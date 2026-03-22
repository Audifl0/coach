import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { WorkerCorpusSupervisionResponse } from '@/lib/program/contracts';
import { parseWorkerCorpusSupervisionResponse } from '@/lib/program/contracts';
import {
  parseDocumentRegistryState,
  parseDoctrineRevisionHistory,
  parsePublishedDoctrineSnapshot,
  parseQuestionSynthesisDossier,
  parseScientificQuestionRegistryState,
  parseDurableWorkQueueState,
  type DocumentRegistryRecord,
  type DoctrineRevisionEntry,
  type PublishedDoctrinePrinciple,
  type QuestionSynthesisDossier,
  type ScientificQuestion,
  type DurableWorkQueueItem,
} from '../../../scripts/adaptive-knowledge/contracts';

const DEFAULT_ROOT_DIR = path.join(process.cwd(), '.planning', 'knowledge', 'adaptive-coaching');

type WorkerCorpusSupervisionInput = {
  knowledgeRootDir?: string;
  now?: Date;
};

async function readJsonFile<T>(filePath: string, parser: (input: unknown) => T, fallback: T): Promise<T> {
  try {
    const raw = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
    return parser(raw);
  } catch {
    return fallback;
  }
}

async function readQuestionDossiers(knowledgeRootDir: string): Promise<QuestionSynthesisDossier[]> {
  const filePath = path.join(knowledgeRootDir, 'registry', 'question-synthesis-dossiers.json');
  try {
    const raw = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .map((item) => {
        try {
          return parseQuestionSynthesisDossier(item);
        } catch {
          return null;
        }
      })
      .filter((item): item is QuestionSynthesisDossier => item !== null);
  } catch {
    return [];
  }
}

function countByStatus<T extends string>(values: readonly T[]): Record<T, number> {
  return values.reduce(
    (acc, value) => {
      acc[value] += 1;
      return acc;
    },
    Object.fromEntries([...new Set(values)].map((value) => [value, 0])) as Record<T, number>,
  );
}

function buildWorkflow(items: readonly DurableWorkQueueItem[]) {
  const statuses = {
    pending: 0,
    running: 0,
    blocked: 0,
    completed: 0,
    failed: 0,
  };

  for (const item of items) {
    statuses[item.status] += 1;
  }

  const queueNames = [...new Set(items.map((item) => item.queueName))].sort();
  const queues = queueNames.map((queueName) => {
    const queueItems = items.filter((item) => item.queueName === queueName);
    return {
      queueName,
      total: queueItems.length,
      pending: queueItems.filter((item) => item.status === 'pending').length,
      running: queueItems.filter((item) => item.status === 'running').length,
      blocked: queueItems.filter((item) => item.status === 'blocked').length,
      completed: queueItems.filter((item) => item.status === 'completed').length,
      failed: queueItems.filter((item) => item.status === 'failed').length,
    };
  });

  return {
    queueDepth: items.length,
    blockedItems: statuses.blocked,
    byStatus: statuses,
    queues,
  };
}

function buildDocuments(items: readonly DocumentRegistryRecord[]) {
  const byState = {
    discovered: 0,
    'metadata-ready': 0,
    'abstract-ready': 0,
    'full-text-ready': 0,
    extractible: 0,
    extracted: 0,
    linked: 0,
  };

  for (const item of items) {
    byState[item.status] += 1;
  }

  return {
    total: items.length,
    byState,
  };
}

function buildQuestions(questions: readonly ScientificQuestion[], dossiers: readonly QuestionSynthesisDossier[]) {
  const byCoverage = {
    empty: 0,
    partial: 0,
    developing: 0,
    mature: 0,
    blocked: 0,
  };
  const byPublication = {
    'not-ready': 0,
    candidate: 0,
    published: 0,
    reopened: 0,
  };

  let contradictionCount = 0;
  let blockingContradictionCount = 0;

  const dossierByQuestionId = new Map(dossiers.map((dossier) => [dossier.questionId, dossier]));
  const notableQuestions = questions
    .map((question) => {
      byCoverage[question.coverageStatus] += 1;
      byPublication[question.publicationStatus] += 1;
      const dossier = dossierByQuestionId.get(question.questionId) ?? null;
      const contradictions = dossier?.contradictions ?? [];
      const blocking = contradictions.filter((item) => item.severity === 'blocking' && item.resolved === false).length;
      contradictionCount += contradictions.length;
      blockingContradictionCount += blocking;

      return {
        questionId: question.questionId,
        label: question.labelFr,
        coverageStatus: question.coverageStatus,
        publicationStatus: question.publicationStatus,
        publicationReadiness: dossier?.publicationReadiness ?? null,
        contradictionCount: contradictions.length,
        blockingContradictionCount: blocking,
        linkedStudyCount: dossier?.linkedStudyIds.length ?? question.linkedStudyIds.length,
        updatedAt: dossier?.generatedAt ?? question.updatedAt ?? null,
      };
    })
    .sort((left, right) => {
      if (right.blockingContradictionCount !== left.blockingContradictionCount) {
        return right.blockingContradictionCount - left.blockingContradictionCount;
      }
      if (right.contradictionCount !== left.contradictionCount) {
        return right.contradictionCount - left.contradictionCount;
      }
      return (Date.parse(right.updatedAt ?? '') || 0) - (Date.parse(left.updatedAt ?? '') || 0);
    })
    .slice(0, 5);

  return {
    total: questions.length,
    contradictionCount,
    blockingContradictionCount,
    byCoverage,
    byPublication,
    notableQuestions,
  };
}

function buildDoctrine(principles: readonly PublishedDoctrinePrinciple[], revisions: readonly DoctrineRevisionEntry[]) {
  return {
    activePrinciples: principles.filter((item) => item.revisionStatus === 'active').length,
    reopenedPrinciples: principles.filter((item) => item.revisionStatus === 'reopened').length,
    supersededPrinciples: principles.filter((item) => item.revisionStatus === 'superseded').length,
    recentRevisions: [...revisions]
      .sort((left, right) => Date.parse(right.changedAt) - Date.parse(left.changedAt))
      .slice(0, 5),
  };
}

function buildRecentResearchJournal(input: {
  workItems: readonly DurableWorkQueueItem[];
  questions: readonly ScientificQuestion[];
  dossiers: readonly QuestionSynthesisDossier[];
  revisions: readonly DoctrineRevisionEntry[];
}) {
  const entries = [
    ...input.workItems.map((item) => ({
      kind: 'workflow',
      id: item.id,
      title: `${item.queueName}:${item.logicalKey}`,
      at: item.updatedAt,
      detail: `${item.status}${item.blockedReason ? ` · ${item.blockedReason}` : ''}`,
    })),
    ...input.questions.map((question) => ({
      kind: 'question',
      id: question.questionId,
      title: question.labelFr,
      at: question.updatedAt,
      detail: `${question.coverageStatus} · ${question.publicationStatus}`,
    })),
    ...input.dossiers.map((dossier) => ({
      kind: 'dossier',
      id: dossier.questionId,
      title: dossier.questionId,
      at: dossier.generatedAt,
      detail: `${dossier.publicationReadiness} · contradictions ${dossier.contradictions.length}`,
    })),
    ...input.revisions.map((revision) => ({
      kind: 'doctrine',
      id: revision.revisionId,
      title: revision.principleId,
      at: revision.changedAt,
      detail: `${revision.changeType} · ${revision.reason}`,
    })),
  ];

  return entries
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
    .slice(0, 8);
}

export async function loadWorkerCorpusSupervision(
  input: WorkerCorpusSupervisionInput = {},
): Promise<WorkerCorpusSupervisionResponse> {
  const knowledgeRootDir = input.knowledgeRootDir ?? DEFAULT_ROOT_DIR;
  const now = input.now ?? new Date();

  const [workQueueState, documentState, scientificQuestions, questionDossiers, doctrineSnapshot, doctrineHistory] = await Promise.all([
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
    readQuestionDossiers(knowledgeRootDir),
    readJsonFile(
      path.join(knowledgeRootDir, 'registry', 'published-doctrine.json'),
      parsePublishedDoctrineSnapshot,
      parsePublishedDoctrineSnapshot({ version: 'v1', generatedAt: now.toISOString(), principles: [] }),
    ),
    readJsonFile(
      path.join(knowledgeRootDir, 'registry', 'doctrine-revisions.json'),
      parseDoctrineRevisionHistory,
      parseDoctrineRevisionHistory({ version: 'v1', generatedAt: now.toISOString(), entries: [] }),
    ),
  ]);

  return parseWorkerCorpusSupervisionResponse({
    generatedAt: now.toISOString(),
    workflow: buildWorkflow(workQueueState.items),
    documents: buildDocuments(documentState.items),
    questions: buildQuestions(scientificQuestions.items, questionDossiers),
    doctrine: buildDoctrine(doctrineSnapshot.principles, doctrineHistory.entries),
    recentResearchJournal: buildRecentResearchJournal({
      workItems: workQueueState.items,
      questions: scientificQuestions.items,
      dossiers: questionDossiers,
      revisions: doctrineHistory.entries,
    }),
  });
}
