import { z } from 'zod';

const SOURCE_TYPE_VALUES = ['guideline', 'review', 'expertise'] as const;
const STAGE_VALUES = ['discover', 'ingest', 'synthesize', 'validate', 'publish'] as const;
const STAGE_STATUS_VALUES = ['succeeded', 'failed', 'skipped'] as const;
const PIPELINE_MODE_VALUES = ['bootstrap', 'refresh', 'check'] as const;
const SYNTHESIS_PROVIDER_VALUES = ['openai', 'deterministic'] as const;
const CONTRADICTION_SEVERITY_VALUES = ['low', 'medium', 'high', 'critical'] as const;
const CONTRADICTION_RESOLUTION_VALUES = ['pending', 'retained', 'rejected'] as const;
const DISCOVERY_GAP_STATUS_VALUES = ['covered', 'partial', 'uncovered'] as const;
const RANKING_REASON_DIRECTION_VALUES = ['boost', 'penalty', 'reject'] as const;
const BOOTSTRAP_CAMPAIGN_STATUS_VALUES = ['idle', 'running', 'paused', 'completed', 'failed'] as const;
const COLLECTION_JOB_STATUS_VALUES = ['pending', 'running', 'completed', 'blocked', 'exhausted'] as const;

export const evidenceRankingReasonSchema = z
  .object({
    code: z.string().min(1),
    direction: z.enum(RANKING_REASON_DIRECTION_VALUES),
    detail: z.string().min(1),
  })
  .strict();

export const evidenceScientificRankingSchema = z
  .object({
    compositeScore: z.number().min(0).max(1),
    sourceTypeScore: z.number().min(0).max(1),
    recencyScore: z.number().min(0).max(1),
    richnessScore: z.number().min(0).max(1),
    tagCoverageScore: z.number().min(0).max(1),
    selected: z.boolean(),
    reasons: z.array(evidenceRankingReasonSchema),
  })
  .strict();

export const structuredStudyExtractionSchema = z
  .object({
    recordId: z.string().min(1),
    topicKeys: z.array(z.string().min(1)).min(1),
    population: z.string().min(1).optional(),
    intervention: z.string().min(1).optional(),
    applicationContext: z.string().min(1).optional(),
    outcomes: z.array(z.string().min(1)),
    evidenceSignals: z.array(z.string().min(1)),
    limitations: z.array(z.string().min(1)),
    safetySignals: z.array(z.string().min(1)),
    rejectionReason: z
      .object({
        code: z.string().min(1),
        reason: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

export const adaptiveKnowledgeRankingTelemetrySchema = z
  .object({
    evaluatedRecordCount: z.number().int().nonnegative(),
    selectedRecordCount: z.number().int().nonnegative(),
    rejectedRecordCount: z.number().int().nonnegative(),
    topRecordIds: z.array(z.string().min(1)),
    rejectionCodes: z.array(z.string().min(1)),
  })
  .strict();

export const adaptiveKnowledgeDiscoveryQuerySchema = z
  .object({
    source: z.enum(['pubmed', 'crossref', 'openalex']),
    query: z.string().min(1),
    topicKey: z.string().min(1),
    topicLabel: z.string().min(1),
    subtopicKey: z.string().min(1),
    subtopicLabel: z.string().min(1),
    queryFamily: z.string().min(1),
    priority: z.number().int().positive(),
    targetPopulation: z.string().min(1).nullable().optional(),
  })
  .strict();

export const adaptiveKnowledgeCoverageGapSchema = z
  .object({
    topicKey: z.string().min(1),
    topicLabel: z.string().min(1),
    targetQueryCount: z.number().int().nonnegative(),
    servedQueryCount: z.number().int().nonnegative(),
    fetchedRecordCount: z.number().int().nonnegative(),
    normalizedRecordCount: z.number().int().nonnegative(),
    status: z.enum(DISCOVERY_GAP_STATUS_VALUES),
  })
  .strict();

export const adaptiveKnowledgeDiscoveryTelemetrySchema = z
  .object({
    targetTopicKeys: z.array(z.string().min(1)),
    targetTopicLabels: z.array(z.string().min(1)),
    totalQueries: z.number().int().nonnegative(),
    coverageGaps: z.array(adaptiveKnowledgeCoverageGapSchema),
  })
  .strict();

export const normalizedEvidenceRecordSchema = z
  .object({
    id: z.string().min(1),
    canonicalId: z.string().min(1).optional(),
    sourceType: z.enum(SOURCE_TYPE_VALUES),
    sourceUrl: z.string().url(),
    sourceDomain: z.string().min(1),
    publishedAt: z.string().date(),
    title: z.string().min(1),
    summaryEn: z.string().min(1),
    tags: z.array(z.string().min(1)).min(1),
    provenanceIds: z.array(z.string().min(1)).min(1),
    ranking: evidenceScientificRankingSchema.optional(),
  })
  .strict();

export const corpusPrincipleSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    summaryFr: z.string().min(1),
    guidanceFr: z.string().min(1),
    provenanceRecordIds: z.array(z.string().min(1)).min(1),
    evidenceLevel: z.string().min(1),
    guardrail: z.enum(['SAFE-01', 'SAFE-02', 'SAFE-03']),
    targetPopulation: z.string().min(1).optional(),
    applicationContext: z.string().min(1).optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();

export const adaptiveKnowledgeBootstrapCampaignStateSchema = z
  .object({
    schemaVersion: z.string().min(1),
    campaignId: z.string().min(1),
    status: z.enum(BOOTSTRAP_CAMPAIGN_STATUS_VALUES),
    mode: z.literal('bootstrap'),
    startedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    lastRunId: z.string().min(1).nullable().optional(),
    activeJobId: z.string().min(1).nullable().optional(),
    backlog: z
      .object({
        pending: z.number().int().nonnegative(),
        running: z.number().int().nonnegative(),
        blocked: z.number().int().nonnegative(),
        completed: z.number().int().nonnegative(),
        exhausted: z.number().int().nonnegative().optional(),
      })
      .strict(),
    progress: z
      .object({
        discoveredQueryFamilies: z.number().int().nonnegative(),
        canonicalRecordCount: z.number().int().nonnegative(),
        extractionBacklogCount: z.number().int().nonnegative(),
        publicationCandidateCount: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const adaptiveKnowledgeCollectionJobSchema = z
  .object({
    id: z.string().min(1),
    source: z.enum(['pubmed', 'crossref', 'openalex']),
    query: z.string().min(1),
    queryFamily: z.string().min(1),
    topicKey: z.string().min(1),
    topicLabel: z.string().min(1),
    subtopicKey: z.string().min(1),
    subtopicLabel: z.string().min(1),
    priority: z.number().int().positive(),
    status: z.enum(COLLECTION_JOB_STATUS_VALUES),
    targetPopulation: z.string().min(1).nullable().optional(),
    cursor: z.string().min(1).nullable().optional(),
    pagesFetched: z.number().int().nonnegative(),
    recordsFetched: z.number().int().nonnegative(),
    canonicalRecords: z.number().int().nonnegative(),
    lastError: z.string().min(1).nullable().optional(),
  })
  .strict();

export const adaptiveKnowledgeBootstrapRunTelemetrySchema = z
  .object({
    queueDepth: z
      .object({
        pending: z.number().int().nonnegative(),
        running: z.number().int().nonnegative(),
        blocked: z.number().int().nonnegative(),
        completed: z.number().int().nonnegative(),
        exhausted: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
      })
      .strict(),
    jobsProcessed: z.number().int().nonnegative(),
    pagesConsumed: z.number().int().nonnegative(),
    processedJobIds: z.array(z.string().min(1)),
    pendingJobIds: z.array(z.string().min(1)),
    exhaustionReasons: z
      .object({
        sourceExhausted: z.number().int().nonnegative(),
        maxPagesReached: z.number().int().nonnegative(),
        blocked: z.number().int().nonnegative(),
        deferred: z.number().int().nonnegative(),
      })
      .strict(),
    dedupedCanonicalRecords: z.number().int().nonnegative(),
    incrementalSkippedRecords: z.number().int().nonnegative(),
  })
  .strict();

export const synthesisRunMetadataSchema = z
  .object({
    provider: z.enum(SYNTHESIS_PROVIDER_VALUES),
    model: z.string().min(1),
    promptVersion: z.string().min(1),
    requestId: z.string().min(1).nullable(),
    requestIds: z.array(z.string().min(1)).optional(),
    latencyMs: z.number().int().nonnegative().optional(),
    totalLatencyMs: z.number().int().nonnegative().optional(),
  })
  .strict();

export const rejectedSynthesisClaimSchema = z
  .object({
    recordId: z.string().min(1),
    code: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

export const synthesisContradictionSchema = z
  .object({
    code: z.string().min(1),
    severity: z.enum(CONTRADICTION_SEVERITY_VALUES),
    recordIds: z.array(z.string().min(1)).min(1),
    resolution: z.enum(CONTRADICTION_RESOLUTION_VALUES),
  })
  .strict();

export const sourceSynthesisBatchSchema = z
  .object({
    lotId: z.string().min(1),
    recordIds: z.array(z.string().min(1)).min(1),
    studyExtractions: z.array(structuredStudyExtractionSchema),
    retainedClaims: z.array(corpusPrincipleSchema),
    rejectedClaims: z.array(rejectedSynthesisClaimSchema),
    coverageTags: z.array(z.string().min(1)),
    contradictions: z.array(synthesisContradictionSchema),
    modelRun: synthesisRunMetadataSchema,
  })
  .strict();

export const validatedSynthesisSchema = z
  .object({
    principles: z.array(corpusPrincipleSchema),
    studyExtractions: z.array(structuredStudyExtractionSchema),
    rejectedClaims: z.array(rejectedSynthesisClaimSchema),
    coverage: z
      .object({
        recordCount: z.number().int().nonnegative(),
        batchCount: z.number().int().nonnegative(),
        retainedClaimCount: z.number().int().nonnegative(),
        sourceDomains: z.array(z.string().min(1)).min(1),
        coveredTags: z.array(z.string().min(1)),
      })
      .strict(),
    contradictions: z.array(synthesisContradictionSchema),
    modelRun: synthesisRunMetadataSchema,
  })
  .strict();

const stageReportSchema = z
  .object({
    stage: z.enum(STAGE_VALUES),
    status: z.enum(STAGE_STATUS_VALUES),
    message: z.string().min(1).optional(),
  })
  .strict();

const artifactPointerSchema = z
  .object({
    indexPath: z.string().min(1),
    principlesPath: z.string().min(1),
    reportPath: z.string().min(1),
    validatedSynthesisPath: z.string().min(1).optional(),
    studyExtractionsPath: z.string().min(1).optional(),
  })
  .strict();

export const corpusSnapshotManifestSchema = z
  .object({
    snapshotId: z.string().min(1),
    schemaVersion: z.string().min(1),
    generatedAt: z.string().datetime(),
    evidenceRecordCount: z.number().int().nonnegative(),
    principleCount: z.number().int().nonnegative(),
    sourceDomains: z.array(z.string().min(1)).min(1),
    artifacts: artifactPointerSchema,
  })
  .strict();

const orderedStages = [...STAGE_VALUES];

export const corpusRunReportSchema = z
  .object({
    runId: z.string().min(1),
    mode: z.enum(PIPELINE_MODE_VALUES),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    snapshotId: z.string().min(1),
    stageReports: z.array(stageReportSchema).min(1),
    discovery: adaptiveKnowledgeDiscoveryTelemetrySchema.optional(),
    ranking: adaptiveKnowledgeRankingTelemetrySchema.optional(),
    bootstrap: adaptiveKnowledgeBootstrapRunTelemetrySchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const observed = value.stageReports.map((stage) => stage.stage);
    const expectedPrefix = orderedStages.slice(0, observed.length);
    for (let index = 0; index < observed.length; index += 1) {
      if (observed[index] !== expectedPrefix[index]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'stageReports must follow discover->ingest->synthesize->validate->publish order',
          path: ['stageReports', index, 'stage'],
        });
      }
    }

    const firstFailureIndex = value.stageReports.findIndex((stage) => stage.status === 'failed');
    if (firstFailureIndex >= 0) {
      for (let index = firstFailureIndex + 1; index < value.stageReports.length; index += 1) {
        if (value.stageReports[index]?.status === 'succeeded') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'stageReports cannot mark later stages as succeeded after a failed stage',
            path: ['stageReports', index, 'status'],
          });
        }
      }
    }
  });

export type NormalizedEvidenceRecord = z.infer<typeof normalizedEvidenceRecordSchema>;
export type AdaptiveKnowledgeDiscoveryQuery = z.infer<typeof adaptiveKnowledgeDiscoveryQuerySchema>;
export type AdaptiveKnowledgeCoverageGap = z.infer<typeof adaptiveKnowledgeCoverageGapSchema>;
export type AdaptiveKnowledgeDiscoveryTelemetry = z.infer<typeof adaptiveKnowledgeDiscoveryTelemetrySchema>;
export type EvidenceRankingReason = z.infer<typeof evidenceRankingReasonSchema>;
export type EvidenceScientificRanking = z.infer<typeof evidenceScientificRankingSchema>;
export type StructuredStudyExtraction = z.infer<typeof structuredStudyExtractionSchema>;
export type AdaptiveKnowledgeRankingTelemetry = z.infer<typeof adaptiveKnowledgeRankingTelemetrySchema>;
export type CorpusPrinciple = z.infer<typeof corpusPrincipleSchema>;
export type AdaptiveKnowledgeBootstrapCampaignState = z.infer<typeof adaptiveKnowledgeBootstrapCampaignStateSchema>;
export type AdaptiveKnowledgeCollectionJob = z.infer<typeof adaptiveKnowledgeCollectionJobSchema>;
export type AdaptiveKnowledgeBootstrapRunTelemetry = z.infer<typeof adaptiveKnowledgeBootstrapRunTelemetrySchema>;
export type SynthesisRunMetadata = z.infer<typeof synthesisRunMetadataSchema>;
export type RejectedSynthesisClaim = z.infer<typeof rejectedSynthesisClaimSchema>;
export type SynthesisContradiction = z.infer<typeof synthesisContradictionSchema>;
export type SourceSynthesisBatch = z.infer<typeof sourceSynthesisBatchSchema>;
export type ValidatedSynthesis = z.infer<typeof validatedSynthesisSchema>;
export type CorpusRunReport = z.infer<typeof corpusRunReportSchema>;
export type CorpusSnapshotManifest = z.infer<typeof corpusSnapshotManifestSchema>;

export function parseNormalizedEvidenceRecord(input: unknown): NormalizedEvidenceRecord {
  return normalizedEvidenceRecordSchema.parse(input);
}

export function parseAdaptiveKnowledgeDiscoveryQuery(input: unknown): AdaptiveKnowledgeDiscoveryQuery {
  return adaptiveKnowledgeDiscoveryQuerySchema.parse(input);
}

export function parseAdaptiveKnowledgeCoverageGap(input: unknown): AdaptiveKnowledgeCoverageGap {
  return adaptiveKnowledgeCoverageGapSchema.parse(input);
}

export function parseAdaptiveKnowledgeCollectionJob(input: unknown): AdaptiveKnowledgeCollectionJob {
  return adaptiveKnowledgeCollectionJobSchema.parse(input);
}

export function parseAdaptiveKnowledgeDiscoveryTelemetry(input: unknown): AdaptiveKnowledgeDiscoveryTelemetry {
  return adaptiveKnowledgeDiscoveryTelemetrySchema.parse(input);
}

export function parseEvidenceScientificRanking(input: unknown): EvidenceScientificRanking {
  return evidenceScientificRankingSchema.parse(input);
}

export function parseAdaptiveKnowledgeRankingTelemetry(input: unknown): AdaptiveKnowledgeRankingTelemetry {
  return adaptiveKnowledgeRankingTelemetrySchema.parse(input);
}

export function parseCorpusPrinciple(input: unknown): CorpusPrinciple {
  return corpusPrincipleSchema.parse(input);
}

export function parseAdaptiveKnowledgeBootstrapCampaignState(input: unknown): AdaptiveKnowledgeBootstrapCampaignState {
  return adaptiveKnowledgeBootstrapCampaignStateSchema.parse(input);
}

export function parseAdaptiveKnowledgeBootstrapRunTelemetry(input: unknown): AdaptiveKnowledgeBootstrapRunTelemetry {
  return adaptiveKnowledgeBootstrapRunTelemetrySchema.parse(input);
}

export function parseSourceSynthesisBatch(input: unknown): SourceSynthesisBatch {
  return sourceSynthesisBatchSchema.parse(input);
}

export function parseValidatedSynthesis(input: unknown): ValidatedSynthesis {
  return validatedSynthesisSchema.parse(input);
}

export function parseCorpusRunReport(input: unknown): CorpusRunReport {
  return corpusRunReportSchema.parse(input);
}

export function parseCorpusSnapshotManifest(input: unknown): CorpusSnapshotManifest {
  return corpusSnapshotManifestSchema.parse(input);
}
