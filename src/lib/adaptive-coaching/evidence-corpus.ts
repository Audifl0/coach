import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

type EvidenceSourceClass = 'guideline' | 'review' | 'expertise';

type RuntimeEvidenceEntry = {
  id: string;
  sourceClass: EvidenceSourceClass;
  title: string;
  summary: string;
  tags: string[];
};

type RuntimeEvidenceCorpus = {
  snapshotId: string | null;
  entries: RuntimeEvidenceEntry[];
  principles: unknown[];
};

type SnapshotPointer = {
  snapshotId?: string;
  snapshotDir?: string;
  candidateDir?: string;
};

type LoadActiveAdaptiveEvidenceCorpusInput = {
  knowledgeRootDir?: string;
};

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function toSourceClass(value: unknown): EvidenceSourceClass | null {
  if (value === 'guideline' || value === 'review' || value === 'expertise') {
    return value;
  }
  return null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeSnapshotDir(pointer: SnapshotPointer): string | null {
  const fromSnapshot = isNonEmptyString(pointer.snapshotDir) ? pointer.snapshotDir : null;
  const fromLegacyCandidate = isNonEmptyString(pointer.candidateDir)
    ? pointer.candidateDir.replace(/([/\\])candidate$/, '$1validated')
    : null;
  return fromSnapshot ?? fromLegacyCandidate;
}

function isValidatedSnapshotDir(snapshotDir: string): boolean {
  return path.basename(snapshotDir) === 'validated';
}

function loadSnapshotCorpus(pointer: SnapshotPointer): RuntimeEvidenceCorpus | null {
  const snapshotDir = normalizeSnapshotDir(pointer);
  if (!snapshotDir || !isValidatedSnapshotDir(snapshotDir)) {
    return null;
  }

  const sources = readJsonFile<{ records?: unknown[] }>(path.join(snapshotDir, 'sources.json'));
  const principles = readJsonFile<{ principles?: unknown[] }>(path.join(snapshotDir, 'principles.json'));
  if (!sources || !principles || !Array.isArray(sources.records) || !Array.isArray(principles.principles)) {
    return null;
  }

  const entries = sources.records
    .map((record) => {
      const row = record as Record<string, unknown>;
      const sourceClass = toSourceClass(row.sourceType);
      const tags = Array.isArray(row.tags) ? row.tags.filter((tag) => typeof tag === 'string') : [];
      if (
        !sourceClass ||
        !isNonEmptyString(row.id) ||
        !isNonEmptyString(row.title) ||
        !isNonEmptyString(row.summaryEn) ||
        tags.length === 0
      ) {
        return null;
      }

      return {
        id: row.id,
        sourceClass,
        title: row.title,
        summary: row.summaryEn,
        tags,
      } satisfies RuntimeEvidenceEntry;
    })
    .filter((entry): entry is RuntimeEvidenceEntry => entry !== null);

  if (entries.length === 0) {
    return null;
  }

  return {
    snapshotId: isNonEmptyString(pointer.snapshotId) ? pointer.snapshotId : null,
    entries,
    principles: principles.principles,
  };
}

function loadLegacyCorpus(knowledgeRootDir: string): RuntimeEvidenceCorpus | null {
  const index = readJsonFile<{ entries?: unknown[] }>(path.join(knowledgeRootDir, 'index.json'));
  const principles = readJsonFile<{ principles?: unknown[] }>(path.join(knowledgeRootDir, 'principles.json'));
  if (!index || !principles || !Array.isArray(index.entries) || !Array.isArray(principles.principles)) {
    return null;
  }

  const entries = index.entries
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      const sourceClass = toSourceClass(row.source_type);
      const tags = Array.isArray(row.tags) ? row.tags.filter((tag) => typeof tag === 'string') : [];
      if (
        !sourceClass ||
        !isNonEmptyString(row.id) ||
        !isNonEmptyString(row.title) ||
        !isNonEmptyString(row.summary) ||
        tags.length === 0
      ) {
        return null;
      }

      return {
        id: row.id,
        sourceClass,
        title: row.title,
        summary: row.summary,
        tags,
      } satisfies RuntimeEvidenceEntry;
    })
    .filter((entry): entry is RuntimeEvidenceEntry => entry !== null);

  if (entries.length === 0) {
    return null;
  }

  return {
    snapshotId: isNonEmptyString(index['version']) ? index['version'] : null,
    entries,
    principles: principles.principles,
  };
}

export function loadActiveAdaptiveEvidenceCorpus(
  input: LoadActiveAdaptiveEvidenceCorpusInput = {},
): RuntimeEvidenceCorpus {
  const knowledgeRootDir =
    input.knowledgeRootDir ?? path.join(process.cwd(), '.planning', 'knowledge', 'adaptive-coaching');
  const activePointer = readJsonFile<SnapshotPointer>(path.join(knowledgeRootDir, 'active.json'));
  const rollbackPointer = readJsonFile<SnapshotPointer>(path.join(knowledgeRootDir, 'rollback.json'));

  if (activePointer) {
    const fromActive = loadSnapshotCorpus(activePointer);
    if (fromActive) {
      return fromActive;
    }
  }

  if (rollbackPointer) {
    const fromRollback = loadSnapshotCorpus(rollbackPointer);
    if (fromRollback) {
      return fromRollback;
    }
  }

  const legacy = loadLegacyCorpus(knowledgeRootDir);
  if (legacy) {
    return legacy;
  }

  return {
    snapshotId: null,
    entries: [],
    principles: [],
  };
}
