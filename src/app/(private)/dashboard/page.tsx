import { redirect } from 'next/navigation';

import {
  buildDefaultSessionGateRepository,
  type SessionGateRepository,
  validateSessionFromCookies,
  validateSessionToken,
} from '@/lib/auth/session-gate';
import { isProfileComplete } from '@/lib/profile/completeness';

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

  return (
    <main>
      <h1>Dashboard</h1>
      <p>You are authenticated on this device.</p>
      <form action="/api/auth/logout" method="post">
        <button type="submit">Logout current device</button>
      </form>
    </main>
  );
}
