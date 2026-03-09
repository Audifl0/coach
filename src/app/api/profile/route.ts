import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { createProfileDal, createProfileDbClient } from '@/server/dal/profile';
import {
  createProfileGetHandler,
  createProfilePutHandler,
  type ProfileRouteDeps,
} from './route-handlers';

async function buildDefaultDeps(): Promise<ProfileRouteDeps> {
  const { prisma } = await import('@/lib/db/prisma');
  const dal = createProfileDal(createProfileDbClient(prisma));
  const repository = await buildDefaultSessionGateRepository();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    getProfile: (userId) => dal.getProfileByUserId(userId),
    upsertProfile: (userId, input) => dal.upsertProfile(userId, input),
    patchProfile: (userId, patch) => dal.patchProfile(userId, patch),
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
