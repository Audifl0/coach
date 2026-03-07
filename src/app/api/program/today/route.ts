import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import type { ProgramTodaySessionCandidates } from '@/lib/program/contracts';
import { selectTodayWorkoutProjection } from '@/lib/program/select-today-session';
import { createProgramDal } from '@/server/dal/program';

export type ProgramTodayRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  getTodayOrNextSessionCandidates: (userId: string) => Promise<ProgramTodaySessionCandidates>;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

export function createProgramTodayGetHandler(deps: ProgramTodayRouteDeps) {
  return async function GET(): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const candidates = await deps.getTodayOrNextSessionCandidates(session.userId);
    const payload = selectTodayWorkoutProjection(candidates);

    return json(payload, 200);
  };
}

async function buildDefaultDeps(): Promise<ProgramTodayRouteDeps> {
  const { prisma } = await import('@/lib/db/prisma');
  const repository = await buildDefaultSessionGateRepository();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    getTodayOrNextSessionCandidates: async (userId: string) => {
      const programDal = createProgramDal(prisma as never, { userId });
      return programDal.getTodayOrNextSessionCandidates();
    },
  };
}

export async function GET(): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramTodayGetHandler(deps)();
}
