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

export type ProgramAdaptationRejectRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  rejectRecommendation: (input: { userId: string; recommendationId: string; reason?: string }) => Promise<unknown>;
};

const rejectBodySchema = z.object({
  decision: z.literal('reject'),
  reason: z.string().trim().min(1).max(240).optional(),
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

export function createProgramAdaptationRejectPostHandler(deps: ProgramAdaptationRejectRouteDeps) {
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

    const parsed = rejectBodySchema.safeParse(payload);
    if (!parsed.success) {
      return json({ error: 'Invalid rejection payload' }, 400);
    }

    const { recommendationId } = await context.params;

    try {
      const recommendation = parseAdaptiveRecommendation(
        await deps.rejectRecommendation({
          userId: session.userId,
          recommendationId,
          reason: parsed.data.reason,
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

      return json({ error: 'Unable to reject recommendation' }, 500);
    }
  };
}

async function buildDefaultDeps(): Promise<ProgramAdaptationRejectRouteDeps> {
  const repository = await buildDefaultSessionGateRepository();
  const service = await buildDefaultAdaptiveCoachingService();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    rejectRecommendation: (input) => service.rejectAdaptiveRecommendation(input),
  };
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramAdaptationRejectPostHandler(deps)(request, context);
}
