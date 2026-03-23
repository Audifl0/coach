import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { WorkerCorpusBacklogDashboardPayload } from '@/lib/program/contracts';
import { parseWorkerCorpusBacklogDashboardPayload } from '@/lib/program/contracts';
import {
  parseCorpusRunReport,
  parseDocumentRegistryState,
  parseDurableWorkQueueState,
  parsePublishedDoctrineSnapshot,
  parseScientificQuestionRegistryState,
} from '../../../scripts/adaptive-knowledge/contracts';

const DEFAULT_ROOT_DIR = path.join(process.cwd(), '.planning', 'knowledge', 'adaptive-coaching');

type Input = { knowledgeRootDir?: string; now?: Date };

async function readJsonFile<T>(filePath: string, parser: (input: unknown) => T, fallback: T): Promise<T> {
  try {
    const raw = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
    return parser(raw);
  } catch (error) {
    const errno = (error as NodeJS.ErrnoException).code;
    if (errno === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

async function readLatestRunReport(knowledgeRootDir: string) {
  const activePath = path.join(knowledgeRootDir, 'active.json');
  try {
    const active = JSON.parse(await readFile(activePath, 'utf8')) as { snapshotDir?: string };
    if (!active.snapshotDir) return null;
    return await readJsonFile(path.join(active.snapshotDir, 'run-report.json'), parseCorpusRunReport, null);
  } catch (error) {
    const errno = (error as NodeJS.ErrnoException).code;
    if (errno === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function getWorkerCorpusBacklog(input: Input = {}): Promise<WorkerCorpusBacklogDashboardPayload> {
  const knowledgeRootDir = input.knowledgeRootDir ?? DEFAULT_ROOT_DIR;
  const now = input.now ?? new Date();

  const [queueState, documentState, questionState, doctrineState, latestRunReport] = await Promise.all([
    readJsonFile(
      path.join(knowledgeRootDir, 'registry', 'work-queues.json'),
      parseDurableWorkQueueState,
      parseDurableWorkQueueState({ version: 'v1', generatedAt: now.toISOString(), items: [] }),
    ),
    readJsonFile(
      path.join(knowledgeRootDir, 'registry', 'document-library.json'),
      parseDocumentRegistryState,
      parseDocumentRegistryState({ version: 'v1', generatedAt: now.toISOString(), items: [] }),
    ),
    readJsonFile(
      path.join(knowledgeRootDir, 'registry', 'scientific-questions.json'),
      parseScientificQuestionRegistryState,
      parseScientificQuestionRegistryState({ version: 'v1', generatedAt: now.toISOString(), items: [] }),
    ),
    readJsonFile(
      path.join(knowledgeRootDir, 'registry', 'published-doctrine.json'),
      parsePublishedDoctrineSnapshot,
      parsePublishedDoctrineSnapshot({ version: 'v1', generatedAt: now.toISOString(), principles: [] }),
    ),
    readLatestRunReport(knowledgeRootDir),
  ]);

  const queueHealth = {
    ready: queueState.items.filter((item) => item.status === 'pending').length,
    blocked: queueState.items.filter((item) => item.status === 'blocked').length,
    inProgress: queueState.items.filter((item) => item.status === 'running').length,
  };

  const itemsByKind = {
    'discover-front-page': queueState.items.filter((item) => item.queueName === 'collection').length,
    'extract-study-card': documentState.items.filter((item) => item.status !== 'extracted' && item.status !== 'linked').length,
    'publish-doctrine': Math.max(
      0,
      questionState.items.filter((item) => item.publicationStatus === 'candidate').length - doctrineState.principles.length,
    ),
  } as const;

  const publishStage = latestRunReport?.stageReports.find((stage) => stage.stage === 'publish');
  const noProgressReasons = latestRunReport?.productivity?.noProgressReasons ?? (
    publishStage?.message?.startsWith('blocked:') ? [publishStage.message.replace(/^blocked:/, '')] : []
  );

  return parseWorkerCorpusBacklogDashboardPayload({
    generatedAt: now.toISOString(),
    queueHealth,
    itemsByKind,
    noProgressReasons,
  });
}
