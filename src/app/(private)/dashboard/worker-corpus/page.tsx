import { redirect } from 'next/navigation';

import { createProfileDal, createProfileDbClient } from '@/server/dal/profile';
import {
  getWorkerCorpusRunDetail,
  getWorkerCorpusSnapshotDetail,
  loadWorkerCorpusStatus,
} from '@/server/dashboard/worker-dashboard';
import { loadWorkerCorpusOverviewSection } from './loaders/overview';
import { resolveDashboardAccess } from '../loaders/dashboard-access';
import { RunDetailPanel } from './_components/run-detail-panel';
import { SnapshotDetailPanel } from './_components/snapshot-detail-panel';
import { WorkerCorpusLiveClient } from './_components/worker-corpus-live-client';
import { PublicationStatusCard } from './_components/publication-status-card';
import { RecentRunsCard } from './_components/recent-runs-card';
import { WorkerStatusCard } from './_components/worker-status-card';

export default async function WorkerCorpusDashboardPage() {
  const { prisma } = await import('@/lib/db/prisma');
  const profileDal = createProfileDal(createProfileDbClient(prisma));
  const { session, route } = await resolveDashboardAccess({
    getProfileByUserId: async (userId) => profileDal.getProfileByUserId(userId),
  });

  if (route === 'login' || !session) {
    redirect('/login?next=/dashboard/worker-corpus');
  }

  if (route === 'onboarding') {
    redirect('/onboarding');
  }

  const overviewSection = await loadWorkerCorpusOverviewSection({});
  const leadRunId = overviewSection.status === 'ready' ? overviewSection.data.recentRuns[0]?.runId ?? null : null;
  const activeSnapshotId =
    overviewSection.status === 'ready' ? overviewSection.data.publication.activeSnapshotId ?? null : null;
  const [runDetail, snapshotDetail, statusPayload] = overviewSection.status === 'ready'
    ? await Promise.all([
        leadRunId ? getWorkerCorpusRunDetail(leadRunId) : Promise.resolve(null),
        activeSnapshotId ? getWorkerCorpusSnapshotDetail(activeSnapshotId) : Promise.resolve(null),
        loadWorkerCorpusStatus(),
      ])
    : [null, null, null];

  return (
    <main>
      <h1>Worker corpus dashboard</h1>
      <p>Operational view over worker lease, publication status, recent runs, and snapshot freshness.</p>
      {overviewSection.status === 'ready' ? (
        <>
          {statusPayload ? (
            <WorkerCorpusLiveClient initialStatus={statusPayload} initialRuns={overviewSection.data.recentRuns} />
          ) : (
            <>
              <WorkerStatusCard loadState="ready" live={overviewSection.data.live} />
              <PublicationStatusCard loadState="ready" publication={overviewSection.data.publication} />
              <RecentRunsCard loadState="ready" runs={overviewSection.data.recentRuns} />
            </>
          )}
          {runDetail ? <RunDetailPanel loadState="ready" detail={runDetail} /> : <RunDetailPanel loadState="empty" />}
          {snapshotDetail ? (
            <SnapshotDetailPanel loadState="ready" detail={snapshotDetail} />
          ) : (
            <SnapshotDetailPanel loadState="empty" />
          )}
        </>
      ) : overviewSection.status === 'empty' ? (
        <>
          <WorkerStatusCard loadState="empty" />
          <PublicationStatusCard loadState="empty" />
          <RecentRunsCard loadState="empty" />
          <RunDetailPanel loadState="empty" />
          <SnapshotDetailPanel loadState="empty" />
        </>
      ) : (
        <>
          <WorkerStatusCard loadState="error" />
          <PublicationStatusCard loadState="error" />
          <RecentRunsCard loadState="error" />
          <RunDetailPanel loadState="error" />
          <SnapshotDetailPanel loadState="error" />
        </>
      )}
    </main>
  );
}
