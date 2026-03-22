'use client';

import { useRouter } from 'next/navigation';

import type {
  WorkerCorpusLibraryDetail,
  WorkerCorpusOverviewSection,
  WorkerCorpusRunDetail,
  WorkerCorpusSnapshotDetail,
  WorkerCorpusSupervisionResponse,
} from '@/lib/program/contracts';
import { WorkerCorpusDashboardClient } from './worker-corpus-dashboard-client';

type WorkerCorpusDashboardClientShellProps = {
  initialSection: WorkerCorpusOverviewSection;
  initialSupervision: WorkerCorpusSupervisionResponse;
  initialRunDetail: WorkerCorpusRunDetail | null;
  initialSnapshotDetail: WorkerCorpusSnapshotDetail | null;
  initialLibraryDetail: WorkerCorpusLibraryDetail | null;
};

export function WorkerCorpusDashboardClientShell(props: WorkerCorpusDashboardClientShellProps) {
  const router = useRouter();

  return <WorkerCorpusDashboardClient {...props} onRefresh={() => router.refresh()} />;
}
