import {
  parseProgramTrendQueryInput,
  parseProgramTrendsSummaryResponse,
} from '@/lib/program/contracts';
import { logRouteFailure, type AppLogger } from '@/server/observability/app-logger';

export type ProgramTrendsRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  getTrendSummary: (input: { period: '7d' | '30d' | '90d' }, userId?: string) => Promise<unknown>;
  logger?: AppLogger;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

export function createProgramTrendsGetHandler(deps: ProgramTrendsRouteDeps) {
  return async function GET(request: Request): Promise<Response> {
    try {
      const session = await deps.resolveSession();
      if (!session) {
        return json({ error: 'Unauthorized' }, 401);
      }

      const { searchParams } = new URL(request.url);
      const raw = {
        period: searchParams.get('period') ?? '30d',
      };

      let query: { period: '7d' | '30d' | '90d' };
      try {
        query = parseProgramTrendQueryInput(raw);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Invalid trend query' }, 400);
      }

      try {
        const summary = await deps.getTrendSummary(query, session.userId);
        const payload = parseProgramTrendsSummaryResponse(summary);
        return json(payload, 200);
      } catch (error) {
        logRouteFailure(
          {
            route: '/api/program/trends',
            method: 'GET',
            status: 500,
            source: 'route_handler',
            error,
          },
          deps.logger,
        );

        return json({ error: 'Unable to load trend summary' }, 500);
      }
    } catch (error) {
      logRouteFailure(
        {
          route: '/api/program/trends',
          method: 'GET',
          status: 500,
          source: 'route_handler',
          error,
        },
        deps.logger,
      );

      return json({ error: 'Unable to load trend summary' }, 500);
    }
  };
}
