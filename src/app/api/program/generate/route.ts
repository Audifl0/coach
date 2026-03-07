import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import {
  buildDefaultProgramGenerationService,
} from '@/server/services/program-generation';
import {
  createProgramGeneratePostHandler,
  type ProgramGenerateRouteDeps,
} from './route-handlers';

async function buildDefaultDeps(): Promise<ProgramGenerateRouteDeps> {
  const sessionRepository = await buildDefaultSessionGateRepository();
  const programGeneration = await buildDefaultProgramGenerationService();

  return {
    resolveSession: () => validateSessionFromCookies(sessionRepository),
    generatePlan: (userId, input) => programGeneration.generate(userId, input),
  };
}

export async function POST(request: Request): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramGeneratePostHandler(deps)(request);
}
