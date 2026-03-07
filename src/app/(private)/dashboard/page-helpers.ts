import type {
  ProgramTodayResponse,
  ProgramTodaySessionCandidates,
  ProgramTrendsSummaryResponse,
} from '@/lib/program/contracts';
import { selectTodayWorkoutProjection } from '@/lib/program/select-today-session';
import { type SessionGateRepository, validateSessionToken } from '@/lib/auth/session-gate';
import { isProfileComplete } from '@/lib/profile/completeness';
import { parseProgramTrendsSummaryResponse } from '@/lib/program/contracts';
import {
  buildAdaptiveForecastViewModel,
  type AdaptiveForecastViewModel,
} from '@/lib/adaptive-coaching/forecast';
import type { AdaptiveRecommendationRecord } from '@/server/dal/adaptive-coaching';

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

export async function loadProgramTodayData(input: {
  getTodayOrNextSessionCandidates: () => Promise<ProgramTodaySessionCandidates>;
}): Promise<ProgramTodayResponse | null> {
  try {
    return selectTodayWorkoutProjection(await input.getTodayOrNextSessionCandidates());
  } catch {
    return null;
  }
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
} | {
  getTrendSummary: (input: { period: '30d' }) => Promise<unknown>;
}): Promise<ProgramTrendsSummaryResponse | null> {
  if ('getTrendSummary' in input) {
    try {
      return parseProgramTrendsSummaryResponse(await input.getTrendSummary({ period: '30d' }));
    } catch {
      return null;
    }
  }

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
