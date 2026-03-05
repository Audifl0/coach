import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import {
  parseProgramTrendQueryInput,
  parseProgramTrendsExerciseResponse,
} from '@/lib/program/contracts';
import { createProgramDal } from '@/server/dal/program';

type RouteContext = {
  params: { exerciseKey: string } | Promise<{ exerciseKey: string }>;
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
  return async function GET(request: Request, context: RouteContext): Promise<Response> {
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

async function buildDefaultDeps(): Promise<ProgramTrendsExerciseRouteDeps> {
  const { prisma } = await import('@/lib/db/prisma');
  const repository = await buildDefaultSessionGateRepository();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    getExerciseTrendSeries: async (input, userId) => {
      if (!userId) {
        throw new Error('Unauthorized');
      }

      const dal = createProgramDal(prisma as never, { userId });
      return dal.getExerciseTrendSeries(input);
    },
  };
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramTrendsExerciseGetHandler(deps)(request, context);
}
