import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import {
  buildDefaultAdaptiveCoachingService,
} from '@/server/services/adaptive-coaching';
import {
  createProgramAdaptationRejectPostHandler,
  type ProgramAdaptationRejectRouteDeps,
  type RecommendationRouteContext,
} from '../route-handlers';

async function buildDefaultDeps(): Promise<ProgramAdaptationRejectRouteDeps> {
  const repository = await buildDefaultSessionGateRepository();
  const service = await buildDefaultAdaptiveCoachingService();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    rejectRecommendation: (input) => service.rejectAdaptiveRecommendation(input),
  };
}

export async function POST(request: Request, context: RecommendationRouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramAdaptationRejectPostHandler(deps)(request, context);
}
