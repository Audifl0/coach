import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { createProfileDal, createProfileDbClient } from '@/server/dal/profile';
import { createProgramDal, createProgramDbClient } from '@/server/dal/program';
import {
  createSubstitutionCandidatesGetHandler,
  type CandidateRouteDeps,
  type ProfileForSubstitution,
  type PlannedExerciseRouteContext,
} from '../route-handlers';

async function buildDefaultDeps(): Promise<CandidateRouteDeps> {
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
  };
}

export async function GET(request: Request, context: PlannedExerciseRouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createSubstitutionCandidatesGetHandler(deps)(request, context);
}
