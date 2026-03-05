import { z } from 'zod';

const SOURCE_TYPE_VALUES = ['guideline', 'review', 'expertise'] as const;
const STAGE_VALUES = ['discover', 'ingest', 'synthesize', 'validate', 'publish'] as const;
const STAGE_STATUS_VALUES = ['succeeded', 'failed', 'skipped'] as const;

export const normalizedEvidenceRecordSchema = z
  .object({
    id: z.string().min(1),
    sourceType: z.enum(SOURCE_TYPE_VALUES),
    sourceUrl: z.string().url(),
    sourceDomain: z.string().min(1),
    publishedAt: z.string().date(),
    title: z.string().min(1),
    summaryEn: z.string().min(1),
    tags: z.array(z.string().min(1)).min(1),
    provenanceIds: z.array(z.string().min(1)).min(1),
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
    mode: z.enum(['refresh', 'check']),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    snapshotId: z.string().min(1),
    stageReports: z.array(stageReportSchema).min(1),
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
export type CorpusPrinciple = z.infer<typeof corpusPrincipleSchema>;
export type CorpusRunReport = z.infer<typeof corpusRunReportSchema>;
export type CorpusSnapshotManifest = z.infer<typeof corpusSnapshotManifestSchema>;

export function parseNormalizedEvidenceRecord(input: unknown): NormalizedEvidenceRecord {
  return normalizedEvidenceRecordSchema.parse(input);
}

export function parseCorpusPrinciple(input: unknown): CorpusPrinciple {
  return corpusPrincipleSchema.parse(input);
}

export function parseCorpusRunReport(input: unknown): CorpusRunReport {
  return corpusRunReportSchema.parse(input);
}

export function parseCorpusSnapshotManifest(input: unknown): CorpusSnapshotManifest {
  return corpusSnapshotManifestSchema.parse(input);
}
