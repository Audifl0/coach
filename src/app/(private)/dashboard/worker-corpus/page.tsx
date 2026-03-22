import { redirect } from 'next/navigation';

import { WorkerCorpusDashboardClientShell } from './_components/worker-corpus-dashboard-client-shell';

import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import {
  type WorkerCorpusLibraryDetail,
  type WorkerCorpusOverviewSection,
  type WorkerCorpusRunDetail,
  type WorkerCorpusSnapshotDetail,
  type WorkerCorpusSupervisionResponse,
} from '@/lib/program/contracts';
import {
  getWorkerCorpusLibraryDetail,
  getWorkerCorpusRunDetail,
  getWorkerCorpusSnapshotDetail,
} from '@/server/dashboard/worker-dashboard';
import { loadWorkerCorpusSupervision } from '@/server/services/worker-corpus-supervision';
import { loadWorkerCorpusOverviewSection } from './loaders/overview';
import { WorkerCorpusDashboardClientShell } from './_components/worker-corpus-dashboard-client-shell';

function buildFallbackSupervision(now: Date): WorkerCorpusSupervisionResponse {
  return {
    generatedAt: now.toISOString(),
    workflow: {
      queueDepth: 0,
      blockedItems: 0,
      byStatus: {
        pending: 0,
        running: 0,
        blocked: 0,
        completed: 0,
        failed: 0,
      },
      queues: [],
    },
    documents: {
      total: 0,
      byState: {
        discovered: 0,
        'metadata-ready': 0,
        'abstract-ready': 0,
        'full-text-ready': 0,
        extractible: 0,
        extracted: 0,
        linked: 0,
      },
    },
    questions: {
      total: 0,
      contradictionCount: 0,
      blockingContradictionCount: 0,
      byCoverage: {
        empty: 0,
        partial: 0,
        developing: 0,
        mature: 0,
        blocked: 0,
      },
      byPublication: {
        'not-ready': 0,
        candidate: 0,
        published: 0,
        reopened: 0,
      },
      notableQuestions: [],
    },
    doctrine: {
      activePrinciples: 0,
      reopenedPrinciples: 0,
      supersededPrinciples: 0,
      recentRevisions: [],
    },
    recentResearchJournal: [],
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
  const supervision = (await loadWorkerCorpusSupervision().catch(() => null)) ?? buildFallbackSupervision(now);

  const leadRunId = overviewSection.status === 'ready' ? overviewSection.data.recentRuns[0]?.runId ?? null : null;
  const focusSnapshotId = overviewSection.status === 'ready' ? overviewSection.data.publication.activeSnapshotId ?? null : null;

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
    <WorkerCorpusDashboardClientShell
      initialSection={safeSection}
      initialSupervision={supervision}
      initialRunDetail={runDetail}
      initialSnapshotDetail={snapshotDetail}
      initialLibraryDetail={libraryDetail}
    />
  );
}
