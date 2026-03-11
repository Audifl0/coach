import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { parseAdaptiveKnowledgePipelineConfig } from './config';
import {
  parseCorpusPrinciple,
  parseCorpusRunReport,
  parseCorpusSnapshotManifest,
  type CorpusSnapshotManifest,
  type CorpusPrinciple,
  type CorpusRunReport,
  type NormalizedEvidenceRecord,
  type ValidatedSynthesis,
} from './contracts';
import { fetchCrossrefEvidenceBatch } from './connectors/crossref';
import { buildAdaptiveKnowledgeDiscoveryPlan } from './discovery';
import { fetchOpenAlexEvidenceBatch } from './connectors/openalex';
import { fetchPubmedEvidenceBatch } from './connectors/pubmed';
import {
  dedupeNormalizedEvidenceRecords,
  parseConnectorCursorState,
  type ConnectorFetchInput,
  type ConnectorFetchResult,
} from './connectors/shared';
import { promoteCandidateSnapshot } from './publish';
import {
  evaluateCorpusQualityGate,
  type CorpusQualityGateResult,
  type QualityGateContradiction,
} from './quality-gates';
import { curateAdaptiveKnowledgeBible } from './curation';
import { createConfiguredOpenAiCorpusSynthesisClient, CorpusRemoteSynthesisError } from './remote-synthesis';
import {
  buildValidatedSynthesisFromPrinciples,
  synthesizeCorpusPrinciples,
  synthesizeCorpusWithRemoteModel,
  type CorpusSynthesisOutput,
} from './synthesis';

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
  synthesizeImpl?: (
    records: NormalizedEvidenceRecord[],
  ) => CorpusPrinciple[] | CorpusSynthesisOutput | Promise<CorpusPrinciple[] | CorpusSynthesisOutput>;
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
  validatedSynthesis: ValidatedSynthesis;
  runReport: CorpusRunReport;
  publish: CorpusQualityGateResult;
};

const DEFAULT_CONNECTORS: PipelineConnectors = {
  pubmed: fetchPubmedEvidenceBatch,
  crossref: fetchCrossrefEvidenceBatch,
  openalex: fetchOpenAlexEvidenceBatch,
};

function normalizeSynthesisResult(
  records: NormalizedEvidenceRecord[],
  result: CorpusPrinciple[] | CorpusSynthesisOutput,
): CorpusSynthesisOutput {
  if (Array.isArray(result)) {
    return {
      principles: result,
      validatedSynthesis: buildValidatedSynthesisFromPrinciples({
        records,
        principles: result,
      }),
    };
  }

  return {
    principles: result.principles,
    validatedSynthesis: result.validatedSynthesis,
  };
}

function deterministicRunId(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

async function loadCursorState(outputRootDir: string): Promise<{ seenRecordIds: string[] }> {
  try {
    const raw = await readFile(path.join(outputRootDir, 'connector-state.json'), 'utf8');
    return parseConnectorCursorState(JSON.parse(raw) as unknown);
  } catch {
    return {
      seenRecordIds: [],
    };
  }
}

async function writeCursorState(outputRootDir: string, seenRecordIds: string[]): Promise<void> {
  await writeFile(
    path.join(outputRootDir, 'connector-state.json'),
    JSON.stringify(
      {
        seenRecordIds: seenRecordIds.slice(-500),
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
}

async function loadPreviousManifest(outputRootDir: string): Promise<CorpusSnapshotManifest | null> {
  try {
    const activePointerRaw = await readFile(path.join(outputRootDir, 'active.json'), 'utf8');
    const activePointer = JSON.parse(activePointerRaw) as { snapshotDir?: string };
    if (!activePointer.snapshotDir) {
      return null;
    }
    const manifestRaw = await readFile(path.join(activePointer.snapshotDir, 'manifest.json'), 'utf8');
    return JSON.parse(manifestRaw) as CorpusSnapshotManifest;
  } catch {
    return null;
  }
}

export async function runAdaptiveKnowledgePipeline(
  input: RunAdaptiveKnowledgePipelineInput = {},
): Promise<AdaptivePipelineRunResult> {
  const now = input.now ?? new Date();
  const runId = input.runId ?? deterministicRunId(now);
  const mode = input.mode ?? 'refresh';
  const config = parseAdaptiveKnowledgePipelineConfig(input.configOverrides);
  const outputRootDir =
    input.outputRootDir ?? path.join(process.cwd(), '.planning', 'knowledge', 'adaptive-coaching');
  const candidateDir = path.join(outputRootDir, 'snapshots', runId, 'candidate');
  const connectors: PipelineConnectors = {
    ...DEFAULT_CONNECTORS,
    ...(input.connectors ?? {}),
  };
  const synthesize =
    input.synthesizeImpl ??
    (async (records: NormalizedEvidenceRecord[]) =>
      synthesizeCorpusWithRemoteModel({
        records,
        runId,
        client: createConfiguredOpenAiCorpusSynthesisClient(),
      }));
  const cursorState = await loadCursorState(outputRootDir);
  const discoveryPlan = buildAdaptiveKnowledgeDiscoveryPlan({
    sources: Object.keys(connectors) as Array<keyof PipelineConnectors>,
    maxQueries: config.maxQueriesPerRun,
  });

  const stageReports: PipelineStage[] = [];

  stageReports.push({
    stage: 'discover',
    status: 'succeeded',
    message: `discovered=${discoveryPlan.length}; maxQueries=${config.maxQueriesPerRun}`,
  });

  const sourceResults = await Promise.all(
    discoveryPlan.map(async (source) => {
      const connector = connectors[source.source];
      return connector({
        query: source.query,
        allowedDomains: [...config.allowedDomains],
        freshnessWindowDays: config.freshnessWindowDays,
        retryCount: config.maxRetries,
        timeoutMs: config.requestTimeoutMs,
        now,
        cursorState,
      });
    }),
  );

  const skippedSources = sourceResults.filter((source) => source.skipped).length;
  const rawNormalizedRecords = sourceResults.flatMap((source) => source.records);
  const incrementalFilteredRecords = rawNormalizedRecords.filter(
    (record) => !cursorState.seenRecordIds.includes(record.id),
  );
  const normalizedRecords = dedupeNormalizedEvidenceRecords(incrementalFilteredRecords);
  const dedupedRecords = incrementalFilteredRecords.length - normalizedRecords.length;
  const incrementalSkipped = rawNormalizedRecords.length - incrementalFilteredRecords.length;
  const fetchedRecords = sourceResults.reduce((total, source) => total + source.recordsFetched, 0);
  const skippedRecords = sourceResults.reduce((total, source) => total + source.recordsSkipped, 0);
  stageReports.push({
    stage: 'ingest',
    status: 'succeeded',
    message:
      `sources=${sourceResults.length}; skippedSources=${skippedSources}; ` +
      `fetched=${fetchedRecords}; incrementalSkipped=${incrementalSkipped}; deduped=${dedupedRecords}; skipped=${skippedRecords}; normalized=${normalizedRecords.length}`,
  });

  let principles: CorpusPrinciple[] = [];
  let validatedSynthesis = buildValidatedSynthesisFromPrinciples({
    records: [],
    principles: [],
  });
  let manifest: CorpusSnapshotManifest | null = null;
  let synthesisErrorMessage: string | null = null;
  let publishErrorMessage: string | null = null;
  let qualityGateResult = evaluateCorpusQualityGate({
    now,
    records: [],
    threshold: input.qualityGateOverrides?.threshold,
    criticalContradictions: input.qualityGateOverrides?.criticalContradictions,
  });
  try {
    const synthesisResult = normalizeSynthesisResult(normalizedRecords, await Promise.resolve(synthesize(normalizedRecords)));
    principles = synthesisResult.principles;
    validatedSynthesis = synthesisResult.validatedSynthesis;
    stageReports.push({
      stage: 'synthesize',
      status: 'succeeded',
      message:
        `principles=${principles.length}; ` +
        `coverage=${validatedSynthesis.coverage.recordCount}; ` +
        `provider=${validatedSynthesis.modelRun.provider}`,
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
      validatedSynthesis,
      threshold: input.qualityGateOverrides?.threshold,
      criticalContradictions: input.qualityGateOverrides?.criticalContradictions,
    });
  } catch (error) {
    if (error instanceof CorpusRemoteSynthesisError) {
      synthesisErrorMessage = `${error.reason};provider=openai`;
    } else {
      synthesisErrorMessage = error instanceof Error ? error.message : String(error);
    }
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

  manifest = parseCorpusSnapshotManifest({
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
      validatedSynthesisPath: path.join('snapshots', runId, 'candidate', 'validated-synthesis.json'),
    },
  });
  const previousManifest = await loadPreviousManifest(outputRootDir);
  const curatedBible = curateAdaptiveKnowledgeBible({
    records: normalizedRecords,
    principles,
    validatedSynthesis,
  });

  await mkdir(candidateDir, { recursive: true });
  await writeCursorState(
    outputRootDir,
    [...cursorState.seenRecordIds, ...normalizedRecords.map((record) => record.id)],
  );
  await writeFile(
    path.join(candidateDir, 'sources.json'),
    JSON.stringify(
      {
        runId,
        generatedAt: now.toISOString(),
        discoveryPlan,
        sources: sourceResults,
        records: normalizedRecords,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  await writeFile(
    path.join(candidateDir, 'validated-synthesis.json'),
    JSON.stringify(
      {
        runId,
        generatedAt: now.toISOString(),
        ...validatedSynthesis,
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
  await writeFile(path.join(candidateDir, 'knowledge-bible.json'), JSON.stringify(curatedBible, null, 2) + '\n', 'utf8');
  await writeFile(path.join(candidateDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  await writeFile(
    path.join(candidateDir, 'diff.json'),
    JSON.stringify(
      {
        previousSnapshotId: previousManifest?.snapshotId ?? null,
        currentSnapshotId: runId,
        evidenceRecordDelta: normalizedRecords.length - (previousManifest?.evidenceRecordCount ?? 0),
        principleDelta: principles.length - (previousManifest?.principleCount ?? 0),
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  await writeFile(path.join(candidateDir, 'run-report.json'), JSON.stringify(runReport, null, 2) + '\n', 'utf8');

  if (!synthesisErrorMessage && qualityGateResult.publishable) {
    if (mode === 'check') {
      const publishStage = runReport.stageReports.find((stage) => stage.stage === 'publish');
      if (publishStage) {
        publishStage.message = 'check-mode-no-publish';
      }
      await writeFile(path.join(candidateDir, 'run-report.json'), JSON.stringify(runReport, null, 2) + '\n', 'utf8');
    } else {
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
        await writeFile(path.join(publish.pointer.snapshotDir, 'run-report.json'), JSON.stringify(runReport, null, 2) + '\n', 'utf8');
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
    validatedSynthesis,
    runReport,
    publish: qualityGateResult,
  };
}
