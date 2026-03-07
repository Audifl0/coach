import { getSubstitutionCandidates } from '@/lib/program/substitution';
import { parseSubstitutionApplyInput } from '@/lib/program/contracts';
import { applyPlannedExerciseSubstitution, SubstitutionError } from '@/lib/program/substitution';
import type { MovementPattern } from '@/lib/program/types';
import type { PlannedExerciseRecord } from '@/server/dal/program';

type PlannedExerciseOwnership = {
  plannedExerciseId: string;
  exerciseKey: string;
  scheduledDate: string;
};

export type ProfileForSubstitution = {
  equipmentCategories: Array<'bodyweight' | 'dumbbells' | 'barbell' | 'bench' | 'machines' | 'bands'>;
  limitations: Array<{
    zone: string;
    severity: 'none' | 'mild' | 'moderate' | 'severe';
    temporality: 'temporary' | 'chronic';
  }>;
};

export type PlannedExerciseRouteContext = {
  params: Promise<{ plannedExerciseId: string }>;
};

export type SubstituteRouteDeps = {
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

export type CandidateRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  getProfile: (userId: string) => Promise<ProfileForSubstitution | null>;
  getPlannedExerciseOwnership: (
    plannedExerciseId: string,
    userId?: string,
  ) => Promise<PlannedExerciseOwnership | null>;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function isAccountOwnershipError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Mismatched account context');
}

export function createPlannedExerciseSubstitutePostHandler(deps: SubstituteRouteDeps) {
  return async function POST(request: Request, context: PlannedExerciseRouteContext): Promise<Response> {
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

export function createSubstitutionCandidatesGetHandler(deps: CandidateRouteDeps) {
  return async function GET(_request: Request, context: PlannedExerciseRouteContext): Promise<Response> {
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
