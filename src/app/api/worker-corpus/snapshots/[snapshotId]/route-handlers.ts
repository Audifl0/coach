import { parseWorkerCorpusSnapshotDetail } from '@/lib/program/contracts';

export type WorkerCorpusSnapshotDetailRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  getSnapshotDetail: (snapshotId: string) => Promise<unknown | null>;
};

export type WorkerCorpusSnapshotDetailRouteContext = {
  params: Promise<{ snapshotId: string }>;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

export function createWorkerCorpusSnapshotDetailGetHandler(deps: WorkerCorpusSnapshotDetailRouteDeps) {
  return async function GET(_request: Request, context: WorkerCorpusSnapshotDetailRouteContext): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { snapshotId } = await context.params;
    const detail = await deps.getSnapshotDetail(snapshotId);
    if (!detail) {
      return json({ error: 'Snapshot not found' }, 404);
    }

    try {
      return json(parseWorkerCorpusSnapshotDetail(detail), 200);
    } catch {
      return json({ error: 'Unable to load worker snapshot detail' }, 500);
    }
  };
}
