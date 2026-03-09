import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { createProgramDal, createProgramDbClient } from '@/server/dal/program';
import { createSessionLoggingService } from '@/server/services/session-logging';
import {
  createProgramSessionNotePatchHandler,
  type ProgramSessionNoteRouteDeps,
  type SessionRouteContext,
} from '../route-handlers';

async function buildDefaultDeps(): Promise<ProgramSessionNoteRouteDeps> {
  const { prisma } = await import('@/lib/db/prisma');
  const repository = await buildDefaultSessionGateRepository();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    updateSessionNote: async (input, userId) => {
      const dal = createProgramDal(createProgramDbClient(prisma), { userId });
      const service = createSessionLoggingService({ programDal: dal });
      await service.updateSessionNote(input);
    },
  };
}

export async function PATCH(request: Request, context: SessionRouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramSessionNotePatchHandler(deps)(request, context);
}
