import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import {
  buildDefaultAdaptiveCoachingService,
} from '@/server/services/adaptive-coaching';
import {
  createProgramAdaptationPostHandler,
  type ProgramAdaptationRouteDeps,
} from './route-handlers';

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
