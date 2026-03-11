import { parseWorkerCorpusRunsResponse } from '@/lib/program/contracts';

export type WorkerCorpusRunsRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  listRuns: (input: { limit: number }) => Promise<unknown>;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function parseLimit(raw: string | null): number {
  if (!raw) {
    return 10;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Invalid limit');
  }
  return parsed;
}

export function createWorkerCorpusRunsGetHandler(deps: WorkerCorpusRunsRouteDeps) {
  return async function GET(request: Request): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    let limit = 10;
    try {
      limit = parseLimit(new URL(request.url).searchParams.get('limit'));
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid limit' }, 400);
    }

    try {
      return json(parseWorkerCorpusRunsResponse(await deps.listRuns({ limit })), 200);
    } catch {
      return json({ error: 'Unable to load worker runs' }, 500);
    }
  };
}
