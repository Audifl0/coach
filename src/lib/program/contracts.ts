import { z } from 'zod';

import { equipmentTagValues, movementPatternValues, sessionStateValues } from './types';

export const programGenerateInputSchema = z.object({
  regenerate: z.boolean().optional().default(false),
  anchorDate: z.iso.date().optional(),
});

export const programPlannedExerciseSchema = z.object({
  id: z.string().trim().min(1),
  exerciseKey: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  movementPattern: z.enum(movementPatternValues),
  sets: z.number().int().min(1),
  targetReps: z.number().int().min(1),
  targetLoad: z.string().trim().min(1),
  restMinSec: z.number().int().min(0),
  restMaxSec: z.number().int().min(0),
  isSubstituted: z.boolean(),
  originalExerciseKey: z.string().trim().min(1).nullable(),
});

export const programSessionSummarySchema = z.object({
  id: z.string().trim().min(1),
  scheduledDate: z.iso.date(),
  dayIndex: z.number().int().min(0).max(6),
  focusLabel: z.string().trim().min(1),
  state: z.enum(sessionStateValues),
  exercises: z.array(programPlannedExerciseSchema).default([]),
});

export const programTodayResponseSchema = z.object({
  todaySession: programSessionSummarySchema.nullable(),
  nextSession: programSessionSummarySchema.nullable(),
  primaryAction: z.literal('start_workout'),
});

export const programSessionDetailResponseSchema = z.object({
  session: z.object({
    id: z.string().trim().min(1),
    scheduledDate: z.iso.date(),
    dayIndex: z.number().int().min(0).max(6),
    focusLabel: z.string().trim().min(1),
    state: z.enum(sessionStateValues),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    effectiveDurationSec: z.number().int().min(0).nullable(),
    durationCorrectedAt: z.iso.datetime().nullable(),
    note: z.string().trim().max(280).nullable(),
    postSessionFatigue: z.number().int().min(1).max(5).nullable(),
    postSessionReadiness: z.number().int().min(1).max(5).nullable(),
    postSessionComment: z.string().trim().max(280).nullable(),
    exercises: z.array(
      z.object({
        id: z.string().trim().min(1),
        exerciseKey: z.string().trim().min(1),
        displayName: z.string().trim().min(1),
        movementPattern: z.enum(movementPatternValues),
        sets: z.number().int().min(1),
        targetReps: z.number().int().min(1),
        targetLoad: z.string().trim().min(1),
        restMinSec: z.number().int().min(0),
        restMaxSec: z.number().int().min(0),
        isSubstituted: z.boolean(),
        originalExerciseKey: z.string().trim().min(1).nullable(),
        isSkipped: z.boolean(),
        skipReasonCode: z.string().trim().min(1).nullable(),
        skipReasonText: z.string().trim().min(1).nullable(),
        loggedSets: z.array(
          z.object({
            setIndex: z.number().int().min(1),
            weight: z.number().positive(),
            reps: z.number().int().min(1),
            rpe: z.number().min(1).max(10).nullable(),
          }),
        ).default([]),
      }),
    ).default([]),
  }),
});

export const programHistoryRowSchema = z.object({
  id: z.string().trim().min(1),
  date: z.iso.date(),
  duration: z.number().int().min(0),
  exerciseCount: z.number().int().min(0),
  totalLoad: z.number().min(0),
});

export const programHistoryListResponseSchema = z.object({
  sessions: z.array(programHistoryRowSchema).default([]),
});

export const programHistoryLoggedSetSchema = z.object({
  setIndex: z.number().int().min(1),
  weight: z.number().positive(),
  reps: z.number().int().min(1),
  rpe: z.number().min(1).max(10).nullable(),
});

export const programHistoryExerciseDetailSchema = z.object({
  id: z.string().trim().min(1),
  exerciseKey: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  movementPattern: z.enum(movementPatternValues),
  isSkipped: z.boolean(),
  skipReasonCode: z.string().trim().min(1).nullable(),
  skipReasonText: z.string().trim().min(1).nullable(),
  loggedSets: z.array(programHistoryLoggedSetSchema).default([]),
});

export const programHistorySessionDetailResponseSchema = z.object({
  session: z.object({
    id: z.string().trim().min(1),
    date: z.iso.date(),
    duration: z.number().int().min(0),
    exerciseCount: z.number().int().min(0),
    totalLoad: z.number().min(0),
    focusLabel: z.string().trim().min(1),
    exercises: z.array(programHistoryExerciseDetailSchema).default([]),
  }),
});

export const substitutionCandidateSchema = z.object({
  exerciseKey: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  movementPattern: z.enum(movementPatternValues),
  equipmentTags: z.array(z.enum(equipmentTagValues)).min(1),
});

export const substitutionApplyInputSchema = z.object({
  replacementExerciseKey: z.string().trim().min(1),
});

export const loggedSetInputSchema = z.object({
  setIndex: z.number().int().min(1),
  weight: z.number().positive(),
  reps: z.number().int().min(1),
  rpe: z.number().min(1).max(10).optional(),
});

export const exerciseSkipInputSchema = z.object({
  reasonCode: z.string().trim().min(1),
  reasonText: z.string().trim().max(280).optional(),
});

export const sessionNoteInputSchema = z.object({
  note: z.string().trim().max(280).nullable().optional(),
});

export const sessionCompleteInputSchema = z.object({
  fatigue: z.number().int().min(1).max(5),
  readiness: z.number().int().min(1).max(5),
  comment: z.string().trim().max(280).optional(),
});

export const sessionDurationCorrectionInputSchema = z.object({
  effectiveDurationSec: z.number().int().min(1),
});

export const historyPeriodValues = ['7d', '30d', '90d', 'custom'] as const;

export const historyQueryInputSchema = z
  .object({
    period: z.enum(historyPeriodValues),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.period === 'custom') {
      if (!value.from || !value.to) {
        ctx.addIssue({
          code: 'custom',
          message: '`from` and `to` are required when period is custom',
        });
        return;
      }

      if (value.from > value.to) {
        ctx.addIssue({
          code: 'custom',
          path: ['from'],
          message: '`from` must be less than or equal to `to`',
        });
      }

      return;
    }

    if (value.from || value.to) {
      ctx.addIssue({
        code: 'custom',
        message: '`from` and `to` are only allowed when period is custom',
      });
    }
  });

export const workerCorpusSeverityValues = ['healthy', 'degraded', 'critical'] as const;
export const workerCorpusLiveStateValues = [
  'idle',
  'started',
  'heartbeat',
  'completed',
  'failed',
  'blocked-by-lease',
  'stale',
] as const;
export const workerCorpusOutcomeValues = ['succeeded', 'failed', 'blocked', 'running'] as const;
export const workerCorpusArtifactStateValues = ['candidate', 'validated'] as const;
export const workerCorpusStageValues = [
  'discover',
  'ingest',
  'fulltext',
  'extract-study-cards',
  'thematic-synthesis',
  'synthesize',
  'validate',
  'publish',
] as const;
export const workerCorpusStageStatusValues = ['succeeded', 'failed', 'skipped'] as const;
export const workerCorpusModeValues = ['bootstrap', 'refresh', 'check'] as const;
export const workerCorpusControlStateValues = ['idle', 'running', 'paused', 'failed'] as const;
export const workerCorpusControlActionValues = ['start', 'pause', 'resume', 'reset'] as const;

export const workerCorpusBootstrapCampaignSchema = z.object({
  campaignId: z.string().trim().min(1),
  status: z.enum(['idle', 'running', 'paused', 'completed', 'failed']),
  startedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lastRunId: z.string().trim().min(1).nullable(),
  activeJobId: z.string().trim().min(1).nullable(),
  backlog: z.object({
    pending: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    exhausted: z.number().int().nonnegative().default(0),
  }),
  progress: z.object({
    discoveredQueryFamilies: z.number().int().nonnegative(),
    canonicalRecordCount: z.number().int().nonnegative(),
    extractionBacklogCount: z.number().int().nonnegative(),
    publicationCandidateCount: z.number().int().nonnegative(),
  }),
  cursors: z.object({
    resumableJobCount: z.number().int().nonnegative(),
    activeCursorCount: z.number().int().nonnegative(),
    sampleJobIds: z.array(z.string().trim().min(1)).default([]),
  }),
  budgets: z.object({
    maxJobsPerRun: z.number().int().positive(),
    maxPagesPerJob: z.number().int().positive(),
    maxCanonicalRecordsPerRun: z.number().int().positive(),
    maxRuntimeMs: z.number().int().positive(),
  }),
});

export const workerCorpusStageReportSchema = z.object({
  stage: z.enum(workerCorpusStageValues),
  status: z.enum(workerCorpusStageStatusValues),
  message: z.string().trim().min(1).nullable().default(null),
});

export const workerCorpusRunRowSchema = z.object({
  runId: z.string().trim().min(1),
  snapshotId: z.string().trim().min(1),
  mode: z.enum(workerCorpusModeValues),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  artifactState: z.enum(workerCorpusArtifactStateValues),
  outcome: z.enum(workerCorpusOutcomeValues),
  severity: z.enum(workerCorpusSeverityValues),
  finalStage: z.enum(workerCorpusStageValues),
  finalMessage: z.string().trim().min(1).nullable(),
  evidenceRecordCount: z.number().int().nonnegative().nullable(),
  principleCount: z.number().int().nonnegative().nullable(),
  sourceDomains: z.array(z.string().trim().min(1)).default([]),
  qualityGateReasons: z.array(z.string().trim().min(1)).default([]),
  isActiveSnapshot: z.boolean(),
  isRollbackSnapshot: z.boolean(),
});

export const workerCorpusRunDetailSchema = workerCorpusRunRowSchema.extend({
  generatedAt: z.iso.datetime().nullable(),
  stageReports: z.array(workerCorpusStageReportSchema).min(1),
  modelRun: z
    .object({
      provider: z.string().trim().min(1),
      model: z.string().trim().min(1),
      requestId: z.string().trim().min(1).nullable(),
      latencyMs: z.number().int().nonnegative().nullable(),
    })
    .nullable(),
  contradictionCount: z.number().int().nonnegative(),
  coverageRecordCount: z.number().int().nonnegative().nullable(),
});

export const workerCorpusSnapshotDetailSchema = z.object({
  snapshotId: z.string().trim().min(1),
  artifactState: z.enum(workerCorpusArtifactStateValues),
  generatedAt: z.iso.datetime().nullable(),
  promotedAt: z.iso.datetime().nullable(),
  severity: z.enum(workerCorpusSeverityValues),
  isActiveSnapshot: z.boolean(),
  isRollbackSnapshot: z.boolean(),
  snapshotAgeHours: z.number().nonnegative().nullable(),
  evidenceRecordCount: z.number().int().nonnegative().nullable(),
  principleCount: z.number().int().nonnegative().nullable(),
  sourceDomains: z.array(z.string().trim().min(1)).default([]),
  diff: z
    .object({
      previousSnapshotId: z.string().trim().min(1).nullable(),
      currentSnapshotId: z.string().trim().min(1),
      evidenceRecordDelta: z.number().int(),
      principleDelta: z.number().int(),
    })
    .nullable(),
  qualityGateReasons: z.array(z.string().trim().min(1)).default([]),
  modelRun: z
    .object({
      provider: z.string().trim().min(1),
      model: z.string().trim().min(1),
      requestId: z.string().trim().min(1).nullable(),
      latencyMs: z.number().int().nonnegative().nullable(),
    })
    .nullable(),
  contradictionCount: z.number().int().nonnegative(),
  coverageRecordCount: z.number().int().nonnegative().nullable(),
});

export const workerCorpusOverviewResponseSchema = z.object({
  generatedAt: z.iso.datetime(),
  control: z.object({
    state: z.enum(workerCorpusControlStateValues),
    pid: z.number().int().positive().nullable(),
    mode: z.enum(workerCorpusModeValues).nullable(),
    startedAt: z.iso.datetime().nullable(),
    stoppedAt: z.iso.datetime().nullable(),
    pauseRequestedAt: z.iso.datetime().nullable(),
    message: z.string().trim().min(1).nullable(),
    campaign: workerCorpusBootstrapCampaignSchema.nullable().default(null),
  }),
  live: z.object({
    state: z.enum(workerCorpusLiveStateValues),
    severity: z.enum(workerCorpusSeverityValues),
    runId: z.string().trim().min(1).nullable(),
    mode: z.enum(workerCorpusModeValues).nullable(),
    startedAt: z.iso.datetime().nullable(),
    heartbeatAt: z.iso.datetime().nullable(),
    leaseExpiresAt: z.iso.datetime().nullable(),
    message: z.string().trim().min(1).nullable(),
    isHeartbeatStale: z.boolean(),
  }),
  publication: z.object({
    severity: z.enum(workerCorpusSeverityValues),
    activeSnapshotId: z.string().trim().min(1).nullable(),
    activeSnapshotDir: z.string().trim().min(1).nullable(),
    promotedAt: z.iso.datetime().nullable(),
    rollbackSnapshotId: z.string().trim().min(1).nullable(),
    rollbackSnapshotDir: z.string().trim().min(1).nullable(),
    rollbackAvailable: z.boolean(),
    snapshotAgeHours: z.number().nonnegative().nullable(),
    evidenceRecordCount: z.number().int().nonnegative().nullable(),
    principleCount: z.number().int().nonnegative().nullable(),
    sourceDomains: z.array(z.string().trim().min(1)).default([]),
    qualityGateReasons: z.array(z.string().trim().min(1)).default([]),
    lastRunAgeHours: z.number().nonnegative().nullable(),
  }),
  recentRuns: z.array(workerCorpusRunRowSchema).default([]),
});

export const workerCorpusOverviewSchema = workerCorpusOverviewResponseSchema;
export const workerCorpusOverviewSectionSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ready'),
    data: workerCorpusOverviewSchema,
  }),
  z.object({
    status: z.literal('empty'),
  }),
  z.object({
    status: z.literal('error'),
  }),
]);

export const workerCorpusStatusResponseSchema = workerCorpusOverviewResponseSchema.pick({
  generatedAt: true,
  control: true,
  live: true,
  publication: true,
});

export const workerCorpusRunsResponseSchema = z.object({
  generatedAt: z.iso.datetime(),
  runs: z.array(workerCorpusRunRowSchema).default([]),
});

export const workerCorpusControlCommandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start'),
    mode: z.enum(workerCorpusModeValues).optional().default('refresh'),
  }),
  z.object({
    action: z.literal('pause'),
  }),
  z.object({
    action: z.literal('resume'),
    mode: z.enum(workerCorpusModeValues).optional(),
  }),
  z.object({
    action: z.literal('reset'),
  }),
]);

export const workerCorpusControlResponseSchema = z.object({
  control: workerCorpusOverviewResponseSchema.shape.control,
});

export const workerCorpusLibraryEntrySchema = z.object({
  snapshotId: z.string().trim().min(1),
  runId: z.string().trim().min(1),
  mode: z.enum(workerCorpusModeValues),
  artifactState: z.enum(workerCorpusArtifactStateValues),
  outcome: z.enum(workerCorpusOutcomeValues),
  severity: z.enum(workerCorpusSeverityValues),
  generatedAt: z.iso.datetime().nullable(),
  promotedAt: z.iso.datetime().nullable(),
  evidenceRecordCount: z.number().int().nonnegative().nullable(),
  principleCount: z.number().int().nonnegative().nullable(),
  contradictionCount: z.number().int().nonnegative(),
  sourceDomains: z.array(z.string().trim().min(1)).default([]),
  coveredTags: z.array(z.string().trim().min(1)).default([]),
  qualityGateReasons: z.array(z.string().trim().min(1)).default([]),
  isActiveSnapshot: z.boolean(),
  isRollbackSnapshot: z.boolean(),
});

export const workerCorpusLibraryResponseSchema = z.object({
  generatedAt: z.iso.datetime(),
  entries: z.array(workerCorpusLibraryEntrySchema).default([]),
});

export const workerCorpusSupervisionWorkflowSchema = z.object({
  queueDepth: z.number().int().nonnegative(),
  blockedItems: z.number().int().nonnegative(),
  byStatus: z.object({
    pending: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  queues: z.array(
    z.object({
      queueName: z.string().trim().min(1),
      total: z.number().int().nonnegative(),
      blocked: z.number().int().nonnegative(),
      pending: z.number().int().nonnegative(),
      running: z.number().int().nonnegative(),
      completed: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
    }),
  ).default([]),
});

export const workerCorpusSupervisionDocumentsSchema = z.object({
  total: z.number().int().nonnegative(),
  byState: z.object({
    discovered: z.number().int().nonnegative(),
    'metadata-ready': z.number().int().nonnegative(),
    'abstract-ready': z.number().int().nonnegative(),
    'full-text-ready': z.number().int().nonnegative(),
    extractible: z.number().int().nonnegative(),
    extracted: z.number().int().nonnegative(),
    linked: z.number().int().nonnegative(),
  }),
});

export const workerCorpusSupervisionQuestionSummarySchema = z.object({
  questionId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  coverageStatus: z.enum(['empty', 'partial', 'developing', 'mature', 'blocked']),
  publicationStatus: z.enum(['not-ready', 'candidate', 'published', 'reopened']),
  publicationReadiness: z.enum(['insufficient', 'candidate', 'ready', 'blocked']).nullable(),
  contradictionCount: z.number().int().nonnegative(),
  blockingContradictionCount: z.number().int().nonnegative(),
  linkedStudyCount: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime().nullable(),
});

export const workerCorpusSupervisionQuestionsSchema = z.object({
  total: z.number().int().nonnegative(),
  contradictionCount: z.number().int().nonnegative(),
  blockingContradictionCount: z.number().int().nonnegative(),
  byCoverage: z.object({
    empty: z.number().int().nonnegative(),
    partial: z.number().int().nonnegative(),
    developing: z.number().int().nonnegative(),
    mature: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
  }),
  byPublication: z.object({
    'not-ready': z.number().int().nonnegative(),
    candidate: z.number().int().nonnegative(),
    published: z.number().int().nonnegative(),
    reopened: z.number().int().nonnegative(),
  }),
  notableQuestions: z.array(workerCorpusSupervisionQuestionSummarySchema).default([]),
});

export const workerCorpusSupervisionDoctrineRevisionSchema = z.object({
  revisionId: z.string().trim().min(1),
  principleId: z.string().trim().min(1),
  changedAt: z.iso.datetime(),
  changeType: z.enum(['published', 'reopened', 'superseded', 'reaffirmed']),
  reason: z.string().trim().min(1),
});

export const workerCorpusSupervisionDoctrineSchema = z.object({
  activePrinciples: z.number().int().nonnegative(),
  reopenedPrinciples: z.number().int().nonnegative(),
  supersededPrinciples: z.number().int().nonnegative(),
  recentRevisions: z.array(workerCorpusSupervisionDoctrineRevisionSchema).default([]),
});

export const workerCorpusResearchJournalEntrySchema = z.object({
  kind: z.string().trim().min(1),
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  at: z.iso.datetime(),
  detail: z.string().trim().min(1),
});

export const workerCorpusSupervisionResponseSchema = z.object({
  generatedAt: z.iso.datetime(),
  workflow: workerCorpusSupervisionWorkflowSchema,
  documents: workerCorpusSupervisionDocumentsSchema,
  questions: workerCorpusSupervisionQuestionsSchema,
  doctrine: workerCorpusSupervisionDoctrineSchema,
  recentResearchJournal: z.array(workerCorpusResearchJournalEntrySchema).default([]),
});

export const workerCorpusCorpusPrincipleSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summaryFr: z.string().trim().min(1),
  guidanceFr: z.string().trim().min(1),
  provenanceRecordIds: z.array(z.string().trim().min(1)).default([]),
  evidenceLevel: z.string().trim().min(1),
  guardrail: z.string().trim().min(1),
  targetPopulation: z.string().trim().min(1).nullable().default(null),
  applicationContext: z.string().trim().min(1).nullable().default(null),
  confidence: z.number().min(0).max(1).nullable().default(null),
});

export const workerCorpusCorpusSourceSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  sourceType: z.string().trim().min(1),
  sourceDomain: z.string().trim().min(1),
  sourceUrl: z.string().trim().min(1).nullable().default(null),
  publishedAt: z.string().trim().min(1).nullable().default(null),
  summaryEn: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).default([]),
  provenanceIds: z.array(z.string().trim().min(1)).default([]),
  ranking: z
    .object({
      compositeScore: z.number().min(0).max(1),
      selected: z.boolean(),
      reasons: z.array(
        z.object({
          code: z.string().trim().min(1),
          direction: z.string().trim().min(1),
          detail: z.string().trim().min(1),
        }),
      ).default([]),
    })
    .nullable()
    .default(null),
});

export const workerCorpusStudyExtractionSchema = z.object({
  recordId: z.string().trim().min(1),
  topicKeys: z.array(z.string().trim().min(1)).default([]),
  population: z.string().trim().min(1).nullable().default(null),
  intervention: z.string().trim().min(1).nullable().default(null),
  applicationContext: z.string().trim().min(1).nullable().default(null),
  outcomes: z.array(z.string().trim().min(1)).default([]),
  evidenceSignals: z.array(z.string().trim().min(1)).default([]),
  limitations: z.array(z.string().trim().min(1)).default([]),
  safetySignals: z.array(z.string().trim().min(1)).default([]),
  rejectionReason: z
    .object({
      code: z.string().trim().min(1),
      reason: z.string().trim().min(1),
    })
    .nullable()
    .default(null),
});

export const workerCorpusKnowledgeBibleSchema = z.object({
  principles: z.array(
    z.object({
      id: z.string().trim().min(1),
      title: z.string().trim().min(1),
      description: z.string().trim().min(1),
      guardrail: z.string().trim().min(1),
      tags: z.array(z.string().trim().min(1)).default([]),
      provenanceRecordIds: z.array(z.string().trim().min(1)).default([]),
    }),
  ).default([]),
  sources: z.array(
    z.object({
      id: z.string().trim().min(1),
      title: z.string().trim().min(1),
      summary: z.string().trim().min(1),
      sourceClass: z.string().trim().min(1),
      tags: z.array(z.string().trim().min(1)).default([]),
      provenanceIds: z.array(z.string().trim().min(1)).default([]),
    }),
  ).default([]),
});

export const workerCorpusLibraryDetailSchema = z.object({
  entry: workerCorpusLibraryEntrySchema,
  stageReports: z.array(workerCorpusStageReportSchema).default([]),
  principles: z.array(workerCorpusCorpusPrincipleSchema).default([]),
  sources: z.array(workerCorpusCorpusSourceSchema).default([]),
  studyExtractions: z.array(workerCorpusStudyExtractionSchema).default([]),
  rejectedClaims: z.array(
    z.object({
      recordId: z.string().trim().min(1),
      code: z.string().trim().min(1),
      reason: z.string().trim().min(1),
    }),
  ).default([]),
  contradictions: z.array(
    z.object({
      code: z.string().trim().min(1),
      severity: z.string().trim().min(1),
      recordIds: z.array(z.string().trim().min(1)).default([]),
      resolution: z.string().trim().min(1),
    }),
  ).default([]),
  discovery: z
    .object({
      targetTopicKeys: z.array(z.string().trim().min(1)).default([]),
      totalQueries: z.number().int().nonnegative(),
      coverageGaps: z.array(
        z.object({
          topicKey: z.string().trim().min(1),
          topicLabel: z.string().trim().min(1),
          status: z.string().trim().min(1),
          normalizedRecordCount: z.number().int().nonnegative(),
          fetchedRecordCount: z.number().int().nonnegative(),
        }),
      ).default([]),
    })
    .nullable()
    .default(null),
  ranking: z
    .object({
      evaluatedRecordCount: z.number().int().nonnegative(),
      selectedRecordCount: z.number().int().nonnegative(),
      rejectedRecordCount: z.number().int().nonnegative(),
      topRecordIds: z.array(z.string().trim().min(1)).default([]),
      rejectionCodes: z.array(z.string().trim().min(1)).default([]),
    })
    .nullable()
    .default(null),
  connectorSummaries: z.array(
    z.object({
      source: z.string().trim().min(1),
      skipped: z.boolean(),
      attempts: z.number().int().nonnegative(),
      rawResults: z.number().int().nonnegative().nullable().default(null),
      recordsFetched: z.number().int().nonnegative(),
      recordsSkipped: z.number().int().nonnegative(),
      nextCursor: z.string().trim().min(1).nullable().default(null),
      skipReasons: z
        .object({
          disallowedDomain: z.number().int().nonnegative(),
          stalePublication: z.number().int().nonnegative(),
          alreadySeen: z.number().int().nonnegative(),
          invalidUrl: z.number().int().nonnegative(),
          offTopic: z.number().int().nonnegative(),
        })
        .nullable()
        .default(null),
      error: z
        .object({
          message: z.string().trim().min(1),
          attempts: z.number().int().nonnegative(),
        })
        .nullable()
        .default(null),
    }),
  ).default([]),
  knowledgeBible: workerCorpusKnowledgeBibleSchema.nullable().default(null),
});

export const workerCorpusRunDetailSectionSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ready'),
    data: workerCorpusRunDetailSchema,
  }),
  z.object({
    status: z.literal('empty'),
  }),
  z.object({
    status: z.literal('error'),
  }),
]);

export const workerCorpusSnapshotDetailSectionSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ready'),
    data: workerCorpusSnapshotDetailSchema,
  }),
  z.object({
    status: z.literal('empty'),
  }),
  z.object({
    status: z.literal('error'),
  }),
]);

export type ProgramGenerateInput = z.infer<typeof programGenerateInputSchema>;
export type ProgramPlannedExercise = z.infer<typeof programPlannedExerciseSchema>;
export type ProgramSessionSummary = z.infer<typeof programSessionSummarySchema>;
export type ProgramSessionSummaryCandidate = Omit<ProgramSessionSummary, 'scheduledDate'> & {
  scheduledDate: Date | string;
};
export type ProgramTodaySessionCandidates = {
  todaySession: ProgramSessionSummaryCandidate | null;
  nextSession: ProgramSessionSummaryCandidate | null;
};
export type ProgramTodayResponse = z.infer<typeof programTodayResponseSchema>;
export type ProgramSessionDetailResponse = z.infer<typeof programSessionDetailResponseSchema>;
export type ProgramHistoryRow = z.infer<typeof programHistoryRowSchema>;
export type ProgramHistoryListResponse = z.infer<typeof programHistoryListResponseSchema>;
export type ProgramHistorySessionDetailResponse = z.infer<typeof programHistorySessionDetailResponseSchema>;
export type SubstitutionCandidate = z.infer<typeof substitutionCandidateSchema>;
export type SubstitutionApplyInput = z.infer<typeof substitutionApplyInputSchema>;
export type LoggedSetInput = z.infer<typeof loggedSetInputSchema>;
export type ExerciseSkipInput = z.infer<typeof exerciseSkipInputSchema>;
export type SessionNoteInput = z.infer<typeof sessionNoteInputSchema>;
export type SessionCompleteInput = z.infer<typeof sessionCompleteInputSchema>;
export type SessionDurationCorrectionInput = z.infer<typeof sessionDurationCorrectionInputSchema>;
export type HistoryQueryInput = z.infer<typeof historyQueryInputSchema>;
export type WorkerCorpusStageReport = z.infer<typeof workerCorpusStageReportSchema>;
export type WorkerCorpusOverview = z.infer<typeof workerCorpusOverviewSchema>;
export type WorkerCorpusControlCommand = z.infer<typeof workerCorpusControlCommandSchema>;
export type WorkerCorpusControlResponse = z.infer<typeof workerCorpusControlResponseSchema>;
export type WorkerCorpusRunRow = z.infer<typeof workerCorpusRunRowSchema>;
export type WorkerCorpusRunDetail = z.infer<typeof workerCorpusRunDetailSchema>;
export type WorkerCorpusSnapshotDetail = z.infer<typeof workerCorpusSnapshotDetailSchema>;
export type WorkerCorpusOverviewResponse = z.infer<typeof workerCorpusOverviewResponseSchema>;
export type WorkerCorpusOverviewSection = z.infer<typeof workerCorpusOverviewSectionSchema>;
export type WorkerCorpusStatusResponse = z.infer<typeof workerCorpusStatusResponseSchema>;
export type WorkerCorpusRunsResponse = z.infer<typeof workerCorpusRunsResponseSchema>;
export type WorkerCorpusLibraryEntry = z.infer<typeof workerCorpusLibraryEntrySchema>;
export type WorkerCorpusLibraryResponse = z.infer<typeof workerCorpusLibraryResponseSchema>;
export type WorkerCorpusSupervisionResponse = z.infer<typeof workerCorpusSupervisionResponseSchema>;
export type WorkerCorpusLibraryDetail = z.infer<typeof workerCorpusLibraryDetailSchema>;
export type WorkerCorpusRunDetailSection = z.infer<typeof workerCorpusRunDetailSectionSchema>;
export type WorkerCorpusSnapshotDetailSection = z.infer<typeof workerCorpusSnapshotDetailSectionSchema>;

export function parseProgramGenerateInput(input: unknown): ProgramGenerateInput {
  return programGenerateInputSchema.parse(input);
}

export function parseProgramTodayResponse(input: unknown): ProgramTodayResponse {
  return programTodayResponseSchema.parse(input);
}

export function parseProgramSessionDetailResponse(input: unknown): ProgramSessionDetailResponse {
  return programSessionDetailResponseSchema.parse(input);
}

export function parseProgramHistoryListResponse(input: unknown): ProgramHistoryListResponse {
  return programHistoryListResponseSchema.parse(input);
}

export function parseProgramHistorySessionDetailResponse(input: unknown): ProgramHistorySessionDetailResponse {
  return programHistorySessionDetailResponseSchema.parse(input);
}

export function parseSubstitutionApplyInput(input: unknown): SubstitutionApplyInput {
  return substitutionApplyInputSchema.parse(input);
}

export function parseLoggedSetInput(input: unknown): LoggedSetInput {
  return loggedSetInputSchema.parse(input);
}

export function parseExerciseSkipInput(input: unknown): ExerciseSkipInput {
  return exerciseSkipInputSchema.parse(input);
}

export function parseSessionNoteInput(input: unknown): SessionNoteInput {
  return sessionNoteInputSchema.parse(input);
}

export function parseSessionCompleteInput(input: unknown): SessionCompleteInput {
  return sessionCompleteInputSchema.parse(input);
}

export function parseSessionDurationCorrectionInput(input: unknown): SessionDurationCorrectionInput {
  return sessionDurationCorrectionInputSchema.parse(input);
}

export function parseHistoryQueryInput(input: unknown): HistoryQueryInput {
  return historyQueryInputSchema.parse(input);
}

export function parseWorkerCorpusOverviewResponse(input: unknown): WorkerCorpusOverviewResponse {
  return workerCorpusOverviewResponseSchema.parse(input);
}

export function parseWorkerCorpusOverviewSection(input: unknown): WorkerCorpusOverviewSection {
  return workerCorpusOverviewSectionSchema.parse(input);
}

export function parseWorkerCorpusRunDetail(input: unknown): WorkerCorpusRunDetail {
  return workerCorpusRunDetailSchema.parse(input);
}

export function parseWorkerCorpusRunDetailSection(input: unknown): WorkerCorpusRunDetailSection {
  return workerCorpusRunDetailSectionSchema.parse(input);
}

export function parseWorkerCorpusSnapshotDetail(input: unknown): WorkerCorpusSnapshotDetail {
  return workerCorpusSnapshotDetailSchema.parse(input);
}

export function parseWorkerCorpusSnapshotDetailSection(input: unknown): WorkerCorpusSnapshotDetailSection {
  return workerCorpusSnapshotDetailSectionSchema.parse(input);
}

export function parseWorkerCorpusStatusResponse(input: unknown): WorkerCorpusStatusResponse {
  return workerCorpusStatusResponseSchema.parse(input);
}

export function parseWorkerCorpusRunsResponse(input: unknown): WorkerCorpusRunsResponse {
  return workerCorpusRunsResponseSchema.parse(input);
}

export function parseWorkerCorpusControlCommand(input: unknown): WorkerCorpusControlCommand {
  return workerCorpusControlCommandSchema.parse(input);
}

export function parseWorkerCorpusControlResponse(input: unknown): WorkerCorpusControlResponse {
  return workerCorpusControlResponseSchema.parse(input);
}

export function parseWorkerCorpusLibraryResponse(input: unknown): WorkerCorpusLibraryResponse {
  return workerCorpusLibraryResponseSchema.parse(input);
}

export function parseWorkerCorpusSupervisionResponse(input: unknown): WorkerCorpusSupervisionResponse {
  return workerCorpusSupervisionResponseSchema.parse(input);
}

export function parseWorkerCorpusLibraryDetail(input: unknown): WorkerCorpusLibraryDetail {
  return workerCorpusLibraryDetailSchema.parse(input);
}

export {
  parseProgramTrendQueryInput,
  parseProgramTrendsExerciseResponse,
  parseProgramTrendsSummaryResponse,
  programTrendQueryInputSchema,
  programTrendsExerciseResponseSchema,
  programTrendsSummaryResponseSchema,
  trendPeriodValues,
} from './trends';

export type { ProgramTrendQueryInput, ProgramTrendsExerciseResponse, ProgramTrendsSummaryResponse } from './trends';
