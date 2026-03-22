import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadWorkerCorpusSupervision } from '../../src/server/services/worker-corpus-supervision';

async function writeJson(filePath: string, payload: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

async function buildSupervisionFixture() {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'worker-corpus-supervision-'));
  const generatedAt = '2026-03-22T12:00:00.000Z';

  await writeJson(path.join(rootDir, 'registry', 'work-queues.json'), {
    version: 'v1',
    generatedAt,
    items: [
      {
        id: 'wq-1',
        queueName: 'scientific-questions',
        logicalKey: 'q-1',
        status: 'pending',
        payload: { questionId: 'q-volume' },
        createdAt: '2026-03-22T10:00:00.000Z',
        updatedAt: '2026-03-22T10:00:00.000Z',
      },
      {
        id: 'wq-2',
        queueName: 'scientific-questions',
        logicalKey: 'q-2',
        status: 'running',
        payload: { questionId: 'q-rest' },
        createdAt: '2026-03-22T10:05:00.000Z',
        updatedAt: '2026-03-22T10:10:00.000Z',
        claimedBy: 'worker-1',
        claimedAt: '2026-03-22T10:06:00.000Z',
      },
      {
        id: 'wq-3',
        queueName: 'scientific-questions',
        logicalKey: 'q-3',
        status: 'blocked',
        payload: { questionId: 'q-pain' },
        createdAt: '2026-03-22T10:15:00.000Z',
        updatedAt: '2026-03-22T10:20:00.000Z',
        blockedReason: 'waiting-for-fulltext',
      },
      {
        id: 'wq-4',
        queueName: 'doctrine',
        logicalKey: 'principle-1',
        status: 'completed',
        payload: { principleId: 'p-1' },
        createdAt: '2026-03-22T10:30:00.000Z',
        updatedAt: '2026-03-22T10:40:00.000Z',
      },
    ],
  });

  await writeJson(path.join(rootDir, 'registry', 'document-library.json'), {
    version: 'v1',
    generatedAt,
    items: [
      {
        documentId: 'doc-1',
        canonicalId: 'canon-1',
        recordId: 'record-1',
        title: 'Document one',
        sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
        sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/1',
        status: 'discovered',
        topicKeys: ['volume'],
        createdAt: generatedAt,
        updatedAt: generatedAt,
      },
      {
        documentId: 'doc-2',
        canonicalId: 'canon-2',
        recordId: 'record-2',
        title: 'Document two',
        sourceDomain: 'doi.org',
        sourceUrl: 'https://doi.org/2',
        status: 'extractible',
        topicKeys: ['rest'],
        createdAt: generatedAt,
        updatedAt: generatedAt,
      },
      {
        documentId: 'doc-3',
        canonicalId: 'canon-3',
        recordId: 'record-3',
        title: 'Document three',
        sourceDomain: 'doi.org',
        sourceUrl: 'https://doi.org/3',
        status: 'linked',
        topicKeys: ['pain'],
        createdAt: generatedAt,
        updatedAt: generatedAt,
      },
      {
        documentId: 'doc-4',
        canonicalId: 'canon-4',
        recordId: 'record-4',
        title: 'Document four',
        sourceDomain: 'doi.org',
        sourceUrl: 'https://doi.org/4',
        status: 'linked',
        topicKeys: ['pain'],
        createdAt: generatedAt,
        updatedAt: generatedAt,
      },
    ],
  });

  await writeJson(path.join(rootDir, 'registry', 'scientific-questions.json'), {
    version: 'v1',
    generatedAt,
    items: [
      {
        questionId: 'q-volume',
        labelFr: 'Volume hebdomadaire',
        promptFr: 'Quel volume ?',
        topicKeys: ['volume'],
        inclusionCriteria: [],
        exclusionCriteria: [],
        linkedStudyIds: ['study-1', 'study-2', 'study-3'],
        coverageStatus: 'mature',
        publicationStatus: 'published',
        updatedAt: '2026-03-22T11:00:00.000Z',
      },
      {
        questionId: 'q-rest',
        labelFr: 'Temps de repos',
        promptFr: 'Quel repos ?',
        topicKeys: ['rest'],
        inclusionCriteria: [],
        exclusionCriteria: [],
        linkedStudyIds: ['study-4', 'study-5'],
        coverageStatus: 'developing',
        publicationStatus: 'candidate',
        updatedAt: '2026-03-22T11:10:00.000Z',
      },
      {
        questionId: 'q-pain',
        labelFr: 'Douleur et charge',
        promptFr: 'Quelle adaptation ?',
        topicKeys: ['pain'],
        inclusionCriteria: [],
        exclusionCriteria: [],
        linkedStudyIds: ['study-6'],
        coverageStatus: 'blocked',
        publicationStatus: 'reopened',
        updatedAt: '2026-03-22T11:20:00.000Z',
      },
    ],
  });

  await writeJson(path.join(rootDir, 'registry', 'question-synthesis-dossiers.json'), [
    {
      questionId: 'q-volume',
      coverageStatus: 'mature',
      linkedStudyIds: ['study-1', 'study-2', 'study-3'],
      contradictions: [],
      summaryFr: 'Question mature.',
      confidenceLevel: 'high',
      publicationReadiness: 'ready',
      generatedAt: '2026-03-22T11:30:00.000Z',
    },
    {
      questionId: 'q-rest',
      coverageStatus: 'developing',
      linkedStudyIds: ['study-4', 'study-5'],
      contradictions: [
        {
          questionId: 'q-rest',
          studyIds: ['study-4', 'study-5'],
          reasonCode: 'outcome-direction-divergence',
          summaryFr: 'Contradiction notable.',
          severity: 'blocking',
          resolved: false,
        },
      ],
      summaryFr: 'Question candidate mais contradictoire.',
      confidenceLevel: 'moderate',
      publicationReadiness: 'blocked',
      generatedAt: '2026-03-22T11:40:00.000Z',
    },
    {
      questionId: 'q-pain',
      coverageStatus: 'blocked',
      linkedStudyIds: ['study-6'],
      contradictions: [],
      summaryFr: 'Question rouverte.',
      confidenceLevel: 'low',
      publicationReadiness: 'insufficient',
      generatedAt: '2026-03-22T11:50:00.000Z',
    },
  ]);

  await writeJson(path.join(rootDir, 'registry', 'published-doctrine.json'), {
    version: 'v1',
    generatedAt,
    principles: [
      {
        principleId: 'p-active',
        statementFr: 'Principe actif.',
        conditionsFr: 'Conditions.',
        limitsFr: 'Limites.',
        confidenceLevel: 'high',
        questionIds: ['q-volume'],
        studyIds: ['study-1', 'study-2', 'study-3'],
        revisionStatus: 'active',
        publishedAt: '2026-03-22T11:00:00.000Z',
      },
      {
        principleId: 'p-reopened',
        statementFr: 'Principe rouvert.',
        conditionsFr: 'Conditions.',
        limitsFr: 'Limites.',
        confidenceLevel: 'moderate',
        questionIds: ['q-pain'],
        studyIds: ['study-6'],
        revisionStatus: 'reopened',
        publishedAt: '2026-03-21T11:00:00.000Z',
      },
    ],
  });

  await writeJson(path.join(rootDir, 'registry', 'doctrine-revisions.json'), {
    version: 'v1',
    generatedAt,
    entries: [
      {
        revisionId: 'rev-1',
        principleId: 'p-active',
        changedAt: '2026-03-22T11:05:00.000Z',
        changeType: 'published',
        reason: 'Sufficient evidence.',
      },
      {
        revisionId: 'rev-2',
        principleId: 'p-reopened',
        changedAt: '2026-03-22T11:45:00.000Z',
        changeType: 'reopened',
        reason: 'New contradiction detected.',
      },
    ],
  });

  return rootDir;
}

test('supervision service summarizes queue depth and blocked items', async () => {
  const rootDir = await buildSupervisionFixture();

  const supervision = await loadWorkerCorpusSupervision({ knowledgeRootDir: rootDir });

  assert.equal(supervision.workflow.queueDepth, 4);
  assert.equal(supervision.workflow.blockedItems, 1);
  assert.equal(supervision.workflow.byStatus.pending, 1);
  assert.equal(supervision.workflow.byStatus.running, 1);
  assert.equal(supervision.workflow.byStatus.completed, 1);
});

test('supervision service summarizes document-state distribution', async () => {
  const rootDir = await buildSupervisionFixture();

  const supervision = await loadWorkerCorpusSupervision({ knowledgeRootDir: rootDir });

  assert.equal(supervision.documents.total, 4);
  assert.equal(supervision.documents.byState.discovered, 1);
  assert.equal(supervision.documents.byState.extractible, 1);
  assert.equal(supervision.documents.byState.linked, 2);
});

test('supervision service summarizes scientific question maturity and contradiction counts', async () => {
  const rootDir = await buildSupervisionFixture();

  const supervision = await loadWorkerCorpusSupervision({ knowledgeRootDir: rootDir });

  assert.equal(supervision.questions.total, 3);
  assert.equal(supervision.questions.byCoverage.mature, 1);
  assert.equal(supervision.questions.byCoverage.developing, 1);
  assert.equal(supervision.questions.byCoverage.blocked, 1);
  assert.equal(supervision.questions.byPublication.published, 1);
  assert.equal(supervision.questions.byPublication.candidate, 1);
  assert.equal(supervision.questions.byPublication.reopened, 1);
  assert.equal(supervision.questions.contradictionCount, 1);
  assert.equal(supervision.questions.blockingContradictionCount, 1);
  assert.equal(supervision.questions.notableQuestions[0]?.questionId, 'q-rest');
});

test('supervision service summarizes published doctrine revisions', async () => {
  const rootDir = await buildSupervisionFixture();

  const supervision = await loadWorkerCorpusSupervision({ knowledgeRootDir: rootDir });

  assert.equal(supervision.doctrine.activePrinciples, 1);
  assert.equal(supervision.doctrine.reopenedPrinciples, 1);
  assert.equal(supervision.doctrine.recentRevisions.length, 2);
  assert.equal(supervision.doctrine.recentRevisions[0]?.changeType, 'reopened');
  assert.equal(supervision.recentResearchJournal.length > 0, true);
  assert.equal(supervision.recentResearchJournal[0]?.kind.length > 0, true);
});
