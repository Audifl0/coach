import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseAdaptiveKnowledgeWorkerControlState } from '../../scripts/adaptive-knowledge/contracts';
import {
  loadWorkerControlState,
  setWorkerControlMode,
} from '../../scripts/adaptive-knowledge/control-state';

test('missing control state defaults to running', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-worker-control-'));

  const state = await loadWorkerControlState(outputRootDir);

  assert.equal(state.mode, 'running');
  assert.equal(state.reason, null);
  assert.equal(state.lastCommand, null);
  assert.match(state.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('control state persists paused mode with metadata', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-worker-control-'));
  const now = new Date('2026-03-22T18:00:00.000Z');

  const written = await setWorkerControlMode(outputRootDir, {
    mode: 'paused',
    reason: 'operator requested pause',
    lastCommand: 'pause',
    now,
  });

  assert.equal(written.mode, 'paused');
  assert.equal(written.reason, 'operator requested pause');
  assert.equal(written.lastCommand, 'pause');
  assert.equal(written.updatedAt, now.toISOString());

  const persisted = await loadWorkerControlState(outputRootDir);
  assert.deepEqual(persisted, written);

  const raw = JSON.parse(await readFile(path.join(outputRootDir, 'control.json'), 'utf8')) as unknown;
  assert.deepEqual(raw, written);
});

test('control state parser rejects invalid modes', () => {
  assert.throws(
    () =>
      parseAdaptiveKnowledgeWorkerControlState({
        mode: 'stopped',
        updatedAt: '2026-03-22T18:00:00.000Z',
        reason: null,
        lastCommand: null,
      }),
    /paused|running/i,
  );
});
