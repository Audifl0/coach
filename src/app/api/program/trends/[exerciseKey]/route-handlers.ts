import {
  parseProgramTrendQueryInput,
  parseProgramTrendsExerciseResponse,
} from '@/lib/program/contracts';

export type ExerciseTrendRouteContext = {
  params: Promise<{ exerciseKey: string }>;
};

export type ProgramTrendsExerciseRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  getExerciseTrendSeries: (
    input: { period: '7d' | '30d' | '90d'; exerciseKey: string },
    userId?: string,
  ) => Promise<unknown | null>;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

export function createProgramTrendsExerciseGetHandler(deps: ProgramTrendsExerciseRouteDeps) {
  return async function GET(request: Request, context: ExerciseTrendRouteContext): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { exerciseKey } = await context.params;
    if (!exerciseKey) {
      return json({ error: 'Exercise key is required' }, 400);
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
      const series = await deps.getExerciseTrendSeries(
        {
          period: query.period,
          exerciseKey,
        },
        session.userId,
      );

      if (!series) {
        return json({ error: 'Trend data not found' }, 404);
      }

      const payload = parseProgramTrendsExerciseResponse(series);
      return json(payload, 200);
    } catch {
      return json({ error: 'Unable to load exercise trends' }, 500);
    }
  };
}
