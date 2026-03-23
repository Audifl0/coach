import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { WorkerCorpusLiveRun } from '@/lib/program/contracts';
import { workerCorpusLiveRunSchema } from '@/lib/program/contracts';
import {
  parseDocumentRegistryState,
  parsePublishedDoctrineSnapshot,
  parseScientificQuestionRegistryState,
  parseDurableWorkQueueState,
  type AdaptiveKnowledgeBootstrapCampaignState,
  type DurableWorkQueueItem,
} from '../../../scripts/adaptive-knowledge/contracts';
import {
  readAdaptiveKnowledgeBootstrapCampaignState,
  readAdaptiveKnowledgeWorkerState,
} from '../../../scripts/adaptive-knowledge/worker-state';

const DEFAULT_ROOT_DIR = path.join(process.cwd(), '.planning', 'knowledge', 'adaptive-coaching');
const HEARTBEAT_STALE_SEC = 5 * 60;

type WorkerCorpusLiveRunInput = {
  knowledgeRootDir?: string;
  now?: Date;
};

type WorkQueueState = ReturnType<typeof parseDurableWorkQueueState>;
type DocumentRegistryState = ReturnType<typeof parseDocumentRegistryState>;
type ScientificQuestionRegistryState = ReturnType<typeof parseScientificQuestionRegistryState>;
type PublishedDoctrineSnapshot = ReturnType<typeof parsePublishedDoctrineSnapshot>;

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

function emptyLiveRun(): WorkerCorpusLiveRun {
  return workerCorpusLiveRunSchema.parse({
    active: false,
    runId: null,
    mode: null,
    status: 'idle',
    currentStage: null,
    currentWorkItemKind: null,
    lastCompletedItemKind: null,
    currentWorkItemLabel: null,
    lastHeartbeatAt: null,
    heartbeatAgeSec: null,
    startedAt: null,
    liveMessage: null,
    progress: {
      queue: 0,
      documents: 0,
      questions: 0,
      doctrine: 0,
    },
  });
}

function computeHeartbeatAgeSec(now: Date, heartbeatAt: string): number | null {
  const heartbeatMs = Date.parse(heartbeatAt);
  if (Number.isNaN(heartbeatMs)) {
    return null;
  }

  return Math.max(0, Math.floor((now.getTime() - heartbeatMs) / 1000));
}

function deriveStatus(input: {
  workerStatus: string;
  message: string | undefined;
  heartbeatAgeSec: number | null;
}): WorkerCorpusLiveRun['status'] {
  if (input.workerStatus === 'failed') {
    return 'failed';
  }
  if (input.workerStatus === 'completed' || input.workerStatus === 'blocked-by-lease') {
    return 'completed';
  }
  if (input.workerStatus === 'stale' || (input.heartbeatAgeSec !== null && input.heartbeatAgeSec > HEARTBEAT_STALE_SEC)) {
    return 'stale';
  }
  if (input.workerStatus === 'started' || input.message === 'pipeline-starting') {
    return 'starting';
  }
  return 'running';
}

function deriveCurrentStage(message: string | undefined): string | null {
  if (!message) {
    return null;
  }

  if (message === 'pipeline-starting') {
    return 'pipeline-starting';
  }

  const normalized = message.toLowerCase();
  if (normalized.includes('discover')) {
    return 'discover';
  }
  if (normalized.includes('ingest')) {
    return 'ingest';
  }
  if (normalized.includes('full-text') || normalized.includes('fulltext')) {
    return 'fulltext';
  }
  if (normalized.includes('extract')) {
    return 'extract-study-cards';
  }
  if (normalized.includes('synth')) {
    return 'synthesize';
  }
  if (normalized.includes('validat')) {
    return 'validate';
  }
  if (normalized.includes('publish')) {
    return 'publish';
  }

  return null;
}

function titleCaseSource(source: string | undefined): string | null {
  if (!source) {
    return null;
  }

  const normalized = source.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.toLowerCase() === 'pubmed') {
    return 'PubMed';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function resolveQueueItem(
  workQueueState: WorkQueueState,
  workerRunId: string,
  bootstrapState: AdaptiveKnowledgeBootstrapCampaignState | null,
): DurableWorkQueueItem | null {
  const claimed = workQueueState.items.find((item) => item.status === 'running' && item.claimedBy === workerRunId);
  if (claimed) {
    return claimed;
  }

  if (bootstrapState?.activeJobId) {
    return workQueueState.items.find((item) => item.id === bootstrapState.activeJobId) ?? null;
  }

  return workQueueState.items.find((item) => item.status === 'running') ?? null;
}

function deriveCurrentWorkItemLabel(queueItem: DurableWorkQueueItem | null): string | null {
  if (!queueItem) {
    return null;
  }

  const payload = queueItem.payload as Record<string, unknown>;
  const source = titleCaseSource(typeof payload.source === 'string' ? payload.source : undefined);
  const subtopicLabel = typeof payload.subtopicLabel === 'string' ? payload.subtopicLabel.trim() : '';
  const logicalKey = queueItem.logicalKey.trim();
  const detail = subtopicLabel || logicalKey || queueItem.id;

  if (!detail) {
    return source;
  }

  if (source) {
    return `${source} · ${detail}`;
  }

  return detail;
}

function deriveLiveMessage(input: {
  status: WorkerCorpusLiveRun['status'];
  message: string | undefined;
  currentStage: string | null;
  queueItemLabel: string | null;
}): string | null {
  if (input.status === 'idle') {
    return null;
  }
  if (input.status === 'starting') {
    return 'Démarrage du pipeline';
  }
  if (input.status === 'stale') {
    return 'Heartbeat ancien détecté';
  }

  const raw = input.message?.trim();
  if (!raw || raw.toLowerCase() === 'working') {
    return input.currentStage || input.queueItemLabel ? 'Analyse en cours' : 'Analyse en cours';
  }

  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export async function loadWorkerCorpusLiveRun(
  input: WorkerCorpusLiveRunInput = {},
): Promise<WorkerCorpusLiveRun> {
  const knowledgeRootDir = input.knowledgeRootDir ?? DEFAULT_ROOT_DIR;
  const now = input.now ?? new Date();

  const [workerState, bootstrapState, workQueueState, documentState, scientificQuestionState, doctrineSnapshot] =
    await Promise.all([
      readAdaptiveKnowledgeWorkerState(knowledgeRootDir),
      readAdaptiveKnowledgeBootstrapCampaignState(knowledgeRootDir),
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
    ]);

  if (!workerState) {
    return emptyLiveRun();
  }

  const heartbeatAgeSec = computeHeartbeatAgeSec(now, workerState.heartbeatAt);
  const status = deriveStatus({
    workerStatus: workerState.status,
    message: workerState.message,
    heartbeatAgeSec,
  });
  const queueItem = resolveQueueItem(workQueueState, workerState.runId, bootstrapState);
  const currentStage = deriveCurrentStage(workerState.message);
  const currentWorkItemLabel = deriveCurrentWorkItemLabel(queueItem);
  const liveMessage = deriveLiveMessage({
    status,
    message: workerState.message,
    currentStage,
    queueItemLabel: currentWorkItemLabel,
  });

  return workerCorpusLiveRunSchema.parse({
    active: status !== 'idle' && status !== 'completed' && status !== 'failed',
    runId: workerState.runId,
    mode: workerState.mode,
    status,
    currentStage,
    currentWorkItemKind: workerState.currentItemKind ?? null,
    lastCompletedItemKind: workerState.lastCompletedItemKind ?? null,
    currentWorkItemLabel,
    lastHeartbeatAt: workerState.heartbeatAt,
    heartbeatAgeSec,
    startedAt: workerState.startedAt,
    liveMessage,
    progress: {
      queue: workQueueState.items.length,
      documents: documentState.items.length,
      questions: scientificQuestionState.items.length,
      doctrine: doctrineSnapshot.principles.length,
    },
  });
}
