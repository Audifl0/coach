import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { createProgramDal, createProgramDbClient } from '@/server/dal/program';
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
      const dal = createProgramDal(createProgramDbClient(prisma), { userId });
      return dal.getPlannedExerciseOwnership(plannedExerciseId);
    },
    logSet: async (input, userId) => {
      const dal = createProgramDal(createProgramDbClient(prisma), { userId });
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
