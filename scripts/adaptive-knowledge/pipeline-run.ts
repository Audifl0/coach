import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  parseAdaptiveKnowledgePipelineConfig } from './config';
import {
  parseAdaptiveKnowledgeCollectionJob,
  parseAdaptiveKnowledgeBootstrapRunTelemetry,
  parseAdaptiveKnowledgeRankingTelemetry,
  parseAdaptiveKnowledgeCoverageGap,
  parseAdaptiveKnowledgeDiscoveryTelemetry,
  parseCorpusPrinciple,
  parseCorpusRunReport,
  parseCorpusSnapshotManifest,
  parseDoctrineRevisionEntry,
  parsePublishedDoctrinePrinciple,
  parsePublishedDoctrineSnapshot,
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
  type QuestionSynthesisDossier,
  type ThematicSynthesis,
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
import { createConfiguredOpenAiCorpusSynthesisClient, CorpusRemoteSynthesisError, type CorpusRemoteSynthesisClient } from './remote-synthesis';
import {
  buildStructuredExtractionPlan,
  buildValidatedSynthesisFromPrinciples,
  rankEvidenceRecords,
  synthesizeCorpusPrinciples,
  synthesizeCorpusWithRemoteModel,
  type CorpusSynthesisOutput,
} from './synthesis';
import { acquireFullText, type FullTextAcquisitionResult } from './fulltext-acquisition';
import { extractStudyCards } from './study-card-extraction';
import { synthesizeThematicPrinciples } from './thematic-synthesis';
import { renderBookletMarkdown } from './booklet-renderer';
import { buildDocumentRegistryRecordFromNormalizedRecord, upsertDocumentRegistryRecords } from './registry/doc-library';
import { buildStudyDossierFromStudyCard, upsertStudyDossiers } from './registry/study-dossiers';
import { loadScientificQuestions, upsertScientificQuestions } from './registry/scientific-questions';
import { enqueueWorkItems } from './registry/work-queues';
import { linkStudiesToScientificQuestions } from './question-linking';
import { analyzeQuestionContradictions, buildQuestionSynthesisDossier } from './contradiction-analysis';
import { evaluateDoctrineCandidatePublication, reconcileDoctrineAgainstDossiers } from './conservative-publication';
import {
  appendDoctrineRevisionEntries,
  loadPublishedDoctrineSnapshot,
  writePublishedDoctrineSnapshot,
} from './registry/doctrine';

type PipelineConnectorFn = (input: ConnectorFetchInput) => Promise<ConnectorFetchResult>;

type PipelineConnectors = {
  pubmed: PipelineConnectorFn;
  crossref: PipelineConnectorFn;
  openalex: PipelineConnectorFn;
};

type StageStatus = 'succeeded' | 'failed' | 'skipped';

type PipelineStage = {
  stage:
    | 'discover'
    | 'ingest'
    | 'fulltext'
    | 'extract-study-cards'
    | 'thematic-synthesis'
    | 'synthesize'
    | 'validate'
    | 'publish';
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
    maxQueriesPerRun: number;
    pagesPerQuery: number;
    fulltextBudgetPerRun: number;
    bootstrapMaxJobsPerRun: number;
    bootstrapMaxPagesPerJob: number;
    bootstrapMaxCanonicalRecordsPerRun: number;
    bootstrapMaxRuntimeMs: number;
  }>;
  connectors?: Partial<PipelineConnectors>;
  remoteSynthesisClient?: CorpusRemoteSynthesisClient;
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

function buildQualityGateProjection(input: {
  mode: PipelineMode;
  normalizedRecords: NormalizedEvidenceRecord[];
  cursorState: { seenRecordIds: string[] };
  bootstrapTelemetry?: AdaptiveKnowledgeBootstrapRunTelemetry;
}): NonNullable<RunAdaptiveKnowledgePipelineInput['qualityGateOverrides']> extends never
  ? never
  : {
      libraryRecordCount: number;
      projectionRecordCount: number;
      backlogRecordCount: number;
      projectionSafe: boolean;
      canonicalRecordsOnly: boolean;
    } {
  const libraryRecordCount =
    input.mode === 'bootstrap'
      ? new Set([...input.cursorState.seenRecordIds, ...input.normalizedRecords.map((record) => record.id)]).size
      : input.normalizedRecords.length;
  const backlogRecordCount =
    input.mode === 'bootstrap'
      ? (input.bootstrapTelemetry?.queueDepth.pending ?? 0) +
        (input.bootstrapTelemetry?.queueDepth.running ?? 0) +
        (input.bootstrapTelemetry?.queueDepth.blocked ?? 0)
      : 0;

  return {
    libraryRecordCount,
    projectionRecordCount: input.normalizedRecords.length,
    backlogRecordCount,
    projectionSafe: true,
    canonicalRecordsOnly: true,
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
    (async (records: NormalizedEvidenceRecord[]) => {
      try {
        const client = input.remoteSynthesisClient ?? createConfiguredOpenAiCorpusSynthesisClient();
        return await synthesizeCorpusWithRemoteModel({
          records,
          runId,
          client,
        });
      } catch (configError) {
        // Fall back to local deterministic synthesis when remote client is not configured
        if (configError instanceof Error && configError.message.includes('not configured')) {
          return synthesizeCorpusPrinciples(records);
        }
        throw configError;
      }
    });
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

  const pagesPerQuery = config.pagesPerQuery;

  const sourceResults = await Promise.all(
    discoveryPlan.map(async (source, index) => {
      const connector = connectors[source.source];
      const allRecords: ConnectorFetchResult['records'] = [];
      let totalFetched = 0;
      let totalSkipped = 0;
      let lastTelemetry: ConnectorFetchResult['telemetry'] = { attempts: 0 };
      let lastError: ConnectorFetchResult['error'];
      let wasSkipped = false;

      for (let page = 0; page < pagesPerQuery; page++) {
        const pageResult = await connector({
          query: source.query,
          allowedDomains: [...config.allowedDomains],
          freshnessWindowDays: config.freshnessWindowDays,
          retryCount: config.maxRetries,
          timeoutMs: config.requestTimeoutMs,
          now,
          cursorState,
          collectionJob: mode === 'bootstrap' ? bootstrapJobs[index] : undefined,
          pagination: { page, pagesPerQuery },
        });

        allRecords.push(...pageResult.records);
        totalFetched += pageResult.recordsFetched;
        totalSkipped += pageResult.recordsSkipped;
        lastTelemetry = pageResult.telemetry;

        if (pageResult.skipped || pageResult.error) {
          wasSkipped = pageResult.skipped;
          lastError = pageResult.error;
          break;
        }

        if (pageResult.recordsFetched === 0 || lastTelemetry.hasMore !== true) {
          break;
        }
      }

      return {
        source: source.source,
        skipped: wasSkipped,
        records: allRecords,
        recordsFetched: totalFetched,
        recordsSkipped: totalSkipped,
        telemetry: lastTelemetry,
        ...(lastError ? { error: lastError } : {}),
      } satisfies ConnectorFetchResult;
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

  // Full-text acquisition stage: run for top N records (budget-gated)
  const fulltextBudget = config.fulltextBudgetPerRun;
  const fulltextTargets = candidateRecordsForSynthesis.slice(0, fulltextBudget);
  const fulltextResultMap = new Map<string, FullTextAcquisitionResult>();
  let fulltextAcquired = 0;
  for (const record of fulltextTargets) {
    const ftResult = await acquireFullText({ record });
    fulltextResultMap.set(record.id, ftResult);
    if (ftResult.source !== 'abstract-only') {
      fulltextAcquired += 1;
      // Promote the record's documentary status to full-text-ready
      const idx = rankedRecords.findIndex((r) => r.id === record.id);
      if (idx >= 0) {
        rankedRecords[idx] = {
          ...rankedRecords[idx]!,
          documentary: {
            status: 'full-text-ready' as const,
            acquisition: {
              sourceKind: 'full-text' as const,
              rejectionReason: null,
            },
          },
        };
      }
    }
  }
  const fulltextStageStatus: StageStatus =
    fulltextTargets.length > 0 ? 'succeeded' : 'skipped';
  const fulltextStageMessage =
    `budget=${fulltextBudget}; targets=${fulltextTargets.length}; acquired=${fulltextAcquired}; ` +
    `abstractOnly=${fulltextTargets.length - fulltextAcquired}`;
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
  stageReports.push({
    stage: 'fulltext',
    status: fulltextStageStatus,
    message: fulltextStageMessage,
  });

  let principles: CorpusPrinciple[] = [];
  let studyCards: import('./contracts').StudyCard[] = [];
  let thematicSyntheses: ThematicSynthesis[] = [];
  let validatedSynthesis = buildValidatedSynthesisFromPrinciples({
    records: [],
    principles: [],
  });
  let questionSynthesisDossiers: QuestionSynthesisDossier[] = [];
  let manifest: CorpusSnapshotManifest | null = null;
  let synthesisErrorMessage: string | null = null;
  let publishErrorMessage: string | null = null;
  const qualityGateProjection = buildQualityGateProjection({
    mode,
    normalizedRecords,
    cursorState,
    bootstrapTelemetry,
  });
  let studyCardStageRecorded = false;
  let thematicSynthesisStageRecorded = false;
  let studyCardStageMessage = 'remote-client-unavailable';
  let remoteStudyCardClient: CorpusRemoteSynthesisClient | null = input.remoteSynthesisClient ?? null;
  if (!remoteStudyCardClient) {
    try {
      remoteStudyCardClient = createConfiguredOpenAiCorpusSynthesisClient();
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('not configured')) {
        throw error;
      }
    }
  }
  let qualityGateResult = evaluateCorpusQualityGate({
    now,
    records: [],
    threshold: input.qualityGateOverrides?.threshold,
    criticalContradictions: input.qualityGateOverrides?.criticalContradictions,
    projection: qualityGateProjection,
  });
  if (candidateRecordsForSynthesis.length > 0 && recordsForSynthesis.length === 0) {
    stageReports.push({
      stage: 'extract-study-cards',
      status: remoteStudyCardClient ? 'succeeded' : 'skipped',
      message: remoteStudyCardClient ? 'records=0; extracted=0' : studyCardStageMessage,
    });
    studyCardStageRecorded = true;
    stageReports.push({
      stage: 'thematic-synthesis',
      status: 'skipped',
      message: 'no-study-cards-available',
    });
    thematicSynthesisStageRecorded = true;
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
      projection: qualityGateProjection,
    });
  } else if (recordsForSynthesis.length === 0) {
    stageReports.push({
      stage: 'extract-study-cards',
      status: remoteStudyCardClient ? 'succeeded' : 'skipped',
      message: remoteStudyCardClient ? 'records=0; extracted=0' : studyCardStageMessage,
    });
    studyCardStageRecorded = true;
    stageReports.push({
      stage: 'thematic-synthesis',
      status: 'skipped',
      message: 'no-study-cards-available',
    });
    thematicSynthesisStageRecorded = true;
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
      projection: qualityGateProjection,
    });
  } else {
    try {
      if (remoteStudyCardClient) {
        studyCards = await extractStudyCards({
          records: fulltextTargets,
          fullTextMap: new Map(
            [...fulltextResultMap.entries()].map(([recordId, result]) => [recordId, { fullText: result.fullText, sections: result.sections }]),
          ),
          client: remoteStudyCardClient,
          runId,
        });
        studyCardStageMessage = `records=${fulltextTargets.length}; extracted=${studyCards.length}`;
        stageReports.push({
          stage: 'extract-study-cards',
          status: 'succeeded',
          message: studyCardStageMessage,
        });
        studyCardStageRecorded = true;
      } else {
        stageReports.push({
          stage: 'extract-study-cards',
          status: 'skipped',
          message: studyCardStageMessage,
        });
        studyCardStageRecorded = true;
      }
      if (remoteStudyCardClient && studyCards.length > 0) {
        const groupedCards = new Map<string, import('./contracts').StudyCard[]>();
        for (const card of studyCards) {
          for (const topicKey of card.topicKeys) {
            const existing = groupedCards.get(topicKey);
            if (existing) {
              existing.push(card);
            } else {
              groupedCards.set(topicKey, [card]);
            }
          }
        }
        thematicSyntheses = await Promise.all(
          [...groupedCards.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([topicKey, topicCards]) =>
              synthesizeThematicPrinciples({
                topicKey,
                topicLabel: topicKey,
                studyCards: topicCards,
                client: remoteStudyCardClient!,
                runId,
              }),
            ),
        );
        stageReports.push({
          stage: 'thematic-synthesis',
          status: 'succeeded',
          message: `topics=${thematicSyntheses.length}; cards=${studyCards.length}`,
        });
        thematicSynthesisStageRecorded = true;
      } else {
        stageReports.push({
          stage: 'thematic-synthesis',
          status: 'skipped',
          message: 'no-study-cards-available',
        });
        thematicSynthesisStageRecorded = true;
      }
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
        projection: qualityGateProjection,
      });
    } catch (error) {
      if (!studyCardStageRecorded) {
        stageReports.push({
          stage: 'extract-study-cards',
          status: remoteStudyCardClient ? 'failed' : 'skipped',
          message: remoteStudyCardClient ? 'study-card-extraction-failed' : studyCardStageMessage,
        });
        studyCardStageRecorded = true;
      }
      if (!thematicSynthesisStageRecorded) {
        stageReports.push({
          stage: 'thematic-synthesis',
          status: 'skipped',
          message: studyCardStageRecorded ? 'blocked-by-study-card-failure' : 'blocked-by-study-card-stage',
        });
        thematicSynthesisStageRecorded = true;
      }
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
    status: synthesisErrorMessage ? 'skipped' : qualityGateResult.status === 'progressing' ? 'succeeded' : 'skipped',
    message: synthesisErrorMessage
      ? 'blocked-by-synthesis-failure'
      : qualityGateResult.publishable
        ? 'pending-artifact-write'
        : qualityGateResult.status === 'progressing'
          ? `progressing:${qualityGateResult.reasons.join(',')}`
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
      studyCardsPath: path.join('snapshots', runId, 'candidate', 'study-cards.json'),
      thematicSynthesisPath: path.join('snapshots', runId, 'candidate', 'thematic-synthesis.json'),
      bookletPath: path.join('snapshots', runId, 'candidate', 'booklet-fr.md'),
    },
  });
  const previousManifest = await loadPreviousManifest(outputRootDir);
  let currentDoctrineSnapshot = await loadPublishedDoctrineSnapshot(outputRootDir);
  const bookletMarkdown = renderBookletMarkdown({
    thematicSyntheses,
    studyCards,
    generatedAt: now.toISOString(),
    snapshotId: runId,
  });

  await mkdir(candidateDir, { recursive: true });
  await writePublishedDoctrineSnapshot(outputRootDir, currentDoctrineSnapshot);
  await appendDoctrineRevisionEntries(outputRootDir, [], now);
  await writeFile(
    path.join(outputRootDir, 'registry', 'question-synthesis-dossiers.json'),
    JSON.stringify(
      {
        version: 'v1',
        generatedAt: now.toISOString(),
        items: questionSynthesisDossiers,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  await upsertDocumentRegistryRecords(
    outputRootDir,
    rankedRecords.map((record) => buildDocumentRegistryRecordFromNormalizedRecord(record, now)),
    now,
  );
  await enqueueWorkItems(
    outputRootDir,
    'study-extraction',
    recordsForSynthesis.map((record) => ({
      logicalKey: `study-extraction:${record.id}`,
      payload: {
        recordId: record.id,
        canonicalId: record.canonicalId ?? record.id,
      },
    })),
    now,
  );
  if (studyCards.length > 0) {
    const persistedDossiers = await upsertStudyDossiers(
      outputRootDir,
      studyCards.map((card) => buildStudyDossierFromStudyCard(card, now)),
      now,
    );
    const scientificQuestions = await loadScientificQuestions(outputRootDir);
    const questionLinking = linkStudiesToScientificQuestions({
      studyDossiers: persistedDossiers.items,
      questions: scientificQuestions.items,
      now,
    });
    const questionDossiers = questionLinking.questions.map((question) => {
      const linkedStudies = persistedDossiers.items.filter((study) => question.linkedStudyIds.includes(study.studyId));
      const contradictions = analyzeQuestionContradictions({
        question,
        linkedStudies,
      });
      return buildQuestionSynthesisDossier({
        question,
        linkedStudies,
        contradictions,
        now,
      });
    });
    questionSynthesisDossiers = questionDossiers;
    await upsertScientificQuestions(outputRootDir, questionLinking.questions, now);
    await writeFile(
      path.join(outputRootDir, 'registry', 'question-synthesis-dossiers.json'),
      JSON.stringify(
        {
          version: 'v1',
          generatedAt: now.toISOString(),
          items: questionDossiers,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );

    const candidatePrinciples = questionDossiers.flatMap((dossier) => {
      if (dossier.linkedStudyIds.length === 0) {
        return [];
      }
      const question = questionLinking.questions.find((item) => item.questionId === dossier.questionId);
      if (!question) {
        return [];
      }

      const linkedStudies = persistedDossiers.items.filter((study) => dossier.linkedStudyIds.includes(study.studyId));
      const statementFr = dossier.summaryFr;
      const conditionsFr = question.inclusionCriteria.join(' ');
      const limitsFr = dossier.contradictions.length > 0
        ? dossier.contradictions.map((item) => item.summaryFr).join(' ')
        : question.exclusionCriteria.join(' ');

      return [
        parsePublishedDoctrinePrinciple({
          principleId: `doctrine:${dossier.questionId}`,
          statementFr,
          conditionsFr: conditionsFr || 'Conditions explicites non nulles requises.',
          limitsFr: limitsFr || 'Limites explicites requises.',
          confidenceLevel: dossier.confidenceLevel,
          questionIds: [dossier.questionId],
          studyIds: dossier.linkedStudyIds,
          revisionStatus: 'active',
          publishedAt: now.toISOString(),
        }),
      ];
    });

    const publishedPrinciples = candidatePrinciples.flatMap((candidate) => {
      const dossier = questionDossiers.find((item) => item.questionId === candidate.questionIds[0]);
      if (!dossier) {
        return [];
      }
      const evaluated = evaluateDoctrineCandidatePublication({
        candidate,
        dossier,
      });
      return evaluated.published && evaluated.principle ? [evaluated.principle] : [];
    });

    const existingPrincipleIds = new Set(currentDoctrineSnapshot.principles.map((principle) => principle.principleId));
    const reconciled = reconcileDoctrineAgainstDossiers({
      snapshot: parsePublishedDoctrineSnapshot({
        version: currentDoctrineSnapshot.version,
        generatedAt: now.toISOString(),
        principles: [...currentDoctrineSnapshot.principles, ...publishedPrinciples].filter(
          (principle, index, list) => list.findIndex((item) => item.principleId === principle.principleId) === index,
        ),
      }),
      dossiers: questionDossiers,
      now,
    });

    currentDoctrineSnapshot = await writePublishedDoctrineSnapshot(outputRootDir, reconciled.snapshot);

    const revisionEntries = [
      ...publishedPrinciples
        .filter((principle) => !existingPrincipleIds.has(principle.principleId))
        .map((principle) =>
          parseDoctrineRevisionEntry({
            revisionId: `${principle.principleId}:published:${now.toISOString()}`,
            principleId: principle.principleId,
            changedAt: now.toISOString(),
            changeType: 'published',
            reason: 'Conservative doctrine publication gate accepted this principle.',
          }),
        ),
      ...reconciled.revisions,
    ];
    if (revisionEntries.length > 0) {
      await appendDoctrineRevisionEntries(outputRootDir, revisionEntries, now);
    }
    const revisionHistoryPath = path.join(outputRootDir, 'registry', 'doctrine-revisions.json');
    const revisionHistory = JSON.parse(await readFile(revisionHistoryPath, 'utf8')) as { entries?: Array<{ principleId: string; changeType: string }> };
    const existingPublishedIds = new Set(
      (revisionHistory.entries ?? [])
        .filter((entry) => entry.changeType === 'published')
        .map((entry) => entry.principleId),
    );
    const missingPublishedEntries = currentDoctrineSnapshot.principles
      .filter((principle) => principle.revisionStatus === 'active' && !existingPublishedIds.has(principle.principleId))
      .map((principle) =>
        parseDoctrineRevisionEntry({
          revisionId: `${principle.principleId}:published-snapshot:${now.toISOString()}`,
          principleId: principle.principleId,
          changedAt: now.toISOString(),
          changeType: 'published',
          reason: 'Backfilled from active published doctrine snapshot.',
        }),
      );
    if (missingPublishedEntries.length > 0) {
      await appendDoctrineRevisionEntries(outputRootDir, missingPublishedEntries, now);
    }
    await enqueueWorkItems(
      outputRootDir,
      'question-linking',
      studyCards.map((card) => ({
        logicalKey: `question-linking:${card.recordId}`,
        payload: {
          studyId: card.recordId,
          recordId: card.recordId,
        },
      })),
      now,
    );
  }
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
        fulltext: {
          budget: fulltextBudget,
          targets: fulltextTargets.length,
          acquired: fulltextAcquired,
          results: [...fulltextResultMap.entries()].map(([, result]) => result),
        },
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
    path.join(candidateDir, 'study-cards.json'),
    JSON.stringify(
      {
        runId,
        generatedAt: now.toISOString(),
        studyCards,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  await writeFile(
    path.join(candidateDir, 'thematic-synthesis.json'),
    JSON.stringify(
      {
        runId,
        generatedAt: now.toISOString(),
        thematicSyntheses,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  await writeFile(path.join(candidateDir, 'booklet-fr.md'), bookletMarkdown, 'utf8');
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
  const curatedBible = curateAdaptiveKnowledgeBible({
    records: normalizedRecords,
    principles,
    validatedSynthesis,
    studyCards,
    thematicSyntheses,
    questionSynthesisDossiers,
    publishedDoctrine: currentDoctrineSnapshot,
  });
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
