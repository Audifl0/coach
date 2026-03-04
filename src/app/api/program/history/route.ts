import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { parseHistoryQueryInput, parseProgramHistoryListResponse } from '@/lib/program/contracts';
import { createProgramDal } from '@/server/dal/program';

type HistoryRow = {
  id: string;
  date: string;
  duration: number;
  exerciseCount: number;
  totalLoad: number;
};

export type ProgramHistoryRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  getHistoryList: (range: { from: Date; to: Date }, userId?: string) => Promise<HistoryRow[]>;
  now?: () => Date;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function atStartOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function atEndOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function resolveHistoryRange(
  input: { period: '7d' | '30d' | '90d' | 'custom'; from?: string; to?: string },
  now: Date,
): { from: Date; to: Date } {
  if (input.period === 'custom' && input.from && input.to) {
    return {
      from: atStartOfDay(new Date(`${input.from}T00:00:00.000Z`)),
      to: atEndOfDay(new Date(`${input.to}T23:59:59.999Z`)),
    };
  }

  const days = input.period === '7d' ? 7 : input.period === '30d' ? 30 : 90;
  const to = atEndOfDay(now);
  const from = atStartOfDay(new Date(now));
  from.setDate(from.getDate() - (days - 1));

  return { from, to };
}

export function createProgramHistoryGetHandler(deps: ProgramHistoryRouteDeps) {
  return async function GET(request: Request): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { searchParams } = new URL(request.url);
    const raw = {
      period: searchParams.get('period') ?? '7d',
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
    };

    let query: { period: '7d' | '30d' | '90d' | 'custom'; from?: string; to?: string };
    try {
      query = parseHistoryQueryInput(raw);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid history query' }, 400);
    }

    try {
      const range = resolveHistoryRange(query, deps.now ? deps.now() : new Date());
      const sessions = await deps.getHistoryList(range, session.userId);
      const payload = parseProgramHistoryListResponse({ sessions });
      return json(payload, 200);
    } catch {
      return json({ error: 'Unable to load program history' }, 500);
    }
  };
}

async function buildDefaultDeps(): Promise<ProgramHistoryRouteDeps> {
  const { prisma } = await import('@/lib/db/prisma');
  const repository = await buildDefaultSessionGateRepository();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    getHistoryList: async (range, userId) => {
      if (!userId) {
        throw new Error('Unauthorized');
      }

      const dal = createProgramDal(prisma as never, { userId });
      return dal.getHistoryList(range);
    },
  };
}

export async function GET(request: Request): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramHistoryGetHandler(deps)(request);
}
