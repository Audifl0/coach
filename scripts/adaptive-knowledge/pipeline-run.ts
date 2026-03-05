import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { parseAdaptiveKnowledgePipelineConfig } from './config';
import {
  parseCorpusPrinciple,
  parseCorpusRunReport,
  parseCorpusSnapshotManifest,
  type CorpusPrinciple,
  type CorpusRunReport,
  type NormalizedEvidenceRecord,
} from './contracts';
import { fetchCrossrefEvidenceBatch } from './connectors/crossref';
import { fetchOpenAlexEvidenceBatch } from './connectors/openalex';
import { fetchPubmedEvidenceBatch } from './connectors/pubmed';
import type { ConnectorFetchInput, ConnectorFetchResult } from './connectors/shared';

type PipelineConnectorFn = (input: ConnectorFetchInput) => Promise<ConnectorFetchResult>;

type PipelineConnectors = {
  pubmed: PipelineConnectorFn;
  crossref: PipelineConnectorFn;
  openalex: PipelineConnectorFn;
};

type StageStatus = 'succeeded' | 'failed' | 'skipped';

type PipelineStage = {
  stage: 'discover' | 'ingest' | 'synthesize' | 'validate' | 'publish';
  status: StageStatus;
  message?: string;
};

type PipelineMode = 'refresh' | 'check';

export type RunAdaptiveKnowledgePipelineInput = {
  runId?: string;
  now?: Date;
  mode?: PipelineMode;
  outputRootDir?: string;
  configOverrides?: Partial<{
    allowedDomains: string[];
    freshnessWindowDays: number;
    backfillMaxDays: number;
    retryCount: number;
    timeoutMs: number;
  }>;
  connectors?: Partial<PipelineConnectors>;
};

export type AdaptivePipelineRunResult = {
  runId: string;
  candidateDir: string;
  sources: ConnectorFetchResult[];
  normalizedRecords: NormalizedEvidenceRecord[];
  principles: CorpusPrinciple[];
  runReport: CorpusRunReport;
};

const DEFAULT_CONNECTORS: PipelineConnectors = {
  pubmed: fetchPubmedEvidenceBatch,
  crossref: fetchCrossrefEvidenceBatch,
  openalex: fetchOpenAlexEvidenceBatch,
};

const SOURCE_QUERIES: Array<{ source: keyof PipelineConnectors; query: string }> = [
  { source: 'pubmed', query: 'resistance training autoregulation safety' },
  { source: 'crossref', query: 'strength training load progression review' },
  { source: 'openalex', query: 'fatigue monitoring resistance training' },
];

function deterministicRunId(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

function buildDefaultPrinciples(records: NormalizedEvidenceRecord[]): CorpusPrinciple[] {
  const provenance = [...new Set(records.map((record) => record.id))];
  if (provenance.length === 0) {
    return [];
  }

  const principle = parseCorpusPrinciple({
    id: 'principle-evidence-freshness-first',
    title: 'Evidence Freshness First',
    summaryFr: 'La priorite est donnee aux recommandations basees sur des preuves recentes et filtrees.',
    guidanceFr:
      'Maintenir une progression prudente et verifier la recuperation avant toute augmentation de charge.',
    provenanceRecordIds: provenance,
    evidenceLevel: 'review',
    guardrail: 'SAFE-03',
  });

  return [principle];
}

export async function runAdaptiveKnowledgePipeline(
  input: RunAdaptiveKnowledgePipelineInput = {},
): Promise<AdaptivePipelineRunResult> {
  const now = input.now ?? new Date();
  const runId = input.runId ?? deterministicRunId(now);
  const mode = input.mode ?? 'refresh';
  const config = parseAdaptiveKnowledgePipelineConfig(input.configOverrides);
  const outputRootDir = input.outputRootDir ?? process.cwd();
  const candidateDir = path.join(outputRootDir, 'snapshots', runId, 'candidate');
  const connectors: PipelineConnectors = {
    ...DEFAULT_CONNECTORS,
    ...(input.connectors ?? {}),
  };

  const stageReports: PipelineStage[] = [];

  stageReports.push({ stage: 'discover', status: 'succeeded', message: `sources=${SOURCE_QUERIES.length}` });

  const sourceResults: ConnectorFetchResult[] = [];
  for (const source of SOURCE_QUERIES) {
    const connector = connectors[source.source];
    const outcome = await connector({
      query: source.query,
      allowedDomains: [...config.allowedDomains],
      freshnessWindowDays: config.freshnessWindowDays,
      retryCount: config.maxRetries,
      timeoutMs: config.requestTimeoutMs,
      now,
    });
    sourceResults.push(outcome);
  }

  const skippedSources = sourceResults.filter((source) => source.skipped).length;
  const normalizedRecords = sourceResults.flatMap((source) => source.records);
  stageReports.push({
    stage: 'ingest',
    status: 'succeeded',
    message: `sources=${sourceResults.length}; skipped=${skippedSources}; records=${normalizedRecords.length}`,
  });

  const principles = buildDefaultPrinciples(normalizedRecords);
  stageReports.push({
    stage: 'synthesize',
    status: 'succeeded',
    message: `principles=${principles.length}`,
  });

  for (const principle of principles) {
    parseCorpusPrinciple(principle);
  }
  stageReports.push({
    stage: 'validate',
    status: 'succeeded',
    message: 'contracts=ok',
  });

  stageReports.push({
    stage: 'publish',
    status: mode === 'refresh' ? 'skipped' : 'skipped',
    message: 'pointer swap disabled in this phase',
  });

  const runReport = parseCorpusRunReport({
    runId,
    mode,
    startedAt: now.toISOString(),
    completedAt: new Date(now.getTime() + 1_000).toISOString(),
    snapshotId: runId,
    stageReports,
  });

  parseCorpusSnapshotManifest({
    snapshotId: runId,
    schemaVersion: 'v1',
    generatedAt: now.toISOString(),
    evidenceRecordCount: normalizedRecords.length,
    principleCount: principles.length,
    sourceDomains: [...new Set(normalizedRecords.map((record) => record.sourceDomain))].sort(),
    artifacts: {
      indexPath: path.join('snapshots', runId, 'candidate', 'sources.json'),
      principlesPath: path.join('snapshots', runId, 'candidate', 'principles.json'),
      reportPath: path.join('snapshots', runId, 'candidate', 'run-report.json'),
    },
  });

  await mkdir(candidateDir, { recursive: true });
  await writeFile(
    path.join(candidateDir, 'sources.json'),
    JSON.stringify(
      {
        runId,
        generatedAt: now.toISOString(),
        sources: sourceResults,
        records: normalizedRecords,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  await writeFile(
    path.join(candidateDir, 'principles.json'),
    JSON.stringify(
      {
        runId,
        generatedAt: now.toISOString(),
        principles,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  await writeFile(path.join(candidateDir, 'run-report.json'), JSON.stringify(runReport, null, 2) + '\n', 'utf8');

  return {
    runId,
    candidateDir,
    sources: sourceResults,
    normalizedRecords,
    principles,
    runReport,
  };
}
