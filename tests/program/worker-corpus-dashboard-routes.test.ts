import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkerCorpusControlGetHandler, createWorkerCorpusControlPostHandler } from '../../src/app/api/worker-corpus/control/route-handlers';
import { createWorkerCorpusLibraryDetailGetHandler } from '../../src/app/api/worker-corpus/library/[snapshotId]/route-handlers';
import { createWorkerCorpusLibraryGetHandler } from '../../src/app/api/worker-corpus/library/route-handlers';
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

test('control and library routes validate authenticated worker dashboard workflows', async () => {
  const getControl = createWorkerCorpusControlGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    readControl: async () => ({
      state: 'idle',
      pid: null,
      mode: null,
      startedAt: null,
      stoppedAt: null,
      pauseRequestedAt: null,
      message: null,
      campaign: null,
    }),
    startWorker: async ({ mode }) => ({
      state: 'running',
      pid: 4321,
      mode,
      startedAt: '2026-03-11T10:05:00.000Z',
      stoppedAt: null,
      pauseRequestedAt: null,
      message: `worker launched from dashboard (${mode})`,
      campaign: null,
    }),
    pauseWorker: async () => ({
      state: 'paused',
      pid: null,
      mode: 'refresh',
      startedAt: '2026-03-11T10:05:00.000Z',
      stoppedAt: '2026-03-11T10:06:00.000Z',
      pauseRequestedAt: '2026-03-11T10:06:00.000Z',
      message: 'pause requested from dashboard',
      campaign: null,
    }),
    resumeWorker: async ({ mode }) => ({
      state: 'running',
      pid: 8765,
      mode: mode ?? 'bootstrap',
      startedAt: '2026-03-11T10:07:00.000Z',
      stoppedAt: null,
      pauseRequestedAt: null,
      message: `campaign resumed from dashboard (${mode ?? 'bootstrap'})`,
      campaign: null,
    }),
    resetWorker: async () => ({
      state: 'idle',
      pid: null,
      mode: 'bootstrap',
      startedAt: null,
      stoppedAt: '2026-03-11T10:08:00.000Z',
      pauseRequestedAt: null,
      message: 'bootstrap scope reset from dashboard',
      campaign: null,
    }),
  });
  const postControl = createWorkerCorpusControlPostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    readControl: async () => ({}),
    startWorker: async ({ mode }) => ({
      state: 'running',
      pid: 4321,
      mode,
      startedAt: '2026-03-11T10:05:00.000Z',
      stoppedAt: null,
      pauseRequestedAt: null,
      message: `worker launched from dashboard (${mode})`,
      campaign: null,
    }),
    pauseWorker: async () => ({
      state: 'paused',
      pid: null,
      mode: 'refresh',
      startedAt: '2026-03-11T10:05:00.000Z',
      stoppedAt: '2026-03-11T10:06:00.000Z',
      pauseRequestedAt: '2026-03-11T10:06:00.000Z',
      message: 'pause requested from dashboard',
      campaign: null,
    }),
    resumeWorker: async ({ mode }) => ({
      state: 'running',
      pid: 8765,
      mode: mode ?? 'bootstrap',
      startedAt: '2026-03-11T10:07:00.000Z',
      stoppedAt: null,
      pauseRequestedAt: null,
      message: `campaign resumed from dashboard (${mode ?? 'bootstrap'})`,
      campaign: null,
    }),
    resetWorker: async () => ({
      state: 'idle',
      pid: null,
      mode: 'bootstrap',
      startedAt: null,
      stoppedAt: '2026-03-11T10:08:00.000Z',
      pauseRequestedAt: null,
      message: 'bootstrap scope reset from dashboard',
      campaign: null,
    }),
  });
  const getLibrary = createWorkerCorpusLibraryGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    listLibrary: async () => ({
      generatedAt: '2026-03-11T10:07:00.000Z',
      entries: [],
    }),
  });
  const getLibraryDetail = createWorkerCorpusLibraryDetailGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getLibraryDetail: async () => ({
      entry: {
        snapshotId: 'run-ready',
        runId: 'run-ready',
        mode: 'refresh',
        artifactState: 'validated',
        outcome: 'succeeded',
        severity: 'healthy',
        generatedAt: '2026-03-11T10:01:00.000Z',
        promotedAt: '2026-03-11T10:02:00.000Z',
        evidenceRecordCount: 5,
        principleCount: 2,
        contradictionCount: 0,
        sourceDomains: ['doi.org'],
        coveredTags: ['progression'],
        qualityGateReasons: [],
        isActiveSnapshot: true,
        isRollbackSnapshot: false,
      },
      stageReports: [],
      principles: [],
      sources: [],
      studyExtractions: [],
      rejectedClaims: [],
      contradictions: [],
      discovery: null,
      ranking: null,
      knowledgeBible: null,
    }),
  });

  assert.equal((await getControl()).status, 200);
  assert.equal(
    (
      await postControl(
        new Request('http://localhost/api/worker-corpus/control', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'start', mode: 'check' }),
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await postControl(
        new Request('http://localhost/api/worker-corpus/control', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'resume', mode: 'bootstrap' }),
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await postControl(
        new Request('http://localhost/api/worker-corpus/control', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'reset' }),
        }),
      )
    ).status,
    200,
  );
  assert.equal((await getLibrary()).status, 200);
  assert.equal(
    (
      await getLibraryDetail(new Request('http://localhost/api/worker-corpus/library/run-ready'), {
        params: Promise.resolve({ snapshotId: 'run-ready' }),
      })
    ).status,
    200,
  );
});

test('status and runs routes return parse-validated payloads for authenticated users', async () => {
  const getStatus = createWorkerCorpusStatusGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    loadStatus: async () => ({
      generatedAt: '2026-03-11T10:00:00.000Z',
      control: {
        state: 'idle',
        pid: null,
        mode: null,
        startedAt: null,
        stoppedAt: null,
      pauseRequestedAt: null,
      message: null,
      campaign: {
        campaignId: 'bootstrap-1',
        status: 'running',
        startedAt: '2026-03-11T08:00:00.000Z',
        updatedAt: '2026-03-11T10:00:00.000Z',
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
          extractionBacklogCount: 9,
          publicationCandidateCount: 6,
        },
        cursors: {
          resumableJobCount: 5,
          activeCursorCount: 3,
          sampleJobIds: ['pubmed:progression-load'],
        },
        budgets: {
          maxJobsPerRun: 12,
          maxPagesPerJob: 5,
          maxCanonicalRecordsPerRun: 250,
          maxRuntimeMs: 900000,
        },
      },
    },
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
  assert.equal((await statusResponse.clone().json()).control.state, 'idle');
  assert.equal((await statusResponse.clone().json()).control.campaign.cursors.activeCursorCount, 3);
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
