import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { createProfileDal } from '@/server/dal/profile';
import { createProgramDal } from '@/server/dal/program';
import {
  createPlannedExerciseSubstitutePostHandler,
  type ProfileForSubstitution,
  type PlannedExerciseRouteContext,
  type SubstituteRouteDeps,
} from '../route-handlers';

async function buildDefaultDeps(): Promise<SubstituteRouteDeps> {
  const { prisma } = await import('@/lib/db/prisma');
  const profileDal = createProfileDal(prisma as never);
  const sessionRepository = await buildDefaultSessionGateRepository();

  return {
    resolveSession: () => validateSessionFromCookies(sessionRepository),
    getProfile: (userId) => profileDal.getProfileByUserId(userId) as Promise<ProfileForSubstitution | null>,
    getPlannedExerciseOwnership: (plannedExerciseId, userId) => {
      if (!userId) {
        return Promise.resolve(null);
      }

      const programDal = createProgramDal(prisma as never, { userId });
      return programDal.getPlannedExerciseOwnership(plannedExerciseId);
    },
    updatePlannedExercise: (input, userId) => {
      if (!userId) {
        throw new Error('Unauthorized');
      }

      const programDal = createProgramDal(prisma as never, { userId });
      return programDal.applyPlannedExerciseSubstitution(input.plannedExerciseId, {
        replacementExerciseKey: input.replacementExerciseKey,
        replacementDisplayName: input.replacementDisplayName,
        replacementMovementPattern: input.replacementMovementPattern,
      });
    },
  };
}

export async function POST(request: Request, context: PlannedExerciseRouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createPlannedExerciseSubstitutePostHandler(deps)(request, context);
}
