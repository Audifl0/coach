import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import {
  parseProgramTrendQueryInput,
  parseProgramTrendsSummaryResponse,
} from '@/lib/program/contracts';
import { createProgramDal } from '@/server/dal/program';

export type ProgramTrendsRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  getTrendSummary: (input: { period: '7d' | '30d' | '90d' }, userId?: string) => Promise<unknown>;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

export function createProgramTrendsGetHandler(deps: ProgramTrendsRouteDeps) {
  return async function GET(request: Request): Promise<Response> {
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
    } catch {
      return json({ error: 'Unable to load trend summary' }, 500);
    }
  };
}

async function buildDefaultDeps(): Promise<ProgramTrendsRouteDeps> {
  const { prisma } = await import('@/lib/db/prisma');
  const repository = await buildDefaultSessionGateRepository();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    getTrendSummary: async (input, userId) => {
      if (!userId) {
        throw new Error('Unauthorized');
      }

      const dal = createProgramDal(prisma as never, { userId });
      return dal.getTrendSummary(input);
    },
  };
}

export async function GET(request: Request): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramTrendsGetHandler(deps)(request);
}
