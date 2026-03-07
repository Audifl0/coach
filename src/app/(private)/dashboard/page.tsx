import { redirect } from 'next/navigation';
import {
  buildDefaultSessionGateRepository,
  validateSessionFromCookies,
} from '@/lib/auth/session-gate';
import { TodayWorkoutCard } from './_components/today-workout-card';
import { SessionHistoryCard } from './_components/session-history-card';
import { createAdaptiveCoachingDal, type AdaptiveRecommendationRecord } from '@/server/dal/adaptive-coaching';
import { AdaptiveConfirmationBanner } from './components/adaptive-confirmation-banner';
import { AdaptiveForecastCard } from './components/adaptive-forecast-card';
import { TrendsSummaryCard } from './_components/trends-summary-card';
import { createProgramDal } from '@/server/dal/program';
import {
  loadDashboardProgramTodaySection,
  loadDashboardTrendsSection,
} from '@/server/dashboard/program-dashboard';
import {
  pickDashboardSession,
  resolveAdaptiveForecastCard,
  resolveDashboardRoute,
  resolveDashboardSectionOrder,
} from './page-helpers';

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
export default async function DashboardPage() {
  const { prisma } = await import('@/lib/db/prisma');
  const repository = await buildDefaultSessionGateRepository();
  const session = await validateSessionFromCookies(repository);
  const route = await resolveDashboardRoute(
    session,
    async (userId) =>
      prisma.athleteProfile.findUnique({
        where: { userId },
        select: {
          userId: true,
          goal: true,
          weeklySessionTarget: true,
          sessionDuration: true,
          equipmentCategories: true,
          limitationsDeclared: true,
          limitations: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
  );

  if (route === 'login') {
    redirect('/login?next=/dashboard');
  }

  if (!session) {
    redirect('/login?next=/dashboard');
  }

  if (route === 'onboarding') {
    redirect('/onboarding');
  }

  const programDal = createProgramDal(prisma as never, { userId: session.userId });
  const programTodaySection = await loadDashboardProgramTodaySection({
    getTodayOrNextSessionCandidates: async () => programDal.getTodayOrNextSessionCandidates(),
  });
  const sessionSurface = pickDashboardSession(programTodaySection.status === 'error' ? null : programTodaySection.data);
  const adaptiveDal = createAdaptiveCoachingDal(prisma as never, { userId: session.userId });
  const latestRecommendation = sessionSurface.topSession
    ? await adaptiveDal.listLatestAdaptiveRecommendation(sessionSurface.topSession.id)
    : null;
  const adaptiveForecast = resolveAdaptiveForecastCard(latestRecommendation);
  const pendingConfirmationRecommendation = latestRecommendation
    ? toPendingConfirmationBannerData(latestRecommendation)
    : null;
  const trendsSection = await loadDashboardTrendsSection({
    getTrendSummary: async (input) => programDal.getTrendSummary(input),
  });
  const sectionOrder = resolveDashboardSectionOrder({
    hasAdaptiveForecast: Boolean(adaptiveForecast),
    hasTrends: trendsSection.status !== 'empty',
  });
  const drilldownExerciseKey = sessionSurface.topSession?.exercises?.[0]?.exerciseKey ?? null;

  return (
    <main>
      <h1>Dashboard</h1>
      {pendingConfirmationRecommendation ? (
        <AdaptiveConfirmationBanner recommendation={pendingConfirmationRecommendation} />
      ) : null}
      {programTodaySection.status === 'error' ? (
        <TodayWorkoutCard loadState="error" />
      ) : (
        <TodayWorkoutCard
          loadState={programTodaySection.status}
          data={{
            todaySession: sessionSurface.mode === 'today' ? sessionSurface.topSession : null,
            nextSession: sessionSurface.mode === 'next' ? sessionSurface.topSession : null,
            primaryAction: sessionSurface.primaryAction,
          }}
        />
      )}
      {sectionOrder.includes('adaptive-forecast') && adaptiveForecast ? <AdaptiveForecastCard forecast={adaptiveForecast} /> : null}
      {sectionOrder.includes('trends-summary')
        ? (trendsSection.status === 'error'
          ? <TrendsSummaryCard loadState="error" />
          : (trendsSection.status === 'ready'
            ? <TrendsSummaryCard initialData={trendsSection.data} drilldownExerciseKey={drilldownExerciseKey} />
            : null))
        : null}
      {sectionOrder.includes('session-history') ? <SessionHistoryCard /> : null}
      <p>You are authenticated on this device.</p>
      <form action="/api/auth/logout" method="post">
        <button type="submit">Logout current device</button>
      </form>
    </main>
  );
}
