import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { getSubstitutionCandidates } from '@/lib/program/substitution';
import { createProfileDal } from '@/server/dal/profile';
import { createProgramDal } from '@/server/dal/program';

type PlannedExerciseOwnership = {
  plannedExerciseId: string;
  exerciseKey: string;
  scheduledDate: string;
};

type ProfileForSubstitution = {
  equipmentCategories: Array<'bodyweight' | 'dumbbells' | 'barbell' | 'bench' | 'machines' | 'bands'>;
  limitations: Array<{ zone: string; severity: 'none' | 'mild' | 'moderate' | 'severe' }>;
};

type CandidateRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  getProfile: (userId: string) => Promise<ProfileForSubstitution | null>;
  getPlannedExerciseOwnership: (
    plannedExerciseId: string,
    userId?: string,
  ) => Promise<PlannedExerciseOwnership | null>;
};

type RouteContext = {
  params: { plannedExerciseId: string } | Promise<{ plannedExerciseId: string }>;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function isAccountOwnershipError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Mismatched account context');
}

export function createSubstitutionCandidatesGetHandler(deps: CandidateRouteDeps) {
  return async function GET(_request: Request, context: RouteContext): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { plannedExerciseId } = await context.params;

    let ownership: PlannedExerciseOwnership | null = null;
    try {
      ownership = await deps.getPlannedExerciseOwnership(plannedExerciseId, session.userId);
    } catch (error) {
      if (isAccountOwnershipError(error)) {
        return json({ error: 'Planned exercise not found' }, 404);
      }

      return json({ error: 'Unable to load substitutions' }, 500);
    }

    if (!ownership) {
      return json({ error: 'Planned exercise not found' }, 404);
    }

    const profile = await deps.getProfile(session.userId);
    if (!profile) {
      return json({ error: 'Profile is required before requesting substitutions' }, 400);
    }

    const candidates = getSubstitutionCandidates({
      plannedExerciseKey: ownership.exerciseKey,
      equipmentCategories: profile.equipmentCategories,
      limitations: profile.limitations,
      limit: 3,
    });

    return json({ candidates }, 200);
  };
}

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

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createSubstitutionCandidatesGetHandler(deps)(request, context);
}
