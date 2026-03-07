import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { createProgramDal } from '@/server/dal/program';
import {
  createProgramHistoryGetHandler,
  type ProgramHistoryRouteDeps,
} from './route-handlers';

async function buildDefaultDeps(): Promise<ProgramHistoryRouteDeps> {
  const { prisma } = await import('@/lib/db/prisma');
  const repository = await buildDefaultSessionGateRepository();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    getHistoryList: async (range, userId) => {
      if (!userId) {
        throw new Error('Unauthorized');
      }

      const dal = createProgramDal(prisma as never, { userId });
      return dal.getHistoryList(range);
    },
  };
}

export async function GET(request: Request): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramHistoryGetHandler(deps)(request);
}
