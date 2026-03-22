import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  parseAdaptiveKnowledgeWorkerControlState,
  type AdaptiveKnowledgeWorkerControlState,
} from './contracts';

const CONTROL_STATE_FILE = 'control.json';

export type SetWorkerControlModeInput = {
  mode: AdaptiveKnowledgeWorkerControlState['mode'];
  reason: string | null;
  lastCommand: AdaptiveKnowledgeWorkerControlState['lastCommand'];
  now?: Date;
};

function buildControlStatePath(outputRootDir: string): string {
  return path.join(outputRootDir, CONTROL_STATE_FILE);
}

function buildDefaultControlState(now: Date): AdaptiveKnowledgeWorkerControlState {
  return {
    mode: 'running',
    updatedAt: now.toISOString(),
    reason: null,
    lastCommand: null,
  };
}

export async function loadWorkerControlState(outputRootDir: string): Promise<AdaptiveKnowledgeWorkerControlState> {
  const controlPath = buildControlStatePath(outputRootDir);

  try {
    const raw = await readFile(controlPath, 'utf8');
    return parseAdaptiveKnowledgeWorkerControlState(JSON.parse(raw) as unknown);
  } catch (error) {
    const isMissingFile =
      error instanceof Error && 'code' in error && typeof (error as NodeJS.ErrnoException).code === 'string'
        ? (error as NodeJS.ErrnoException).code === 'ENOENT'
        : false;

    if (isMissingFile) {
      return buildDefaultControlState(new Date());
    }

    throw error;
  }
}

export async function writeWorkerControlState(
  outputRootDir: string,
  state: AdaptiveKnowledgeWorkerControlState,
): Promise<AdaptiveKnowledgeWorkerControlState> {
  const nextState = parseAdaptiveKnowledgeWorkerControlState(state);
  const controlPath = buildControlStatePath(outputRootDir);
  const tempPath = `${controlPath}.${process.pid}.tmp`;

  await mkdir(outputRootDir, { recursive: true });
  await writeFile(tempPath, JSON.stringify(nextState, null, 2) + '\n', 'utf8');
  await rename(tempPath, controlPath);

  return nextState;
}

export async function setWorkerControlMode(
  outputRootDir: string,
  input: SetWorkerControlModeInput,
): Promise<AdaptiveKnowledgeWorkerControlState> {
  return writeWorkerControlState(outputRootDir, {
    mode: input.mode,
    updatedAt: (input.now ?? new Date()).toISOString(),
    reason: input.reason,
    lastCommand: input.lastCommand,
  });
}
