import { parseWorkerCorpusLibraryResponse } from '@/lib/program/contracts';

export type WorkerCorpusLibraryRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  listLibrary: () => Promise<unknown>;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

export function createWorkerCorpusLibraryGetHandler(deps: WorkerCorpusLibraryRouteDeps) {
  return async function GET(): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    try {
      return json(parseWorkerCorpusLibraryResponse(await deps.listLibrary()), 200);
    } catch {
      return json({ error: 'Unable to load worker corpus library' }, 500);
    }
  };
}
