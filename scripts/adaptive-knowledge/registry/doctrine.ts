import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  parseDoctrineRevisionEntry,
  parseDoctrineRevisionHistory,
  parsePublishedDoctrineSnapshot,
  type DoctrineRevisionEntry,
  type DoctrineRevisionHistory,
  type PublishedDoctrineSnapshot,
} from '../contracts';

const REGISTRY_DIR = 'registry';
const DOCTRINE_SNAPSHOT_FILE = 'published-doctrine.json';
const DOCTRINE_REVISION_FILE = 'doctrine-revisions.json';
const VERSION = 'v1';

function resolveDoctrineSnapshotPath(outputRootDir: string): string {
  return path.join(outputRootDir, REGISTRY_DIR, DOCTRINE_SNAPSHOT_FILE);
}

function resolveDoctrineRevisionPath(outputRootDir: string): string {
  return path.join(outputRootDir, REGISTRY_DIR, DOCTRINE_REVISION_FILE);
}

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

async function writeJsonAtomically(targetPath: string, payload: unknown): Promise<void> {
  const tmpPath = `${targetPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  await rename(tmpPath, targetPath);
}

export async function loadPublishedDoctrineSnapshot(outputRootDir: string): Promise<PublishedDoctrineSnapshot> {
  const filePath = resolveDoctrineSnapshotPath(outputRootDir);
  try {
    return parsePublishedDoctrineSnapshot(JSON.parse(await readFile(filePath, 'utf8')) as unknown);
  } catch {
    return parsePublishedDoctrineSnapshot({
      version: VERSION,
      generatedAt: nowIso(),
      principles: [],
    });
  }
}

export async function writePublishedDoctrineSnapshot(
  outputRootDir: string,
  snapshot: PublishedDoctrineSnapshot,
): Promise<PublishedDoctrineSnapshot> {
  const filePath = resolveDoctrineSnapshotPath(outputRootDir);
  await mkdir(path.dirname(filePath), { recursive: true });
  const parsed = parsePublishedDoctrineSnapshot(snapshot);
  await writeJsonAtomically(filePath, parsed);
  return parsed;
}

export async function loadDoctrineRevisionHistory(outputRootDir: string): Promise<DoctrineRevisionHistory> {
  const filePath = resolveDoctrineRevisionPath(outputRootDir);
  try {
    return parseDoctrineRevisionHistory(JSON.parse(await readFile(filePath, 'utf8')) as unknown);
  } catch {
    return parseDoctrineRevisionHistory({
      version: VERSION,
      generatedAt: nowIso(),
      entries: [],
    });
  }
}

export async function appendDoctrineRevisionEntries(
  outputRootDir: string,
  entries: readonly DoctrineRevisionEntry[],
  now?: Date,
): Promise<DoctrineRevisionHistory> {
  const filePath = resolveDoctrineRevisionPath(outputRootDir);
  await mkdir(path.dirname(filePath), { recursive: true });
  const current = await loadDoctrineRevisionHistory(outputRootDir);
  const next = parseDoctrineRevisionHistory({
    version: current.version ?? VERSION,
    generatedAt: nowIso(now),
    entries: [...current.entries, ...entries.map((entry) => parseDoctrineRevisionEntry(entry))],
  });
  await writeJsonAtomically(filePath, next);
  return next;
}
