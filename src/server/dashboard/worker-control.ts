import { spawn } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { parseAdaptiveKnowledgePipelineConfig } from '../../../scripts/adaptive-knowledge/config';
import { setWorkerControlMode } from '../../../scripts/adaptive-knowledge/control-state';
import {
  parseAdaptiveKnowledgeCollectionJob,
  type AdaptiveKnowledgeBootstrapCampaignState,
} from '../../../scripts/adaptive-knowledge/contracts';
import { readAdaptiveKnowledgeBootstrapCampaignState } from '../../../scripts/adaptive-knowledge/worker-state';

export type WorkerControlMode = 'bootstrap' | 'refresh' | 'check';
export type WorkerBootstrapCampaignOverview = {
  campaignId: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  startedAt: string;
  updatedAt: string;
  lastRunId: string | null;
  activeJobId: string | null;
  backlog: {
    pending: number;
    running: number;
    blocked: number;
    completed: number;
    exhausted: number;
  };
  progress: {
    discoveredQueryFamilies: number;
    canonicalRecordCount: number;
    extractionBacklogCount: number;
    publicationCandidateCount: number;
  };
  cursors: {
    resumableJobCount: number;
    activeCursorCount: number;
    sampleJobIds: string[];
  };
  budgets: {
    maxJobsPerRun: number;
    maxPagesPerJob: number;
    maxCanonicalRecordsPerRun: number;
    maxRuntimeMs: number;
  };
};

export type WorkerControlState = {
  state: 'idle' | 'running' | 'paused' | 'failed';
  pid: number | null;
  mode: WorkerControlMode | null;
  startedAt: string | null;
  stoppedAt: string | null;
  pauseRequestedAt: string | null;
  message: string | null;
  campaign: WorkerBootstrapCampaignOverview | null;
};

type WorkerControlInput = {
  knowledgeRootDir?: string;
  now?: Date;
};

type WorkerLaunchInvocation = {
  command: string;
  args: string[];
  options: SpawnOptions;
};

type WorkerLauncher = (invocation: WorkerLaunchInvocation) => { pid?: number | null; unref(): void };

const DEFAULT_ROOT_DIR = path.join(process.cwd(), '.planning', 'knowledge', 'adaptive-coaching');
const CONTROL_STATE_FILE = 'worker-control.json';
const BOOTSTRAP_JOBS_FILE = 'bootstrap-jobs.json';
const CONNECTOR_STATE_FILE = 'connector-state.json';
const BOOTSTRAP_STATE_FILE = 'bootstrap-state.json';
const WORKER_STATE_FILE = 'worker-state.json';
const WORKER_LOCK_FILE = 'worker.lock';
const COACH_ENV_FILE = '/opt/coach/.env';
const WORKER_COMPOSE_SERVICE = 'worker-corpus';
const WORKER_CONTROL_BRIDGE_MODE = 'host-file';

let workerLauncher: WorkerLauncher = ({ command, args, options }) => spawn(command, args, options);

function resolveWorkerControlBridgeMode(env: NodeJS.ProcessEnv = process.env): 'docker-compose' | 'host-file' {
  return env.WORKER_CONTROL_BRIDGE_MODE === WORKER_CONTROL_BRIDGE_MODE ? 'host-file' : 'docker-compose';
}

function resolveKnowledgeRootDir(input?: string): string {
  return input ?? DEFAULT_ROOT_DIR;
}

function buildControlStatePath(knowledgeRootDir: string): string {
  return path.join(knowledgeRootDir, CONTROL_STATE_FILE);
}

async function safeReadControlState(filePath: string): Promise<WorkerControlState | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as WorkerControlState;
  } catch {
    return null;
  }
}

async function writeControlState(filePath: string, state: WorkerControlState): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

async function readBootstrapJobs(knowledgeRootDir: string) {
  try {
    const raw = await readFile(path.join(knowledgeRootDir, BOOTSTRAP_JOBS_FILE), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((job) => parseAdaptiveKnowledgeCollectionJob(job));
  } catch {
    return [];
  }
}

function mapCampaignStatus(input: {
  campaign: AdaptiveKnowledgeBootstrapCampaignState | null;
  control: Pick<WorkerControlState, 'state'>;
}): WorkerBootstrapCampaignOverview['status'] {
  if (!input.campaign) {
    return input.control.state === 'paused' ? 'paused' : 'idle';
  }
  if (input.control.state === 'paused') {
    return 'paused';
  }
  return input.campaign.status;
}

async function readCampaignOverview(
  knowledgeRootDir: string,
  controlState: Pick<WorkerControlState, 'state'>,
): Promise<WorkerBootstrapCampaignOverview | null> {
  const [campaign, jobs] = await Promise.all([
    readAdaptiveKnowledgeBootstrapCampaignState(knowledgeRootDir),
    readBootstrapJobs(knowledgeRootDir),
  ]);
  if (!campaign) {
    return null;
  }

  const budgets = parseAdaptiveKnowledgePipelineConfig().bootstrap;
  const resumableJobs = jobs.filter((job) => job.status === 'pending' || job.status === 'blocked');
  const activeCursorJobs = jobs.filter((job) => typeof job.cursor === 'string' && job.cursor.length > 0);

  return {
    campaignId: campaign.campaignId,
    status: mapCampaignStatus({ campaign, control: controlState }),
    startedAt: campaign.startedAt,
    updatedAt: campaign.updatedAt,
    lastRunId: campaign.lastRunId ?? null,
    activeJobId: campaign.activeJobId ?? null,
    backlog: {
      pending: campaign.backlog.pending,
      running: campaign.backlog.running,
      blocked: campaign.backlog.blocked,
      completed: campaign.backlog.completed,
      exhausted: campaign.backlog.exhausted ?? 0,
    },
    progress: campaign.progress,
    cursors: {
      resumableJobCount: resumableJobs.length,
      activeCursorCount: activeCursorJobs.length,
      sampleJobIds: activeCursorJobs.slice(0, 3).map((job) => job.id),
    },
    budgets: {
      maxJobsPerRun: budgets.maxJobsPerRun,
      maxPagesPerJob: budgets.maxPagesPerJob,
      maxCanonicalRecordsPerRun: budgets.maxCanonicalRecordsPerRun,
      maxRuntimeMs: budgets.maxRuntimeMs,
    },
  };
}

async function writeResolvedControlState(filePath: string, state: Omit<WorkerControlState, 'campaign'>): Promise<WorkerControlState> {
  const nextState: WorkerControlState = {
    ...state,
    campaign: await readCampaignOverview(path.dirname(filePath), state),
  };
  await writeControlState(filePath, nextState);
  return nextState;
}

function isPidRunning(pid: number | null): boolean {
  if (!pid || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function createIdleState(now: Date, message: string | null = null): WorkerControlState {
  return {
    state: 'idle',
    pid: null,
    mode: null,
    startedAt: null,
    stoppedAt: now.toISOString(),
    pauseRequestedAt: null,
    message,
    campaign: null,
  };
}

function buildStartWorkerInvocation(input: {
  knowledgeRootDir: string;
  mode: WorkerControlMode;
}): WorkerLaunchInvocation {
  return {
    command: 'docker',
    args: [
      'compose',
      '--env-file',
      COACH_ENV_FILE,
      'up',
      '-d',
      WORKER_COMPOSE_SERVICE,
    ],
    options: {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        ADAPTIVE_KNOWLEDGE_OUTPUT_ROOT_DIR: input.knowledgeRootDir,
        ADAPTIVE_KNOWLEDGE_WORKER_MODE: input.mode,
      },
    },
  };
}

export function setWorkerLauncherForTests(nextLauncher: WorkerLauncher): void {
  workerLauncher = nextLauncher;
}

export function resetWorkerLauncherForTests(): void {
  workerLauncher = ({ command, args, options }) => spawn(command, args, options);
}

export async function readWorkerControlState(input: WorkerControlInput = {}): Promise<WorkerControlState> {
  const now = input.now ?? new Date();
  const filePath = buildControlStatePath(resolveKnowledgeRootDir(input.knowledgeRootDir));
  const existing = await safeReadControlState(filePath);

  if (!existing) {
    return {
      ...createIdleState(now),
      campaign: await readCampaignOverview(resolveKnowledgeRootDir(input.knowledgeRootDir), { state: 'idle' }),
    };
  }

  if (existing.state === 'running' && !isPidRunning(existing.pid)) {
    const resolved = {
      ...existing,
      state: 'idle' as const,
      pid: null,
      stoppedAt: now.toISOString(),
      message: existing.message ?? 'worker process exited',
    };
    return writeResolvedControlState(filePath, resolved);
  }

  return {
    ...existing,
    campaign: await readCampaignOverview(resolveKnowledgeRootDir(input.knowledgeRootDir), existing),
  };
}

export async function startWorkerControl(
  input: WorkerControlInput & {
    mode?: WorkerControlMode;
  } = {},
): Promise<WorkerControlState> {
  const now = input.now ?? new Date();
  const knowledgeRootDir = resolveKnowledgeRootDir(input.knowledgeRootDir);
  const filePath = buildControlStatePath(knowledgeRootDir);
  const current = await readWorkerControlState({ knowledgeRootDir, now });
  if (current.state === 'running' && isPidRunning(current.pid)) {
    return {
      ...current,
      message: 'already-running',
    };
  }

  const mode = input.mode ?? 'refresh';
  if (resolveWorkerControlBridgeMode() === 'host-file') {
    await setWorkerControlMode(knowledgeRootDir, {
      mode: 'running',
      reason: 'operator requested worker start',
      lastCommand: 'start',
      now,
    });
    const nextState: WorkerControlState = {
      state: 'running',
      pid: null,
      mode,
      startedAt: now.toISOString(),
      stoppedAt: null,
      pauseRequestedAt: null,
      message: `worker start requested from dashboard (${mode})`,
      campaign: null,
    };
    return writeResolvedControlState(filePath, nextState);
  }

  const child = workerLauncher(buildStartWorkerInvocation({ knowledgeRootDir, mode }));
  child.unref();

  const nextState: WorkerControlState = {
    state: 'running',
    pid: child.pid ?? null,
    mode,
    startedAt: now.toISOString(),
    stoppedAt: null,
    pauseRequestedAt: null,
    message: `worker launched from dashboard (${mode})`,
    campaign: null,
  };
  return writeResolvedControlState(filePath, nextState);
}

export async function pauseWorkerControl(input: WorkerControlInput = {}): Promise<WorkerControlState> {
  const now = input.now ?? new Date();
  const knowledgeRootDir = resolveKnowledgeRootDir(input.knowledgeRootDir);
  const filePath = buildControlStatePath(knowledgeRootDir);
  const current = await readWorkerControlState({ knowledgeRootDir, now });

  await setWorkerControlMode(knowledgeRootDir, {
    mode: 'paused',
    reason: 'operator requested pause',
    lastCommand: 'pause',
    now,
  });

  const nextState: WorkerControlState = {
    state: 'paused',
    pid: current.state === 'running' && isPidRunning(current.pid) ? current.pid : null,
    mode: current.mode,
    startedAt: current.startedAt,
    stoppedAt: current.stoppedAt,
    pauseRequestedAt: now.toISOString(),
    message:
      current.state === 'running' && isPidRunning(current.pid)
        ? 'soft pause requested from dashboard; active run may finish, new runs blocked'
        : 'pause requested from dashboard',
    campaign: null,
  };
  return writeResolvedControlState(filePath, nextState);
}

export async function resumeWorkerControl(
  input: WorkerControlInput & {
    mode?: WorkerControlMode;
  } = {},
): Promise<WorkerControlState> {
  const current = await readWorkerControlState(input);
  return startWorkerControl({
    ...input,
    mode: input.mode ?? current.mode ?? 'bootstrap',
  });
}

export async function resetWorkerControl(input: WorkerControlInput = {}): Promise<WorkerControlState> {
  const now = input.now ?? new Date();
  const knowledgeRootDir = resolveKnowledgeRootDir(input.knowledgeRootDir);
  const filePath = buildControlStatePath(knowledgeRootDir);
  const current = await readWorkerControlState({ knowledgeRootDir, now });

  if (current.state === 'running' && isPidRunning(current.pid)) {
    throw new Error('Cannot reset bootstrap scope while worker is running');
  }

  await Promise.all([
    rm(path.join(knowledgeRootDir, BOOTSTRAP_JOBS_FILE), { force: true }),
    rm(path.join(knowledgeRootDir, CONNECTOR_STATE_FILE), { force: true }),
    rm(path.join(knowledgeRootDir, BOOTSTRAP_STATE_FILE), { force: true }),
    rm(path.join(knowledgeRootDir, WORKER_STATE_FILE), { force: true }),
    rm(path.join(knowledgeRootDir, WORKER_LOCK_FILE), { force: true }),
  ]);

  const nextState: WorkerControlState = {
    state: 'idle',
    pid: null,
    mode: 'bootstrap',
    startedAt: null,
    stoppedAt: now.toISOString(),
    pauseRequestedAt: null,
    message: 'bootstrap scope reset from dashboard',
    campaign: null,
  };
  return writeResolvedControlState(filePath, nextState);
}
