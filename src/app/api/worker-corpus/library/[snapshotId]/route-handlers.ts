import { parseWorkerCorpusLibraryDetail } from '@/lib/program/contracts';

export type WorkerCorpusLibraryDetailRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  getLibraryDetail: (snapshotId: string) => Promise<unknown | null>;
};

export type WorkerCorpusLibraryDetailRouteContext = {
  params: Promise<{ snapshotId: string }>;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

export function createWorkerCorpusLibraryDetailGetHandler(deps: WorkerCorpusLibraryDetailRouteDeps) {
  return async function GET(_request: Request, context: WorkerCorpusLibraryDetailRouteContext): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { snapshotId } = await context.params;
    const detail = await deps.getLibraryDetail(snapshotId);
    if (!detail) {
      return json({ error: 'Snapshot not found' }, 404);
    }

    try {
      return json(parseWorkerCorpusLibraryDetail(detail), 200);
    } catch {
      return json({ error: 'Unable to load worker corpus detail' }, 500);
    }
  };
}
