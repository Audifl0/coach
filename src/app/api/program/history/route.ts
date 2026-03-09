import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { createProgramDal, createProgramDbClient } from '@/server/dal/program';
import { logRouteFailure } from '@/server/observability/app-logger';
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
      const dal = createProgramDal(createProgramDbClient(prisma), { userId });
      return dal.getHistoryList(range);
    },
  };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const deps = await buildDefaultDeps();
    return createProgramHistoryGetHandler(deps)(request);
  } catch (error) {
    logRouteFailure({
      route: '/api/program/history',
      method: 'GET',
      status: 500,
      source: 'route_module',
      error,
    });

    return Response.json({ error: 'Unable to load program history' }, { status: 500 });
  }
}
