import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  parseDurableWorkQueueItem,
  parseDurableWorkQueueState,
  type DurableWorkQueueItem,
  type DurableWorkQueueState,
} from '../contracts';

const REGISTRY_DIR = 'registry';
const WORK_QUEUE_FILE = 'work-queues.json';
const WORK_QUEUE_VERSION = 'v1';

function resolveWorkQueuePath(outputRootDir: string): string {
  return path.join(outputRootDir, REGISTRY_DIR, WORK_QUEUE_FILE);
}

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

async function writeJsonAtomically(targetPath: string, payload: unknown): Promise<void> {
  const tmpPath = `${targetPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  await rename(tmpPath, targetPath);
}

function createEmptyState(now?: Date): DurableWorkQueueState {
  return parseDurableWorkQueueState({
    version: WORK_QUEUE_VERSION,
    generatedAt: nowIso(now),
    items: [],
  });
}

async function saveState(outputRootDir: string, state: DurableWorkQueueState): Promise<void> {
  const registryPath = resolveWorkQueuePath(outputRootDir);
  await mkdir(path.dirname(registryPath), { recursive: true });
  await writeJsonAtomically(registryPath, state);
}

export async function loadWorkQueues(outputRootDir: string): Promise<DurableWorkQueueState> {
  const registryPath = resolveWorkQueuePath(outputRootDir);
  try {
    const raw = await readFile(registryPath, 'utf8');
    return parseDurableWorkQueueState(JSON.parse(raw) as unknown);
  } catch {
    return createEmptyState();
  }
}

export async function enqueueWorkItems(
  outputRootDir: string,
  queueName: string,
  items: ReadonlyArray<{ logicalKey: string; payload: Record<string, unknown> }>,
  now?: Date,
): Promise<DurableWorkQueueState> {
  const existing = await loadWorkQueues(outputRootDir);
  const timestamp = nowIso(now);
  const dedupeKeys = new Set(
    existing.items.filter((item) => item.queueName === queueName).map((item) => item.logicalKey),
  );
  const nextItems = [...existing.items];

  for (const item of items) {
    if (dedupeKeys.has(item.logicalKey)) {
      continue;
    }
    dedupeKeys.add(item.logicalKey);
    nextItems.push(
      parseDurableWorkQueueItem({
        id: randomUUID(),
        queueName,
        logicalKey: item.logicalKey,
        status: 'pending',
        payload: item.payload,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
  }

  const nextState = parseDurableWorkQueueState({
    version: existing.version ?? WORK_QUEUE_VERSION,
    generatedAt: timestamp,
    items: nextItems,
  });
  await saveState(outputRootDir, nextState);
  return nextState;
}

export async function claimNextWorkItem(
  outputRootDir: string,
  queueName: string,
  workerId: string,
  now?: Date,
): Promise<DurableWorkQueueItem | null> {
  const existing = await loadWorkQueues(outputRootDir);
  const next = existing.items.find((item) => item.queueName === queueName && item.status === 'pending');
  if (!next) {
    return null;
  }

  const timestamp = nowIso(now);
  const claimed = parseDurableWorkQueueItem({
    ...next,
    status: 'running',
    claimedBy: workerId,
    claimedAt: timestamp,
    updatedAt: timestamp,
  });
  const nextState = parseDurableWorkQueueState({
    version: existing.version ?? WORK_QUEUE_VERSION,
    generatedAt: timestamp,
    items: existing.items.map((item) => (item.id === next.id ? claimed : item)),
  });
  await saveState(outputRootDir, nextState);
  return claimed;
}

async function transitionWorkItem(
  outputRootDir: string,
  workItemId: string,
  updater: (item: DurableWorkQueueItem, timestamp: string) => DurableWorkQueueItem,
  now?: Date,
): Promise<DurableWorkQueueItem> {
  const existing = await loadWorkQueues(outputRootDir);
  const current = existing.items.find((item) => item.id === workItemId);
  if (!current) {
    throw new Error(`Work item not found: ${workItemId}`);
  }

  const timestamp = nowIso(now);
  const updated = updater(current, timestamp);
  const nextState = parseDurableWorkQueueState({
    version: existing.version ?? WORK_QUEUE_VERSION,
    generatedAt: timestamp,
    items: existing.items.map((item) => (item.id === workItemId ? updated : item)),
  });
  await saveState(outputRootDir, nextState);
  return updated;
}

export async function completeWorkItem(outputRootDir: string, workItemId: string, now?: Date): Promise<DurableWorkQueueItem> {
  return transitionWorkItem(
    outputRootDir,
    workItemId,
    (item, timestamp) =>
      parseDurableWorkQueueItem({
        ...item,
        status: 'completed',
        updatedAt: timestamp,
      }),
    now,
  );
}

export async function blockWorkItem(
  outputRootDir: string,
  workItemId: string,
  blockedReason: string,
  now?: Date,
): Promise<DurableWorkQueueItem> {
  return transitionWorkItem(
    outputRootDir,
    workItemId,
    (item, timestamp) =>
      parseDurableWorkQueueItem({
        ...item,
        status: 'blocked',
        blockedReason,
        updatedAt: timestamp,
      }),
    now,
  );
}
