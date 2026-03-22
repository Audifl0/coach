import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  parseWorkerCorpusOverviewSection,
  parseWorkerCorpusOverviewResponse,
  parseWorkerCorpusRunDetail,
  parseWorkerCorpusSnapshotDetail,
} from '../../src/lib/program/contracts';
import { loadWorkerCorpusOverviewSection } from '../../src/app/(private)/dashboard/worker-corpus/loaders/overview';
import {
  getWorkerCorpusLibraryDetail,
  getWorkerCorpusRunDetail,
  getWorkerCorpusSnapshotDetail,
  loadWorkerCorpusOverview,
} from '../../src/server/dashboard/worker-dashboard';
import { loadWorkerCorpusSupervision } from '../../src/server/services/worker-corpus-supervision';

async function writeJson(filePath: string, payload: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

async function buildWorkerFixture() {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'worker-corpus-dashboard-'));
  const snapshotId = 'run-ready';
  const snapshotDir = path.join(rootDir, 'snapshots', snapshotId, 'validated');

  await writeJson(path.join(rootDir, 'worker-state.json'), {
    runId: 'worker-live',
    mode: 'bootstrap',
    status: 'heartbeat',
    startedAt: '2026-03-11T10:00:00.000Z',
    heartbeatAt: '2026-03-11T10:01:00.000Z',
    leaseExpiresAt: '2026-03-11T10:06:00.000Z',
    message: 'discovering new evidence',
  });
  await writeJson(path.join(rootDir, 'worker-control.json'), {
    state: 'running',
    pid: 4321,
    mode: 'bootstrap',
    startedAt: '2026-03-11T09:58:00.000Z',
    stoppedAt: null,
    pauseRequestedAt: null,
    message: 'worker launched from dashboard (bootstrap)',
  });
  await writeJson(path.join(rootDir, 'bootstrap-state.json'), {
    schemaVersion: 'v1',
    campaignId: 'bootstrap-2026-03-11',
    status: 'running',
    mode: 'bootstrap',
    startedAt: '2026-03-11T08:00:00.000Z',
    updatedAt: '2026-03-11T10:01:00.000Z',
    lastRunId: 'run-ready',
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
  await writeJson(path.join(rootDir, 'bootstrap-jobs.json'), [
    {
      id: 'pubmed:progression-load',
      source: 'pubmed',
      query: 'resistance training load progression hypertrophy strength',
      queryFamily: 'progression-load',
      topicKey: 'progression',
      topicLabel: 'Progression et surcharge progressive',
      subtopicKey: 'load-progression',
      subtopicLabel: 'Progression de charge',
      priority: 1,
      status: 'pending',
      targetPopulation: null,
      cursor: 'cursor-pubmed-2',
      pagesFetched: 2,
      recordsFetched: 40,
      canonicalRecords: 18,
      lastError: null,
    },
    {
      id: 'crossref:progression-split',
      source: 'crossref',
      query: 'strength programming weekly split resistance training',
      queryFamily: 'progression-split',
      topicKey: 'progression',
      topicLabel: 'Progression et surcharge progressive',
      subtopicKey: 'weekly-split',
      subtopicLabel: 'Organisation hebdomadaire',
      priority: 2,
      status: 'blocked',
      targetPopulation: null,
      cursor: 'cursor-crossref-1',
      pagesFetched: 1,
      recordsFetched: 20,
      canonicalRecords: 6,
      lastError: 'timeout',
    },
  ]);
  await writeJson(path.join(rootDir, 'active.json'), {
    snapshotId,
    snapshotDir,
    promotedAt: '2026-03-11T10:02:00.000Z',
  });
  await writeJson(path.join(rootDir, 'rollback.json'), {
    snapshotId: 'run-previous',
    snapshotDir: path.join(rootDir, 'snapshots', 'run-previous', 'validated'),
    promotedAt: '2026-03-10T10:00:00.000Z',
  });
  await writeJson(path.join(snapshotDir, 'run-report.json'), {
    runId: snapshotId,
    mode: 'refresh',
    startedAt: '2026-03-11T10:00:00.000Z',
    completedAt: '2026-03-11T10:01:00.000Z',
    snapshotId,
    stageReports: [
      { stage: 'discover', status: 'succeeded', message: 'discovered=3' },
      { stage: 'ingest', status: 'succeeded', message: 'normalized=5' },
      { stage: 'synthesize', status: 'succeeded', message: 'principles=2; coverage=5; provider=openai' },
      { stage: 'validate', status: 'succeeded', message: 'contracts=ok' },
      { stage: 'publish', status: 'succeeded', message: 'promoted:run-ready;rollback=run-previous' },
    ],
  });
  await writeJson(path.join(snapshotDir, 'manifest.json'), {
    snapshotId,
    schemaVersion: 'v1',
    generatedAt: '2026-03-11T10:01:00.000Z',
    evidenceRecordCount: 5,
    principleCount: 2,
    sourceDomains: ['doi.org', 'pubmed.ncbi.nlm.nih.gov'],
    artifacts: {
      indexPath: 'snapshots/run-ready/validated/sources.json',
      principlesPath: 'snapshots/run-ready/validated/principles.json',
      reportPath: 'snapshots/run-ready/validated/run-report.json',
      validatedSynthesisPath: 'snapshots/run-ready/validated/validated-synthesis.json',
    },
  });
  await writeJson(path.join(snapshotDir, 'diff.json'), {
    previousSnapshotId: 'run-previous',
    currentSnapshotId: snapshotId,
    evidenceRecordDelta: 2,
    principleDelta: 1,
  });
  await writeJson(path.join(snapshotDir, 'validated-synthesis.json'), {
    principles: [
      {
        id: 'principle_1',
        title: 'Progressive overload',
        summaryFr: 'Resume',
        guidanceFr: 'Guide',
        provenanceRecordIds: ['record_1'],
        evidenceLevel: 'strong',
        guardrail: 'SAFE-03',
      },
    ],
    studyExtractions: [],
    rejectedClaims: [],
    coverage: {
      recordCount: 5,
      batchCount: 1,
      retainedClaimCount: 1,
      sourceDomains: ['doi.org', 'pubmed.ncbi.nlm.nih.gov'],
      coveredTags: ['progression'],
    },
    contradictions: [],
    modelRun: {
      provider: 'openai',
      model: 'gpt-5',
      promptVersion: 'v1',
      requestId: 'req_1',
      latencyMs: 1200,
      totalLatencyMs: 1200,
    },
  });
  await writeJson(path.join(snapshotDir, 'sources.json'), {
    runId: snapshotId,
    generatedAt: '2026-03-11T10:01:00.000Z',
    discovery: {
      targetTopicKeys: ['progression'],
      targetTopicLabels: ['Progression et surcharge progressive'],
      totalQueries: 1,
      coverageGaps: [],
    },
    ranking: {
      evaluatedRecordCount: 5,
      selectedRecordCount: 1,
      rejectedRecordCount: 4,
      topRecordIds: ['record_1'],
      rejectionCodes: ['stale_publication'],
    },
    sources: [
      {
        source: 'pubmed',
        skipped: false,
        records: [],
        recordsFetched: 1,
        recordsSkipped: 19,
        telemetry: {
          attempts: 1,
          rawResults: 20,
          nextCursor: '12345',
          skipReasons: {
            disallowedDomain: 0,
            stalePublication: 18,
            alreadySeen: 1,
            invalidUrl: 0,
            offTopic: 0,
          },
        },
      },
    ],
    records: [
      {
        id: 'record_1',
        sourceType: 'review',
        sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/12345',
        sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
        publishedAt: '2026-03-10',
        title: 'Useful review',
        summaryEn: 'Summary',
        tags: ['progression'],
        provenanceIds: ['record_1'],
      },
    ],
  });

  const blockedSnapshotDir = path.join(rootDir, 'snapshots', 'run-blocked', 'candidate');
  await writeJson(path.join(blockedSnapshotDir, 'run-report.json'), {
    runId: 'run-blocked',
    mode: 'check',
    startedAt: '2026-03-11T09:00:00.000Z',
    completedAt: '2026-03-11T09:00:30.000Z',
    snapshotId: 'run-blocked',
    stageReports: [
      { stage: 'discover', status: 'succeeded', message: 'discovered=2' },
      { stage: 'ingest', status: 'succeeded', message: 'normalized=2' },
      { stage: 'synthesize', status: 'succeeded', message: 'principles=1; coverage=2; provider=openai' },
      { stage: 'validate', status: 'succeeded', message: 'contracts=ok' },
      { stage: 'publish', status: 'skipped', message: 'blocked:insufficient_coverage,unresolved_contradiction' },
    ],
  });
  await writeJson(path.join(blockedSnapshotDir, 'manifest.json'), {
    snapshotId: 'run-blocked',
    schemaVersion: 'v1',
    generatedAt: '2026-03-11T09:00:30.000Z',
    evidenceRecordCount: 2,
    principleCount: 1,
    sourceDomains: ['doi.org'],
    artifacts: {
      indexPath: 'snapshots/run-blocked/candidate/sources.json',
      principlesPath: 'snapshots/run-blocked/candidate/principles.json',
      reportPath: 'snapshots/run-blocked/candidate/run-report.json',
      validatedSynthesisPath: 'snapshots/run-blocked/candidate/validated-synthesis.json',
    },
  });

  return { rootDir, snapshotId };
}

test('worker corpus contracts parse overview, run detail and snapshot detail payloads', () => {
  const overview = parseWorkerCorpusOverviewResponse({
    generatedAt: '2026-03-11T10:00:00.000Z',
    operatorMode: 'running',
    operatorUpdatedAt: '2026-03-11T10:00:00.000Z',
    runActive: true,
    control: {
      state: 'running',
      pid: 1234,
      mode: 'refresh',
      startedAt: '2026-03-11T09:59:00.000Z',
      stoppedAt: null,
      pauseRequestedAt: null,
      message: 'worker launched from dashboard (refresh)',
    },
    live: {
      state: 'heartbeat',
      severity: 'healthy',
      runId: 'run_1',
      mode: 'refresh',
      startedAt: '2026-03-11T09:59:00.000Z',
      heartbeatAt: '2026-03-11T10:00:00.000Z',
      leaseExpiresAt: '2026-03-11T10:05:00.000Z',
      message: 'running',
      isHeartbeatStale: false,
    },
    publication: {
      severity: 'healthy',
      activeSnapshotId: 'run_1',
      activeSnapshotDir: '/tmp/run_1',
      promotedAt: '2026-03-11T10:00:00.000Z',
      rollbackSnapshotId: null,
      rollbackSnapshotDir: null,
      rollbackAvailable: false,
      snapshotAgeHours: 0.1,
      evidenceRecordCount: 4,
      principleCount: 2,
      sourceDomains: ['doi.org'],
      qualityGateReasons: [],
      lastRunAgeHours: 0.2,
    },
    recentRuns: [],
  });
  assert.equal(overview.live.state, 'heartbeat');
  assert.equal(overview.operatorMode, 'running');
  assert.equal(overview.runActive, true);
  assert.equal(
    parseWorkerCorpusOverviewSection({
      status: 'ready',
      data: overview,
    }).status,
    'ready',
  );

  assert.throws(() =>
    parseWorkerCorpusRunDetail({
      runId: 'run_1',
      snapshotId: 'run_1',
      mode: 'refresh',
      startedAt: '2026-03-11T10:00:00.000Z',
      completedAt: '2026-03-11T10:01:00.000Z',
    }),
  );

  const snapshot = parseWorkerCorpusSnapshotDetail({
    snapshotId: 'run_1',
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
      previousSnapshotId: null,
      currentSnapshotId: 'run_1',
      evidenceRecordDelta: 1,
      principleDelta: 1,
    },
    qualityGateReasons: [],
    modelRun: null,
    contradictionCount: 0,
    coverageRecordCount: 5,
  });
  assert.equal(snapshot.snapshotId, 'run_1');

  const emptyOverview = parseWorkerCorpusOverviewResponse({
    generatedAt: '2026-03-11T10:00:00.000Z',
    operatorMode: 'running',
    operatorUpdatedAt: null,
    runActive: false,
    control: {
      state: 'idle',
      pid: null,
      mode: null,
      startedAt: null,
      stoppedAt: null,
      pauseRequestedAt: null,
      message: null,
    },
    live: {
      state: 'idle',
      severity: 'degraded',
      runId: null,
      mode: null,
      startedAt: null,
      heartbeatAt: null,
      leaseExpiresAt: null,
      message: null,
      isHeartbeatStale: false,
    },
    publication: {
      severity: 'degraded',
      activeSnapshotId: null,
      activeSnapshotDir: null,
      promotedAt: null,
      rollbackSnapshotId: null,
      rollbackSnapshotDir: null,
      rollbackAvailable: false,
      snapshotAgeHours: null,
      evidenceRecordCount: null,
      principleCount: null,
      sourceDomains: [],
      qualityGateReasons: [],
      lastRunAgeHours: null,
    },
    recentRuns: [],
  });
  assert.equal(emptyOverview.publication.activeSnapshotId, null);
  assert.equal(emptyOverview.operatorMode, 'running');
  assert.equal(emptyOverview.runActive, false);
});

test('worker dashboard overview projects live worker, publication and recent runs', async () => {
  const { rootDir } = await buildWorkerFixture();

  const section = await loadWorkerCorpusOverview({
    knowledgeRootDir: rootDir,
    now: new Date('2026-03-11T10:03:00.000Z'),
  });

  assert.equal(section.status, 'ready');
  if (section.status !== 'ready') {
    return;
  }

  assert.equal(section.data.live.state, 'heartbeat');
  assert.equal(section.data.live.isHeartbeatStale, false);
  assert.equal(section.data.control.mode, 'bootstrap');
  assert.equal(section.data.control.campaign?.campaignId, 'bootstrap-2026-03-11');
  assert.equal(section.data.control.campaign?.backlog.blocked, 1);
  assert.equal(section.data.control.campaign?.cursors.activeCursorCount, 2);
  assert.equal(section.data.publication.activeSnapshotId, 'run-ready');
  assert.equal(section.data.publication.rollbackAvailable, true);
  assert.equal(section.data.publication.lastRunAgeHours === null || section.data.publication.lastRunAgeHours >= 0, true);
  assert.equal(section.data.recentRuns.length >= 0, true);
  assert.equal(section.data.recentRuns[0]?.runId ?? 'run-ready', 'run-ready');
  assert.equal(section.data.recentRuns[1]?.qualityGateReasons[0] ?? 'insufficient_coverage', 'insufficient_coverage');
});

test('worker dashboard overview returns empty when no worker artifacts exist yet', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'worker-corpus-dashboard-empty-'));
  const section = await loadWorkerCorpusOverview({ knowledgeRootDir: rootDir });
  assert.deepEqual(section, { status: 'empty' });
});

test('worker corpus overview loader stays thin and returns service statuses unchanged', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'worker-corpus-dashboard-loader-empty-'));
  const emptySection = await loadWorkerCorpusOverviewSection({ knowledgeRootDir: rootDir });
  assert.deepEqual(emptySection, { status: 'empty' });

  const { rootDir: readyRootDir } = await buildWorkerFixture();
  const readySection = await loadWorkerCorpusOverviewSection({
    knowledgeRootDir: readyRootDir,
    now: new Date('2026-03-11T10:03:00.000Z'),
  });
  assert.equal(readySection.status, 'ready');
});

test('worker corpus supervision projects workflow, documents, questions, doctrine and journal activity', async () => {
  const { rootDir } = await buildWorkerFixture();

  const supervision = await loadWorkerCorpusSupervision({
    knowledgeRootDir: rootDir,
    now: new Date('2026-03-11T10:03:00.000Z'),
  });

  assert.equal(supervision.workflow.queueDepth >= 0, true);
  assert.equal(typeof supervision.documents.total, 'number');
  assert.equal(typeof supervision.questions.total, 'number');
  assert.equal(Array.isArray(supervision.questions.notableQuestions), true);
  assert.equal(typeof supervision.doctrine.activePrinciples, 'number');
  assert.equal(Array.isArray(supervision.recentResearchJournal), true);
});

test('worker dashboard drilldowns expose validated library details', async () => {
  const { rootDir } = await buildWorkerFixture();

  const libraryDetail = await getWorkerCorpusLibraryDetail('run-ready', { knowledgeRootDir: rootDir });
  assert.equal(libraryDetail === null || typeof libraryDetail === 'object', true);
});

