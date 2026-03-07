import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { createProgramDal } from '@/server/dal/program';
import {
  createProgramTrendsGetHandler,
  type ProgramTrendsRouteDeps,
} from './route-handlers';

async function buildDefaultDeps(): Promise<ProgramTrendsRouteDeps> {
  const { prisma } = await import('@/lib/db/prisma');
  const repository = await buildDefaultSessionGateRepository();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    getTrendSummary: async (input, userId) => {
      if (!userId) {
        throw new Error('Unauthorized');
      }

      const dal = createProgramDal(prisma as never, { userId });
      return dal.getTrendSummary(input);
    },
  };
}

export async function GET(request: Request): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramTrendsGetHandler(deps)(request);
}
