import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { createProfileDal } from '@/server/dal/profile';
import { createProgramDal } from '@/server/dal/program';
import {
  createSubstitutionCandidatesGetHandler,
  type CandidateRouteDeps,
  type ProfileForSubstitution,
  type PlannedExerciseRouteContext,
} from '../route-handlers';

async function buildDefaultDeps(): Promise<CandidateRouteDeps> {
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
  };
}

export async function GET(request: Request, context: PlannedExerciseRouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createSubstitutionCandidatesGetHandler(deps)(request, context);
}
