import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { createProgramDal } from '@/server/dal/program';
import {
  createProgramTodayGetHandler,
  type ProgramTodayRouteDeps,
} from './route-handlers';

async function buildDefaultDeps(): Promise<ProgramTodayRouteDeps> {
  const { prisma } = await import('@/lib/db/prisma');
  const repository = await buildDefaultSessionGateRepository();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    getTodayOrNextSessionCandidates: async (userId: string) => {
      const programDal = createProgramDal(prisma as never, { userId });
      return programDal.getTodayOrNextSessionCandidates();
    },
  };
}

export async function GET(): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramTodayGetHandler(deps)();
}
