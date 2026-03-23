import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAdaptiveKnowledgeWorkItems } from '../../scripts/adaptive-knowledge/work-items';

test('work items are generated from fronts, documents, questions, contradictions, and doctrine', () => {
  const items = buildAdaptiveKnowledgeWorkItems({
    researchFronts: [
      {
        id: 'front-progression-load-pubmed',
        source: 'pubmed',
        queryFamily: 'progression-load',
        status: 'active',
        topicKey: 'progression',
        query: 'resistance training load progression hypertrophy strength',
        pageCursor: { page: 0, nextCursor: null },
        attempts: 0,
        evidence: { pagesVisited: 0, reformulationsTried: 0, sourcesVisited: 1 },
      },
    ],
    documents: [
      {
        documentId: 'doc-extractible',
        canonicalId: 'doi:10.1000/example',
        recordId: 'pubmed-123',
        title: 'Hypertrophy dose response',
        sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
        sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/123',
        status: 'extractible',
        topicKeys: ['hypertrophy-dose'],
        createdAt: '2026-03-22T00:00:00.000Z',
        updatedAt: '2026-03-22T00:05:00.000Z',
      },
    ],
    questions: [
      {
        id: 'question-hypertrophy-dose',
        topicKey: 'hypertrophy-dose',
        coverage: 'partial',
        publicationStatus: 'not-ready',
      },
    ],
    contradictions: [
      {
        id: 'contradiction-1',
        topicKey: 'hypertrophy-dose',
        severity: 'blocking',
        resolved: false,
      },
    ],
    doctrineCandidates: [
      {
        id: 'doctrine-hypertrophy-dose',
        topicKey: 'hypertrophy-dose',
        publicationReadiness: 'ready',
      },
    ],
    now: new Date('2026-03-23T00:00:00.000Z'),
  });

  assert.ok(items.some((item) => item.kind === 'discover-front-page'));
  assert.ok(items.some((item) => item.kind === 'extract-study-card'));
  assert.ok(items.some((item) => item.kind === 'link-study-question'));
  assert.ok(items.some((item) => item.kind === 'analyze-contradiction'));
  assert.ok(items.some((item) => item.kind === 'publish-doctrine'));
});

test('work items emit revisit-front and blockedBy metadata for non-ready front states', () => {
  const items = buildAdaptiveKnowledgeWorkItems({
    researchFronts: [
      {
        id: 'front-cooldown',
        source: 'pubmed',
        queryFamily: 'volume-landmarks',
        status: 'cooldown',
        topicKey: 'volume',
        query: 'volume landmarks hypertrophy resistance training',
        pageCursor: { page: 2, nextCursor: 'cursor-2' },
        attempts: 2,
        cooldownUntil: '2026-03-25T00:00:00.000Z',
        evidence: { pagesVisited: 2, reformulationsTried: 1, sourcesVisited: 1 },
      },
      {
        id: 'front-deferred',
        source: 'crossref',
        queryFamily: 'volume-landmarks',
        status: 'deferred',
        topicKey: 'volume',
        query: 'volume landmarks hypertrophy resistance training systematic review',
        pageCursor: { page: 0, nextCursor: null },
        attempts: 1,
        evidence: { pagesVisited: 1, reformulationsTried: 1, sourcesVisited: 1 },
      },
      {
        id: 'front-active',
        source: 'openalex',
        queryFamily: 'volume-landmarks',
        status: 'active',
        topicKey: 'volume',
        query: 'volume landmarks hypertrophy resistance training meta analysis',
        pageCursor: { page: 1, nextCursor: 'cursor-1' },
        attempts: 0,
        evidence: { pagesVisited: 1, reformulationsTried: 0, sourcesVisited: 1 },
      },
    ],
    documents: [],
    questions: [],
    contradictions: [
      {
        id: 'contradiction-open',
        topicKey: 'volume',
        severity: 'blocking',
        resolved: false,
      },
    ],
    doctrineCandidates: [
      {
        id: 'doctrine-volume',
        topicKey: 'volume',
        publicationReadiness: 'ready',
      },
    ],
    now: new Date('2026-03-23T00:00:00.000Z'),
  });

  assert.equal(items.some((item) => item.kind === 'discover-front-page' && item.targetId === 'front-active'), true);

  const cooldownItem = items.find((item) => item.kind === 'revisit-front' && item.targetId === 'front-cooldown');
  assert.ok(cooldownItem);
  assert.equal(cooldownItem?.status, 'blocked');
  assert.deepEqual(cooldownItem?.blockedBy, ['front:cooldown']);

  const deferredItem = items.find((item) => item.kind === 'revisit-front' && item.targetId === 'front-deferred');
  assert.ok(deferredItem);
  assert.equal(deferredItem?.status, 'blocked');
  assert.deepEqual(deferredItem?.blockedBy, ['front:deferred']);

  const doctrineItem = items.find((item) => item.kind === 'publish-doctrine');
  assert.ok(doctrineItem);
  assert.deepEqual(doctrineItem?.blockedBy, ['contradiction:contradiction-open']);
});

test('active front discovery priority stays neutral when only cooldown metadata differs', () => {
  const items = buildAdaptiveKnowledgeWorkItems({
    researchFronts: [
      {
        id: 'front-active-no-cooldown',
        source: 'pubmed',
        queryFamily: 'frequency-dose',
        status: 'active',
        topicKey: 'frequency',
        query: 'training frequency dose response hypertrophy',
        pageCursor: { page: 0, nextCursor: null },
        attempts: 0,
        evidence: { pagesVisited: 0, reformulationsTried: 0, sourcesVisited: 1 },
      },
      {
        id: 'front-active-with-stale-cooldown',
        source: 'pubmed',
        queryFamily: 'frequency-dose',
        status: 'active',
        topicKey: 'frequency',
        query: 'training frequency dose response hypertrophy review',
        pageCursor: { page: 0, nextCursor: null },
        attempts: 0,
        cooldownUntil: '2026-03-22T12:00:00.000Z',
        evidence: { pagesVisited: 0, reformulationsTried: 0, sourcesVisited: 1 },
      },
    ],
    documents: [],
    questions: [],
    contradictions: [],
    doctrineCandidates: [],
    now: new Date('2026-03-23T00:00:00.000Z'),
    freshnessPriorityWeight: 0.2,
  });

  const neutralItem = items.find((item) => item.targetId === 'front-active-no-cooldown');
  const staleCooldownItem = items.find((item) => item.targetId === 'front-active-with-stale-cooldown');

  assert.ok(neutralItem);
  assert.ok(staleCooldownItem);
  assert.equal(neutralItem?.kind, 'discover-front-page');
  assert.equal(staleCooldownItem?.kind, 'discover-front-page');
  assert.equal(neutralItem?.priorityScore, 0.45);
  assert.equal(staleCooldownItem?.priorityScore, 0.45);
});
