import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  parseDocumentRegistryRecord,
  parseDocumentRegistryState,
  type DocumentRegistryRecord,
  type DocumentRegistryState,
  type NormalizedEvidenceRecord,
} from '../contracts';

const REGISTRY_DIR = 'registry';
const DOCUMENT_REGISTRY_FILE = 'document-library.json';
const DOCUMENT_REGISTRY_VERSION = 'v1';

function resolveDocumentRegistryPath(outputRootDir: string): string {
  return path.join(outputRootDir, REGISTRY_DIR, DOCUMENT_REGISTRY_FILE);
}

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

async function writeJsonAtomically(targetPath: string, payload: unknown): Promise<void> {
  const tmpPath = `${targetPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  await rename(tmpPath, targetPath);
}

function createEmptyState(now?: Date): DocumentRegistryState {
  return parseDocumentRegistryState({
    version: DOCUMENT_REGISTRY_VERSION,
    generatedAt: nowIso(now),
    items: [],
  });
}

function deriveDocumentStatus(record: NormalizedEvidenceRecord): DocumentRegistryRecord['status'] {
  switch (record.documentary?.status) {
    case 'metadata-only':
      return 'metadata-ready';
    case 'abstract-ready':
      return 'extractible';
    case 'full-text-ready':
      return 'extractible';
    case 'blocked':
      return 'metadata-ready';
    default:
      return 'discovered';
  }
}

export function buildDocumentRegistryRecordFromNormalizedRecord(
  record: NormalizedEvidenceRecord,
  now?: Date,
): DocumentRegistryRecord {
  const timestamp = nowIso(now);
  return parseDocumentRegistryRecord({
    documentId: record.canonicalId ?? record.id,
    canonicalId: record.canonicalId ?? null,
    recordId: record.id,
    title: record.title,
    sourceDomain: record.sourceDomain,
    sourceUrl: record.sourceUrl,
    status: deriveDocumentStatus(record),
    topicKeys: record.tags,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export async function loadDocumentRegistry(outputRootDir: string): Promise<DocumentRegistryState> {
  const registryPath = resolveDocumentRegistryPath(outputRootDir);
  try {
    const raw = await readFile(registryPath, 'utf8');
    return parseDocumentRegistryState(JSON.parse(raw) as unknown);
  } catch {
    return createEmptyState();
  }
}

export async function upsertDocumentRegistryRecords(
  outputRootDir: string,
  records: readonly DocumentRegistryRecord[],
  now?: Date,
): Promise<DocumentRegistryState> {
  const registryPath = resolveDocumentRegistryPath(outputRootDir);
  await mkdir(path.dirname(registryPath), { recursive: true });

  const existing = await loadDocumentRegistry(outputRootDir);
  const nextById = new Map(existing.items.map((item) => [item.documentId, item]));

  for (const record of records) {
    const parsed = parseDocumentRegistryRecord(record);
    const current = nextById.get(parsed.documentId);
    nextById.set(
      parsed.documentId,
      parseDocumentRegistryRecord({
        ...parsed,
        createdAt: current?.createdAt ?? parsed.createdAt,
        updatedAt: nowIso(now),
      }),
    );
  }

  const nextState = parseDocumentRegistryState({
    version: existing.version ?? DOCUMENT_REGISTRY_VERSION,
    generatedAt: nowIso(now),
    items: [...nextById.values()].sort((left, right) => left.documentId.localeCompare(right.documentId)),
  });

  await writeJsonAtomically(registryPath, nextState);
  return nextState;
}
