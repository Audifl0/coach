import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { parseExerciseSkipInput } from '@/lib/program/contracts';
import { createProgramDal } from '@/server/dal/program';
import { createSessionLoggingService } from '@/server/services/session-logging';

type RouteContext = {
  params: { sessionId: string; plannedExerciseId: string } | Promise<{ sessionId: string; plannedExerciseId: string }>;
};

type OwnedExercise = {
  plannedSessionId: string;
};

type ProgramSessionExerciseSkipRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  getExerciseOwnership: (plannedExerciseId: string, userId?: string) => Promise<OwnedExercise | null>;
  skipExercise: (input: { plannedExerciseId: string; reasonCode: string; reasonText?: string }, userId?: string) => Promise<void>;
  revertSkippedExercise: (input: { plannedExerciseId: string }, userId?: string) => Promise<void>;
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
  return message.includes('completed') || message.includes('cannot') || message.includes('required');
}

async function assertOwnedExerciseForSession(
  deps: ProgramSessionExerciseSkipRouteDeps,
  userId: string,
  sessionId: string,
  plannedExerciseId: string,
): Promise<Response | null> {
  let ownership: OwnedExercise | null = null;
  try {
    ownership = await deps.getExerciseOwnership(plannedExerciseId, userId);
  } catch (error) {
    if (isOwnershipError(error)) {
      return json({ error: 'Planned exercise not found' }, 404);
    }

    return json({ error: 'Unable to verify planned exercise ownership' }, 500);
  }

  if (!ownership || ownership.plannedSessionId !== sessionId) {
    return json({ error: 'Planned exercise not found' }, 404);
  }

  return null;
}

export function createProgramSessionExerciseSkipPostHandler(deps: ProgramSessionExerciseSkipRouteDeps) {
  return async function POST(request: Request, context: RouteContext): Promise<Response> {
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

    let parsed: { reasonCode: string; reasonText?: string };
    try {
      parsed = parseExerciseSkipInput(payload);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid skip payload' }, 400);
    }

    const ownershipError = await assertOwnedExerciseForSession(deps, session.userId, sessionId, plannedExerciseId);
    if (ownershipError) {
      return ownershipError;
    }

    try {
      await deps.skipExercise(
        {
          plannedExerciseId,
          reasonCode: parsed.reasonCode,
          reasonText: parsed.reasonText,
        },
        session.userId,
      );

      return json(
        {
          plannedExerciseId,
          skipped: true,
        },
        200,
      );
    } catch (error) {
      if (isOwnershipError(error) || isNotFoundError(error)) {
        return json({ error: 'Planned exercise not found' }, 404);
      }

      if (isBadRequestError(error)) {
        return json({ error: error instanceof Error ? error.message : 'Invalid skip request' }, 400);
      }

      return json({ error: 'Unable to skip exercise' }, 500);
    }
  };
}

export function createProgramSessionExerciseSkipDeleteHandler(deps: ProgramSessionExerciseSkipRouteDeps) {
  return async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { sessionId, plannedExerciseId } = await context.params;

    const ownershipError = await assertOwnedExerciseForSession(deps, session.userId, sessionId, plannedExerciseId);
    if (ownershipError) {
      return ownershipError;
    }

    try {
      await deps.revertSkippedExercise({ plannedExerciseId }, session.userId);
      return json(
        {
          plannedExerciseId,
          skipped: false,
        },
        200,
      );
    } catch (error) {
      if (isOwnershipError(error) || isNotFoundError(error)) {
        return json({ error: 'Planned exercise not found' }, 404);
      }

      if (isBadRequestError(error)) {
        return json({ error: error instanceof Error ? error.message : 'Invalid skip revert request' }, 400);
      }

      return json({ error: 'Unable to revert skipped exercise' }, 500);
    }
  };
}

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

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramSessionExerciseSkipPostHandler(deps)(request, context);
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramSessionExerciseSkipDeleteHandler(deps)(request, context);
}
