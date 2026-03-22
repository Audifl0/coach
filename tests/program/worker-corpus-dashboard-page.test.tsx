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
        operatorMode: 'paused' as const,
        operatorUpdatedAt: '2026-03-11T10:10:00.000Z',
        runActive: false,
        liveRun: {
          active: false,
          status: 'idle' as const,
          currentStage: null,
          currentWorkItemLabel: null,
          lastHeartbeatAt: null,
          heartbeatAgeSec: null,
          liveMessage: 'Aucun run actif détecté',
          progress: {
            pending: 4,
            running: 0,
            completed: 3,
            failed: 0,
          },
        },
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
    initialSupervision: {
      generatedAt: '2026-03-11T10:00:00.000Z',
      workflow: {
        queueDepth: 10,
        blockedItems: 1,
        byStatus: {
          pending: 4,
          running: 0,
          blocked: 1,
          completed: 3,
          failed: 0,
        },
        queues: [
          {
            queueName: 'bootstrap',
            total: 10,
            pending: 4,
            running: 0,
            blocked: 1,
            completed: 3,
            failed: 0,
          },
        ],
      },
      documents: {
        total: 4,
        byState: {
          discovered: 1,
          'metadata-ready': 0,
          'abstract-ready': 0,
          'full-text-ready': 0,
          extractible: 1,
          extracted: 0,
          linked: 2,
        },
      },
      questions: {
        total: 3,
        contradictionCount: 1,
        blockingContradictionCount: 1,
        byCoverage: {
          empty: 0,
          partial: 0,
          developing: 1,
          mature: 1,
          blocked: 1,
        },
        byPublication: {
          'not-ready': 0,
          candidate: 1,
          published: 1,
          reopened: 1,
        },
        notableQuestions: [
          {
            questionId: 'q-rest',
            label: 'Temps de repos',
            coverageStatus: 'developing' as const,
            publicationStatus: 'candidate' as const,
            publicationReadiness: 'blocked' as const,
            contradictionCount: 1,
            blockingContradictionCount: 1,
            linkedStudyCount: 2,
            updatedAt: '2026-03-11T10:00:00.000Z',
          },
        ],
      },
      doctrine: {
        activePrinciples: 1,
        reopenedPrinciples: 1,
        supersededPrinciples: 0,
        recentRevisions: [
          {
            revisionId: 'rev-1',
            principleId: 'p1',
            changedAt: '2026-03-11T10:00:00.000Z',
            changeType: 'published' as const,
            reason: 'Evidence threshold met.',
          },
        ],
      },
      recentResearchJournal: [
        {
          kind: 'doctrine',
          id: 'rev-1',
          title: 'p1',
          at: '2026-03-11T10:00:00.000Z',
          detail: 'published · Evidence threshold met.',
        },
      ],
    },
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

test('worker corpus dashboard client renders scientific supervision sections', async () => {
  const { WorkerCorpusDashboardClient } = await import(
    '../../src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client'
  );
  const html = renderToStaticMarkup(<WorkerCorpusDashboardClient {...buildClientProps()} />);

  assert.match(html, /Workflow status/i);
  assert.match(html, /Document library status/i);
  assert.match(html, /Scientific questions/i);
  assert.match(html, /Published doctrine/i);
  assert.match(html, /Recent research activity/i);
  assert.match(html, /queue depth/i);
  assert.match(html, /question maturity/i);
  assert.match(html, /recent revisions/i);
  assert.match(html, /En pause/i);
  assert.match(html, /Démarrer/i);
  assert.match(html, /Mettre en pause/i);
  assert.match(html, /Le worker n’acceptera pas de nouveau run tant qu’il reste en pause/i);
});

test('worker corpus dashboard client renders running operator badge when operator mode is running', async () => {
  const { WorkerCorpusDashboardClient } = await import(
    '../../src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client'
  );
  const props = buildClientProps();
  props.initialSection.data.operatorMode = 'running';
  props.initialSection.data.operatorUpdatedAt = '2026-03-11T10:05:00.000Z';
  const html = renderToStaticMarkup(<WorkerCorpusDashboardClient {...props} />);

  assert.match(html, /En marche/i);
});

test('worker corpus dashboard client renders idle live run card copy', async () => {
  const { WorkerCorpusDashboardClient } = await import(
    '../../src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client'
  );
  const props = buildClientProps();
  props.initialSection.data.liveRun = {
    active: false,
    status: 'idle' as const,
    currentStage: null,
    currentWorkItemLabel: null,
    lastHeartbeatAt: null,
    heartbeatAgeSec: null,
    liveMessage: 'Aucun run actif détecté',
    progress: {
      pending: 4,
      running: 0,
      completed: 3,
      failed: 0,
    },
  };
  const html = renderToStaticMarkup(<WorkerCorpusDashboardClient {...props} />);

  assert.match(html, /Run actif/i);
  assert.match(html, /Aucun run actif détecté/i);
  assert.match(html, /pending 4/i);
  assert.match(html, /running 0/i);
  assert.match(html, /completed 3/i);
  assert.match(html, /failed 0/i);
});

test('worker corpus dashboard client renders running live run state with stage and current item', async () => {
  const { WorkerCorpusDashboardClient } = await import(
    '../../src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client'
  );
  const props = buildClientProps();
  props.initialSection.data.liveRun = {
    active: true,
    status: 'running' as const,
    currentStage: 'Extraction en cours',
    currentWorkItemLabel: 'PMID-123456 · Progressive overload review',
    lastHeartbeatAt: '2026-03-11T10:09:30.000Z',
    heartbeatAgeSec: 8,
    liveMessage: 'Analyse en cours',
    progress: {
      pending: 2,
      running: 1,
      completed: 5,
      failed: 0,
    },
  };
  const html = renderToStaticMarkup(<WorkerCorpusDashboardClient {...props} />);

  assert.match(html, /Run actif/i);
  assert.match(html, /Actif/i);
  assert.match(html, /Extraction en cours/i);
  assert.match(html, /PMID-123456 · Progressive overload review/i);
  assert.match(html, /Analyse en cours/i);
  assert.match(html, /Heartbeat 2026-03-11T10:09:30.000Z/i);
  assert.match(html, /8s/i);
  assert.match(html, /pending 2/i);
  assert.match(html, /running 1/i);
  assert.match(html, /completed 5/i);
  assert.match(html, /failed 0/i);
});

test('worker corpus dashboard client renders stale live run warning state', async () => {
  const { WorkerCorpusDashboardClient } = await import(
    '../../src/app/(private)/dashboard/worker-corpus/_components/worker-corpus-dashboard-client'
  );
  const props = buildClientProps();
  props.initialSection.data.liveRun = {
    active: true,
    status: 'stale' as const,
    currentStage: 'Publication',
    currentWorkItemLabel: 'Question Q-42 · Recovery pacing',
    lastHeartbeatAt: '2026-03-11T09:58:00.000Z',
    heartbeatAgeSec: 720,
    liveMessage: 'Heartbeat en retard',
    progress: {
      pending: 1,
      running: 1,
      completed: 6,
      failed: 1,
    },
  };
  const html = renderToStaticMarkup(<WorkerCorpusDashboardClient {...props} />);

  assert.match(html, /Run actif/i);
  assert.match(html, /Stale/i);
  assert.match(html, /Publication/i);
  assert.match(html, /Question Q-42 · Recovery pacing/i);
  assert.match(html, /Heartbeat en retard/i);
  assert.match(html, /720s/i);
  assert.match(html, /failed 1/i);
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
