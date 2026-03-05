import { z } from 'zod';

const SOURCE_TYPE_VALUES = ['guideline', 'review', 'expertise'] as const;

export const normalizedEvidenceRecordSchema = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    sourceType: z.enum(SOURCE_TYPE_VALUES),
    title: z.string().min(1),
    url: z.string().url(),
    domain: z.string().min(1),
    publishedAt: z.string().date(),
    summary: z.string().min(1),
    language: z.string().min(1).default('en'),
    provenanceId: z.string().min(1),
    provenanceUrl: z.string().url(),
    tags: z.array(z.string().min(1)).min(1),
  })
  .strict();

const principleProvenanceSchema = z
  .object({
    recordId: z.string().min(1),
    url: z.string().url(),
    source: z.string().min(1),
  })
  .strict();

export const corpusPrincipleSchema = z
  .object({
    id: z.string().min(1),
    titleFr: z.string().min(1),
    summaryFr: z.string().min(1),
    recommendationFr: z.string().min(1),
    provenance: z.array(principleProvenanceSchema).min(1),
  })
  .strict();

const stageNameSchema = z.enum(['discover', 'fetch', 'synthesize', 'validate']);
const stageStatusSchema = z.enum(['success', 'failed', 'skipped']);

const runStageSchema = z
  .object({
    stage: stageNameSchema,
    status: stageStatusSchema,
    message: z.string().min(1).optional(),
  })
  .strict();

export const corpusRunReportSchema = z
  .object({
    runId: z.string().min(1),
    generatedAt: z.string().datetime(),
    stageOrder: z.array(stageNameSchema).length(4),
    stages: z.array(runStageSchema).min(1),
    sources: z.array(
      z
        .object({
          source: z.string().min(1),
          skipped: z.boolean(),
          recordsFetched: z.number().int().nonnegative(),
          recordsSkipped: z.number().int().nonnegative(),
          attempts: z.number().int().positive(),
          error: z.string().min(1).optional(),
        })
        .strict(),
    ),
  })
  .strict();

export const corpusSnapshotManifestSchema = z
  .object({
    runId: z.string().min(1),
    candidatePath: z.string().min(1),
    sourcesFile: z.string().min(1),
    principlesFile: z.string().min(1),
    runReportFile: z.string().min(1),
  })
  .strict();

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
