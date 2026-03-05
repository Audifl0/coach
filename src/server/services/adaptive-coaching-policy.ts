import {
  evaluateRecommendationConfidence,
  selectConservativeFallback,
  type RecommendationConfidenceResult,
} from '@/lib/adaptive-coaching/confidence';
import {
  applyAdaptiveSafetyPolicy,
  type AdaptiveRecommendation,
  type AthleteSafetyContext,
} from '@/lib/adaptive-coaching/policy';

export type ResolveAdaptiveRecommendationPolicyInput = {
  candidateRecommendation: AdaptiveRecommendation | null;
  modelConfidence: number | null;
  contextQuality: number | null;
  lastAppliedRecommendation: AdaptiveRecommendation | null;
  athleteContext?: AthleteSafetyContext;
  minimumConfidence?: number;
};

export type ResolveAdaptiveRecommendationPolicyResult = {
  recommendation: AdaptiveRecommendation;
  usedFallback: boolean;
  fallbackReasonCode: 'reuse_last_conservative' | 'conservative_hold' | null;
  fallbackTriggerCodes: string[];
  confidence: RecommendationConfidenceResult;
  prudenceForecast: boolean;
};

export function resolveAdaptiveRecommendationPolicy(
  input: ResolveAdaptiveRecommendationPolicyInput,
): ResolveAdaptiveRecommendationPolicyResult {
  const athleteContext: AthleteSafetyContext = input.athleteContext ?? {
    limitations: [],
    painFlags: [],
  };

  const confidence = evaluateRecommendationConfidence({
    candidateRecommendation: input.candidateRecommendation,
    modelConfidence: input.modelConfidence,
    contextQuality: input.contextQuality,
    minimumConfidence: input.minimumConfidence,
  });

  if (!input.candidateRecommendation || confidence.fallbackRequired) {
    const fallback = selectConservativeFallback({
      lastAppliedRecommendation: input.lastAppliedRecommendation,
      athleteContext,
    });

    return {
      recommendation: fallback.recommendation,
      usedFallback: true,
      fallbackReasonCode: fallback.fallbackReasonCode,
      fallbackTriggerCodes: confidence.reasonCodes,
      confidence,
      prudenceForecast: true,
    };
  }

  const policyResult = applyAdaptiveSafetyPolicy({
    recommendation: input.candidateRecommendation,
    athleteContext,
  });
  const prudenceForecast = policyResult.warnings.limitationConflict;

  return {
    recommendation: policyResult.normalizedRecommendation,
    usedFallback: false,
    fallbackReasonCode: null,
    fallbackTriggerCodes: [],
    confidence,
    prudenceForecast,
  };
}
