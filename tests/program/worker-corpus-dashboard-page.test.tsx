import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { RunDetailPanel } from '../../src/app/(private)/dashboard/worker-corpus/_components/run-detail-panel';
import { SnapshotDetailPanel } from '../../src/app/(private)/dashboard/worker-corpus/_components/snapshot-detail-panel';

const require = createRequire(import.meta.url);
require.extensions['.css'] = (module) => {
  const proxy = new Proxy(
    {},
    {
      get: (_target, prop) => String(prop),
    },
  );
  module.exports = proxy;
  module.exports.default = proxy;
  module.exports.__esModule = true;
};

function buildClientProps() {
  return {
    initialSection: {
      status: 'ready' as const,
      data: {
        generatedAt: '2026-03-11T10:00:00.000Z',
        control: {
          state: 'paused' as const,
          pid: null,
          mode: 'bootstrap' as const,
          startedAt: '2026-03-11T08:00:00.000Z',
          stoppedAt: '2026-03-11T10:10:00.000Z',
          pauseRequestedAt: '2026-03-11T10:10:00.000Z',
          message: 'pause requested from dashboard',
          campaign: {
            campaignId: 'bootstrap-2026-03-11',
            status: 'paused' as const,
            startedAt: '2026-03-11T08:00:00.000Z',
            updatedAt: '2026-03-11T10:10:00.000Z',
            lastRunId: 'run-bootstrap-1',
            activeJobId: 'pubmed:progression-load',
            backlog: {
              pending: 4,
              running: 0,
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
              activeCursorCount: 2,
              sampleJobIds: ['pubmed:progression-load', 'crossref:progression-split'],
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
          state: 'completed' as const,
          severity: 'healthy' as const,
          runId: 'run-bootstrap-1',
          mode: 'bootstrap' as const,
          startedAt: '2026-03-11T09:59:00.000Z',
          heartbeatAt: '2026-03-11T10:00:00.000Z',
          leaseExpiresAt: '2026-03-11T10:05:00.000Z',
          message: 'bootstrap completed',
          isHeartbeatStale: false,
        },
        publication: {
          severity: 'healthy' as const,
          activeSnapshotId: 'run-ready',
          activeSnapshotDir: '/tmp/run-ready',
          promotedAt: '2026-03-11T10:02:00.000Z',
          rollbackSnapshotId: 'run-previous',
          rollbackSnapshotDir: '/tmp/run-previous',
          rollbackAvailable: true,
          snapshotAgeHours: 1.5,
          evidenceRecordCount: 5,
          principleCount: 2,
          sourceDomains: ['doi.org', 'pubmed.ncbi.nlm.nih.gov'],
          qualityGateReasons: [],
          lastRunAgeHours: 0.4,
        },
        recentRuns: [
          {
            runId: 'run-bootstrap-1',
            snapshotId: 'run-bootstrap-1',
            mode: 'bootstrap' as const,
            startedAt: '2026-03-11T09:59:00.000Z',
            completedAt: '2026-03-11T10:01:00.000Z',
            artifactState: 'candidate' as const,
            outcome: 'running' as const,
            severity: 'healthy' as const,
            finalStage: 'publish' as const,
            finalMessage: 'progressing:library_growth_detected,backfill_incomplete',
            evidenceRecordCount: 5,
            principleCount: 2,
            sourceDomains: ['doi.org'],
            qualityGateReasons: [],
            isActiveSnapshot: false,
            isRollbackSnapshot: false,
          },
        ],
      },
    },
    initialStatus: {
      generatedAt: '2026-03-11T10:00:00.000Z',
      control: {
        state: 'paused' as const,
        pid: null,
        mode: 'bootstrap' as const,
        startedAt: '2026-03-11T08:00:00.000Z',
        stoppedAt: '2026-03-11T10:10:00.000Z',
        pauseRequestedAt: '2026-03-11T10:10:00.000Z',
        message: 'pause requested from dashboard',
        campaign: {
          campaignId: 'bootstrap-2026-03-11',
          status: 'paused' as const,
          startedAt: '2026-03-11T08:00:00.000Z',
          updatedAt: '2026-03-11T10:10:00.000Z',
          lastRunId: 'run-bootstrap-1',
          activeJobId: 'pubmed:progression-load',
          backlog: {
            pending: 4,
            running: 0,
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
            activeCursorCount: 2,
            sampleJobIds: ['pubmed:progression-load', 'crossref:progression-split'],
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
        state: 'completed' as const,
        severity: 'healthy' as const,
        runId: 'run-bootstrap-1',
        mode: 'bootstrap' as const,
        startedAt: '2026-03-11T09:59:00.000Z',
        heartbeatAt: '2026-03-11T10:00:00.000Z',
        leaseExpiresAt: '2026-03-11T10:05:00.000Z',
        message: 'bootstrap completed',
        isHeartbeatStale: false,
      },
      publication: {
        severity: 'healthy' as const,
        activeSnapshotId: 'run-ready',
        activeSnapshotDir: '/tmp/run-ready',
        promotedAt: '2026-03-11T10:02:00.000Z',
        rollbackSnapshotId: 'run-previous',
        rollbackSnapshotDir: '/tmp/run-previous',
        rollbackAvailable: true,
        snapshotAgeHours: 1.5,
        evidenceRecordCount: 5,
        principleCount: 2,
        sourceDomains: ['doi.org', 'pubmed.ncbi.nlm.nih.gov'],
        qualityGateReasons: [],
        lastRunAgeHours: 0.4,
      },
    },
    initialRuns: [
      {
        runId: 'run-bootstrap-1',
        snapshotId: 'run-bootstrap-1',
        mode: 'bootstrap' as const,
        startedAt: '2026-03-11T09:59:00.000Z',
        completedAt: '2026-03-11T10:01:00.000Z',
        artifactState: 'candidate' as const,
        outcome: 'running' as const,
        severity: 'healthy' as const,
        finalStage: 'publish' as const,
        finalMessage: 'progressing:library_growth_detected,backfill_incomplete',
        evidenceRecordCount: 5,
        principleCount: 2,
        sourceDomains: ['doi.org'],
        qualityGateReasons: [],
        isActiveSnapshot: false,
        isRollbackSnapshot: false,
      },
    ],
    initialRunDetail: {
      runId: 'run-bootstrap-1',
      snapshotId: 'run-bootstrap-1',
      mode: 'bootstrap' as const,
      startedAt: '2026-03-11T09:59:00.000Z',
      completedAt: '2026-03-11T10:01:00.000Z',
      artifactState: 'candidate' as const,
      outcome: 'running' as const,
      severity: 'healthy' as const,
      finalStage: 'publish' as const,
      finalMessage: 'progressing:library_growth_detected,backfill_incomplete',
      evidenceRecordCount: 5,
      principleCount: 2,
      sourceDomains: ['doi.org'],
      qualityGateReasons: [],
      isActiveSnapshot: false,
      isRollbackSnapshot: false,
      generatedAt: '2026-03-11T10:01:00.000Z',
      stageReports: [
        { stage: 'discover' as const, status: 'succeeded' as const, message: 'discovered=6' },
        { stage: 'publish' as const, status: 'succeeded' as const, message: 'progressing:library_growth_detected,backfill_incomplete' },
      ],
      modelRun: {
        provider: 'openai',
        model: 'gpt-5',
        requestId: 'req_1',
        latencyMs: 1200,
      },
      contradictionCount: 0,
      coverageRecordCount: 5,
    },
    initialSnapshotDetail: {
      snapshotId: 'run-ready',
      artifactState: 'validated' as const,
      generatedAt: '2026-03-11T10:01:00.000Z',
      promotedAt: '2026-03-11T10:02:00.000Z',
      severity: 'healthy' as const,
      isActiveSnapshot: true,
      isRollbackSnapshot: false,
      snapshotAgeHours: 1.5,
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
    },
    initialLibrary: {
      generatedAt: '2026-03-11T10:00:00.000Z',
      entries: [
        {
          snapshotId: 'run-ready',
          runId: 'run-ready',
          mode: 'refresh' as const,
          artifactState: 'validated' as const,
          outcome: 'succeeded' as const,
          severity: 'healthy' as const,
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
      ],
    },
    initialLibraryDetail: {
      entry: {
        snapshotId: 'run-ready',
        runId: 'run-ready',
        mode: 'refresh' as const,
        artifactState: 'validated' as const,
        outcome: 'succeeded' as const,
        severity: 'healthy' as const,
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
      discovery: {
        targetTopicKeys: ['progression'],
        totalQueries: 6,
        coverageGaps: [],
      },
      ranking: {
        evaluatedRecordCount: 5,
        selectedRecordCount: 2,
        rejectedRecordCount: 3,
        topRecordIds: ['record_1'],
        rejectionCodes: ['stale_publication'],
      },
      connectorSummaries: [
        {
          source: 'pubmed',
          skipped: false,
          attempts: 1,
          rawResults: 20,
          recordsFetched: 5,
          recordsSkipped: 15,
          nextCursor: 'cursor-pubmed-2',
          skipReasons: {
            disallowedDomain: 0,
            stalePublication: 8,
            alreadySeen: 6,
            invalidUrl: 1,
            offTopic: 4,
          },
          error: null,
        },
      ],
      knowledgeBible: {
        principles: [
          {
            id: 'p1',
            title: 'Progressive overload',
            description: 'Guide compact.',
            guardrail: 'SAFE-03',
            tags: ['progression'],
            provenanceRecordIds: ['record_1'],
          },
        ],
        sources: [],
      },
    },
  };
}

test('worker corpus dashboard client renders bootstrap campaign controls and diagnostics', async () => {
  const { WorkerCorpusDashboardClient } = await import(
    '../../src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client'
  );
  const html = renderToStaticMarkup(<WorkerCorpusDashboardClient {...buildClientProps()} />);

  assert.match(html, /Bootstrap longue duree/);
  assert.match(html, /Mode de lancement/);
  assert.match(html, /Bootstrap/);
  assert.match(html, /Reprendre/);
  assert.match(html, /Reset scope/);
  assert.match(html, /Campaign progress/);
  assert.match(html, /cursor jobs 2/);
  assert.match(html, /budget canonical 250/);
  assert.match(html, /off-topic 4/);
});

test('run detail panel stays readable for progressing bootstrap runs', () => {
  const html = renderToStaticMarkup(
    <RunDetailPanel
      loadState="ready"
      detail={buildClientProps().initialRunDetail}
    />,
  );

  assert.match(html, /run-bootstrap-1/);
  assert.match(html, /bootstrap/);
  assert.match(html, /progressing:library_growth_detected,backfill_incomplete/);
});

test('snapshot detail panel preserves active runtime projection metadata', () => {
  const html = renderToStaticMarkup(
    <SnapshotDetailPanel
      loadState="ready"
      detail={buildClientProps().initialSnapshotDetail}
    />,
  );

  assert.match(html, /run-ready/);
  assert.match(html, /validated/);
  assert.match(html, /run-previous/);
});
