import assert from 'node:assert/strict';
import test from 'node:test';

import { scheduleAdaptiveKnowledgeWork } from '../../scripts/adaptive-knowledge/scheduler';

test('scheduler prefers blocking downstream work over additional discovery', () => {
  const plan = scheduleAdaptiveKnowledgeWork({
    items: [
      {
        id: 'discover-front',
        kind: 'discover-front-page',
        status: 'ready',
        topicKey: 'hypertrophy-dose',
        priorityScore: 0.52,
        blockedBy: [],
        targetId: 'front-1',
      },
      {
        id: 'extract-study',
        kind: 'extract-study-card',
        status: 'ready',
        topicKey: 'hypertrophy-dose',
        priorityScore: 0.78,
        blockedBy: [],
        targetId: 'doc-1',
      },
      {
        id: 'publish-doctrine',
        kind: 'publish-doctrine',
        status: 'ready',
        topicKey: 'hypertrophy-dose',
        priorityScore: 0.92,
        blockedBy: [],
        targetId: 'doctrine-1',
      },
    ],
    limits: { maxItems: 2 },
  });

  assert.deepEqual(
    plan.selectedItems.map((item) => item.kind),
    ['publish-doctrine', 'extract-study-card'],
  );
  assert.equal(plan.skippedItems.some((item) => item.id === 'discover-front' && item.reason === 'budget-exceeded'), true);
});

test('scheduler skips blocked items and reports explicit no-progress reasons', () => {
  const plan = scheduleAdaptiveKnowledgeWork({
    items: [
      {
        id: 'publish-doctrine',
        kind: 'publish-doctrine',
        status: 'ready',
        topicKey: 'hypertrophy-dose',
        priorityScore: 0.95,
        blockedBy: ['contradiction:open-1'],
        targetId: 'doctrine-1',
      },
      {
        id: 'front-cooldown',
        kind: 'revisit-front',
        status: 'blocked',
        topicKey: 'hypertrophy-dose',
        priorityScore: 0.4,
        blockedBy: ['front:cooldown'],
        targetId: 'front-1',
      },
      {
        id: 'front-deferred',
        kind: 'revisit-front',
        status: 'blocked',
        topicKey: 'hypertrophy-dose',
        priorityScore: 0.35,
        blockedBy: ['front:deferred'],
        targetId: 'front-2',
      },
      {
        id: 'front-duplicate-heavy',
        kind: 'revisit-front',
        status: 'blocked',
        topicKey: 'hypertrophy-dose',
        priorityScore: 0.3,
        blockedBy: ['front:duplicate-heavy'],
        targetId: 'front-3',
      },
      {
        id: 'front-source-cold',
        kind: 'revisit-front',
        status: 'blocked',
        topicKey: 'hypertrophy-dose',
        priorityScore: 0.29,
        blockedBy: ['front:source-cold'],
        targetId: 'front-4',
      },
      {
        id: 'front-no-docs',
        kind: 'revisit-front',
        status: 'blocked',
        topicKey: 'hypertrophy-dose',
        priorityScore: 0.28,
        blockedBy: ['front:no-extractable-documents'],
        targetId: 'front-5',
      },
      {
        id: 'contradiction-backlog',
        kind: 'publish-doctrine',
        status: 'blocked',
        topicKey: 'hypertrophy-dose',
        priorityScore: 0.27,
        blockedBy: ['publication:contradiction-backlog-only'],
        targetId: 'doctrine-2',
      },
      {
        id: 'publication-not-yet-justified',
        kind: 'publish-doctrine',
        status: 'blocked',
        topicKey: 'hypertrophy-dose',
        priorityScore: 0.26,
        blockedBy: ['publication:not-yet-justified'],
        targetId: 'doctrine-3',
      },
    ],
    limits: { maxItems: 3 },
  });

  assert.deepEqual(plan.selectedItems, []);
  assert.equal(plan.noProgressSummary?.readyItems, 0);
  assert.equal(plan.noProgressSummary?.blockedItems, 8);
  assert.deepEqual(plan.noProgressSummary?.noProgressReasons, [
    'contradiction-backlog-only',
    'deferred',
    'duplicate-heavy',
    'no-extractable-documents',
    'publication-not-yet-justified',
    'source-cold',
    'waiting-for-cooldown',
  ]);
});

test('scheduler respects per-kind caps within the run budget', () => {
  const plan = scheduleAdaptiveKnowledgeWork({
    items: [
      {
        id: 'extract-1',
        kind: 'extract-study-card',
        status: 'ready',
        topicKey: 'hypertrophy-dose',
        priorityScore: 0.82,
        blockedBy: [],
        targetId: 'doc-1',
      },
      {
        id: 'extract-2',
        kind: 'extract-study-card',
        status: 'ready',
        topicKey: 'strength-dose',
        priorityScore: 0.8,
        blockedBy: [],
        targetId: 'doc-2',
      },
      {
        id: 'discover-1',
        kind: 'discover-front-page',
        status: 'ready',
        topicKey: 'strength-dose',
        priorityScore: 0.5,
        blockedBy: [],
        targetId: 'front-1',
      },
    ],
    limits: {
      maxItems: 3,
      perKind: {
        'extract-study-card': 1,
      },
    },
  });

  assert.deepEqual(
    plan.selectedItems.map((item) => item.id),
    ['extract-1', 'discover-1'],
  );
  assert.equal(plan.skippedItems.some((item) => item.id === 'extract-2' && item.reason === 'kind-cap-reached'), true);
});

test('scheduler reports status-only no-progress reasons when blockedBy is empty', () => {
  const plan = scheduleAdaptiveKnowledgeWork({
    items: [
      {
        id: 'front-revisit-pending-status',
        kind: 'revisit-front',
        status: 'blocked',
        topicKey: 'hypertrophy-dose',
        priorityScore: 0.33,
        blockedBy: [],
        targetId: 'front-9',
      },
      {
        id: 'publication-pending-status',
        kind: 'publish-doctrine',
        status: 'blocked',
        topicKey: 'hypertrophy-dose',
        priorityScore: 0.31,
        blockedBy: [],
        targetId: 'doctrine-9',
      },
    ],
    limits: { maxItems: 2 },
  });

  assert.deepEqual(plan.selectedItems, []);
  assert.equal(plan.noProgressSummary?.readyItems, 0);
  assert.equal(plan.noProgressSummary?.blockedItems, 2);
  assert.deepEqual(plan.noProgressSummary?.noProgressReasons, ['blocked-by-status']);
});
