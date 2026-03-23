import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getWorkerCorpusBacklog } from '../../src/server/services/worker-corpus-backlog';

async function writeJson(filePath: string, payload: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

test('backlog service projects queue health, item classes, and no-progress reasons', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'worker-corpus-backlog-'));
  const snapshotDir = path.join(rootDir, 'snapshots', 'run-ready', 'validated');

  await writeJson(path.join(rootDir, 'registry', 'work-queues.json'), {
    version: 'v1',
    generatedAt: '2026-03-23T12:00:00.000Z',
    items: [
      { id: 'q1', queueName: 'collection', logicalKey: 'a', status: 'pending', payload: {}, createdAt: '2026-03-23T11:00:00.000Z', updatedAt: '2026-03-23T11:00:00.000Z' },
      { id: 'q2', queueName: 'collection', logicalKey: 'b', status: 'running', payload: {}, createdAt: '2026-03-23T11:00:00.000Z', updatedAt: '2026-03-23T11:00:00.000Z', claimedBy: 'run-live', claimedAt: '2026-03-23T11:10:00.000Z' },
      { id: 'q3', queueName: 'collection', logicalKey: 'c', status: 'blocked', payload: {}, createdAt: '2026-03-23T11:00:00.000Z', updatedAt: '2026-03-23T11:00:00.000Z', blockedReason: 'lease' },
    ],
  });
  await writeJson(path.join(rootDir, 'registry', 'document-library.json'), {
    version: 'v1',
    generatedAt: '2026-03-23T12:00:00.000Z',
    items: [
      { documentId: 'doc-1', canonicalId: null, recordId: 'rec-1', title: 'A', sourceDomain: 'pubmed.ncbi.nlm.nih.gov', sourceUrl: 'https://example.com/1', status: 'metadata-ready', topicKeys: ['progression'], createdAt: '2026-03-23T11:00:00.000Z', updatedAt: '2026-03-23T11:00:00.000Z' },
      { documentId: 'doc-2', canonicalId: null, recordId: 'rec-2', title: 'B', sourceDomain: 'pubmed.ncbi.nlm.nih.gov', sourceUrl: 'https://example.com/2', status: 'extracted', topicKeys: ['progression'], createdAt: '2026-03-23T11:00:00.000Z', updatedAt: '2026-03-23T11:00:00.000Z' },
    ],
  });
  await writeJson(path.join(rootDir, 'registry', 'scientific-questions.json'), {
    version: 'v1',
    generatedAt: '2026-03-23T12:00:00.000Z',
    items: [
      { questionId: 'question-1', labelFr: 'Q1', promptFr: 'P1', topicKeys: ['progression'], inclusionCriteria: [], exclusionCriteria: [], linkedStudyIds: [], coverageStatus: 'partial', publicationStatus: 'candidate', updatedAt: '2026-03-23T11:00:00.000Z' },
      { questionId: 'question-2', labelFr: 'Q2', promptFr: 'P2', topicKeys: ['progression'], inclusionCriteria: [], exclusionCriteria: [], linkedStudyIds: [], coverageStatus: 'mature', publicationStatus: 'published', updatedAt: '2026-03-23T11:00:00.000Z' },
    ],
  });
  await writeJson(path.join(rootDir, 'registry', 'published-doctrine.json'), {
    version: 'v1',
    generatedAt: '2026-03-23T12:00:00.000Z',
    principles: [
      { principleId: 'principle-1', statementFr: 'Principe', conditionsFr: 'Cond', limitsFr: 'Lim', confidenceLevel: 'high', questionIds: ['question-2'], studyIds: ['study-2'], revisionStatus: 'active', publishedAt: '2026-03-23T11:00:00.000Z' },
    ],
  });
  await writeJson(path.join(rootDir, 'active.json'), { snapshotId: 'run-ready', snapshotDir, promotedAt: '2026-03-23T12:00:00.000Z' });
  await writeJson(path.join(snapshotDir, 'run-report.json'), {
    runId: 'run-ready',
    mode: 'refresh',
    startedAt: '2026-03-23T11:30:00.000Z',
    completedAt: '2026-03-23T12:00:00.000Z',
    snapshotId: 'run-ready',
    stageReports: [
      { stage: 'discover', status: 'succeeded', message: 'discovered=0' },
      { stage: 'ingest', status: 'succeeded', message: 'normalized=0' },
      { stage: 'fulltext', status: 'succeeded', message: 'fulltext=0' },
      { stage: 'extract-study-cards', status: 'succeeded', message: 'study_cards=1' },
      { stage: 'thematic-synthesis', status: 'succeeded', message: 'skipped:no_study_cards' },
      { stage: 'synthesize', status: 'succeeded', message: 'principles=0' },
      { stage: 'validate', status: 'succeeded', message: 'contracts=ok' },
      { stage: 'publish', status: 'succeeded', message: 'blocked:no_documents_ready,questions_undercovered' },
    ],
    productivity: {
      executedWorkItems: 2,
      usefulDelta: { documents: 1, studyCards: 1, contradictions: 0, doctrine: 0 },
      noProgressReasons: ['no_documents_ready', 'questions_undercovered'],
      topBacklogShortages: ['extract-study-card'],
      currentItemKind: null,
      lastCompletedItemKind: 'extract-study-card',
    },
  });

  const backlog = await getWorkerCorpusBacklog({ knowledgeRootDir: rootDir, now: new Date('2026-03-23T12:05:00.000Z') });

  assert.equal(backlog.queueHealth.ready, 1);
  assert.equal(backlog.queueHealth.blocked, 1);
  assert.equal(backlog.queueHealth.inProgress, 1);
  assert.equal(backlog.itemsByKind['discover-front-page'], 3);
  assert.equal(backlog.itemsByKind['extract-study-card'], 1);
  assert.equal(backlog.itemsByKind['publish-doctrine'], 0);
  assert.deepEqual(backlog.noProgressReasons, ['no_documents_ready', 'questions_undercovered']);
});
