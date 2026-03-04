import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { parseLoggedSetInput } from '@/lib/program/contracts';
import { createProgramDal } from '@/server/dal/program';
import { createSessionLoggingService } from '@/server/services/session-logging';

type RouteContext = {
  params: { sessionId: string; plannedExerciseId: string } | Promise<{ sessionId: string; plannedExerciseId: string }>;
};

type OwnedExercise = {
  plannedSessionId: string;
};

type ProgramSessionExerciseSetsRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  getExerciseOwnership: (plannedExerciseId: string, userId?: string) => Promise<OwnedExercise | null>;
  logSet: (
    input: {
      plannedExerciseId: string;
      setIndex: number;
      weight: number;
      reps: number;
      rpe?: number;
    },
    userId?: string,
  ) => Promise<unknown>;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function isOwnershipError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('mismatched account context');
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('not found');
}

function isBadRequestError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('completed') || message.includes('cannot');
}

function createSetMutationHandler(
  deps: ProgramSessionExerciseSetsRouteDeps,
  mutation: 'POST' | 'PATCH',
) {
  const successStatus = mutation === 'POST' ? 201 : 200;

  return async function handler(request: Request, context: RouteContext): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { sessionId, plannedExerciseId } = await context.params;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Invalid request payload' }, 400);
    }

    let parsed: { setIndex: number; weight: number; reps: number; rpe?: number };
    try {
      parsed = parseLoggedSetInput(payload);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid logged set payload' }, 400);
    }

    let ownership: OwnedExercise | null = null;
    try {
      ownership = await deps.getExerciseOwnership(plannedExerciseId, session.userId);
    } catch (error) {
      if (isOwnershipError(error)) {
        return json({ error: 'Planned exercise not found' }, 404);
      }

      return json({ error: 'Unable to verify planned exercise ownership' }, 500);
    }

    if (!ownership || ownership.plannedSessionId !== sessionId) {
      return json({ error: 'Planned exercise not found' }, 404);
    }

    try {
      const saved = await deps.logSet(
        {
          plannedExerciseId,
          setIndex: parsed.setIndex,
          weight: parsed.weight,
          reps: parsed.reps,
          rpe: parsed.rpe,
        },
        session.userId,
      );

      return json(
        {
          set: saved ?? {
            plannedExerciseId,
            setIndex: parsed.setIndex,
            weight: parsed.weight,
            reps: parsed.reps,
            rpe: parsed.rpe ?? null,
          },
        },
        successStatus,
      );
    } catch (error) {
      if (isOwnershipError(error) || isNotFoundError(error)) {
        return json({ error: 'Planned exercise not found' }, 404);
      }

      if (isBadRequestError(error)) {
        return json({ error: error instanceof Error ? error.message : 'Invalid logging request' }, 400);
      }

      return json({ error: 'Unable to save logged set' }, 500);
    }
  };
}

export function createProgramSessionExerciseSetsPostHandler(deps: ProgramSessionExerciseSetsRouteDeps) {
  return createSetMutationHandler(deps, 'POST');
}

export function createProgramSessionExerciseSetsPatchHandler(deps: ProgramSessionExerciseSetsRouteDeps) {
  return createSetMutationHandler(deps, 'PATCH');
}

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

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramSessionExerciseSetsPostHandler(deps)(request, context);
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramSessionExerciseSetsPatchHandler(deps)(request, context);
}
