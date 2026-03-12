import type { NextRequest } from 'next/server';

import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { listWorkerCorpusRuns } from '@/server/dashboard/worker-dashboard';
import { createWorkerCorpusRunsGetHandler } from './route-handlers';

async function buildDefaultDeps() {
  const repository = await buildDefaultSessionGateRepository();
  return {
    resolveSession: () => validateSessionFromCookies(repository),
    listRuns: ({ limit }: { limit: number }) => listWorkerCorpusRuns({ limit }),
  };
}

export async function GET(request: NextRequest, _context: RouteContext<'/api/worker-corpus/runs'>): Promise<Response> {
  return createWorkerCorpusRunsGetHandler(await buildDefaultDeps())(request);
}
