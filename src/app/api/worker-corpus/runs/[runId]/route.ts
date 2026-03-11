import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { getWorkerCorpusRunDetail } from '@/server/dashboard/worker-dashboard';
import { createWorkerCorpusRunDetailGetHandler, type WorkerCorpusRunDetailRouteContext } from './route-handlers';

async function buildDefaultDeps() {
  const repository = await buildDefaultSessionGateRepository();
  return {
    resolveSession: () => validateSessionFromCookies(repository),
    getRunDetail: (runId: string) => getWorkerCorpusRunDetail(runId),
  };
}

export async function GET(request: Request, context: WorkerCorpusRunDetailRouteContext): Promise<Response> {
  return createWorkerCorpusRunDetailGetHandler(await buildDefaultDeps())(request, context);
}
