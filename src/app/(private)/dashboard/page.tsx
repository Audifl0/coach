import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import type { ComponentProps } from 'react';

import { parseProgramTodayResponse, type ProgramTodayResponse } from '@/lib/program/contracts';
import {
  buildDefaultSessionGateRepository,
  type SessionGateRepository,
  validateSessionFromCookies,
  validateSessionToken,
} from '@/lib/auth/session-gate';
import { isProfileComplete } from '@/lib/profile/completeness';
import { TodayWorkoutCard } from './_components/today-workout-card';
import { SessionHistoryCard } from './_components/session-history-card';
import { createAdaptiveCoachingDal, type AdaptiveRecommendationRecord } from '@/server/dal/adaptive-coaching';
import { AdaptiveConfirmationBanner } from './components/adaptive-confirmation-banner';
import { AdaptiveForecastCard } from './components/adaptive-forecast-card';
import {
  buildAdaptiveForecastViewModel,
  type AdaptiveForecastViewModel,
} from '@/lib/adaptive-coaching/forecast';
import { parseProgramTrendsSummaryResponse, type ProgramTrendsSummaryResponse } from '@/lib/program/contracts';
import { TrendsSummaryCard } from './_components/trends-summary-card';

export async function resolveDashboardSession(
  sessionToken: string | null | undefined,
  repository: SessionGateRepository,
) {
  return validateSessionToken(sessionToken, repository);
}

export async function resolveDashboardRoute(
  session: { userId: string } | null,
  findProfileByUserId: (userId: string) => Promise<unknown | null>,
): Promise<'login' | 'onboarding' | 'dashboard'> {
  if (!session) {
    return 'login';
  }

  const profile = await findProfileByUserId(session.userId);
  if (!isProfileComplete(profile)) {
    return 'onboarding';
  }

  return 'dashboard';
}

export function pickDashboardSession(data: ProgramTodayResponse | null) {
  const todaySession = data?.todaySession ?? null;
  const nextSession = data?.nextSession ?? null;

  return {
    topSession: todaySession ?? nextSession,
    mode: todaySession ? 'today' : (nextSession ? 'next' : 'none'),
    primaryAction: data?.primaryAction ?? 'start_workout',
  };
}

type DashboardAdaptiveForecastSource = Pick<
  AdaptiveRecommendationRecord,
  | 'actionType'
  | 'status'
  | 'warningFlag'
  | 'warningText'
  | 'fallbackApplied'
  | 'fallbackReason'
  | 'reasons'
  | 'evidenceTags'
  | 'forecastPayload'
  | 'progressionDeltaLoadPct'
  | 'progressionDeltaReps'
>;
type PendingAdaptiveRecommendation = ComponentProps<typeof AdaptiveConfirmationBanner>['recommendation'];

export function resolveAdaptiveForecastCard(
  recommendation: DashboardAdaptiveForecastSource | null,
): AdaptiveForecastViewModel | null {
  if (!recommendation) {
    return null;
  }

  return buildAdaptiveForecastViewModel({
    actionType: recommendation.actionType,
    status: recommendation.status,
    warningFlag: recommendation.warningFlag,
    warningText: recommendation.warningText,
    fallbackApplied: recommendation.fallbackApplied,
    fallbackReason: recommendation.fallbackReason,
    reasons: recommendation.reasons,
    evidenceTags: recommendation.evidenceTags,
    forecastPayload: recommendation.forecastPayload,
    progressionDeltaLoadPct: recommendation.progressionDeltaLoadPct,
    progressionDeltaReps: recommendation.progressionDeltaReps,
  });
}

function toPendingConfirmationBannerData(
  record: Pick<AdaptiveRecommendationRecord, 'id' | 'actionType' | 'status' | 'reasons' | 'expiresAt'>,
): PendingAdaptiveRecommendation | null {
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

function buildRequestOrigin(headersStore: Headers): string | null {
  const host = headersStore.get('x-forwarded-host') ?? headersStore.get('host');
  if (!host) {
    return null;
  }

  const protocol = headersStore.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

async function loadProgramTodayData(): Promise<ProgramTodayResponse | null> {
  const headersStore = await headers();
  const origin = buildRequestOrigin(headersStore);
  if (!origin) {
    return null;
  }

  const cookieStore = await cookies();
  const response = await fetch(`${origin}/api/program/today`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      cookie: cookieStore.toString(),
    },
  });

  if (!response.ok) {
    return null;
  }

  return parseProgramTodayResponse(await response.json());
}

export function buildDashboardTrendsRequest(input: {
  origin: string;
  cookieHeader: string;
}): {
  url: string;
  init: RequestInit & { headers: { cookie: string } };
} {
  return {
    url: `${input.origin}/api/program/trends?period=30d`,
    init: {
      method: 'GET',
      cache: 'no-store',
      headers: {
        cookie: input.cookieHeader,
      },
    },
  };
}

export async function loadProgramTrendsData(input: {
  origin: string;
  cookieHeader: string;
  fetchImpl?: typeof fetch;
}): Promise<ProgramTrendsSummaryResponse | null> {
  const request = buildDashboardTrendsRequest({ origin: input.origin, cookieHeader: input.cookieHeader });
  const executeFetch = input.fetchImpl ?? fetch;
  const response = await executeFetch(request.url, request.init);
  if (!response.ok) {
    return null;
  }

  return parseProgramTrendsSummaryResponse(await response.json());
}

export function resolveDashboardSectionOrder(input: {
  hasAdaptiveForecast: boolean;
  hasTrends: boolean;
}): string[] {
  const sections = ['today-workout'];
  if (input.hasAdaptiveForecast) {
    sections.push('adaptive-forecast');
  }
  if (input.hasTrends) {
    sections.push('trends-summary');
  }
  sections.push('session-history');
  return sections;
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

  const programToday = await loadProgramTodayData();
  const sessionSurface = pickDashboardSession(programToday);
  const adaptiveDal = createAdaptiveCoachingDal(prisma as never, { userId: session.userId });
  const latestRecommendation = sessionSurface.topSession
    ? await adaptiveDal.listLatestAdaptiveRecommendation(sessionSurface.topSession.id)
    : null;
  const adaptiveForecast = resolveAdaptiveForecastCard(latestRecommendation);
  const pendingConfirmationRecommendation = latestRecommendation
    ? toPendingConfirmationBannerData(latestRecommendation)
    : null;
  const headersStore = await headers();
  const origin = buildRequestOrigin(headersStore);
  const cookieStore = await cookies();
  const trends = origin ? await loadProgramTrendsData({ origin, cookieHeader: cookieStore.toString() }) : null;
  const sectionOrder = resolveDashboardSectionOrder({
    hasAdaptiveForecast: Boolean(adaptiveForecast),
    hasTrends: Boolean(trends),
  });
  const drilldownExerciseKey = sessionSurface.topSession?.exercises?.[0]?.exerciseKey ?? null;

  return (
    <main>
      <h1>Dashboard</h1>
      {pendingConfirmationRecommendation ? (
        <AdaptiveConfirmationBanner recommendation={pendingConfirmationRecommendation} />
      ) : null}
      <TodayWorkoutCard
        data={{
          todaySession: sessionSurface.mode === 'today' ? sessionSurface.topSession : null,
          nextSession: sessionSurface.mode === 'next' ? sessionSurface.topSession : null,
          primaryAction: sessionSurface.primaryAction,
        }}
      />
      {sectionOrder.includes('adaptive-forecast') && adaptiveForecast ? <AdaptiveForecastCard forecast={adaptiveForecast} /> : null}
      {sectionOrder.includes('trends-summary') && trends ? (
        <TrendsSummaryCard initialData={trends} drilldownExerciseKey={drilldownExerciseKey} />
      ) : null}
      {sectionOrder.includes('session-history') ? <SessionHistoryCard /> : null}
      <p>You are authenticated on this device.</p>
      <form action="/api/auth/logout" method="post">
        <button type="submit">Logout current device</button>
      </form>
    </main>
  );
}
