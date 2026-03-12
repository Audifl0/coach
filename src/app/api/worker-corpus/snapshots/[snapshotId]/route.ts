import type { NextRequest } from 'next/server';

import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { getWorkerCorpusSnapshotDetail } from '@/server/dashboard/worker-dashboard';
import {
  createWorkerCorpusSnapshotDetailGetHandler,
  type WorkerCorpusSnapshotDetailRouteContext,
} from './route-handlers';

async function buildDefaultDeps() {
  const repository = await buildDefaultSessionGateRepository();
  return {
    resolveSession: () => validateSessionFromCookies(repository),
    getSnapshotDetail: (snapshotId: string) => getWorkerCorpusSnapshotDetail(snapshotId),
  };
}

export async function GET(
  request: NextRequest,
  context: RouteContext<'/api/worker-corpus/snapshots/[snapshotId]'>,
): Promise<Response> {
  return createWorkerCorpusSnapshotDetailGetHandler(await buildDefaultDeps())(
    request,
    context as WorkerCorpusSnapshotDetailRouteContext,
  );
}
