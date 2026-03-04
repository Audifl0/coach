import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { parseSubstitutionApplyInput } from '@/lib/program/contracts';
import { applyPlannedExerciseSubstitution, SubstitutionError } from '@/lib/program/substitution';
import type { MovementPattern } from '@/lib/program/types';
import { createProfileDal } from '@/server/dal/profile';
import { createProgramDal, type PlannedExerciseRecord } from '@/server/dal/program';

type PlannedExerciseOwnership = {
  plannedExerciseId: string;
  exerciseKey: string;
  scheduledDate: string;
};

type ProfileForSubstitution = {
  equipmentCategories: Array<'bodyweight' | 'dumbbells' | 'barbell' | 'bench' | 'machines' | 'bands'>;
  limitations: Array<{ zone: string; severity: 'none' | 'mild' | 'moderate' | 'severe' }>;
};

type SubstituteRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  getProfile: (userId: string) => Promise<ProfileForSubstitution | null>;
  getPlannedExerciseOwnership: (
    plannedExerciseId: string,
    userId?: string,
  ) => Promise<PlannedExerciseOwnership | null>;
  updatePlannedExercise: (
    input: {
      plannedExerciseId: string;
      replacementExerciseKey: string;
      replacementDisplayName: string;
      replacementMovementPattern: MovementPattern;
    },
    userId?: string,
  ) => Promise<PlannedExerciseRecord>;
  now?: () => Date;
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

export function createPlannedExerciseSubstitutePostHandler(deps: SubstituteRouteDeps) {
  return async function POST(request: Request, context: RouteContext): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { plannedExerciseId } = await context.params;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Invalid request payload' }, 400);
    }

    let parsedInput: { replacementExerciseKey: string };
    try {
      parsedInput = parseSubstitutionApplyInput(payload);
    } catch {
      return json({ error: 'Invalid replacement exercise key' }, 400);
    }

    const profile = await deps.getProfile(session.userId);
    if (!profile) {
      return json({ error: 'Profile is required before applying substitutions' }, 400);
    }

    try {
      const updated = await applyPlannedExerciseSubstitution({
        plannedExerciseId,
        replacementExerciseKey: parsedInput.replacementExerciseKey,
        now: deps.now ? deps.now() : new Date(),
        equipmentCategories: profile.equipmentCategories,
        limitations: profile.limitations,
        getPlannedExerciseOwnership: (id) => deps.getPlannedExerciseOwnership(id, session.userId),
        updatePlannedExercise: ({ plannedExerciseId: id, replacementExerciseKey, replacementDisplayName, replacementMovementPattern }) =>
          deps.updatePlannedExercise(
            {
              plannedExerciseId: id,
              replacementExerciseKey,
              replacementDisplayName,
              replacementMovementPattern,
            },
            session.userId,
          ),
      });

      return json({ plannedExercise: updated }, 200);
    } catch (error) {
      if (error instanceof SubstitutionError) {
        if (error.code === 'NOT_FOUND') {
          return json({ error: error.message }, 404);
        }

        return json({ error: error.message }, 400);
      }

      if (isAccountOwnershipError(error)) {
        return json({ error: 'Planned exercise not found' }, 404);
      }

      return json({ error: 'Unable to apply substitution' }, 500);
    }
  };
}

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

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createPlannedExerciseSubstitutePostHandler(deps)(request, context);
}
