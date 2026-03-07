import type { ProgramTodaySessionCandidates } from '@/lib/program/contracts';
import { selectTodayWorkoutProjection } from '@/lib/program/select-today-session';
import { logRouteFailure, type AppLogger } from '@/server/observability/app-logger';

export type ProgramTodayRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  getTodayOrNextSessionCandidates: (userId: string) => Promise<ProgramTodaySessionCandidates>;
  logger?: AppLogger;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

export function createProgramTodayGetHandler(deps: ProgramTodayRouteDeps) {
  return async function GET(): Promise<Response> {
    try {
      const session = await deps.resolveSession();
      if (!session) {
        return json({ error: 'Unauthorized' }, 401);
      }

      const candidates = await deps.getTodayOrNextSessionCandidates(session.userId);
      const payload = selectTodayWorkoutProjection(candidates);

      return json(payload, 200);
    } catch (error) {
      logRouteFailure(
        {
          route: '/api/program/today',
          method: 'GET',
          status: 500,
          source: 'route_handler',
          error,
        },
        deps.logger,
      );

      return json({ error: 'Unable to load today workout' }, 500);
    }
  };
}
