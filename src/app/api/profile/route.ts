import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { createProfileDal } from '@/server/dal/profile';
import {
  createProfileGetHandler,
  createProfilePutHandler,
  type ProfileRouteDeps,
} from './route-handlers';

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
