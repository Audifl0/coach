import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type WorkerControlMode = 'refresh' | 'check';
export type WorkerControlState = {
  state: 'idle' | 'running' | 'paused' | 'failed';
  pid: number | null;
  mode: WorkerControlMode | null;
  startedAt: string | null;
  stoppedAt: string | null;
  pauseRequestedAt: string | null;
  message: string | null;
};

type WorkerControlInput = {
  knowledgeRootDir?: string;
  now?: Date;
};

const DEFAULT_ROOT_DIR = path.join(process.cwd(), '.planning', 'knowledge', 'adaptive-coaching');
const CONTROL_STATE_FILE = 'worker-control.json';

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
  };
}

export async function readWorkerControlState(input: WorkerControlInput = {}): Promise<WorkerControlState> {
  const now = input.now ?? new Date();
  const filePath = buildControlStatePath(resolveKnowledgeRootDir(input.knowledgeRootDir));
  const existing = await safeReadControlState(filePath);

  if (!existing) {
    return createIdleState(now);
  }

  if (existing.state === 'running' && !isPidRunning(existing.pid)) {
    const resolved = {
      ...existing,
      state: 'idle' as const,
      pid: null,
      stoppedAt: now.toISOString(),
      message: existing.message ?? 'worker process exited',
    };
    await writeControlState(filePath, resolved);
    return resolved;
  }

  return existing;
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
    return current;
  }

  const mode = input.mode ?? 'refresh';
  const scriptPath = path.join(process.cwd(), 'scripts', 'adaptive-knowledge', 'refresh-corpus.ts');
  const tsxPath = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const child = spawn(process.execPath, [tsxPath, scriptPath, ...(mode === 'check' ? ['--check'] : [])], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      ADAPTIVE_KNOWLEDGE_OUTPUT_ROOT_DIR: knowledgeRootDir,
    },
  });
  child.unref();

  const nextState: WorkerControlState = {
    state: 'running',
    pid: child.pid ?? null,
    mode,
    startedAt: now.toISOString(),
    stoppedAt: null,
    pauseRequestedAt: null,
    message: `worker launched from dashboard (${mode})`,
  };
  await writeControlState(filePath, nextState);
  return nextState;
}

export async function pauseWorkerControl(input: WorkerControlInput = {}): Promise<WorkerControlState> {
  const now = input.now ?? new Date();
  const knowledgeRootDir = resolveKnowledgeRootDir(input.knowledgeRootDir);
  const filePath = buildControlStatePath(knowledgeRootDir);
  const current = await readWorkerControlState({ knowledgeRootDir, now });

  if (current.state !== 'running' || !isPidRunning(current.pid)) {
    const idleState = {
      ...createIdleState(now, 'no active worker process to pause'),
      state: 'paused' as const,
      pauseRequestedAt: now.toISOString(),
    };
    await writeControlState(filePath, idleState);
    return idleState;
  }

  process.kill(current.pid!, 'SIGTERM');
  const nextState: WorkerControlState = {
    state: 'paused',
    pid: null,
    mode: current.mode,
    startedAt: current.startedAt,
    stoppedAt: now.toISOString(),
    pauseRequestedAt: now.toISOString(),
    message: 'pause requested from dashboard',
  };
  await writeControlState(filePath, nextState);
  return nextState;
}
