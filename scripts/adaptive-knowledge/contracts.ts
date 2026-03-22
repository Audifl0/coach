import { z } from 'zod';

const SOURCE_TYPE_VALUES = ['guideline', 'review', 'expertise'] as const;
const STAGE_VALUES = ['discover', 'ingest', 'fulltext', 'extract-study-cards', 'thematic-synthesis', 'synthesize', 'validate', 'publish'] as const;
const STAGE_STATUS_VALUES = ['succeeded', 'failed', 'skipped'] as const;
const PIPELINE_MODE_VALUES = ['bootstrap', 'refresh', 'check'] as const;
const SYNTHESIS_PROVIDER_VALUES = ['openai', 'deterministic'] as const;
const CONTRADICTION_SEVERITY_VALUES = ['low', 'medium', 'high', 'critical'] as const;
const CONTRADICTION_RESOLUTION_VALUES = ['pending', 'retained', 'rejected'] as const;
const DISCOVERY_GAP_STATUS_VALUES = ['covered', 'partial', 'uncovered'] as const;
const RANKING_REASON_DIRECTION_VALUES = ['boost', 'penalty', 'reject'] as const;
const BOOTSTRAP_CAMPAIGN_STATUS_VALUES = ['idle', 'running', 'paused', 'completed', 'failed'] as const;
const COLLECTION_JOB_STATUS_VALUES = ['pending', 'running', 'completed', 'blocked', 'exhausted'] as const;
const DOCUMENTARY_STATUS_VALUES = ['metadata-only', 'abstract-ready', 'full-text-ready', 'blocked'] as const;
const DOCUMENTARY_SOURCE_KIND_VALUES = ['metadata', 'abstract', 'full-text'] as const;
const STUDY_CARD_STUDY_TYPE_VALUES = [
  'rct',
  'meta-analysis',
  'systematic-review',
  'cohort',
  'case-study',
  'guideline',
  'narrative-review',
] as const;
const STUDY_CARD_TRAINING_LEVEL_VALUES = ['novice', 'intermediate', 'advanced', 'mixed'] as const;
const STUDY_CARD_EVIDENCE_LEVEL_VALUES = ['high', 'moderate', 'low'] as const;
const STUDY_CARD_EXTRACTION_SOURCE_VALUES = ['full-text', 'abstract'] as const;
const THEMATIC_GUARDRAIL_VALUES = ['SAFE-01', 'SAFE-02', 'SAFE-03'] as const;
const THEMATIC_EVIDENCE_LEVEL_VALUES = ['strong', 'moderate', 'emerging'] as const;
const DOCUMENT_REGISTRY_STATUS_VALUES = [
  'discovered',
  'metadata-ready',
  'abstract-ready',
  'full-text-ready',
  'extractible',
  'extracted',
  'linked',
] as const;
const STUDY_DOSSIER_REGISTRY_STATUS_VALUES = ['draft', 'validated-structure', 'linked-to-question', 'needs-review'] as const;
const DURABLE_WORK_QUEUE_STATUS_VALUES = ['pending', 'running', 'blocked', 'completed', 'failed'] as const;

export const documentaryRejectionReasonSchema = z
  .object({
    code: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

export const documentaryAcquisitionSchema = z
  .object({
    attemptedAt: z.string().datetime().optional(),
    sourceKind: z.enum(DOCUMENTARY_SOURCE_KIND_VALUES),
    rejectionReason: documentaryRejectionReasonSchema.nullable().optional(),
  })
  .strict();

export const documentaryRecordStateSchema = z
  .object({
    status: z.enum(DOCUMENTARY_STATUS_VALUES),
    acquisition: documentaryAcquisitionSchema,
  })
  .strict();

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

export const studyCardSchema = z
  .object({
    recordId: z.string().min(1),
    title: z.string().min(1),
    authors: z.string().min(1),
    year: z.number().int().min(1900).max(2100),
    journal: z.string().min(1),
    doi: z.string().min(1).nullable(),
    studyType: z.enum(STUDY_CARD_STUDY_TYPE_VALUES),
    population: z
      .object({
        description: z.string().min(1),
        size: z.number().int().positive().nullable(),
        trainingLevel: z.enum(STUDY_CARD_TRAINING_LEVEL_VALUES).nullable(),
      })
      .strict(),
    protocol: z
      .object({
        duration: z.string().min(1),
        intervention: z.string().min(1),
        comparison: z.string().min(1).nullable(),
      })
      .strict(),
    results: z
      .object({
        primary: z.string().min(1),
        secondary: z.array(z.string().min(1)),
      })
      .strict(),
    practicalTakeaways: z.array(z.string().min(1)),
    limitations: z.array(z.string().min(1)),
    safetySignals: z.array(z.string().min(1)),
    evidenceLevel: z.enum(STUDY_CARD_EVIDENCE_LEVEL_VALUES),
    topicKeys: z.array(z.string().min(1)).min(1),
    extractionSource: z.enum(STUDY_CARD_EXTRACTION_SOURCE_VALUES),
    langueFr: z
      .object({
        titreFr: z.string().min(1),
        resumeFr: z.string().min(1),
        conclusionFr: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const thematicSynthesisSchema = z
  .object({
    topicKey: z.string().min(1),
    topicLabel: z.string().min(1),
    principlesFr: z
      .array(
        z
          .object({
            id: z.string().min(1),
            title: z.string().min(1),
            statement: z.string().min(1),
            conditions: z.array(z.string().min(1)),
            guardrail: z.enum(THEMATIC_GUARDRAIL_VALUES),
            evidenceLevel: z.enum(THEMATIC_EVIDENCE_LEVEL_VALUES),
            sourceCardIds: z.array(z.string().min(1)).min(1),
          })
          .strict(),
      )
      .min(1)
      .max(4),
    summaryFr: z.string().min(1),
    gapsFr: z.array(z.string().min(1)),
    studyCount: z.number().int().nonnegative(),
    lastUpdated: z.string().datetime(),
  })
  .strict();

export const documentRegistryRecordSchema = z
  .object({
    documentId: z.string().min(1),
    canonicalId: z.string().min(1).nullable().optional(),
    recordId: z.string().min(1),
    title: z.string().min(1),
    sourceDomain: z.string().min(1),
    sourceUrl: z.string().url(),
    status: z.enum(DOCUMENT_REGISTRY_STATUS_VALUES),
    topicKeys: z.array(z.string().min(1)),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const documentRegistryStateSchema = z
  .object({
    version: z.string().min(1),
    generatedAt: z.string().datetime(),
    items: z.array(documentRegistryRecordSchema),
  })
  .strict();

export const studyDossierRegistryRecordSchema = z
  .object({
    studyId: z.string().min(1),
    recordId: z.string().min(1),
    title: z.string().min(1),
    status: z.enum(STUDY_DOSSIER_REGISTRY_STATUS_VALUES),
    topicKeys: z.array(z.string().min(1)),
    studyCard: studyCardSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const studyDossierRegistryStateSchema = z
  .object({
    version: z.string().min(1),
    generatedAt: z.string().datetime(),
    items: z.array(studyDossierRegistryRecordSchema),
  })
  .strict();

export const durableWorkQueueItemSchema = z
  .object({
    id: z.string().min(1),
    queueName: z.string().min(1),
    logicalKey: z.string().min(1),
    status: z.enum(DURABLE_WORK_QUEUE_STATUS_VALUES),
    payload: z.record(z.string(), z.unknown()),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    claimedBy: z.string().min(1).optional(),
    claimedAt: z.string().datetime().optional(),
    blockedReason: z.string().min(1).optional(),
    failureReason: z.string().min(1).optional(),
  })
  .strict();

export const durableWorkQueueStateSchema = z
  .object({
    version: z.string().min(1),
    generatedAt: z.string().datetime(),
    items: z.array(durableWorkQueueItemSchema),
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
    documentary: documentaryRecordStateSchema.optional(),
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
    documentStagingPath: z.string().min(1).optional(),
    studyCardsPath: z.string().min(1).optional(),
    thematicSynthesisPath: z.string().min(1).optional(),
    bookletPath: z.string().min(1).optional(),
  })
  .strict();

export const documentaryRecordStagingArtifactSchema = z
  .object({
    runId: z.string().min(1),
    generatedAt: z.string().datetime(),
    runtimeProjection: z
      .object({
        recordIds: z.array(z.string().min(1)),
        promotedRecordIds: z.array(z.string().min(1)),
      })
      .strict(),
    triage: z
      .object({
        extractableRecordIds: z.array(z.string().min(1)),
        deferredRecordIds: z.array(z.string().min(1)),
        lotIds: z.array(z.string().min(1)),
      })
      .strict()
      .optional(),
    records: z.array(normalizedEvidenceRecordSchema),
  })
  .strict()
  .transform((artifact) => ({
    ...artifact,
    records: artifact.records.map((record) => ({
      ...record,
      documentary: record.documentary ?? {
        status: 'metadata-only' as const,
        acquisition: {
          sourceKind: 'metadata' as const,
          rejectionReason: null,
        },
      },
    })),
  }));

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
          message: 'stageReports must follow discover->ingest->fulltext->extract-study-cards->thematic-synthesis->synthesize->validate->publish order',
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
export type DocumentaryRejectionReason = z.infer<typeof documentaryRejectionReasonSchema>;
export type DocumentaryAcquisition = z.infer<typeof documentaryAcquisitionSchema>;
export type DocumentaryRecordState = z.infer<typeof documentaryRecordStateSchema>;
export type EvidenceRankingReason = z.infer<typeof evidenceRankingReasonSchema>;
export type EvidenceScientificRanking = z.infer<typeof evidenceScientificRankingSchema>;
export type StructuredStudyExtraction = z.infer<typeof structuredStudyExtractionSchema>;
export type StudyCard = z.infer<typeof studyCardSchema>;
export type ThematicSynthesis = z.infer<typeof thematicSynthesisSchema>;
export type DocumentRegistryRecord = z.infer<typeof documentRegistryRecordSchema>;
export type DocumentRegistryState = z.infer<typeof documentRegistryStateSchema>;
export type StudyDossierRegistryRecord = z.infer<typeof studyDossierRegistryRecordSchema>;
export type StudyDossierRegistryState = z.infer<typeof studyDossierRegistryStateSchema>;
export type DurableWorkQueueItem = z.infer<typeof durableWorkQueueItemSchema>;
export type DurableWorkQueueState = z.infer<typeof durableWorkQueueStateSchema>;
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
export type DocumentaryRecordStagingArtifact = z.infer<typeof documentaryRecordStagingArtifactSchema>;

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

export function parseStudyCard(input: unknown): StudyCard {
  return studyCardSchema.parse(input);
}

export function parseThematicSynthesis(input: unknown): ThematicSynthesis {
  return thematicSynthesisSchema.parse(input);
}

export function parseDocumentRegistryRecord(input: unknown): DocumentRegistryRecord {
  return documentRegistryRecordSchema.parse(input);
}

export function parseDocumentRegistryState(input: unknown): DocumentRegistryState {
  return documentRegistryStateSchema.parse(input);
}

export function parseStudyDossierRegistryRecord(input: unknown): StudyDossierRegistryRecord {
  return studyDossierRegistryRecordSchema.parse(input);
}

export function parseStudyDossierRegistryState(input: unknown): StudyDossierRegistryState {
  return studyDossierRegistryStateSchema.parse(input);
}

export function parseDurableWorkQueueItem(input: unknown): DurableWorkQueueItem {
  return durableWorkQueueItemSchema.parse(input);
}

export function parseDurableWorkQueueState(input: unknown): DurableWorkQueueState {
  return durableWorkQueueStateSchema.parse(input);
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

export function parseRejectedSynthesisClaim(input: unknown): RejectedSynthesisClaim {
  return rejectedSynthesisClaimSchema.parse(input);
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

export function parseDocumentaryRecordStagingArtifact(input: unknown): DocumentaryRecordStagingArtifact {
  return documentaryRecordStagingArtifactSchema.parse(input);
}
