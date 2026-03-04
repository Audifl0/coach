import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { parseSessionNoteInput } from '@/lib/program/contracts';
import { createProgramDal } from '@/server/dal/program';
import { createSessionLoggingService } from '@/server/services/session-logging';

type RouteContext = {
  params: { sessionId: string } | Promise<{ sessionId: string }>;
};

type ProgramSessionNoteRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  updateSessionNote: (input: { plannedSessionId: string; note: string | null }, userId?: string) => Promise<void>;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
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

export function createProgramSessionNotePatchHandler(deps: ProgramSessionNoteRouteDeps) {
  return async function PATCH(request: Request, context: RouteContext): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { sessionId } = await context.params;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Invalid request payload' }, 400);
    }

    let parsed: { note?: string | null };
    try {
      parsed = parseSessionNoteInput(payload);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid note payload' }, 400);
    }

    try {
      await deps.updateSessionNote(
        {
          plannedSessionId: sessionId,
          note: parsed.note ?? null,
        },
        session.userId,
      );

      return json(
        {
          sessionId,
          note: parsed.note ?? null,
        },
        200,
      );
    } catch (error) {
      if (isNotFoundError(error)) {
        return json({ error: 'Planned session not found' }, 404);
      }

      if (isBadRequestError(error)) {
        return json({ error: error instanceof Error ? error.message : 'Invalid note request' }, 400);
      }

      return json({ error: 'Unable to update session note' }, 500);
    }
  };
}

async function buildDefaultDeps(): Promise<ProgramSessionNoteRouteDeps> {
  const { prisma } = await import('@/lib/db/prisma');
  const repository = await buildDefaultSessionGateRepository();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    updateSessionNote: async (input, userId) => {
      if (!userId) {
        throw new Error('Unauthorized');
      }

      const dal = createProgramDal(prisma as never, { userId });
      const service = createSessionLoggingService({ programDal: dal });
      await service.updateSessionNote(input);
    },
  };
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramSessionNotePatchHandler(deps)(request, context);
}
