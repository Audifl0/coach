import type { ProfileCompletenessInput } from '@/lib/profile/completeness';
import {
  buildDefaultSessionGateRepository,
  validateSessionFromCookies,
} from '@/lib/auth/session-gate';

import { resolveDashboardRoute } from '../page-helpers';

export async function resolveDashboardAccess(input: {
  getProfileByUserId: (userId: string) => Promise<ProfileCompletenessInput | null>;
}): Promise<{ session: { userId: string } | null; route: 'login' | 'onboarding' | 'dashboard' }> {
  const repository = await buildDefaultSessionGateRepository();
  const session = await validateSessionFromCookies(repository);
  const route = await resolveDashboardRoute(session, input.getProfileByUserId);

  return {
    session,
    route,
  };
}
