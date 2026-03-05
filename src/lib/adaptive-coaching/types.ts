export const adaptiveRecommendationActionValues = ['progress', 'hold', 'deload', 'substitution'] as const;

export const adaptiveRecommendationStatusValues = [
  'proposed',
  'validated',
  'pending_confirmation',
  'applied',
  'rejected',
  'fallback_applied',
] as const;

export const adaptiveConfidenceLabelValues = ['low', 'medium', 'high'] as const;

export const adaptiveConfirmationDecisionValues = ['accept', 'reject'] as const;

export type AdaptiveRecommendationAction = (typeof adaptiveRecommendationActionValues)[number];
export type AdaptiveRecommendationStatus = (typeof adaptiveRecommendationStatusValues)[number];
export type AdaptiveConfidenceLabel = (typeof adaptiveConfidenceLabelValues)[number];
export type AdaptiveConfirmationDecision = (typeof adaptiveConfirmationDecisionValues)[number];
