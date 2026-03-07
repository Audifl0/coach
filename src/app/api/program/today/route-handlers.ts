import type { ProgramTodaySessionCandidates } from '@/lib/program/contracts';
import { selectTodayWorkoutProjection } from '@/lib/program/select-today-session';

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
