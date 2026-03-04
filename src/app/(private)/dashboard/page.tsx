import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';

import { parseProgramTodayResponse, type ProgramTodayResponse } from '@/lib/program/contracts';
import {
  buildDefaultSessionGateRepository,
  type SessionGateRepository,
  validateSessionFromCookies,
  validateSessionToken,
} from '@/lib/auth/session-gate';
import { isProfileComplete } from '@/lib/profile/completeness';
import { TodayWorkoutCard } from './_components/today-workout-card';

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
  if (!isProfileComplete(profile as never)) {
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

  if (route === 'onboarding') {
    redirect('/onboarding');
  }

  const programToday = await loadProgramTodayData();
  const sessionSurface = pickDashboardSession(programToday);

  return (
    <main>
      <h1>Dashboard</h1>
      <TodayWorkoutCard
        data={{
          todaySession: sessionSurface.mode === 'today' ? sessionSurface.topSession : null,
          nextSession: sessionSurface.mode === 'next' ? sessionSurface.topSession : null,
          primaryAction: sessionSurface.primaryAction,
        }}
      />
      <p>You are authenticated on this device.</p>
      <form action="/api/auth/logout" method="post">
        <button type="submit">Logout current device</button>
      </form>
    </main>
  );
}
