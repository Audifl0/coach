import { loadDashboardTrendsSection } from '@/server/dashboard/program-dashboard';

import { resolveDashboardSectionOrder } from '../page-helpers';

export async function loadDashboardTrendsSummary(input: {
  programDal: {
    getTrendSummary: (input: { period: '30d' }) => Promise<unknown>;
  };
  hasAdaptiveForecast: boolean;
  topSessionExerciseKey: string | null;
}) {
  const trendsSection = await loadDashboardTrendsSection({
    getTrendSummary: async (args) => input.programDal.getTrendSummary(args),
  });

  const sectionOrder = resolveDashboardSectionOrder({
    hasAdaptiveForecast: input.hasAdaptiveForecast,
    hasTrends: trendsSection.status !== 'empty',
  });

  return {
    trendsSection,
    sectionOrder,
    drilldownExerciseKey: input.topSessionExerciseKey,
  };
}
