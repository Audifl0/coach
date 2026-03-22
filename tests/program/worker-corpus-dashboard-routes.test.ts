import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createWorkerCorpusControlGetHandler, createWorkerCorpusControlPostHandler } from '../../src/app/api/worker-corpus/control/route-handlers';
import { createWorkerCorpusLibraryDetailGetHandler } from '../../src/app/api/worker-corpus/library/[snapshotId]/route-handlers';
import { createWorkerCorpusLibraryGetHandler } from '../../src/app/api/worker-corpus/library/route-handlers';
import { createWorkerCorpusRunDetailGetHandler } from '../../src/app/api/worker-corpus/runs/[runId]/route-handlers';
import { createWorkerCorpusRunsGetHandler } from '../../src/app/api/worker-corpus/runs/route-handlers';
import { createWorkerCorpusSnapshotDetailGetHandler } from '../../src/app/api/worker-corpus/snapshots/[snapshotId]/route-handlers';
import { createWorkerCorpusStatusGetHandler } from '../../src/app/api/worker-corpus/status/route-handlers';
import { createWorkerCorpusSupervisionGetHandler } from '../../src/app/api/worker-corpus/supervision/route-handlers';
import {
  pauseWorkerControl,
  readWorkerControlState,
  resetWorkerLauncherForTests,
  setWorkerLauncherForTests,
  startWorkerControl,
} from '../../src/server/dashboard/worker-control';

test('worker corpus routes return 401 when no authenticated session is present', async () => {
  const getStatus = createWorkerCorpusStatusGetHandler({
    resolveSession: async () => null,
    loadStatus: async () => ({}),
  });
  const getSupervision = createWorkerCorpusSupervisionGetHandler({
    resolveSession: async () => null,
    loadSupervision: async () => ({}),
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
  assert.equal((await getSupervision()).status, 401);
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

test('control route rejects unauthenticated start and pause requests', async () => {
  const postControl = createWorkerCorpusControlPostHandler({
    resolveSession: async () => null,
    readControl: async () => ({}),
    startWorker: async () => {
      throw new Error('should not start worker');
    },
    pauseWorker: async () => {
      throw new Error('should not pause worker');
    },
  });

  const startResponse = await postControl(
    new Request('http://localhost/api/worker-corpus/control', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    }),
  );
  const pauseResponse = await postControl(
    new Request('http://localhost/api/worker-corpus/control', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'pause' }),
    }),
  );

  assert.equal(startResponse.status, 401);
  assert.equal(pauseResponse.status, 401);
});

test('pause action writes paused control state', async () => {
  let pauseCalled = 0;
  const postControl = createWorkerCorpusControlPostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    readControl: async () => ({}),
    startWorker: async () => {
      throw new Error('should not start worker');
    },
    pauseWorker: async () => {
      pauseCalled += 1;
      return {
        state: 'paused',
        pid: null,
        mode: 'refresh',
        startedAt: '2026-03-11T10:05:00.000Z',
        stoppedAt: '2026-03-11T10:06:00.000Z',
        pauseRequestedAt: '2026-03-11T10:06:00.000Z',
        message: 'pause requested from dashboard',
        campaign: null,
      };
    },
  });

  const response = await postControl(
    new Request('http://localhost/api/worker-corpus/control', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'pause' }),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(pauseCalled, 1);
  assert.equal((await response.json()).control.state, 'paused');
});

test('start action writes running control state', async () => {
  let startCalled = 0;
  const postControl = createWorkerCorpusControlPostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    readControl: async () => ({}),
    startWorker: async () => {
      startCalled += 1;
      return {
        state: 'running',
        pid: 4321,
        mode: 'refresh',
        startedAt: '2026-03-11T10:05:00.000Z',
        stoppedAt: null,
        pauseRequestedAt: null,
        message: 'worker launched from dashboard (refresh)',
        campaign: null,
      };
    },
    pauseWorker: async () => {
      throw new Error('should not pause worker');
    },
  });

  const response = await postControl(
    new Request('http://localhost/api/worker-corpus/control', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(startCalled, 1);
  assert.equal((await response.json()).control.state, 'running');
});

test('start action reports already-running instead of launching a duplicate when appropriate', async () => {
  let startCalled = 0;
  const postControl = createWorkerCorpusControlPostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    readControl: async () => ({}),
    startWorker: async () => {
      startCalled += 1;
      return {
        state: 'running',
        pid: 4321,
        mode: 'refresh',
        startedAt: '2026-03-11T10:05:00.000Z',
        stoppedAt: null,
        pauseRequestedAt: null,
        message: 'already-running',
        campaign: null,
      };
    },
    pauseWorker: async () => {
      throw new Error('should not pause worker');
    },
  });

  const response = await postControl(
    new Request('http://localhost/api/worker-corpus/control', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(startCalled, 1);
  assert.equal((await response.json()).control.message, 'already-running');
});

test('control route uses /opt/coach/.env as env-file when shelling to docker compose', async () => {
  let startCommand = '';
  const postControl = createWorkerCorpusControlPostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    readControl: async () => ({}),
    startWorker: async () => {
      startCommand = 'docker compose --env-file /opt/coach/.env up -d worker-corpus';
      return {
        state: 'running',
        pid: 4321,
        mode: 'refresh',
        startedAt: '2026-03-11T10:05:00.000Z',
        stoppedAt: null,
        pauseRequestedAt: null,
        message: 'worker launched from dashboard (refresh)',
        campaign: null,
      };
    },
    pauseWorker: async () => {
      throw new Error('should not pause worker');
    },
  });

  const response = await postControl(
    new Request('http://localhost/api/worker-corpus/control', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    }),
  );

  assert.equal(response.status, 200);
  assert.match(startCommand, /\/opt\/coach\/\.env/);
});

test('server start action writes running control state and uses /opt/coach/.env in docker compose command', async () => {
  const knowledgeRootDir = await mkdtemp(path.join(tmpdir(), 'worker-control-launch-'));
  const calls: Array<{ command: string; args: string[]; options: Record<string, unknown> }> = [];

  setWorkerLauncherForTests((invocation) => {
    calls.push({
      command: invocation.command,
      args: invocation.args,
      options: invocation.options as Record<string, unknown>,
    });
    return {
      pid: 4321,
      unref() {
        // noop
      },
    };
  });

  try {
    const state = await startWorkerControl({ knowledgeRootDir, now: new Date('2026-03-22T19:00:00.000Z') });

    assert.equal(state.state, 'running');
    assert.equal(state.pid, 4321);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.command, 'docker');
    assert.match(`docker ${calls[0]?.args.join(' ')}`, /docker compose --env-file \/opt\/coach\/\.env/i);

    const persisted = JSON.parse(
      await readFile(path.join(knowledgeRootDir, 'worker-control.json'), 'utf8'),
    ) as { state: string; pid: number | null };
    assert.equal(persisted.state, 'running');
    assert.equal(persisted.pid, 4321);
  } finally {
    resetWorkerLauncherForTests();
  }
});

test('server start action reports already-running instead of launching a duplicate when appropriate', async () => {
  const knowledgeRootDir = await mkdtemp(path.join(tmpdir(), 'worker-control-running-'));
  let spawnCalls = 0;

  setWorkerLauncherForTests(() => {
    spawnCalls += 1;
    return {
      pid: 999999,
      unref() {
        // noop
      },
    };
  });

  try {
    await mkdir(knowledgeRootDir, { recursive: true });
    await writeFile(
      path.join(knowledgeRootDir, 'worker-control.json'),
      JSON.stringify(
        {
          state: 'running',
          pid: process.pid,
          mode: 'refresh',
          startedAt: '2026-03-22T19:00:00.000Z',
          stoppedAt: null,
          pauseRequestedAt: null,
          message: 'already-running',
          campaign: null,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );

    const state = await startWorkerControl({ knowledgeRootDir, now: new Date('2026-03-22T19:01:00.000Z') });

    assert.equal(state.state, 'running');
    assert.equal(state.message, 'already-running');
    assert.equal(spawnCalls, 0);
  } finally {
    resetWorkerLauncherForTests();
  }
});

test('server start action can queue a host-bridge launch request without shelling to docker', async () => {
  const knowledgeRootDir = await mkdtemp(path.join(tmpdir(), 'worker-control-bridge-'));
  let spawnCalls = 0;

  setWorkerLauncherForTests(() => {
    spawnCalls += 1;
    return {
      pid: 7777,
      unref() {
        // noop
      },
    };
  });

  const previousMode = process.env.WORKER_CONTROL_BRIDGE_MODE;
  process.env.WORKER_CONTROL_BRIDGE_MODE = 'host-file';

  try {
    const state = await startWorkerControl({ knowledgeRootDir, now: new Date('2026-03-22T19:02:00.000Z') });

    assert.equal(state.state, 'running');
    assert.equal(state.pid, null);
    assert.equal(state.mode, 'refresh');
    assert.equal(state.message, 'worker start requested from dashboard (refresh)');
    assert.equal(spawnCalls, 0);

    const persisted = JSON.parse(await readFile(path.join(knowledgeRootDir, 'worker-control.json'), 'utf8')) as {
      state: string;
      pid: number | null;
      message: string | null;
      mode: string | null;
    };
    assert.equal(persisted.state, 'running');
    assert.equal(persisted.pid, null);
    assert.equal(persisted.mode, 'refresh');
    assert.equal(persisted.message, 'worker start requested from dashboard (refresh)');
  } finally {
    if (previousMode === undefined) {
      delete process.env.WORKER_CONTROL_BRIDGE_MODE;
    } else {
      process.env.WORKER_CONTROL_BRIDGE_MODE = previousMode;
    }
    resetWorkerLauncherForTests();
  }
});

test('server pause action writes paused control state', async () => {
  const knowledgeRootDir = await mkdtemp(path.join(tmpdir(), 'worker-control-pause-'));

  const state = await pauseWorkerControl({ knowledgeRootDir, now: new Date('2026-03-22T19:10:00.000Z') });

  assert.equal(state.state, 'paused');
  assert.equal(state.pauseRequestedAt, '2026-03-22T19:10:00.000Z');
  assert.equal(state.message, 'pause requested from dashboard');
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
          body: JSON.stringify({ action: 'pause' }),
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

test('status, supervision and runs routes return parse-validated payloads for authenticated users', async () => {
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
  const getSupervision = createWorkerCorpusSupervisionGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    loadSupervision: async () => ({
      generatedAt: '2026-03-11T10:00:00.000Z',
      workflow: {
        queueDepth: 4,
        blockedItems: 1,
        byStatus: {
          pending: 1,
          running: 1,
          blocked: 1,
          completed: 1,
          failed: 0,
        },
        queues: [
          {
            queueName: 'scientific-questions',
            total: 4,
            pending: 1,
            running: 1,
            blocked: 1,
            completed: 1,
            failed: 0,
          },
        ],
      },
      documents: {
        total: 3,
        byState: {
          discovered: 1,
          'metadata-ready': 0,
          'abstract-ready': 0,
          'full-text-ready': 0,
          extractible: 1,
          extracted: 0,
          linked: 1,
        },
      },
      questions: {
        total: 2,
        contradictionCount: 1,
        blockingContradictionCount: 1,
        byCoverage: {
          empty: 0,
          partial: 0,
          developing: 1,
          mature: 1,
          blocked: 0,
        },
        byPublication: {
          'not-ready': 0,
          candidate: 1,
          published: 1,
          reopened: 0,
        },
        notableQuestions: [
          {
            questionId: 'q-rest',
            label: 'Temps de repos',
            coverageStatus: 'developing',
            publicationStatus: 'candidate',
            publicationReadiness: 'blocked',
            contradictionCount: 1,
            blockingContradictionCount: 1,
            linkedStudyCount: 2,
            updatedAt: '2026-03-11T10:00:00.000Z',
          },
        ],
      },
      doctrine: {
        activePrinciples: 1,
        reopenedPrinciples: 0,
        supersededPrinciples: 0,
        recentRevisions: [
          {
            revisionId: 'rev-1',
            principleId: 'p-1',
            changedAt: '2026-03-11T10:00:00.000Z',
            changeType: 'published',
            reason: 'Evidence threshold met.',
          },
        ],
      },
      recentResearchJournal: [
        {
          kind: 'doctrine',
          id: 'rev-1',
          title: 'p-1',
          at: '2026-03-11T10:00:00.000Z',
          detail: 'published · Evidence threshold met.',
        },
      ],
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
  const supervisionResponse = await getSupervision();
  const runsResponse = await getRuns(new Request('http://localhost/api/worker-corpus/runs?limit=1'));
  assert.equal(statusResponse.status, 200);
  assert.equal(supervisionResponse.status, 200);
  assert.equal(runsResponse.status, 200);
  assert.equal((await statusResponse.clone().json()).control.state, 'idle');
  assert.equal((await statusResponse.clone().json()).control.campaign.cursors.activeCursorCount, 3);
  assert.equal((await statusResponse.json()).live.runId, 'run-live');
  assert.equal((await supervisionResponse.clone().json()).workflow.queueDepth, 4);
  assert.equal((await supervisionResponse.json()).questions.notableQuestions.length, 1);
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
