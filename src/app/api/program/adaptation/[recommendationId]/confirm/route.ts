import { z } from 'zod';

import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { parseAdaptiveRecommendation } from '@/lib/adaptive-coaching/contracts';
import {
  AdaptiveCoachingError,
  buildDefaultAdaptiveCoachingService,
} from '@/server/services/adaptive-coaching';

type RouteContext = {
  params: { recommendationId: string } | Promise<{ recommendationId: string }>;
};

export type ProgramAdaptationConfirmRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  confirmRecommendation: (input: { userId: string; recommendationId: string }) => Promise<unknown>;
};

const confirmBodySchema = z.object({
  decision: z.literal('accept'),
});

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function isMaskedNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('mismatched account context') || message.includes('not found');
}

export function createProgramAdaptationConfirmPostHandler(deps: ProgramAdaptationConfirmRouteDeps) {
  return async function POST(request: Request, context: RouteContext): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Invalid request payload' }, 400);
    }

    const parsed = confirmBodySchema.safeParse(payload);
    if (!parsed.success) {
      return json({ error: 'Invalid confirmation payload' }, 400);
    }

    const { recommendationId } = await context.params;

    try {
      const recommendation = parseAdaptiveRecommendation(
        await deps.confirmRecommendation({
          userId: session.userId,
          recommendationId,
        }),
      );
      return json({ recommendation }, 200);
    } catch (error) {
      if (isMaskedNotFoundError(error)) {
        return json({ error: 'Recommendation not found' }, 404);
      }

      if (error instanceof AdaptiveCoachingError) {
        if (error.status === 404) {
          return json({ error: 'Recommendation not found' }, 404);
        }

        return json({ error: error.message }, error.status);
      }

      if (error instanceof Error && error.name === 'ZodError') {
        return json({ error: 'Invalid recommendation payload from service' }, 500);
      }

      return json({ error: 'Unable to confirm recommendation' }, 500);
    }
  };
}

async function buildDefaultDeps(): Promise<ProgramAdaptationConfirmRouteDeps> {
  const repository = await buildDefaultSessionGateRepository();
  const service = await buildDefaultAdaptiveCoachingService();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    confirmRecommendation: (input) => service.confirmAdaptiveRecommendation(input),
  };
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramAdaptationConfirmPostHandler(deps)(request, context);
}
