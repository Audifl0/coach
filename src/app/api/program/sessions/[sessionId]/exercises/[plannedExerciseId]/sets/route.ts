import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { createProgramDal } from '@/server/dal/program';
import { createSessionLoggingService } from '@/server/services/session-logging';
import {
  createProgramSessionExerciseSetsPatchHandler,
  createProgramSessionExerciseSetsPostHandler,
  type ProgramSessionExerciseSetsRouteDeps,
  type SessionExerciseRouteContext,
} from '../../../route-handlers';

async function buildDefaultDeps(): Promise<ProgramSessionExerciseSetsRouteDeps> {
  const { prisma } = await import('@/lib/db/prisma');
  const repository = await buildDefaultSessionGateRepository();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    getExerciseOwnership: (plannedExerciseId, userId) => {
      if (!userId) {
        return Promise.resolve(null);
      }

      const dal = createProgramDal(prisma as never, { userId });
      return dal.getPlannedExerciseOwnership(plannedExerciseId);
    },
    logSet: async (input, userId) => {
      if (!userId) {
        throw new Error('Unauthorized');
      }

      const dal = createProgramDal(prisma as never, { userId });
      const service = createSessionLoggingService({ programDal: dal });
      await service.logSet(input);

      return {
        plannedExerciseId: input.plannedExerciseId,
        setIndex: input.setIndex,
        weight: input.weight,
        reps: input.reps,
        rpe: input.rpe ?? null,
      };
    },
  };
}

export async function POST(request: Request, context: SessionExerciseRouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramSessionExerciseSetsPostHandler(deps)(request, context);
}

export async function PATCH(request: Request, context: SessionExerciseRouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramSessionExerciseSetsPatchHandler(deps)(request, context);
}
