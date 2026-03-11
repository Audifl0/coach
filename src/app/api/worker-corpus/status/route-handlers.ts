import { parseWorkerCorpusStatusResponse } from '@/lib/program/contracts';

export type WorkerCorpusStatusRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  loadStatus: () => Promise<unknown>;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

export function createWorkerCorpusStatusGetHandler(deps: WorkerCorpusStatusRouteDeps) {
  return async function GET(): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    try {
      return json(parseWorkerCorpusStatusResponse(await deps.loadStatus()), 200);
    } catch {
      return json({ error: 'Unable to load worker status' }, 500);
    }
  };
}
