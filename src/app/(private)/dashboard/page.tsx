import { redirect } from 'next/navigation';
import { TodayWorkoutCard } from './_components/today-workout-card';
import { SessionHistoryCard } from './_components/session-history-card';
import { createAdaptiveCoachingDal } from '@/server/dal/adaptive-coaching';
import { AdaptiveConfirmationBanner } from './components/adaptive-confirmation-banner';
import { AdaptiveForecastCard } from './components/adaptive-forecast-card';
import { TrendsSummaryCard } from './_components/trends-summary-card';
import { createProgramDal } from '@/server/dal/program';
import { createProgramDbClient } from '@/server/dal/program';
import { createProfileDal, createProfileDbClient } from '@/server/dal/profile';
import { resolveDashboardAccess } from './loaders/dashboard-access';
import { loadDashboardTodayWorkout } from './loaders/today-workout';
import { loadDashboardAdaptiveForecast } from './loaders/adaptive-forecast';
import { loadDashboardTrendsSummary } from './loaders/trends-summary';
export { resolveDashboardSectionOrder } from './page-helpers';

export default async function DashboardPage() {
  const { prisma } = await import('@/lib/db/prisma');
  const profileDal = createProfileDal(createProfileDbClient(prisma));
  const { session, route } = await resolveDashboardAccess({
    getProfileByUserId: async (userId) => profileDal.getProfileByUserId(userId),
  });

  if (route === 'login') {
    redirect('/login?next=/dashboard');
  }

  if (!session) {
    redirect('/login?next=/dashboard');
  }

  if (route === 'onboarding') {
    redirect('/onboarding');
  }

  const programDal = createProgramDal(createProgramDbClient(prisma), { userId: session.userId });
  const { programTodaySection, sessionSurface } = await loadDashboardTodayWorkout({ programDal });
  const adaptiveDal = createAdaptiveCoachingDal(prisma as never, { userId: session.userId });
  const { adaptiveForecast, pendingConfirmationRecommendation } = await loadDashboardAdaptiveForecast({
    adaptiveDal,
    topSessionId: sessionSurface.topSession?.id ?? null,
  });
  const { trendsSection, sectionOrder, drilldownExerciseKey } = await loadDashboardTrendsSummary({
    programDal,
    hasAdaptiveForecast: Boolean(adaptiveForecast),
    topSessionExerciseKey: sessionSurface.topSession?.exercises?.[0]?.exerciseKey ?? null,
  });

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
