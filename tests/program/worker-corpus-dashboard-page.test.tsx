import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PublicationStatusCard } from '../../src/app/(private)/dashboard/worker-corpus/_components/publication-status-card';
import { RecentRunsCard } from '../../src/app/(private)/dashboard/worker-corpus/_components/recent-runs-card';
import { WorkerStatusCard } from '../../src/app/(private)/dashboard/worker-corpus/_components/worker-status-card';
import { resolveWorkerCorpusRefreshInterval } from '../../src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-live-client';

test('worker status card renders live lease, heartbeat and message', () => {
  const html = renderToStaticMarkup(
    <WorkerStatusCard
      loadState="ready"
      live={{
        state: 'heartbeat',
        severity: 'healthy',
        runId: 'run-live',
        mode: 'refresh',
        startedAt: '2026-03-11T10:00:00.000Z',
        heartbeatAt: '2026-03-11T10:02:00.000Z',
        leaseExpiresAt: '2026-03-11T10:07:00.000Z',
        message: 'discovering new evidence',
        isHeartbeatStale: false,
      }}
    />,
  );

  assert.match(html, /Worker status/);
  assert.match(html, /run-live/);
  assert.match(html, /discovering new evidence/);
  assert.match(html, /Heartbeat stale: no/);
});

test('publication status card exposes active snapshot, rollback and freshness', () => {
  const html = renderToStaticMarkup(
    <PublicationStatusCard
      loadState="ready"
      publication={{
        severity: 'degraded',
        activeSnapshotId: 'run-ready',
        activeSnapshotDir: '/tmp/run-ready',
        promotedAt: '2026-03-11T10:02:00.000Z',
        rollbackSnapshotId: null,
        rollbackSnapshotDir: null,
        rollbackAvailable: false,
        snapshotAgeHours: 2.5,
        evidenceRecordCount: 5,
        principleCount: 2,
        sourceDomains: ['doi.org', 'pubmed.ncbi.nlm.nih.gov'],
        qualityGateReasons: ['unresolved_contradiction'],
        lastRunAgeHours: 1.5,
      }}
    />,
  );

  assert.match(html, /run-ready/);
  assert.match(html, /Rollback available: no/);
  assert.match(html, /unresolved_contradiction/);
});

test('recent runs card renders blocked and succeeded runs with operator-facing reasons', () => {
  const html = renderToStaticMarkup(
    <RecentRunsCard
      loadState="ready"
      runs={[
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
        {
          runId: 'run-blocked',
          snapshotId: 'run-blocked',
          mode: 'check',
          startedAt: '2026-03-11T09:00:00.000Z',
          completedAt: '2026-03-11T09:01:00.000Z',
          artifactState: 'candidate',
          outcome: 'blocked',
          severity: 'degraded',
          finalStage: 'publish',
          finalMessage: 'blocked:insufficient_coverage',
          evidenceRecordCount: 2,
          principleCount: 1,
          sourceDomains: ['doi.org'],
          qualityGateReasons: ['insufficient_coverage'],
          isActiveSnapshot: false,
          isRollbackSnapshot: false,
        },
      ]}
    />,
  );

  assert.match(html, /run-ready/);
  assert.match(html, /run-blocked/);
  assert.match(html, /insufficient_coverage/);
});

test('empty and error states stay explicit in worker dashboard cards', () => {
  const emptyHtml = renderToStaticMarkup(<RecentRunsCard loadState="empty" />);
  const errorHtml = renderToStaticMarkup(<WorkerStatusCard loadState="error" />);

  assert.match(emptyHtml, /No completed or candidate run available yet/);
  assert.match(errorHtml, /Unable to load worker status/);
});

test('worker corpus live refresh interval is tighter while the worker is active', () => {
  assert.equal(resolveWorkerCorpusRefreshInterval('heartbeat'), 10_000);
  assert.equal(resolveWorkerCorpusRefreshInterval('started'), 10_000);
  assert.equal(resolveWorkerCorpusRefreshInterval('completed'), 30_000);
  assert.equal(resolveWorkerCorpusRefreshInterval('failed'), 30_000);
});
