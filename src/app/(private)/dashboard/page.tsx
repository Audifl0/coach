import { redirect } from 'next/navigation';

import {
  buildDefaultSessionGateRepository,
  type SessionGateRepository,
  validateSessionFromCookies,
  validateSessionToken,
} from '@/lib/auth/session-gate';

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
