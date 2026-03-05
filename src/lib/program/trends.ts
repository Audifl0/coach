import { z } from 'zod';

import { movementPatternValues } from './types';

export const trendPeriodValues = ['7d', '30d', '90d'] as const;

export const programTrendQueryInputSchema = z.object({
  period: z.enum(trendPeriodValues).optional().default('30d'),
});

const trendPointSchema = z.object({
  date: z.iso.date(),
  value: z.number().min(0),
});

const trendMetricSchema = z.object({
  kpi: z.number().min(0),
  unit: z.string().trim().min(1),
  points: z.array(trendPointSchema).min(1),
});

export const programTrendsSummaryResponseSchema = z.object({
  period: z.enum(trendPeriodValues),
  generatedAt: z.iso.datetime(),
  metrics: z.object({
    volume: trendMetricSchema,
    intensity: trendMetricSchema,
    adherence: trendMetricSchema,
  }),
});

const exerciseTrendPointSchema = z.object({
  date: z.iso.date(),
  reps: z.number().int().min(0),
  load: z.number().min(0),
});

export const programTrendsExerciseResponseSchema = z.object({
  period: z.enum(trendPeriodValues),
  exercise: z.object({
    key: z.string().trim().min(1),
    displayName: z.string().trim().min(1),
    movementPattern: z.enum(movementPatternValues).optional(),
  }),
  points: z.array(exerciseTrendPointSchema).min(1),
});

export type ProgramTrendQueryInput = z.infer<typeof programTrendQueryInputSchema>;
export type ProgramTrendsSummaryResponse = z.infer<typeof programTrendsSummaryResponseSchema>;
export type ProgramTrendsExerciseResponse = z.infer<typeof programTrendsExerciseResponseSchema>;

export function parseProgramTrendQueryInput(input: unknown): ProgramTrendQueryInput {
  return programTrendQueryInputSchema.parse(input);
}

export function parseProgramTrendsSummaryResponse(input: unknown): ProgramTrendsSummaryResponse {
  return programTrendsSummaryResponseSchema.parse(input);
}

export function parseProgramTrendsExerciseResponse(input: unknown): ProgramTrendsExerciseResponse {
  return programTrendsExerciseResponseSchema.parse(input);
}
