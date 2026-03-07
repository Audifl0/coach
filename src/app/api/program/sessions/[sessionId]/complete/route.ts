import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { createProgramDal } from '@/server/dal/program';
import { createSessionLoggingService } from '@/server/services/session-logging';
import {
  createProgramSessionCompletePostHandler,
  type ProgramSessionCompleteRouteDeps,
  type SessionRouteContext,
} from '../route-handlers';

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

export async function POST(request: Request, context: SessionRouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramSessionCompletePostHandler(deps)(request, context);
}
