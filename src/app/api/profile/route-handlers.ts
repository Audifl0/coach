import { validateProfileInput, validateProfilePatch } from '@/lib/profile/contracts';
import { isProfileComplete } from '@/lib/profile/completeness';
import type { ProfileInput, ProfilePatchInput } from '@/lib/profile/contracts';
import type { AthleteProfileRecord } from '@/server/dal/profile';

export type ProfileRouteProfile = Pick<
  AthleteProfileRecord,
  | 'goal'
  | 'weeklySessionTarget'
  | 'sessionDuration'
  | 'equipmentCategories'
  | 'limitationsDeclared'
  | 'limitations'
>;

export type ProfileRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  getProfile: (userId: string) => Promise<ProfileRouteProfile | null>;
  upsertProfile: (userId: string, input: ProfileInput) => Promise<ProfileRouteProfile>;
  patchProfile: (userId: string, patch: ProfilePatchInput) => Promise<ProfileRouteProfile>;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

export function createProfileGetHandler(deps: ProfileRouteDeps) {
  return async function GET(): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const profile = await deps.getProfile(session.userId);

    return json(
      {
        profile,
        complete: isProfileComplete(profile),
      },
      200,
    );
  };
}

export function createProfilePutHandler(deps: ProfileRouteDeps) {
  return async function PUT(request: Request): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Invalid request payload' }, 400);
    }

    const mode = typeof payload === 'object' && payload !== null && 'mode' in payload
      ? (payload as { mode?: string }).mode
      : 'onboarding';

    try {
      if (mode === 'edit') {
        const patch = validateProfilePatch(payload);
        const updated = await deps.patchProfile(session.userId, patch);
        return json({ profile: updated, complete: isProfileComplete(updated) }, 200);
      }

      const input = validateProfileInput(payload);
      const saved = await deps.upsertProfile(session.userId, input);
      return json({ profile: saved, complete: isProfileComplete(saved) }, 200);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid profile payload' }, 400);
    }
  };
}
