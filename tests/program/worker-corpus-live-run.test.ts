import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadWorkerCorpusLiveRun } from '../../src/server/services/worker-corpus-live-run';

async function writeJson(filePath: string, payload: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

test('live run returns inactive projection when runtime artifacts are absent', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'worker-corpus-live-run-empty-'));

  const liveRun = await loadWorkerCorpusLiveRun({
    knowledgeRootDir: rootDir,
    now: new Date('2026-03-11T10:03:00.000Z'),
  });

  assert.deepEqual(liveRun, {
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
});

test('live run maps pipeline starting worker state to starting status', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'worker-corpus-live-run-starting-'));

  await writeJson(path.join(rootDir, 'worker-state.json'), {
    runId: 'run-starting',
    mode: 'bootstrap',
    status: 'started',
    startedAt: '2026-03-11T10:00:00.000Z',
    heartbeatAt: '2026-03-11T10:00:05.000Z',
    leaseExpiresAt: '2026-03-11T10:05:05.000Z',
    message: 'pipeline-starting',
  });

  const liveRun = await loadWorkerCorpusLiveRun({
    knowledgeRootDir: rootDir,
    now: new Date('2026-03-11T10:00:10.000Z'),
  });

  assert.equal(liveRun.active, true);
  assert.equal(liveRun.runId, 'run-starting');
  assert.equal(liveRun.mode, 'bootstrap');
  assert.equal(liveRun.status, 'starting');
  assert.equal(liveRun.currentStage, 'pipeline-starting');
  assert.equal(liveRun.currentWorkItemLabel, null);
  assert.equal(liveRun.heartbeatAgeSec, 5);
  assert.equal(liveRun.liveMessage, 'Démarrage du pipeline');
});

test('live run marks stale heartbeat honestly', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'worker-corpus-live-run-stale-'));

  await writeJson(path.join(rootDir, 'worker-state.json'), {
    runId: 'run-stale',
    mode: 'refresh',
    status: 'heartbeat',
    startedAt: '2026-03-11T10:00:00.000Z',
    heartbeatAt: '2026-03-11T10:01:00.000Z',
    leaseExpiresAt: '2026-03-11T10:06:00.000Z',
    message: 'discovering new evidence',
  });

  const liveRun = await loadWorkerCorpusLiveRun({
    knowledgeRootDir: rootDir,
    now: new Date('2026-03-11T10:12:00.000Z'),
  });

  assert.equal(liveRun.active, true);
  assert.equal(liveRun.status, 'stale');
  assert.equal(liveRun.currentStage, 'discover');
  assert.equal(liveRun.heartbeatAgeSec, 660);
  assert.equal(liveRun.liveMessage, 'Heartbeat ancien détecté');
});

test('live run infers running queue item label and progress from runtime registries', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'worker-corpus-live-run-running-'));

  await writeJson(path.join(rootDir, 'worker-state.json'), {
    runId: 'run-live',
    mode: 'bootstrap',
    status: 'heartbeat',
    startedAt: '2026-03-11T10:00:00.000Z',
    heartbeatAt: '2026-03-11T10:01:00.000Z',
    leaseExpiresAt: '2026-03-11T10:06:00.000Z',
    message: 'discovering new evidence',
  });
  await writeJson(path.join(rootDir, 'bootstrap-state.json'), {
    schemaVersion: 'v1',
    campaignId: 'bootstrap-2026-03-11',
    status: 'running',
    mode: 'bootstrap',
    startedAt: '2026-03-11T08:00:00.000Z',
    updatedAt: '2026-03-11T10:01:00.000Z',
    lastRunId: 'run-live',
    activeJobId: 'pubmed:progression-load',
    backlog: {
      pending: 4,
      running: 1,
      blocked: 1,
      completed: 3,
      exhausted: 2,
    },
    progress: {
      discoveredQueryFamilies: 12,
      canonicalRecordCount: 48,
      extractionBacklogCount: 7,
      publicationCandidateCount: 3,
    },
  });
  await writeJson(path.join(rootDir, 'registry', 'work-queues.json'), {
    version: 'v1',
    generatedAt: '2026-03-11T10:01:00.000Z',
    items: [
      {
        id: 'pubmed:progression-load',
        queueName: 'collection',
        logicalKey: 'progression-load',
        status: 'running',
        payload: {
          source: 'pubmed',
          topicLabel: 'Progression',
          subtopicLabel: 'Charge progressive',
        },
        createdAt: '2026-03-11T09:59:00.000Z',
        updatedAt: '2026-03-11T10:01:00.000Z',
        claimedBy: 'run-live',
        claimedAt: '2026-03-11T10:00:30.000Z',
      },
      {
        id: 'crossref:weekly-split',
        queueName: 'collection',
        logicalKey: 'weekly-split',
        status: 'pending',
        payload: {},
        createdAt: '2026-03-11T09:58:00.000Z',
        updatedAt: '2026-03-11T09:58:00.000Z',
      },
    ],
  });
  await writeJson(path.join(rootDir, 'registry', 'document-library.json'), {
    version: 'v1',
    generatedAt: '2026-03-11T10:01:00.000Z',
    items: Array.from({ length: 48 }, (_, index) => ({
      documentId: `doc-${index + 1}`,
      canonicalId: null,
      recordId: `record-${index + 1}`,
      title: `Document ${index + 1}`,
      sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
      sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${index + 1}`,
      status: 'metadata-ready',
      topicKeys: ['progression'],
      createdAt: '2026-03-11T09:00:00.000Z',
      updatedAt: '2026-03-11T10:00:00.000Z',
    })),
  });
  await writeJson(path.join(rootDir, 'registry', 'scientific-questions.json'), {
    version: 'v1',
    generatedAt: '2026-03-11T10:01:00.000Z',
    items: Array.from({ length: 3 }, (_, index) => ({
      questionId: `question-${index + 1}`,
      labelFr: `Question ${index + 1}`,
      promptFr: `Prompt ${index + 1}`,
      topicKeys: ['progression'],
      inclusionCriteria: [],
      exclusionCriteria: [],
      linkedStudyIds: [],
      coverageStatus: 'partial',
      publicationStatus: 'candidate',
      updatedAt: '2026-03-11T10:00:00.000Z',
    })),
  });
  await writeJson(path.join(rootDir, 'registry', 'published-doctrine.json'), {
    version: 'v1',
    generatedAt: '2026-03-11T10:01:00.000Z',
    principles: [
      {
        principleId: 'principle-1',
        statementFr: 'Principe 1',
        conditionsFr: 'Conditions',
        limitsFr: 'Limites',
        confidenceLevel: 'high',
        questionIds: ['question-1'],
        studyIds: ['study-1'],
        revisionStatus: 'active',
        publishedAt: '2026-03-11T09:30:00.000Z',
      },
    ],
  });

  const liveRun = await loadWorkerCorpusLiveRun({
    knowledgeRootDir: rootDir,
    now: new Date('2026-03-11T10:03:00.000Z'),
  });

  assert.equal(liveRun.active, true);
  assert.equal(liveRun.status, 'running');
  assert.equal(liveRun.currentStage, 'discover');
  assert.equal(liveRun.currentWorkItemLabel, 'PubMed · Charge progressive');
  assert.equal(liveRun.heartbeatAgeSec, 120);
  assert.deepEqual(liveRun.progress, {
    queue: 2,
    documents: 48,
    questions: 3,
    doctrine: 1,
  });
  assert.equal(liveRun.liveMessage, 'Discovering new evidence');
});

test('live run falls back to honest ambiguous messaging when state lacks precise work item details', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'worker-corpus-live-run-ambiguous-'));

  await writeJson(path.join(rootDir, 'worker-state.json'), {
    runId: 'run-ambiguous',
    mode: 'check',
    status: 'heartbeat',
    startedAt: '2026-03-11T10:00:00.000Z',
    heartbeatAt: '2026-03-11T10:01:30.000Z',
    leaseExpiresAt: '2026-03-11T10:06:30.000Z',
    message: 'working',
  });
  await writeJson(path.join(rootDir, 'registry', 'work-queues.json'), {
    version: 'v1',
    generatedAt: '2026-03-11T10:01:30.000Z',
    items: [],
  });
  await writeJson(path.join(rootDir, 'registry', 'document-library.json'), {
    version: 'v1',
    generatedAt: '2026-03-11T10:01:30.000Z',
    items: [],
  });
  await writeJson(path.join(rootDir, 'registry', 'scientific-questions.json'), {
    version: 'v1',
    generatedAt: '2026-03-11T10:01:30.000Z',
    items: [],
  });
  await writeJson(path.join(rootDir, 'registry', 'published-doctrine.json'), {
    version: 'v1',
    generatedAt: '2026-03-11T10:01:30.000Z',
    principles: [],
  });

  const liveRun = await loadWorkerCorpusLiveRun({
    knowledgeRootDir: rootDir,
    now: new Date('2026-03-11T10:03:00.000Z'),
  });

  assert.equal(liveRun.active, true);
  assert.equal(liveRun.status, 'running');
  assert.equal(liveRun.currentStage, null);
  assert.equal(liveRun.currentWorkItemLabel, null);
  assert.equal(liveRun.liveMessage, 'Analyse en cours');
  assert.deepEqual(liveRun.progress, {
    queue: 0,
    documents: 0,
    questions: 0,
    doctrine: 0,
  });
});
