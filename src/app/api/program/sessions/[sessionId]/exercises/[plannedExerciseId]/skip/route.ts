import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { createProgramDal } from '@/server/dal/program';
import { createSessionLoggingService } from '@/server/services/session-logging';
import {
  createProgramSessionExerciseSkipDeleteHandler,
  createProgramSessionExerciseSkipPostHandler,
  type ProgramSessionExerciseSkipRouteDeps,
  type SessionExerciseRouteContext,
} from '../../../route-handlers';

async function buildDefaultDeps(): Promise<ProgramSessionExerciseSkipRouteDeps> {
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
    skipExercise: async (input, userId) => {
      if (!userId) {
        throw new Error('Unauthorized');
      }

      const dal = createProgramDal(prisma as never, { userId });
      const service = createSessionLoggingService({ programDal: dal });
      await service.skipExercise(input);
    },
    revertSkippedExercise: async ({ plannedExerciseId }, userId) => {
      if (!userId) {
        throw new Error('Unauthorized');
      }

      const dal = createProgramDal(prisma as never, { userId });
      const service = createSessionLoggingService({ programDal: dal });
      await service.revertSkippedExercise(plannedExerciseId);
    },
  };
}

export async function POST(request: Request, context: SessionExerciseRouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramSessionExerciseSkipPostHandler(deps)(request, context);
}

export async function DELETE(request: Request, context: SessionExerciseRouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramSessionExerciseSkipDeleteHandler(deps)(request, context);
}
