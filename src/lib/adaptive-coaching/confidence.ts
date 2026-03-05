import {
  applyAdaptiveSafetyPolicy,
  isRecommendationWithinSafetyBounds,
  type AdaptiveRecommendation,
  type AthleteSafetyContext,
} from './policy';

export const SAFE_CONFIDENCE_MINIMUM = 0.6;

export type RecommendationConfidenceInput = {
  candidateRecommendation: AdaptiveRecommendation | null;
  modelConfidence: number | null;
  contextQuality: number | null;
  minimumConfidence?: number;
};

export type RecommendationConfidenceResult = {
  confidenceScore: number;
  fallbackRequired: boolean;
  reasonCodes: string[];
};

export type ConservativeFallbackResult = {
  recommendation: AdaptiveRecommendation;
  fallbackReasonCode: 'reuse_last_conservative' | 'conservative_hold';
};

function toBoundedScore(value: number | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function buildConservativeHold(): AdaptiveRecommendation {
  return {
    actionType: 'hold',
    deltaLoadPct: 0,
    deltaRep: 0,
    substitutionExerciseKey: null,
    movementTags: [],
    equipmentTags: [],
  };
}

export function evaluateRecommendationConfidence(
  input: RecommendationConfidenceInput,
): RecommendationConfidenceResult {
  const reasonCodes: string[] = [];
  if (!input.candidateRecommendation) {
    reasonCodes.push('invalid_recommendation');
  }

  const modelScore = toBoundedScore(input.modelConfidence);
  const contextScore = toBoundedScore(input.contextQuality);
  const confidenceScore = modelScore * 0.7 + contextScore * 0.3;
  const minimumConfidence = input.minimumConfidence ?? SAFE_CONFIDENCE_MINIMUM;

  if (modelScore < minimumConfidence) {
    reasonCodes.push('low_model_confidence');
  }

  if (contextScore < 0.5) {
    reasonCodes.push('low_context_quality');
  }

  const fallbackRequired = reasonCodes.length > 0 || confidenceScore < minimumConfidence;
  if (confidenceScore < minimumConfidence && !reasonCodes.includes('low_composite_confidence')) {
    reasonCodes.push('low_composite_confidence');
  }

  return {
    confidenceScore,
    fallbackRequired,
    reasonCodes,
  };
}

export function selectConservativeFallback(input: {
  lastAppliedRecommendation: AdaptiveRecommendation | null;
  athleteContext?: AthleteSafetyContext;
}): ConservativeFallbackResult {
  const athleteContext: AthleteSafetyContext = input.athleteContext ?? {
    limitations: [],
    painFlags: [],
  };

  if (input.lastAppliedRecommendation && isRecommendationWithinSafetyBounds(input.lastAppliedRecommendation)) {
    const revalidated = applyAdaptiveSafetyPolicy({
      recommendation: input.lastAppliedRecommendation,
      athleteContext,
    }).normalizedRecommendation;
    return {
      recommendation: revalidated,
      fallbackReasonCode: 'reuse_last_conservative',
    };
  }

  return {
    recommendation: buildConservativeHold(),
    fallbackReasonCode: 'conservative_hold',
  };
}
