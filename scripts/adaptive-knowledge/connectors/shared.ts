import {
  parseAdaptiveKnowledgeCollectionJob,
  parseDocumentaryRecordStagingArtifact,
  parseNormalizedEvidenceRecord,
  type AdaptiveKnowledgeCollectionJob,
  type DocumentaryRecordState,
  type NormalizedEvidenceRecord,
} from '../contracts';
import { parseAdaptiveKnowledgePipelineConfig, type AdaptiveKnowledgePipelineConfig } from '../config';

export type ConnectorSource = 'pubmed' | 'crossref' | 'openalex';

export type ConnectorCursorState = {
  seenRecordIds: string[];
};

export type ConnectorFetchInput = {
  query: string;
  allowedDomains?: string[];
  freshnessWindowDays?: number;
  retryCount?: number;
  timeoutMs?: number;
  now?: Date;
  cursorState?: ConnectorCursorState;
  collectionJob?: AdaptiveKnowledgeCollectionJob;
  fetchImpl?: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
};

type RawRecord = {
  id: string;
  sourceType: 'guideline' | 'review' | 'expertise';
  title: string;
  url: string;
  publishedAt: string;
  summary: string;
  tags?: string[];
};

type RetryResult<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; attempts: number; error: string };

export type ConnectorFetchResult = {
  source: ConnectorSource;
  skipped: boolean;
  records: NormalizedEvidenceRecord[];
  recordsFetched: number;
  recordsSkipped: number;
  telemetry: {
    attempts: number;
    nextCursor?: string;
    rawResults?: number;
    incrementalSkipped?: number;
    skipReasons?: {
      disallowedDomain: number;
      stalePublication: number;
      alreadySeen: number;
      invalidUrl: number;
    };
  };
  error?: {
    message: string;
    attempts: number;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;

function extractHost(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

function isWithinFreshnessWindow(dateIso: string, now: Date, windowDays: number): boolean {
  const publishedMs = Date.parse(dateIso);
  if (Number.isNaN(publishedMs)) {
    return false;
  }
  const ageDays = Math.floor((now.getTime() - publishedMs) / DAY_MS);
  return ageDays >= 0 && ageDays <= windowDays;
}

function isAllowedDomain(recordUrl: string, allowedDomains: readonly string[]): boolean {
  const host = extractHost(recordUrl);
  return allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export async function runWithRetry<T>(
  fn: () => Promise<T>,
  retryCount: number,
): Promise<RetryResult<T>> {
  let attempts = 0;
  while (attempts <= retryCount) {
    attempts += 1;
    try {
      const value = await fn();
      return {
        ok: true,
        value,
        attempts,
      };
    } catch (error) {
      if (attempts > retryCount) {
        return {
          ok: false,
          attempts,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  return {
    ok: false,
    attempts: retryCount + 1,
    error: 'Unknown connector retry state',
  };
}

export function resolveConnectorConfig(input: ConnectorFetchInput): AdaptiveKnowledgePipelineConfig {
  return parseAdaptiveKnowledgePipelineConfig({
    allowedDomains: input.allowedDomains,
    freshnessWindowDays: input.freshnessWindowDays,
    retryCount: input.retryCount,
    timeoutMs: input.timeoutMs,
  });
}

function normalizeRecord(raw: RawRecord): NormalizedEvidenceRecord {
  const canonicalId = buildCanonicalRecordId({
    id: raw.id,
    title: raw.title,
    url: raw.url,
  });
  return parseNormalizedEvidenceRecord({
    id: raw.id,
    canonicalId,
    sourceType: raw.sourceType,
    sourceUrl: raw.url,
    sourceDomain: extractHost(raw.url),
    publishedAt: raw.publishedAt,
    title: raw.title,
    summaryEn: raw.summary,
    tags: raw.tags?.length ? raw.tags : ['adaptive-coaching'],
    provenanceIds: [raw.id],
    documentary:
      raw.summary.trim().length > 0
        ? {
            status: 'abstract-ready',
            acquisition: {
              sourceKind: 'abstract',
              rejectionReason: null,
            },
          }
        : {
            status: 'metadata-only',
            acquisition: {
              sourceKind: 'metadata',
              rejectionReason: null,
            },
          },
  });
}

function defaultDocumentaryState(record?: Pick<NormalizedEvidenceRecord, 'summaryEn'>): DocumentaryRecordState {
  if (record?.summaryEn.trim().length) {
    return {
      status: 'abstract-ready',
      acquisition: {
        sourceKind: 'abstract',
        rejectionReason: null,
      },
    };
  }

  return {
    status: 'metadata-only',
    acquisition: {
      sourceKind: 'metadata',
      rejectionReason: null,
    },
  };
}

export function ensureDocumentaryState(record: NormalizedEvidenceRecord): NormalizedEvidenceRecord {
  return parseNormalizedEvidenceRecord({
    ...record,
    documentary: record.documentary ?? defaultDocumentaryState(record),
  });
}

export function buildDocumentaryRecordStagingArtifact(input: {
  runId: string;
  generatedAt: string;
  recordIds: readonly string[];
  promotedRecordIds?: readonly string[];
  triage?: {
    extractableRecordIds: readonly string[];
    deferredRecordIds: readonly string[];
    lotIds: readonly string[];
  };
  records: readonly NormalizedEvidenceRecord[];
}) {
  return parseDocumentaryRecordStagingArtifact({
    runId: input.runId,
    generatedAt: input.generatedAt,
    runtimeProjection: {
      recordIds: [...input.recordIds],
      promotedRecordIds: [...(input.promotedRecordIds ?? input.recordIds)],
    },
    triage: input.triage
      ? {
          extractableRecordIds: [...input.triage.extractableRecordIds],
          deferredRecordIds: [...input.triage.deferredRecordIds],
          lotIds: [...input.triage.lotIds],
        }
      : undefined,
    records: input.records.map((record) => ensureDocumentaryState(record)),
  });
}

function normalizeTitleToken(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractDoiToken(value: string): string | null {
  const match = value.toLowerCase().match(/10\.\d{4,9}\/[-._;()/:a-z0-9]+/i);
  return match ? match[0].toLowerCase() : null;
}

function buildCanonicalRecordId(input: { id: string; title: string; url: string }): string {
  const normalizedTitle = normalizeTitleToken(input.title);
  if (normalizedTitle) {
    return `title:${normalizedTitle}`;
  }

  const doi = extractDoiToken(input.id) ?? extractDoiToken(input.url);
  if (doi) {
    return `doi:${doi}`;
  }

  try {
    const url = new URL(input.url);
    if (url.hostname.endsWith('pubmed.ncbi.nlm.nih.gov')) {
      const pmid = url.pathname.split('/').filter(Boolean)[0];
      if (pmid) {
        return `pmid:${pmid}`;
      }
    }
  } catch {
    // ignore malformed URL here; upstream validation will reject it later if needed
  }

  return `record:${input.id.toLowerCase()}`;
}

function normalizeProvenanceIds(record: NormalizedEvidenceRecord): string[] {
  if (record.provenanceIds.length === 1 && record.provenanceIds[0] !== record.id) {
    return [record.id];
  }

  return [...new Set([...record.provenanceIds, record.id])];
}

export function normalizeConnectorRecords(
  _source: ConnectorSource,
  rawRecords: RawRecord[],
  config: AdaptiveKnowledgePipelineConfig,
  now: Date,
  cursorState?: ConnectorCursorState,
): {
  records: NormalizedEvidenceRecord[];
  skipped: number;
  skipReasons: {
    disallowedDomain: number;
    stalePublication: number;
    alreadySeen: number;
    invalidUrl: number;
  };
} {
  const accepted: NormalizedEvidenceRecord[] = [];
  let skipped = 0;
  const skipReasons = {
    disallowedDomain: 0,
    stalePublication: 0,
    alreadySeen: 0,
    invalidUrl: 0,
  };
  const seenIds = new Set(cursorState?.seenRecordIds ?? []);

  for (const raw of rawRecords) {
    let allowedDomain = false;
    try {
      allowedDomain = isAllowedDomain(raw.url, config.allowedDomains);
    } catch {
      skipped += 1;
      skipReasons.invalidUrl += 1;
      continue;
    }

    if (!allowedDomain) {
      skipped += 1;
      skipReasons.disallowedDomain += 1;
      continue;
    }
    if (!isWithinFreshnessWindow(raw.publishedAt, now, config.freshnessWindowDays)) {
      skipped += 1;
      skipReasons.stalePublication += 1;
      continue;
    }
    if (seenIds.has(raw.id)) {
      skipped += 1;
      skipReasons.alreadySeen += 1;
      continue;
    }
    accepted.push(normalizeRecord(raw));
  }

  return {
    records: accepted,
    skipped,
    skipReasons,
  };
}

export function parseConnectorCursorState(input: unknown): ConnectorCursorState {
  if (!input || typeof input !== 'object') {
    return {
      seenRecordIds: [],
    };
  }

  const record = input as { seenRecordIds?: unknown };
  return {
    seenRecordIds: Array.isArray(record.seenRecordIds)
      ? record.seenRecordIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : [],
  };
}

export function dedupeNormalizedEvidenceRecords(records: NormalizedEvidenceRecord[]): NormalizedEvidenceRecord[] {
  const seen = new Map<string, number>();
  const deduped: NormalizedEvidenceRecord[] = [];

  for (const record of records) {
    const canonicalId =
      record.canonicalId ??
      buildCanonicalRecordId({
        id: record.id,
        title: record.title,
        url: record.sourceUrl,
      });
    const seenIndex = seen.get(canonicalId);
    if (seenIndex !== undefined) {
      const existing = deduped[seenIndex]!;
      deduped[seenIndex] = ensureDocumentaryState({
        ...existing,
        canonicalId,
        provenanceIds: [...new Set([...normalizeProvenanceIds(existing), ...normalizeProvenanceIds(record)])],
        tags: [...new Set([...existing.tags, ...record.tags])],
        documentary: existing.documentary ?? record.documentary ?? defaultDocumentaryState(existing),
      });
      continue;
    }
    seen.set(canonicalId, deduped.length);
    deduped.push(
      ensureDocumentaryState({
        ...record,
        canonicalId,
        provenanceIds: normalizeProvenanceIds(record),
      }),
    );
  }

  return deduped;
}
