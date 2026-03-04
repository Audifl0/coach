import { redirect } from 'next/navigation';

import {
  buildDefaultSessionGateRepository,
  type SessionGateRepository,
  validateSessionFromCookies,
  validateSessionToken,
} from '@/lib/auth/session-gate';
import { isProfileComplete } from '@/lib/profile/completeness';
import { prisma } from '@/lib/db/prisma';

export async function resolveDashboardSession(
  sessionToken: string | null | undefined,
  repository: SessionGateRepository,
) {
  return validateSessionToken(sessionToken, repository);
}

export default async function DashboardPage() {
  const repository = await buildDefaultSessionGateRepository();
  const session = await validateSessionFromCookies(repository);

  if (!session) {
    redirect('/login?next=/dashboard');
  }

  const profile = await prisma.athleteProfile.findUnique({
    where: { userId: session.userId },
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
  });

  if (!isProfileComplete(profile as never)) {
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
