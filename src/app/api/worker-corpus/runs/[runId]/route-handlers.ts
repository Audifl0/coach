import { parseWorkerCorpusRunDetail } from '@/lib/program/contracts';

export type WorkerCorpusRunDetailRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  getRunDetail: (runId: string) => Promise<unknown | null>;
};

export type WorkerCorpusRunDetailRouteContext = {
  params: Promise<{ runId: string }>;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

export function createWorkerCorpusRunDetailGetHandler(deps: WorkerCorpusRunDetailRouteDeps) {
  return async function GET(_request: Request, context: WorkerCorpusRunDetailRouteContext): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { runId } = await context.params;
    const detail = await deps.getRunDetail(runId);
    if (!detail) {
      return json({ error: 'Run not found' }, 404);
    }

    try {
      return json(parseWorkerCorpusRunDetail(detail), 200);
    } catch {
      return json({ error: 'Unable to load worker run detail' }, 500);
    }
  };
}
