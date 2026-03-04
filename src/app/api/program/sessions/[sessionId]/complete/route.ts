import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { parseSessionCompleteInput } from '@/lib/program/contracts';
import { createProgramDal } from '@/server/dal/program';
import { createSessionLoggingService } from '@/server/services/session-logging';

type RouteContext = {
  params: { sessionId: string } | Promise<{ sessionId: string }>;
};

type ProgramSessionCompleteRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  completeSession: (
    input: { plannedSessionId: string; fatigue: number; readiness: number; comment?: string },
    userId?: string,
  ) => Promise<void>;
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
  return message.includes('completed') || message.includes('cannot') || message.includes('already');
}

export function createProgramSessionCompletePostHandler(deps: ProgramSessionCompleteRouteDeps) {
  return async function POST(request: Request, context: RouteContext): Promise<Response> {
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

    let parsed: { fatigue: number; readiness: number; comment?: string };
    try {
      parsed = parseSessionCompleteInput(payload);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid session completion payload' }, 400);
    }

    try {
      await deps.completeSession(
        {
          plannedSessionId: sessionId,
          fatigue: parsed.fatigue,
          readiness: parsed.readiness,
          comment: parsed.comment,
        },
        session.userId,
      );

      return json(
        {
          sessionId,
          completed: true,
          fatigue: parsed.fatigue,
          readiness: parsed.readiness,
          comment: parsed.comment ?? null,
        },
        200,
      );
    } catch (error) {
      if (isNotFoundError(error)) {
        return json({ error: 'Planned session not found' }, 404);
      }

      if (isBadRequestError(error)) {
        return json({ error: error instanceof Error ? error.message : 'Invalid session completion request' }, 400);
      }

      return json({ error: 'Unable to complete session' }, 500);
    }
  };
}

async function buildDefaultDeps(): Promise<ProgramSessionCompleteRouteDeps> {
  const { prisma } = await import('@/lib/db/prisma');
  const repository = await buildDefaultSessionGateRepository();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    completeSession: async (input, userId) => {
      if (!userId) {
        throw new Error('Unauthorized');
      }

      const dal = createProgramDal(prisma as never, { userId });
      const service = createSessionLoggingService({ programDal: dal });
      await service.completeSession(input);
    },
  };
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramSessionCompletePostHandler(deps)(request, context);
}
