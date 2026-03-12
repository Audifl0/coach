import type { NextRequest } from 'next/server';

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

export async function GET(
  request: NextRequest,
  context: RouteContext<'/api/worker-corpus/runs/[runId]'>,
): Promise<Response> {
  return createWorkerCorpusRunDetailGetHandler(await buildDefaultDeps())(
    request,
    context as WorkerCorpusRunDetailRouteContext,
  );
}
