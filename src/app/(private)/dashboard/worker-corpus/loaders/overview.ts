import { loadWorkerCorpusOverview } from '@/server/dashboard/worker-dashboard';

export async function loadWorkerCorpusOverviewSection(input: {
  knowledgeRootDir?: string;
  now?: Date;
}) {
  return loadWorkerCorpusOverview(input);
}
