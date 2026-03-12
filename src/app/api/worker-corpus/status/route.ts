import type { NextRequest } from 'next/server';

import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { loadWorkerCorpusStatus } from '@/server/dashboard/worker-dashboard';
import { createWorkerCorpusStatusGetHandler } from './route-handlers';

async function buildDefaultDeps() {
  const repository = await buildDefaultSessionGateRepository();
  return {
    resolveSession: () => validateSessionFromCookies(repository),
    loadStatus: async () =>
      (await loadWorkerCorpusStatus()) ?? {
        generatedAt: new Date().toISOString(),
        control: {
          state: 'idle',
          pid: null,
          mode: null,
          startedAt: null,
          stoppedAt: null,
          pauseRequestedAt: null,
          message: null,
        },
        live: {
          state: 'idle',
          severity: 'degraded',
          runId: null,
          mode: null,
          startedAt: null,
          heartbeatAt: null,
          leaseExpiresAt: null,
          message: null,
          isHeartbeatStale: false,
        },
        publication: {
          severity: 'degraded',
          activeSnapshotId: null,
          activeSnapshotDir: null,
          promotedAt: null,
          rollbackSnapshotId: null,
          rollbackSnapshotDir: null,
          rollbackAvailable: false,
          snapshotAgeHours: null,
          evidenceRecordCount: null,
          principleCount: null,
          sourceDomains: [],
          qualityGateReasons: [],
          lastRunAgeHours: null,
        },
      },
  };
}

export async function GET(_request: NextRequest, _context: RouteContext<'/api/worker-corpus/status'>): Promise<Response> {
  return createWorkerCorpusStatusGetHandler(await buildDefaultDeps())();
}
