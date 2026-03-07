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
