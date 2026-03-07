import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { createProgramDal } from '@/server/dal/program';
import {
  createProgramTrendsExerciseGetHandler,
  type ExerciseTrendRouteContext,
  type ProgramTrendsExerciseRouteDeps,
} from './route-handlers';

async function buildDefaultDeps(): Promise<ProgramTrendsExerciseRouteDeps> {
  const { prisma } = await import('@/lib/db/prisma');
  const repository = await buildDefaultSessionGateRepository();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    getExerciseTrendSeries: async (input, userId) => {
      if (!userId) {
        throw new Error('Unauthorized');
      }

      const dal = createProgramDal(prisma as never, { userId });
      return dal.getExerciseTrendSeries(input);
    },
  };
}

export async function GET(request: Request, context: ExerciseTrendRouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramTrendsExerciseGetHandler(deps)(request, context);
}
