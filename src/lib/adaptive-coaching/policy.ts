export const SAFE_PROGRESSION_BOUNDS = {
  deltaLoadPctMin: -0.05,
  deltaLoadPctMax: 0.05,
  deltaRepMin: -2,
  deltaRepMax: 2,
} as const;

export type AdaptiveActionType = 'progress' | 'hold' | 'deload' | 'substitution';

export type AdaptiveRecommendation = {
  actionType: AdaptiveActionType;
  deltaLoadPct: number;
  deltaRep: number;
  substitutionExerciseKey?: string | null;
  movementTags: string[];
  equipmentTags: string[];
};

export type AthleteSafetyContext = {
  limitations: Array<{
    zone: string;
    severity: 'none' | 'mild' | 'moderate' | 'severe';
  }>;
  painFlags: string[];
};

export type LimitationConflictWarning = {
  limitationConflict: boolean;
  reasonCodes: string[];
  conflictZones: string[];
};

export type ApplyAdaptiveSafetyPolicyInput = {
  recommendation: AdaptiveRecommendation;
  athleteContext: AthleteSafetyContext;
};

export type AdaptiveSafetyPolicyResult = {
  normalizedRecommendation: AdaptiveRecommendation;
  warnings: LimitationConflictWarning;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function detectLimitationConflict(input: {
  recommendation: AdaptiveRecommendation;
  athleteContext: AthleteSafetyContext;
}): LimitationConflictWarning {
  const _ = input;
  return {
    limitationConflict: false,
    reasonCodes: [],
    conflictZones: [],
  };
}

export function applyAdaptiveSafetyPolicy(input: ApplyAdaptiveSafetyPolicyInput): AdaptiveSafetyPolicyResult {
  const normalizedRecommendation: AdaptiveRecommendation = {
    ...input.recommendation,
    deltaLoadPct: clamp(
      input.recommendation.deltaLoadPct,
      SAFE_PROGRESSION_BOUNDS.deltaLoadPctMin,
      SAFE_PROGRESSION_BOUNDS.deltaLoadPctMax,
    ),
    deltaRep: clamp(
      input.recommendation.deltaRep,
      SAFE_PROGRESSION_BOUNDS.deltaRepMin,
      SAFE_PROGRESSION_BOUNDS.deltaRepMax,
    ),
  };

  return {
    normalizedRecommendation,
    warnings: detectLimitationConflict({
      recommendation: normalizedRecommendation,
      athleteContext: input.athleteContext,
    }),
  };
}
