import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  blockWorkItem,
  claimNextWorkItem,
  enqueueWorkItems,
  loadWorkQueues,
} from '../../scripts/adaptive-knowledge/registry/work-queues';

test('enqueueWorkItems dedupes repeated logical work', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-work-queue-'));

  await enqueueWorkItems(outputRootDir, 'study-extraction', [
    {
      logicalKey: 'study-extraction:pubmed-123',
      payload: { recordId: 'pubmed-123' },
    },
    {
      logicalKey: 'study-extraction:pubmed-123',
      payload: { recordId: 'pubmed-123' },
    },
  ]);

  const state = await loadWorkQueues(outputRootDir);
  const items = state.items.filter((item) => item.queueName === 'study-extraction');
  assert.equal(items.length, 1);
});

test('claimNextWorkItem marks item running and preserves order', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-work-queue-'));

  await enqueueWorkItems(outputRootDir, 'question-linking', [
    {
      logicalKey: 'question-linking:study-a',
      payload: { studyId: 'study-a' },
    },
    {
      logicalKey: 'question-linking:study-b',
      payload: { studyId: 'study-b' },
    },
  ]);

  const first = await claimNextWorkItem(outputRootDir, 'question-linking', 'worker-a');
  const second = await claimNextWorkItem(outputRootDir, 'question-linking', 'worker-b');

  assert.equal(first?.logicalKey, 'question-linking:study-a');
  assert.equal(first?.status, 'running');
  assert.equal(first?.claimedBy, 'worker-a');
  assert.equal(second?.logicalKey, 'question-linking:study-b');
});

test('blocked work item retains reason and can be surfaced later', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-work-queue-'));

  await enqueueWorkItems(outputRootDir, 'study-extraction', [
    {
      logicalKey: 'study-extraction:pubmed-404',
      payload: { recordId: 'pubmed-404' },
    },
  ]);

  const claimed = await claimNextWorkItem(outputRootDir, 'study-extraction', 'worker-a');
  assert.ok(claimed);

  await blockWorkItem(outputRootDir, claimed!.id, 'paywall prevented extraction');

  const state = await loadWorkQueues(outputRootDir);
  const blocked = state.items.find((item) => item.id === claimed!.id);
  assert.equal(blocked?.status, 'blocked');
  assert.equal(blocked?.blockedReason, 'paywall prevented extraction');
});
