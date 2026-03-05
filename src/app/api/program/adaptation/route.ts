import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { parseAdaptiveRecommendation } from '@/lib/adaptive-coaching/contracts';
import {
  AdaptiveCoachingError,
  buildDefaultAdaptiveCoachingService,
} from '@/server/services/adaptive-coaching';

export type ProgramAdaptationRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  generateRecommendation: (userId: string) => Promise<{
    recommendation: unknown;
    meta?: { traceSteps?: string[] };
  }>;
};

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

export function createProgramAdaptationPostHandler(deps: ProgramAdaptationRouteDeps) {
  return async function POST(): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    try {
      const generated = await deps.generateRecommendation(session.userId);
      const recommendation = parseAdaptiveRecommendation(generated.recommendation);
      return json(
        {
          recommendation,
          meta: {
            traceSteps: generated.meta?.traceSteps ?? [],
          },
        },
        200,
      );
    } catch (error) {
      if (isMaskedNotFoundError(error)) {
        return json({ error: 'Recommendation target not found' }, 404);
      }

      if (error instanceof AdaptiveCoachingError) {
        return json({ error: error.message }, error.status);
      }

      if (error instanceof Error && error.name === 'ZodError') {
        return json({ error: 'Invalid recommendation payload from service' }, 500);
      }

      return json({ error: 'Unable to generate adaptive recommendation' }, 500);
    }
  };
}

async function buildDefaultDeps(): Promise<ProgramAdaptationRouteDeps> {
  const repository = await buildDefaultSessionGateRepository();
  const service = await buildDefaultAdaptiveCoachingService();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    generateRecommendation: (userId: string) => service.generate(userId),
  };
}

export async function POST(): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramAdaptationPostHandler(deps)();
}
