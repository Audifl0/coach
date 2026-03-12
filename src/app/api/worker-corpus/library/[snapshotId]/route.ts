import type { NextRequest } from 'next/server';

import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { getWorkerCorpusLibraryDetail } from '@/server/dashboard/worker-dashboard';
import {
  createWorkerCorpusLibraryDetailGetHandler,
  type WorkerCorpusLibraryDetailRouteContext,
} from './route-handlers';

async function buildDefaultDeps() {
  const repository = await buildDefaultSessionGateRepository();
  return {
    resolveSession: () => validateSessionFromCookies(repository),
    getLibraryDetail: (snapshotId: string) => getWorkerCorpusLibraryDetail(snapshotId),
  };
}

export async function GET(
  request: NextRequest,
  context: WorkerCorpusLibraryDetailRouteContext,
): Promise<Response> {
  return createWorkerCorpusLibraryDetailGetHandler(await buildDefaultDeps())(request, context);
}
