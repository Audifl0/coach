import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { parseSessionDurationCorrectionInput } from '@/lib/program/contracts';
import { createProgramDal } from '@/server/dal/program';
import { createSessionLoggingService } from '@/server/services/session-logging';

type RouteContext = {
  params: { sessionId: string } | Promise<{ sessionId: string }>;
};

type ProgramSessionDurationRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  correctDuration: (input: { plannedSessionId: string; effectiveDurationSec: number }, userId?: string) => Promise<void>;
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
  return message.includes('incomplete') || message.includes('24 hours') || message.includes('cannot');
}

export function createProgramSessionDurationPatchHandler(deps: ProgramSessionDurationRouteDeps) {
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

    let parsed: { effectiveDurationSec: number };
    try {
      parsed = parseSessionDurationCorrectionInput(payload);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid duration correction payload' }, 400);
    }

    try {
      await deps.correctDuration(
        {
          plannedSessionId: sessionId,
          effectiveDurationSec: parsed.effectiveDurationSec,
        },
        session.userId,
      );

      return json(
        {
          sessionId,
          effectiveDurationSec: parsed.effectiveDurationSec,
        },
        200,
      );
    } catch (error) {
      if (isNotFoundError(error)) {
        return json({ error: 'Planned session not found' }, 404);
      }

      if (isBadRequestError(error)) {
        return json({ error: error instanceof Error ? error.message : 'Invalid duration correction request' }, 400);
      }

      return json({ error: 'Unable to correct session duration' }, 500);
    }
  };
}

async function buildDefaultDeps(): Promise<ProgramSessionDurationRouteDeps> {
  const { prisma } = await import('@/lib/db/prisma');
  const repository = await buildDefaultSessionGateRepository();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    correctDuration: async (input, userId) => {
      if (!userId) {
        throw new Error('Unauthorized');
      }

      const dal = createProgramDal(prisma as never, { userId });
      const service = createSessionLoggingService({ programDal: dal });
      await service.correctDuration(input);
    },
  };
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramSessionDurationPatchHandler(deps)(request, context);
}
