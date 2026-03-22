import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  parseStudyDossierRegistryRecord,
  parseStudyDossierRegistryState,
  type StudyCard,
  type StudyDossierRegistryRecord,
  type StudyDossierRegistryState,
} from '../contracts';

const REGISTRY_DIR = 'registry';
const STUDY_DOSSIER_REGISTRY_FILE = 'study-dossiers.json';
const STUDY_DOSSIER_REGISTRY_VERSION = 'v1';

function resolveStudyDossierRegistryPath(outputRootDir: string): string {
  return path.join(outputRootDir, REGISTRY_DIR, STUDY_DOSSIER_REGISTRY_FILE);
}

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

async function writeJsonAtomically(targetPath: string, payload: unknown): Promise<void> {
  const tmpPath = `${targetPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  await rename(tmpPath, targetPath);
}

function createEmptyState(now?: Date): StudyDossierRegistryState {
  return parseStudyDossierRegistryState({
    version: STUDY_DOSSIER_REGISTRY_VERSION,
    generatedAt: nowIso(now),
    items: [],
  });
}

export function buildStudyDossierFromStudyCard(card: StudyCard, now?: Date): StudyDossierRegistryRecord {
  const timestamp = nowIso(now);
  return parseStudyDossierRegistryRecord({
    studyId: card.recordId,
    recordId: card.recordId,
    title: card.title,
    status: 'validated-structure',
    topicKeys: card.topicKeys,
    studyCard: card,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export async function loadStudyDossierRegistry(outputRootDir: string): Promise<StudyDossierRegistryState> {
  const registryPath = resolveStudyDossierRegistryPath(outputRootDir);
  try {
    const raw = await readFile(registryPath, 'utf8');
    return parseStudyDossierRegistryState(JSON.parse(raw) as unknown);
  } catch {
    return createEmptyState();
  }
}

export async function upsertStudyDossiers(
  outputRootDir: string,
  dossiers: readonly StudyDossierRegistryRecord[],
  now?: Date,
): Promise<StudyDossierRegistryState> {
  const registryPath = resolveStudyDossierRegistryPath(outputRootDir);
  await mkdir(path.dirname(registryPath), { recursive: true });

  const existing = await loadStudyDossierRegistry(outputRootDir);
  const nextById = new Map(existing.items.map((item) => [item.studyId, item]));

  for (const dossier of dossiers) {
    const parsed = parseStudyDossierRegistryRecord(dossier);
    const current = nextById.get(parsed.studyId);
    nextById.set(
      parsed.studyId,
      parseStudyDossierRegistryRecord({
        ...parsed,
        createdAt: current?.createdAt ?? parsed.createdAt,
        updatedAt: nowIso(now),
      }),
    );
  }

  const nextState = parseStudyDossierRegistryState({
    version: existing.version ?? STUDY_DOSSIER_REGISTRY_VERSION,
    generatedAt: nowIso(now),
    items: [...nextById.values()].sort((left, right) => left.studyId.localeCompare(right.studyId)),
  });

  await writeJsonAtomically(registryPath, nextState);
  return nextState;
}
