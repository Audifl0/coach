import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkerCorpusRunDetailGetHandler } from '../../src/app/api/worker-corpus/runs/[runId]/route-handlers';
import { createWorkerCorpusRunsGetHandler } from '../../src/app/api/worker-corpus/runs/route-handlers';
import { createWorkerCorpusSnapshotDetailGetHandler } from '../../src/app/api/worker-corpus/snapshots/[snapshotId]/route-handlers';
import { createWorkerCorpusStatusGetHandler } from '../../src/app/api/worker-corpus/status/route-handlers';

test('worker corpus routes return 401 when no authenticated session is present', async () => {
  const getStatus = createWorkerCorpusStatusGetHandler({
    resolveSession: async () => null,
    loadStatus: async () => ({}),
  });
  const getRuns = createWorkerCorpusRunsGetHandler({
    resolveSession: async () => null,
    listRuns: async () => ({ generatedAt: '2026-03-11T10:00:00.000Z', runs: [] }),
  });
  const getRunDetail = createWorkerCorpusRunDetailGetHandler({
    resolveSession: async () => null,
    getRunDetail: async () => null,
  });
  const getSnapshotDetail = createWorkerCorpusSnapshotDetailGetHandler({
    resolveSession: async () => null,
    getSnapshotDetail: async () => null,
  });

  assert.equal((await getStatus()).status, 401);
  assert.equal((await getRuns(new Request('http://localhost/api/worker-corpus/runs'))).status, 401);
  assert.equal(
    (
      await getRunDetail(new Request('http://localhost/api/worker-corpus/runs/run-ready'), {
        params: Promise.resolve({ runId: 'run-ready' }),
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await getSnapshotDetail(new Request('http://localhost/api/worker-corpus/snapshots/run-ready'), {
        params: Promise.resolve({ snapshotId: 'run-ready' }),
      })
    ).status,
    401,
  );
});

test('status and runs routes return parse-validated payloads for authenticated users', async () => {
  const getStatus = createWorkerCorpusStatusGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    loadStatus: async () => ({
      generatedAt: '2026-03-11T10:00:00.000Z',
      live: {
        state: 'heartbeat',
        severity: 'healthy',
        runId: 'run-live',
        mode: 'refresh',
        startedAt: '2026-03-11T09:59:00.000Z',
        heartbeatAt: '2026-03-11T10:00:00.000Z',
        leaseExpiresAt: '2026-03-11T10:05:00.000Z',
        message: 'running',
        isHeartbeatStale: false,
      },
      publication: {
        severity: 'healthy',
        activeSnapshotId: 'run-ready',
        activeSnapshotDir: '/tmp/run-ready',
        promotedAt: '2026-03-11T10:02:00.000Z',
        rollbackSnapshotId: null,
        rollbackSnapshotDir: null,
        rollbackAvailable: false,
        snapshotAgeHours: 0.5,
        evidenceRecordCount: 5,
        principleCount: 2,
        sourceDomains: ['doi.org'],
        qualityGateReasons: [],
        lastRunAgeHours: 0.1,
      },
    }),
  });
  const getRuns = createWorkerCorpusRunsGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    listRuns: async ({ limit }) => ({
      generatedAt: '2026-03-11T10:00:00.000Z',
      runs: [
        {
          runId: 'run-ready',
          snapshotId: 'run-ready',
          mode: 'refresh',
          startedAt: '2026-03-11T10:00:00.000Z',
          completedAt: '2026-03-11T10:01:00.000Z',
          artifactState: 'validated',
          outcome: 'succeeded',
          severity: 'healthy',
          finalStage: 'publish',
          finalMessage: 'promoted:run-ready;rollback=run-previous',
          evidenceRecordCount: 5,
          principleCount: 2,
          sourceDomains: ['doi.org'],
          qualityGateReasons: [],
          isActiveSnapshot: true,
          isRollbackSnapshot: false,
        },
      ].slice(0, limit),
    }),
  });

  const statusResponse = await getStatus();
  const runsResponse = await getRuns(new Request('http://localhost/api/worker-corpus/runs?limit=1'));
  assert.equal(statusResponse.status, 200);
  assert.equal(runsResponse.status, 200);
  assert.equal((await statusResponse.json()).live.runId, 'run-live');
  assert.equal((await runsResponse.json()).runs.length, 1);
});

test('runs route validates limit and run/snapshot detail routes return 404 when artifact is missing', async () => {
  const getRuns = createWorkerCorpusRunsGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    listRuns: async () => ({ generatedAt: '2026-03-11T10:00:00.000Z', runs: [] }),
  });
  assert.equal((await getRuns(new Request('http://localhost/api/worker-corpus/runs?limit=abc'))).status, 400);

  const getRunDetail = createWorkerCorpusRunDetailGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getRunDetail: async () => null,
  });
  const getSnapshotDetail = createWorkerCorpusSnapshotDetailGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getSnapshotDetail: async () => null,
  });

  assert.equal(
    (
      await getRunDetail(new Request('http://localhost/api/worker-corpus/runs/missing'), {
        params: Promise.resolve({ runId: 'missing' }),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await getSnapshotDetail(new Request('http://localhost/api/worker-corpus/snapshots/missing'), {
        params: Promise.resolve({ snapshotId: 'missing' }),
      })
    ).status,
    404,
  );
});

test('run and snapshot detail routes surface parse-validated drilldown payloads', async () => {
  const runPayload = {
    runId: 'run-ready',
    snapshotId: 'run-ready',
    mode: 'refresh',
    startedAt: '2026-03-11T10:00:00.000Z',
    completedAt: '2026-03-11T10:01:00.000Z',
    artifactState: 'validated',
    outcome: 'succeeded',
    severity: 'healthy',
    finalStage: 'publish',
    finalMessage: 'promoted:run-ready;rollback=run-previous',
    evidenceRecordCount: 5,
    principleCount: 2,
    sourceDomains: ['doi.org'],
    qualityGateReasons: [],
    isActiveSnapshot: true,
    isRollbackSnapshot: false,
    generatedAt: '2026-03-11T10:01:00.000Z',
    stageReports: [
      { stage: 'discover', status: 'succeeded', message: 'ok' },
      { stage: 'ingest', status: 'succeeded', message: 'ok' },
      { stage: 'synthesize', status: 'succeeded', message: 'ok' },
      { stage: 'validate', status: 'succeeded', message: 'ok' },
      { stage: 'publish', status: 'succeeded', message: 'ok' },
    ],
    modelRun: {
      provider: 'openai',
      model: 'gpt-5',
      requestId: 'req_1',
      latencyMs: 1200,
    },
    contradictionCount: 0,
    coverageRecordCount: 5,
  };
  const snapshotPayload = {
    snapshotId: 'run-ready',
    artifactState: 'validated',
    generatedAt: '2026-03-11T10:01:00.000Z',
    promotedAt: '2026-03-11T10:02:00.000Z',
    severity: 'healthy',
    isActiveSnapshot: true,
    isRollbackSnapshot: false,
    snapshotAgeHours: 0.5,
    evidenceRecordCount: 5,
    principleCount: 2,
    sourceDomains: ['doi.org'],
    diff: {
      previousSnapshotId: 'run-previous',
      currentSnapshotId: 'run-ready',
      evidenceRecordDelta: 2,
      principleDelta: 1,
    },
    qualityGateReasons: [],
    modelRun: {
      provider: 'openai',
      model: 'gpt-5',
      requestId: 'req_1',
      latencyMs: 1200,
    },
    contradictionCount: 0,
    coverageRecordCount: 5,
  };

  const getRunDetail = createWorkerCorpusRunDetailGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getRunDetail: async () => runPayload,
  });
  const getSnapshotDetail = createWorkerCorpusSnapshotDetailGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getSnapshotDetail: async () => snapshotPayload,
  });

  const runResponse = await getRunDetail(new Request('http://localhost/api/worker-corpus/runs/run-ready'), {
    params: Promise.resolve({ runId: 'run-ready' }),
  });
  const snapshotResponse = await getSnapshotDetail(
    new Request('http://localhost/api/worker-corpus/snapshots/run-ready'),
    { params: Promise.resolve({ snapshotId: 'run-ready' }) },
  );

  assert.equal(runResponse.status, 200);
  assert.equal(snapshotResponse.status, 200);
  assert.equal((await runResponse.json()).modelRun.provider, 'openai');
  assert.equal((await snapshotResponse.json()).diff.currentSnapshotId, 'run-ready');
});
