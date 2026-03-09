import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { createProfileDal, createProfileDbClient } from '@/server/dal/profile';
import { createProgramDal, createProgramDbClient } from '@/server/dal/program';
import {
  createPlannedExerciseSubstitutePostHandler,
  type ProfileForSubstitution,
  type PlannedExerciseRouteContext,
  type SubstituteRouteDeps,
} from '../route-handlers';

async function buildDefaultDeps(): Promise<SubstituteRouteDeps> {
  const { prisma } = await import('@/lib/db/prisma');
  const profileDal = createProfileDal(createProfileDbClient(prisma));
  const sessionRepository = await buildDefaultSessionGateRepository();

  return {
    resolveSession: () => validateSessionFromCookies(sessionRepository),
    getProfile: (userId) => profileDal.getProfileByUserId(userId),
    getPlannedExerciseOwnership: (plannedExerciseId, userId) => {
      const programDal = createProgramDal(createProgramDbClient(prisma), { userId });
      return programDal.getPlannedExerciseOwnership(plannedExerciseId);
    },
    updatePlannedExercise: (input, userId) => {
      const programDal = createProgramDal(createProgramDbClient(prisma), { userId });
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
