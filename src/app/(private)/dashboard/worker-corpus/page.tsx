import { redirect } from 'next/navigation';

import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import {
  type WorkerCorpusLibraryResponse,
  type WorkerCorpusOverviewSection,
  type WorkerCorpusStatusResponse,
} from '@/lib/program/contracts';
import {
  getWorkerCorpusLibraryDetail,
  getWorkerCorpusRunDetail,
  getWorkerCorpusSnapshotDetail,
  listWorkerCorpusLibrary,
  loadWorkerCorpusStatus,
} from '@/server/dashboard/worker-dashboard';
import { loadWorkerCorpusOverviewSection } from './loaders/overview';
import { WorkerCorpusDashboardClient } from './_components/worker-corpus-dashboard-client';

function buildFallbackStatus(now: Date): WorkerCorpusStatusResponse {
  return {
    generatedAt: now.toISOString(),
    control: {
      state: 'idle',
      pid: null,
      mode: null,
      startedAt: null,
      stoppedAt: null,
      pauseRequestedAt: null,
      message: null,
      campaign: null,
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
  };
}

function buildFallbackLibrary(now: Date): WorkerCorpusLibraryResponse {
  return {
    generatedAt: now.toISOString(),
    entries: [],
  };
}

export default async function WorkerCorpusDashboardPage(_props: PageProps<'/dashboard/worker-corpus'>) {
  const sessionRepository = await buildDefaultSessionGateRepository();
  const session = await validateSessionFromCookies(sessionRepository);
  if (!session) {
    redirect('/login?next=/dashboard/worker-corpus');
  }

  const now = new Date();
  const overviewSection = await loadWorkerCorpusOverviewSection({});
  const statusPayload = (await loadWorkerCorpusStatus()) ?? buildFallbackStatus(now);
  const library = await listWorkerCorpusLibrary().catch(() => buildFallbackLibrary(now));

  const leadRunId = overviewSection.status === 'ready' ? overviewSection.data.recentRuns[0]?.runId ?? null : null;
  const focusSnapshotId =
    library.entries[0]?.snapshotId ??
    (overviewSection.status === 'ready' ? overviewSection.data.publication.activeSnapshotId ?? null : null);

  const [runDetail, snapshotDetail, libraryDetail] = await Promise.all([
    leadRunId ? getWorkerCorpusRunDetail(leadRunId).catch(() => null) : Promise.resolve(null),
    focusSnapshotId ? getWorkerCorpusSnapshotDetail(focusSnapshotId).catch(() => null) : Promise.resolve(null),
    focusSnapshotId ? getWorkerCorpusLibraryDetail(focusSnapshotId).catch(() => null) : Promise.resolve(null),
  ]);

  const safeSection: WorkerCorpusOverviewSection =
    overviewSection.status === 'ready' || overviewSection.status === 'empty' || overviewSection.status === 'error'
      ? overviewSection
      : { status: 'error' };

  return (
    <WorkerCorpusDashboardClient
      initialSection={safeSection}
      initialStatus={statusPayload}
      initialRuns={safeSection.status === 'ready' ? safeSection.data.recentRuns : []}
      initialRunDetail={runDetail}
      initialSnapshotDetail={snapshotDetail}
      initialLibrary={library}
      initialLibraryDetail={libraryDetail}
    />
  );
}
