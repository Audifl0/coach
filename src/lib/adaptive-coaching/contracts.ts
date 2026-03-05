import { z } from 'zod';

import {
  adaptiveConfidenceLabelValues,
  adaptiveConfirmationDecisionValues,
  adaptiveRecommendationActionValues,
  adaptiveRecommendationStatusValues,
} from './types';

const adaptiveReasonSchema = z.string().trim().min(1).max(180);
const adaptiveEvidenceTagSchema = z.string().trim().min(2).max(32);

const adaptiveForecastProjectionSchema = z.object({
  projectedReadiness: z.number().int().min(1).max(5),
  projectedRpe: z.number().min(1).max(10),
});

export const adaptiveRecommendationProposalSchema = z.object({
  actionType: z.enum(adaptiveRecommendationActionValues),
  status: z.enum(adaptiveRecommendationStatusValues),
  plannedSessionId: z.string().trim().min(1),
  reasons: z.array(adaptiveReasonSchema).min(2).max(3),
  evidenceTags: z.array(adaptiveEvidenceTagSchema).min(1),
  forecastProjection: adaptiveForecastProjectionSchema,
  substitutionTarget: z
    .object({
      exerciseKey: z.string().trim().min(1),
      displayName: z.string().trim().min(1),
    })
    .optional(),
});

export const adaptiveRecommendationSchema = z
  .object({
    id: z.string().trim().min(1),
    actionType: z.enum(adaptiveRecommendationActionValues),
    status: z.enum(adaptiveRecommendationStatusValues),
    plannedSessionId: z.string().trim().min(1),
    confidence: z.number().min(0).max(1),
    confidenceLabel: z.enum(adaptiveConfidenceLabelValues),
    confidenceReason: z.string().trim().min(1),
    warningFlag: z.boolean(),
    warningText: z.string().trim().min(1).optional(),
    fallbackApplied: z.boolean(),
    fallbackReason: z.string().trim().min(1).optional(),
    reasons: z.array(adaptiveReasonSchema).min(2).max(3),
    evidenceTags: z.array(adaptiveEvidenceTagSchema).min(1),
    forecastProjection: adaptiveForecastProjectionSchema,
    progressionDeltaLoadPct: z.number().min(-100).max(100).optional(),
    progressionDeltaReps: z.number().int().optional(),
    progressionDeltaSets: z.number().int().optional(),
    substitutionTarget: z
      .object({
        exerciseKey: z.string().trim().min(1),
        displayName: z.string().trim().min(1),
      })
      .optional(),
    expiresAt: z.iso.datetime().optional(),
    appliedAt: z.iso.datetime().optional(),
    rejectedAt: z.iso.datetime().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === 'pending_confirmation' && !value.expiresAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: '`expiresAt` is required when status is pending_confirmation',
      });
    }
  });

export const adaptiveConfirmationInputSchema = z.object({
  recommendationId: z.string().trim().min(1),
  decision: z.enum(adaptiveConfirmationDecisionValues),
});

export type AdaptiveRecommendationProposal = z.infer<typeof adaptiveRecommendationProposalSchema>;
export type AdaptiveRecommendation = z.infer<typeof adaptiveRecommendationSchema>;
export type AdaptiveConfirmationInput = z.infer<typeof adaptiveConfirmationInputSchema>;

export function parseAdaptiveRecommendationProposal(input: unknown): AdaptiveRecommendationProposal {
  return adaptiveRecommendationProposalSchema.parse(input);
}

export function parseAdaptiveRecommendation(input: unknown): AdaptiveRecommendation {
  return adaptiveRecommendationSchema.parse(input);
}

export function parseAdaptiveConfirmationInput(input: unknown): AdaptiveConfirmationInput {
  return adaptiveConfirmationInputSchema.parse(input);
}
