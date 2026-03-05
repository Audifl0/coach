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
import { promoteCandidateSnapshot } from './publish';
import {
  evaluateCorpusQualityGate,
  type CorpusQualityGateResult,
  type QualityGateContradiction,
} from './quality-gates';
import { synthesizeCorpusPrinciples } from './synthesis';

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
  synthesizeImpl?: (records: NormalizedEvidenceRecord[]) => CorpusPrinciple[] | Promise<CorpusPrinciple[]>;
  qualityGateOverrides?: Partial<{
    threshold: number;
    criticalContradictions: QualityGateContradiction[];
  }>;
};

export type AdaptivePipelineRunResult = {
  runId: string;
  candidateDir: string;
  sources: ConnectorFetchResult[];
  normalizedRecords: NormalizedEvidenceRecord[];
  principles: CorpusPrinciple[];
  runReport: CorpusRunReport;
  publish: CorpusQualityGateResult;
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
  const synthesize = input.synthesizeImpl ?? synthesizeCorpusPrinciples;

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

  let principles: CorpusPrinciple[] = [];
  let synthesisErrorMessage: string | null = null;
  let publishErrorMessage: string | null = null;
  let qualityGateResult = evaluateCorpusQualityGate({
    now,
    records: [],
    threshold: input.qualityGateOverrides?.threshold,
    criticalContradictions: input.qualityGateOverrides?.criticalContradictions,
  });
  try {
    principles = await Promise.resolve(synthesize(normalizedRecords));
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

    qualityGateResult = evaluateCorpusQualityGate({
      now,
      records: normalizedRecords,
      threshold: input.qualityGateOverrides?.threshold,
      criticalContradictions: input.qualityGateOverrides?.criticalContradictions,
    });
  } catch (error) {
    synthesisErrorMessage = error instanceof Error ? error.message : String(error);
    stageReports.push({
      stage: 'synthesize',
      status: 'failed',
      message: synthesisErrorMessage,
    });
    stageReports.push({
      stage: 'validate',
      status: 'skipped',
      message: 'blocked-by-synthesis-failure',
    });
  }

  stageReports.push({
    stage: 'publish',
    status: 'skipped',
    message: synthesisErrorMessage
      ? 'blocked-by-synthesis-failure'
      : qualityGateResult.publishable
        ? 'pending-artifact-write'
        : `blocked:${qualityGateResult.reasons.join(',')}`,
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
    sourceDomains:
      [...new Set(normalizedRecords.map((record) => record.sourceDomain))].sort().length > 0
        ? [...new Set(normalizedRecords.map((record) => record.sourceDomain))].sort()
        : ['unavailable'],
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

  if (!synthesisErrorMessage && qualityGateResult.publishable) {
    try {
      const publish = await promoteCandidateSnapshot({
        outputRootDir,
        snapshotId: runId,
        candidateDir,
        now,
      });
      const publishStage = runReport.stageReports.find((stage) => stage.stage === 'publish');
      if (publishStage) {
        publishStage.status = 'succeeded';
        publishStage.message = publish.previousSnapshotId
          ? `promoted:${runId};rollback=${publish.previousSnapshotId}`
          : `promoted:${runId};rollback=none`;
      }
      await writeFile(path.join(candidateDir, 'run-report.json'), JSON.stringify(runReport, null, 2) + '\n', 'utf8');
    } catch (error) {
      publishErrorMessage = error instanceof Error ? error.message : String(error);
      const publishStage = runReport.stageReports.find((stage) => stage.stage === 'publish');
      if (publishStage) {
        publishStage.status = 'failed';
        publishStage.message = publishErrorMessage;
      }
      await writeFile(path.join(candidateDir, 'run-report.json'), JSON.stringify(runReport, null, 2) + '\n', 'utf8');
    }
  }

  if (synthesisErrorMessage) {
    throw new Error(`synthesize stage failed: ${synthesisErrorMessage}`);
  }
  if (publishErrorMessage) {
    throw new Error(`publish stage failed: ${publishErrorMessage}`);
  }

  return {
    runId,
    candidateDir,
    sources: sourceResults,
    normalizedRecords,
    principles,
    runReport,
    publish: qualityGateResult,
  };
}
