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
  session: programSessionSummarySchema,
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

export type ProgramGenerateInput = z.infer<typeof programGenerateInputSchema>;
export type ProgramPlannedExercise = z.infer<typeof programPlannedExerciseSchema>;
export type ProgramSessionSummary = z.infer<typeof programSessionSummarySchema>;
export type ProgramTodayResponse = z.infer<typeof programTodayResponseSchema>;
export type ProgramSessionDetailResponse = z.infer<typeof programSessionDetailResponseSchema>;
export type SubstitutionCandidate = z.infer<typeof substitutionCandidateSchema>;
export type SubstitutionApplyInput = z.infer<typeof substitutionApplyInputSchema>;

export function parseProgramGenerateInput(input: unknown): ProgramGenerateInput {
  return programGenerateInputSchema.parse(input);
}

export function parseProgramTodayResponse(input: unknown): ProgramTodayResponse {
  return programTodayResponseSchema.parse(input);
}

export function parseProgramSessionDetailResponse(input: unknown): ProgramSessionDetailResponse {
  return programSessionDetailResponseSchema.parse(input);
}

export function parseSubstitutionApplyInput(input: unknown): SubstitutionApplyInput {
  return substitutionApplyInputSchema.parse(input);
}
