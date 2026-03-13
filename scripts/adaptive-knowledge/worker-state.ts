import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  parseAdaptiveKnowledgeBootstrapCampaignState,
  type AdaptiveKnowledgeBootstrapCampaignState,
} from './contracts';

export type AdaptiveKnowledgeWorkerStatus =
  | 'started'
  | 'heartbeat'
  | 'completed'
  | 'failed'
  | 'blocked-by-lease'
  | 'stale';

export type AdaptiveKnowledgeWorkerMode = 'bootstrap' | 'refresh' | 'check';

export type AdaptiveKnowledgeWorkerState = {
  runId: string;
  mode: AdaptiveKnowledgeWorkerMode;
  status: AdaptiveKnowledgeWorkerStatus;
  startedAt: string;
  heartbeatAt: string;
  leaseExpiresAt: string;
  message?: string;
};

export type AcquireAdaptiveKnowledgeLeaseInput = {
  outputRootDir: string;
  runId: string;
  mode: AdaptiveKnowledgeWorkerMode;
  now?: Date;
  leaseMs?: number;
};

export type AcquireAdaptiveKnowledgeLeaseResult =
  | {
      acquired: true;
      state: AdaptiveKnowledgeWorkerState;
    }
  | {
      acquired: false;
      reason: 'blocked-by-lease';
      state: AdaptiveKnowledgeWorkerState | null;
    };

type UpdateAdaptiveKnowledgeLeaseInput = {
  outputRootDir: string;
  runId: string;
  now?: Date;
  leaseMs?: number;
  message?: string;
};

type ReleaseAdaptiveKnowledgeLeaseInput = {
  outputRootDir: string;
  runId: string;
  status: Extract<AdaptiveKnowledgeWorkerStatus, 'completed' | 'failed' | 'blocked-by-lease'>;
  now?: Date;
  leaseMs?: number;
  message?: string;
};

type UpsertAdaptiveKnowledgeBootstrapCampaignInput = {
  outputRootDir: string;
  runId: string;
  now?: Date;
  status: AdaptiveKnowledgeBootstrapCampaignState['status'];
  activeJobId?: string | null;
  backlog: AdaptiveKnowledgeBootstrapCampaignState['backlog'];
  progress: AdaptiveKnowledgeBootstrapCampaignState['progress'];
};

const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const BOOTSTRAP_STATE_FILE = 'bootstrap-state.json';
const WORKER_STATE_FILE = 'worker-state.json';
const WORKER_LOCK_FILE = 'worker.lock';

function resolveLeaseMs(leaseMs?: number): number {
  return Math.max(1_000, leaseMs ?? DEFAULT_LEASE_MS);
}

function toIso(value: Date): string {
  return value.toISOString();
}

function buildStatePaths(outputRootDir: string) {
  return {
    bootstrapPath: path.join(outputRootDir, BOOTSTRAP_STATE_FILE),
    statePath: path.join(outputRootDir, WORKER_STATE_FILE),
    lockPath: path.join(outputRootDir, WORKER_LOCK_FILE),
  };
}

function buildLeaseState(input: {
  runId: string;
  mode: AdaptiveKnowledgeWorkerMode;
  status: AdaptiveKnowledgeWorkerStatus;
  now: Date;
  leaseMs: number;
  startedAt?: string;
  message?: string;
}): AdaptiveKnowledgeWorkerState {
  return {
    runId: input.runId,
    mode: input.mode,
    status: input.status,
    startedAt: input.startedAt ?? toIso(input.now),
    heartbeatAt: toIso(input.now),
    leaseExpiresAt: toIso(new Date(input.now.getTime() + input.leaseMs)),
    message: input.message,
  };
}

async function safeReadWorkerState(statePath: string): Promise<AdaptiveKnowledgeWorkerState | null> {
  try {
    const raw = await readFile(statePath, 'utf8');
    return JSON.parse(raw) as AdaptiveKnowledgeWorkerState;
  } catch {
    return null;
  }
}

async function writeWorkerState(statePath: string, state: AdaptiveKnowledgeWorkerState): Promise<void> {
  await writeFile(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

async function safeReadBootstrapCampaignState(
  bootstrapPath: string,
): Promise<AdaptiveKnowledgeBootstrapCampaignState | null> {
  try {
    const raw = await readFile(bootstrapPath, 'utf8');
    return parseAdaptiveKnowledgeBootstrapCampaignState(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

async function writeBootstrapCampaignState(
  bootstrapPath: string,
  state: AdaptiveKnowledgeBootstrapCampaignState,
): Promise<void> {
  await writeFile(bootstrapPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

async function safeRemove(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

function isLeaseExpired(state: AdaptiveKnowledgeWorkerState, now: Date): boolean {
  return Date.parse(state.leaseExpiresAt) <= now.getTime();
}

export async function readAdaptiveKnowledgeWorkerState(outputRootDir: string): Promise<AdaptiveKnowledgeWorkerState | null> {
  const { statePath } = buildStatePaths(outputRootDir);
  return safeReadWorkerState(statePath);
}

export async function readAdaptiveKnowledgeBootstrapCampaignState(
  outputRootDir: string,
): Promise<AdaptiveKnowledgeBootstrapCampaignState | null> {
  const { bootstrapPath } = buildStatePaths(outputRootDir);
  return safeReadBootstrapCampaignState(bootstrapPath);
}

export async function upsertAdaptiveKnowledgeBootstrapCampaignState(
  input: UpsertAdaptiveKnowledgeBootstrapCampaignInput,
): Promise<AdaptiveKnowledgeBootstrapCampaignState> {
  const now = input.now ?? new Date();
  const { bootstrapPath } = buildStatePaths(input.outputRootDir);
  await mkdir(input.outputRootDir, { recursive: true });
  const existing = await safeReadBootstrapCampaignState(bootstrapPath);
  const next = parseAdaptiveKnowledgeBootstrapCampaignState({
    schemaVersion: 'v1',
    campaignId: existing?.campaignId ?? `bootstrap-${input.runId}`,
    status: input.status,
    mode: 'bootstrap',
    startedAt: existing?.startedAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    lastRunId: input.runId,
    activeJobId: input.activeJobId ?? null,
    backlog: input.backlog,
    progress: input.progress,
  });
  await writeBootstrapCampaignState(bootstrapPath, next);
  return next;
}

export async function acquireAdaptiveKnowledgeLease(
  input: AcquireAdaptiveKnowledgeLeaseInput,
): Promise<AcquireAdaptiveKnowledgeLeaseResult> {
  const now = input.now ?? new Date();
  const leaseMs = resolveLeaseMs(input.leaseMs);
  const { statePath, lockPath } = buildStatePaths(input.outputRootDir);
  await mkdir(input.outputRootDir, { recursive: true });

  const existingState = await safeReadWorkerState(statePath);
  if (existingState !== null && !isLeaseExpired(existingState, now)) {
    return {
      acquired: false,
      reason: 'blocked-by-lease',
      state: existingState,
    };
  }

  if (existingState !== null && isLeaseExpired(existingState, now)) {
    await writeWorkerState(
      statePath,
      buildLeaseState({
        runId: existingState.runId,
        mode: existingState.mode,
        status: 'stale',
        now,
        leaseMs,
        startedAt: existingState.startedAt,
        message: 'Recovered stale lease before new worker run.',
      }),
    );
    await safeRemove(lockPath);
  }

  let handle;
  try {
    handle = await open(lockPath, 'wx');
  } catch {
    const blockingState = await safeReadWorkerState(statePath);
    return {
      acquired: false,
      reason: 'blocked-by-lease',
      state: blockingState,
    };
  }

  await handle.close();

  const state = buildLeaseState({
    runId: input.runId,
    mode: input.mode,
    status: 'started',
    now,
    leaseMs,
  });
  await writeWorkerState(statePath, state);

  return {
    acquired: true,
    state,
  };
}

export async function heartbeatAdaptiveKnowledgeLease(
  input: UpdateAdaptiveKnowledgeLeaseInput,
): Promise<AdaptiveKnowledgeWorkerState> {
  const now = input.now ?? new Date();
  const leaseMs = resolveLeaseMs(input.leaseMs);
  const { statePath } = buildStatePaths(input.outputRootDir);
  const existingState = await safeReadWorkerState(statePath);

  if (existingState === null || existingState.runId !== input.runId) {
    throw new Error(`No active adaptive knowledge lease for run ${input.runId}`);
  }

  const updated = buildLeaseState({
    runId: existingState.runId,
    mode: existingState.mode,
    status: 'heartbeat',
    now,
    leaseMs,
    startedAt: existingState.startedAt,
    message: input.message,
  });
  await writeWorkerState(statePath, updated);
  return updated;
}

export async function releaseAdaptiveKnowledgeLease(
  input: ReleaseAdaptiveKnowledgeLeaseInput,
): Promise<AdaptiveKnowledgeWorkerState> {
  const now = input.now ?? new Date();
  const leaseMs = resolveLeaseMs(input.leaseMs);
  const { statePath, lockPath } = buildStatePaths(input.outputRootDir);
  const existingState = await safeReadWorkerState(statePath);

  if (existingState === null || existingState.runId !== input.runId) {
    throw new Error(`No adaptive knowledge lease to release for run ${input.runId}`);
  }

  const released = buildLeaseState({
    runId: existingState.runId,
    mode: existingState.mode,
    status: input.status,
    now,
    leaseMs,
    startedAt: existingState.startedAt,
    message: input.message,
  });
  await writeWorkerState(statePath, released);
  await safeRemove(lockPath);
  return released;
}
