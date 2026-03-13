import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { parseAdaptiveKnowledgePipelineConfig } from './config';
import {
  parseAdaptiveKnowledgeCollectionJob,
  parseAdaptiveKnowledgeBootstrapRunTelemetry,
  parseAdaptiveKnowledgeRankingTelemetry,
  parseAdaptiveKnowledgeCoverageGap,
  parseAdaptiveKnowledgeDiscoveryTelemetry,
  parseCorpusPrinciple,
  parseCorpusRunReport,
  parseCorpusSnapshotManifest,
  type AdaptiveKnowledgeCoverageGap,
  type AdaptiveKnowledgeBootstrapRunTelemetry,
  type AdaptiveKnowledgeCollectionJob,
  type AdaptiveKnowledgeDiscoveryQuery,
  type AdaptiveKnowledgeDiscoveryTelemetry,
  type AdaptiveKnowledgeRankingTelemetry,
  type CorpusSnapshotManifest,
  type CorpusPrinciple,
  type CorpusRunReport,
  type NormalizedEvidenceRecord,
  type ValidatedSynthesis,
} from './contracts';
import { fetchCrossrefEvidenceBatch } from './connectors/crossref';
import { buildAdaptiveKnowledgeBootstrapCollectionJobs, buildAdaptiveKnowledgeDiscoveryPlan } from './discovery';
import { fetchOpenAlexEvidenceBatch } from './connectors/openalex';
import { fetchPubmedEvidenceBatch } from './connectors/pubmed';
import {
  buildDocumentaryRecordStagingArtifact,
  dedupeNormalizedEvidenceRecords,
  parseConnectorCursorState,
  type ConnectorFetchInput,
  type ConnectorFetchResult,
} from './connectors/shared';
import { promoteCandidateSnapshot } from './publish';
import { upsertAdaptiveKnowledgeBootstrapCampaignState } from './worker-state';
import {
  evaluateCorpusQualityGate,
  type CorpusQualityGateResult,
  type QualityGateContradiction,
} from './quality-gates';
import { curateAdaptiveKnowledgeBible } from './curation';
import { createConfiguredOpenAiCorpusSynthesisClient, CorpusRemoteSynthesisError } from './remote-synthesis';
import {
  buildStructuredExtractionPlan,
  buildValidatedSynthesisFromPrinciples,
  rankEvidenceRecords,
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

type PipelineMode = 'bootstrap' | 'refresh' | 'check';

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
    bootstrapMaxJobsPerRun: number;
    bootstrapMaxPagesPerJob: number;
    bootstrapMaxCanonicalRecordsPerRun: number;
    bootstrapMaxRuntimeMs: number;
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

function buildDiscoveryTelemetry(input: {
  discoveryPlan: AdaptiveKnowledgeDiscoveryQuery[];
  sourceResults: ConnectorFetchResult[];
  normalizedRecords: NormalizedEvidenceRecord[];
}): AdaptiveKnowledgeDiscoveryTelemetry {
  const fetchedByTopic = new Map<string, number>();
  const normalizedByTopic = new Map<string, number>();
  const groupedQueries = new Map<string, AdaptiveKnowledgeDiscoveryQuery[]>();

  input.discoveryPlan.forEach((query, index) => {
    const fetched = input.sourceResults[index]?.records.length ?? 0;
    fetchedByTopic.set(query.topicKey, (fetchedByTopic.get(query.topicKey) ?? 0) + fetched);
    const existing = groupedQueries.get(query.topicKey);
    if (existing) {
      existing.push(query);
    } else {
      groupedQueries.set(query.topicKey, [query]);
    }
  });

  for (const record of input.normalizedRecords) {
    for (const tag of record.tags) {
      normalizedByTopic.set(tag, (normalizedByTopic.get(tag) ?? 0) + 1);
    }
  }

  const coverageGaps: AdaptiveKnowledgeCoverageGap[] = [...groupedQueries.entries()].map(([topicKey, queries]) => {
    const normalizedRecordCount = normalizedByTopic.get(topicKey) ?? 0;
    const fetchedRecordCount = fetchedByTopic.get(topicKey) ?? 0;
    const status: AdaptiveKnowledgeCoverageGap['status'] =
      normalizedRecordCount >= queries.length ? 'covered' : normalizedRecordCount > 0 || fetchedRecordCount > 0 ? 'partial' : 'uncovered';

    return parseAdaptiveKnowledgeCoverageGap({
      topicKey,
      topicLabel: queries[0]?.topicLabel ?? topicKey,
      targetQueryCount: queries.length,
      servedQueryCount: queries.length,
      fetchedRecordCount,
      normalizedRecordCount,
      status,
    });
  });

  return parseAdaptiveKnowledgeDiscoveryTelemetry({
    targetTopicKeys: [...new Set(input.discoveryPlan.map((query) => query.topicKey))],
    targetTopicLabels: [...new Set(input.discoveryPlan.map((query) => query.topicLabel))],
    totalQueries: input.discoveryPlan.length,
    coverageGaps: coverageGaps.sort((left, right) => left.topicKey.localeCompare(right.topicKey)),
  });
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

async function loadBootstrapCollectionJobs(outputRootDir: string): Promise<AdaptiveKnowledgeCollectionJob[]> {
  try {
    const raw = await readFile(path.join(outputRootDir, 'bootstrap-jobs.json'), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((job) => parseAdaptiveKnowledgeCollectionJob(job));
  } catch {
    return [];
  }
}

async function writeBootstrapCollectionJobs(
  outputRootDir: string,
  jobs: readonly AdaptiveKnowledgeCollectionJob[],
): Promise<void> {
  await writeFile(path.join(outputRootDir, 'bootstrap-jobs.json'), JSON.stringify(jobs, null, 2) + '\n', 'utf8');
}

function summarizeBootstrapQueue(jobs: readonly AdaptiveKnowledgeCollectionJob[]) {
  return {
    pending: jobs.filter((job) => job.status === 'pending').length,
    running: jobs.filter((job) => job.status === 'running').length,
    blocked: jobs.filter((job) => job.status === 'blocked').length,
    completed: jobs.filter((job) => job.status === 'completed').length,
    exhausted: jobs.filter((job) => job.status === 'exhausted').length,
    total: jobs.length,
  };
}

function finalizeBootstrapJob(input: {
  job: AdaptiveKnowledgeCollectionJob;
  result: ConnectorFetchResult | undefined;
  maxPagesPerJob: number;
}): {
  job: AdaptiveKnowledgeCollectionJob;
  exhaustionReason: 'sourceExhausted' | 'maxPagesReached' | 'blocked' | null;
} {
  const nextPagesFetched = input.job.pagesFetched + 1;
  const fetchedRecords = input.result?.recordsFetched ?? 0;
  const canonicalRecords = input.result?.records.length ?? 0;
  const nextCursor = input.result?.telemetry.nextCursor ?? input.job.cursor ?? null;
  const errorMessage = input.result?.error?.message ?? null;

  if (input.result?.skipped || errorMessage) {
    return {
      job: parseAdaptiveKnowledgeCollectionJob({
        ...input.job,
        status: 'blocked',
        cursor: nextCursor,
        pagesFetched: nextPagesFetched,
        recordsFetched: input.job.recordsFetched + fetchedRecords,
        canonicalRecords: input.job.canonicalRecords + canonicalRecords,
        lastError: errorMessage ?? 'connector-skipped',
      }),
      exhaustionReason: 'blocked',
    };
  }

  if (nextPagesFetched >= input.maxPagesPerJob) {
    return {
      job: parseAdaptiveKnowledgeCollectionJob({
        ...input.job,
        status: 'exhausted',
        cursor: nextCursor,
        pagesFetched: nextPagesFetched,
        recordsFetched: input.job.recordsFetched + fetchedRecords,
        canonicalRecords: input.job.canonicalRecords + canonicalRecords,
        lastError: 'max-pages-reached',
      }),
      exhaustionReason: 'maxPagesReached',
    };
  }

  if (!input.result?.telemetry.nextCursor || fetchedRecords === 0) {
    return {
      job: parseAdaptiveKnowledgeCollectionJob({
        ...input.job,
        status: 'exhausted',
        cursor: nextCursor,
        pagesFetched: nextPagesFetched,
        recordsFetched: input.job.recordsFetched + fetchedRecords,
        canonicalRecords: input.job.canonicalRecords + canonicalRecords,
        lastError: errorMessage,
      }),
      exhaustionReason: 'sourceExhausted',
    };
  }

  return {
    job: parseAdaptiveKnowledgeCollectionJob({
      ...input.job,
      status: 'pending',
      cursor: input.result.telemetry.nextCursor,
      pagesFetched: nextPagesFetched,
      recordsFetched: input.job.recordsFetched + fetchedRecords,
      canonicalRecords: input.job.canonicalRecords + canonicalRecords,
      lastError: null,
    }),
    exhaustionReason: null,
  };
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
  const existingBootstrapJobs = mode === 'bootstrap' ? await loadBootstrapCollectionJobs(outputRootDir) : [];
  const plannedBootstrapJobs =
    mode === 'bootstrap'
      ? buildAdaptiveKnowledgeBootstrapCollectionJobs({
          sources: Object.keys(connectors) as Array<keyof PipelineConnectors>,
          maxJobs: config.bootstrap.maxJobsPerRun,
          existingJobs: existingBootstrapJobs,
        })
      : [];
  const bootstrapJobs =
    mode === 'bootstrap'
      ? plannedBootstrapJobs.length > 0
        ? plannedBootstrapJobs
        : existingBootstrapJobs
            .filter((job) => job.status === 'completed')
            .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
            .slice(0, config.bootstrap.maxJobsPerRun)
            .map((job) =>
              parseAdaptiveKnowledgeCollectionJob({
                ...job,
                status: 'pending',
                lastError: null,
              }),
            )
      : [];
  const discoveryPlan =
    mode === 'bootstrap'
      ? bootstrapJobs.map((job) => ({
          source: job.source,
          query: job.query,
          topicKey: job.topicKey,
          topicLabel: job.topicLabel,
          subtopicKey: job.subtopicKey,
          subtopicLabel: job.subtopicLabel,
          queryFamily: job.queryFamily,
          priority: job.priority,
          targetPopulation: job.targetPopulation ?? null,
        }))
      : buildAdaptiveKnowledgeDiscoveryPlan({
          sources: Object.keys(connectors) as Array<keyof PipelineConnectors>,
          maxQueries: config.maxQueriesPerRun,
        });

  const stageReports: PipelineStage[] = [];

  const sourceResults = await Promise.all(
    discoveryPlan.map(async (source, index) => {
      const connector = connectors[source.source];
      return connector({
        query: source.query,
        allowedDomains: [...config.allowedDomains],
        freshnessWindowDays: config.freshnessWindowDays,
        retryCount: config.maxRetries,
        timeoutMs: config.requestTimeoutMs,
        now,
        cursorState,
        collectionJob: mode === 'bootstrap' ? bootstrapJobs[index] : undefined,
      });
    }),
  );

  const skippedSources = sourceResults.filter((source) => source.skipped).length;
  const rawNormalizedRecords = sourceResults.flatMap((source) => source.records);
  const incrementalFilteredRecords = rawNormalizedRecords.filter(
    (record) => !cursorState.seenRecordIds.includes(record.id),
  );
  const normalizedRecords = dedupeNormalizedEvidenceRecords(incrementalFilteredRecords);
  const discoveryTelemetry = buildDiscoveryTelemetry({
    discoveryPlan,
    sourceResults,
    normalizedRecords,
  });
  const rankingSelection = rankEvidenceRecords(normalizedRecords, now);
  const rankedRecords = rankingSelection.scoredRecords;
  const candidateRecordsForSynthesis =
    rankingSelection.selectedRecords.length > 0 ? rankingSelection.selectedRecords : rankedRecords;
  const extractionPlan = buildStructuredExtractionPlan({
    records: candidateRecordsForSynthesis,
  });
  const recordsForSynthesis = extractionPlan.extractableRecords;
  const rankingTelemetry: AdaptiveKnowledgeRankingTelemetry = parseAdaptiveKnowledgeRankingTelemetry(
    rankingSelection.telemetry,
  );
  const dedupedRecords = incrementalFilteredRecords.length - normalizedRecords.length;
  const incrementalSkipped = rawNormalizedRecords.length - incrementalFilteredRecords.length;
  const fetchedRecords = sourceResults.reduce((total, source) => total + source.recordsFetched, 0);
  const skippedRecords = sourceResults.reduce((total, source) => total + source.recordsSkipped, 0);
  const finalizedBootstrapJobs =
    mode === 'bootstrap'
      ? bootstrapJobs.map((job, index) =>
          finalizeBootstrapJob({
            job,
            result: sourceResults[index],
            maxPagesPerJob: config.bootstrap.maxPagesPerJob,
          }),
        )
      : [];
  const persistedBootstrapJobs =
    mode === 'bootstrap'
      ? [
          ...existingBootstrapJobs.filter((job) => !new Set(bootstrapJobs.map((activeJob) => activeJob.id)).has(job.id)),
          ...finalizedBootstrapJobs.map((entry) => entry.job),
        ].sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
      : [];
  const bootstrapTelemetry: AdaptiveKnowledgeBootstrapRunTelemetry | undefined =
    mode === 'bootstrap'
      ? parseAdaptiveKnowledgeBootstrapRunTelemetry({
          queueDepth: summarizeBootstrapQueue(persistedBootstrapJobs),
          jobsProcessed: bootstrapJobs.length,
          pagesConsumed: bootstrapJobs.length,
          processedJobIds: bootstrapJobs.map((job) => job.id),
          pendingJobIds: persistedBootstrapJobs.filter((job) => job.status === 'pending').map((job) => job.id),
          exhaustionReasons: {
            sourceExhausted: finalizedBootstrapJobs.filter((entry) => entry.exhaustionReason === 'sourceExhausted').length,
            maxPagesReached: finalizedBootstrapJobs.filter((entry) => entry.exhaustionReason === 'maxPagesReached').length,
            blocked: finalizedBootstrapJobs.filter((entry) => entry.exhaustionReason === 'blocked').length,
            deferred: persistedBootstrapJobs.filter((job) => job.status === 'pending').length,
          },
          dedupedCanonicalRecords: dedupedRecords,
          incrementalSkippedRecords: incrementalSkipped,
        })
      : undefined;
  stageReports.push({
    stage: 'discover',
    status: 'succeeded',
    message:
      `discovered=${discoveryPlan.length}; maxQueries=${config.maxQueriesPerRun}; ` +
      `topics=${discoveryTelemetry.targetTopicKeys.join(',')}; ` +
      `gaps=${discoveryTelemetry.coverageGaps.filter((gap) => gap.status !== 'covered').length}`,
  });
  stageReports.push({
    stage: 'ingest',
    status: 'succeeded',
    message:
      `sources=${sourceResults.length}; skippedSources=${skippedSources}; ` +
      `fetched=${fetchedRecords}; incrementalSkipped=${incrementalSkipped}; deduped=${dedupedRecords}; skipped=${skippedRecords}; normalized=${normalizedRecords.length}; selected=${rankingTelemetry.selectedRecordCount}; rejected=${rankingTelemetry.rejectedRecordCount}`,
  });
  if (extractionPlan.deferredRecordIds.length > 0) {
    stageReports[1]!.message +=
      `; extractable=${recordsForSynthesis.length}; deferredDocuments=${extractionPlan.deferredRecordIds.length}`;
  }
  if (bootstrapTelemetry) {
    stageReports[1]!.message +=
      `; queue=${bootstrapTelemetry.queueDepth.total}; pending=${bootstrapTelemetry.queueDepth.pending}; ` +
      `processed=${bootstrapTelemetry.jobsProcessed}; pages=${bootstrapTelemetry.pagesConsumed}; exhausted=${bootstrapTelemetry.queueDepth.exhausted}; blocked=${bootstrapTelemetry.queueDepth.blocked}`;
  }

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
  if (candidateRecordsForSynthesis.length > 0 && recordsForSynthesis.length === 0) {
    stageReports.push({
      stage: 'synthesize',
      status: 'skipped',
      message: 'blocked-by-document-triage',
    });
    stageReports.push({
      stage: 'validate',
      status: 'skipped',
      message: 'blocked-by-document-triage',
    });
    qualityGateResult = evaluateCorpusQualityGate({
      now,
      records: normalizedRecords,
      validatedSynthesis,
      threshold: input.qualityGateOverrides?.threshold,
      criticalContradictions: input.qualityGateOverrides?.criticalContradictions,
    });
  } else if (recordsForSynthesis.length === 0) {
    stageReports.push({
      stage: 'synthesize',
      status: 'skipped',
      message: 'no-records-selected-for-synthesis',
    });
    stageReports.push({
      stage: 'validate',
      status: 'skipped',
      message: 'blocked-by-empty-corpus',
    });
    qualityGateResult = evaluateCorpusQualityGate({
      now,
      records: normalizedRecords,
      validatedSynthesis,
      threshold: input.qualityGateOverrides?.threshold,
      criticalContradictions: input.qualityGateOverrides?.criticalContradictions,
    });
  } else {
    try {
      const synthesisResult = normalizeSynthesisResult(recordsForSynthesis, await Promise.resolve(synthesize(recordsForSynthesis)));
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
        synthesisErrorMessage = error.message;
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
    discovery: discoveryTelemetry,
    ranking: rankingTelemetry,
    bootstrap: bootstrapTelemetry,
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
      studyExtractionsPath: path.join('snapshots', runId, 'candidate', 'study-extractions.json'),
      documentStagingPath: path.join('snapshots', runId, 'candidate', 'document-staging.json'),
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
  if (mode === 'bootstrap') {
    await writeBootstrapCollectionJobs(outputRootDir, persistedBootstrapJobs);
    const canonicalRecordIds = [...new Set([...cursorState.seenRecordIds, ...normalizedRecords.map((record) => record.id)])];
    await upsertAdaptiveKnowledgeBootstrapCampaignState({
      outputRootDir,
      runId,
      now: new Date(now.getTime() + 500),
      status: 'completed',
      backlog: {
        pending: bootstrapTelemetry?.queueDepth.pending ?? 0,
        running: bootstrapTelemetry?.queueDepth.running ?? 0,
        blocked: bootstrapTelemetry?.queueDepth.blocked ?? 0,
        completed:
          (bootstrapTelemetry?.queueDepth.completed ?? 0) + (bootstrapTelemetry?.queueDepth.exhausted ?? 0),
        exhausted: bootstrapTelemetry?.queueDepth.exhausted ?? 0,
      },
      progress: {
        discoveredQueryFamilies: new Set(discoveryPlan.map((query) => query.queryFamily)).size,
        canonicalRecordCount: canonicalRecordIds.length,
        extractionBacklogCount:
          validatedSynthesis.studyExtractions.length > 0
            ? Math.max(recordsForSynthesis.length - validatedSynthesis.studyExtractions.length, 0) +
              extractionPlan.deferredRecordIds.length
            : recordsForSynthesis.length + extractionPlan.deferredRecordIds.length,
        publicationCandidateCount: principles.length,
      },
    });
  }
  await writeFile(
    path.join(candidateDir, 'sources.json'),
    JSON.stringify(
      {
        runId,
        generatedAt: now.toISOString(),
        discoveryPlan,
        discovery: discoveryTelemetry,
        ranking: rankingTelemetry,
        bootstrap: bootstrapTelemetry,
        selectedRecordIds: recordsForSynthesis.map((record) => record.id),
        rejectedRecordIds: rankingSelection.rejectedRecords.map((record) => record.id),
        sources: sourceResults,
        records: rankedRecords,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  await writeFile(
    path.join(candidateDir, 'document-staging.json'),
    JSON.stringify(
      buildDocumentaryRecordStagingArtifact({
        runId,
        generatedAt: now.toISOString(),
        recordIds: rankedRecords.map((record) => record.id),
        promotedRecordIds: normalizedRecords.map((record) => record.id),
        triage: {
          extractableRecordIds: recordsForSynthesis.map((record) => record.id),
          deferredRecordIds: extractionPlan.deferredRecordIds,
          lotIds: extractionPlan.lots.map((lot) => lot.lotId),
        },
        records: rankedRecords,
      }),
      null,
      2,
    ) + '\n',
    'utf8',
  );
  await writeFile(
    path.join(candidateDir, 'study-extractions.json'),
    JSON.stringify(
      {
        runId,
        generatedAt: now.toISOString(),
        studyExtractions: validatedSynthesis.studyExtractions,
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
    normalizedRecords: rankedRecords,
    principles,
    validatedSynthesis,
    runReport,
    publish: qualityGateResult,
  };
}
