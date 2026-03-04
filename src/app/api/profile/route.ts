import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { validateProfileInput, validateProfilePatch } from '@/lib/profile/contracts';
import { isProfileComplete } from '@/lib/profile/completeness';
import { createProfileDal } from '@/server/dal/profile';

export type ProfileRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  getProfile: (userId: string) => Promise<unknown | null>;
  upsertProfile: (userId: string, input: unknown) => Promise<unknown>;
  patchProfile: (userId: string, patch: unknown) => Promise<unknown>;
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
        complete: isProfileComplete(profile as never),
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
        return json({ profile: updated, complete: isProfileComplete(updated as never) }, 200);
      }

      const input = validateProfileInput(payload);
      const saved = await deps.upsertProfile(session.userId, input);
      return json({ profile: saved, complete: isProfileComplete(saved as never) }, 200);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid profile payload' }, 400);
    }
  };
}

async function buildDefaultDeps(): Promise<ProfileRouteDeps> {
  const { prisma } = await import('@/lib/db/prisma');
  const dal = createProfileDal(prisma as never);
  const repository = await buildDefaultSessionGateRepository();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    getProfile: (userId) => dal.getProfileByUserId(userId),
    upsertProfile: (userId, input) => dal.upsertProfile(userId, input as never),
    patchProfile: (userId, patch) => dal.patchProfile(userId, patch as never),
  };
}

export async function GET(): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProfileGetHandler(deps)();
}

export async function PUT(request: Request): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProfilePutHandler(deps)(request);
}
