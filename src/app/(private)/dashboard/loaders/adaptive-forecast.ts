import type { AdaptiveRecommendationRecord } from '@/server/dal/adaptive-coaching';

import { resolveAdaptiveForecastCard } from '../page-helpers';

function toPendingConfirmationBannerData(
  record: Pick<AdaptiveRecommendationRecord, 'id' | 'actionType' | 'status' | 'reasons' | 'expiresAt'>,
) {
  if (record.status !== 'pending_confirmation') {
    return null;
  }

  if (record.actionType !== 'deload' && record.actionType !== 'substitution') {
    return null;
  }

  if (!record.expiresAt) {
    return null;
  }

  const reasons = Array.isArray(record.reasons) ? record.reasons.filter((item): item is string => typeof item === 'string') : [];
  if (reasons.length < 1) {
    return null;
  }

  return {
    id: record.id,
    actionType: record.actionType,
    reasons,
    expiresAt: record.expiresAt.toISOString(),
  };
}

export async function loadDashboardAdaptiveForecast(input: {
  adaptiveDal: {
    listLatestAdaptiveRecommendation: (
      plannedSessionId: string,
    ) => Promise<AdaptiveRecommendationRecord | null>;
  };
  topSessionId: string | null;
}) {
  const latestRecommendation = input.topSessionId
    ? await input.adaptiveDal.listLatestAdaptiveRecommendation(input.topSessionId)
    : null;

  const adaptiveForecast = resolveAdaptiveForecastCard(latestRecommendation);
  const pendingConfirmationRecommendation = latestRecommendation
    ? toPendingConfirmationBannerData(latestRecommendation)
    : null;

  return {
    adaptiveForecast,
    pendingConfirmationRecommendation,
  };
}
