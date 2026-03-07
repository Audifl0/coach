import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import {
  buildDefaultAdaptiveCoachingService,
} from '@/server/services/adaptive-coaching';
import {
  createProgramAdaptationConfirmPostHandler,
  type ProgramAdaptationConfirmRouteDeps,
  type RecommendationRouteContext,
} from '../route-handlers';

async function buildDefaultDeps(): Promise<ProgramAdaptationConfirmRouteDeps> {
  const repository = await buildDefaultSessionGateRepository();
  const service = await buildDefaultAdaptiveCoachingService();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    confirmRecommendation: (input) => service.confirmAdaptiveRecommendation(input),
  };
}

export async function POST(request: Request, context: RecommendationRouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramAdaptationConfirmPostHandler(deps)(request, context);
}
