import { parseWorkerCorpusSupervisionResponse } from '@/lib/program/contracts';

export type WorkerCorpusSupervisionRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  loadSupervision: () => Promise<unknown>;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

export function createWorkerCorpusSupervisionGetHandler(deps: WorkerCorpusSupervisionRouteDeps) {
  return async function GET(): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    try {
      return json(parseWorkerCorpusSupervisionResponse(await deps.loadSupervision()), 200);
    } catch {
      return json({ error: 'Unable to load worker corpus supervision' }, 500);
    }
  };
}
