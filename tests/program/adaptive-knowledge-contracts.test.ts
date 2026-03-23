import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseAdaptiveKnowledgeBacklogHealthSummary,
  parseAdaptiveKnowledgeResearchFront,
  parseAdaptiveKnowledgeWorkItem,
  parseCorpusPrinciple,
  parseCorpusRunReport,
  parseCorpusSnapshotManifest,
  parseNormalizedEvidenceRecord,
} from '../../scripts/adaptive-knowledge/contracts';
import { parseWorkerCorpusBacklogDashboardPayload } from '../../src/lib/program/contracts';

function buildEvidenceRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'evidence-1',
    sourceType: 'guideline',
    sourceUrl: 'https://www.acsm.org/docs/resistance-training.pdf',
    sourceDomain: 'acsm.org',
    publishedAt: '2024-01-15',
    title: 'Resistance Training Progression',
    summaryEn: 'Conservative progression and readiness-based adjustment recommendations.',
    tags: ['progression', 'readiness'],
    provenanceIds: ['doi:10.1234/acsm.2024.01'],
    ...overrides,
  };
}

function buildPrinciple(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'principle-safe-progressive-overload',
    title: 'Safe Progressive Overload',
    summaryFr: 'Progression conservative avec priorite a la qualite d execution.',
    guidanceFr: 'Augmenter la charge uniquement quand la recuperation est stable.',
    provenanceRecordIds: ['evidence-1'],
    evidenceLevel: 'guideline',
    guardrail: 'SAFE-01',
    ...overrides,
  };
}

test('normalized evidence schema accepts only guideline/review/expertise with required source fields', () => {
  const parsed = parseNormalizedEvidenceRecord(buildEvidenceRecord());
  assert.equal(parsed.sourceType, 'guideline');
  assert.equal(parsed.sourceDomain, 'acsm.org');
  assert.equal(parsed.provenanceIds.length, 1);

  assert.throws(() => parseNormalizedEvidenceRecord(buildEvidenceRecord({ sourceType: 'blog' })));
  assert.throws(() => {
    const { sourceDomain: _unused, ...missingDomain } = buildEvidenceRecord();
    parseNormalizedEvidenceRecord(missingDomain);
  });
  assert.throws(() => parseNormalizedEvidenceRecord(buildEvidenceRecord({ sourceUrl: 'notaurl' })));
  assert.throws(() => parseNormalizedEvidenceRecord(buildEvidenceRecord({ provenanceIds: [] })));
  assert.throws(() =>
    parseNormalizedEvidenceRecord(
      buildEvidenceRecord({
        source_url: 'https://www.acsm.org/docs/resistance-training.pdf',
      }),
    ),
  );
});

test('principle synthesis schema requires FR fields and non-empty provenance references', () => {
  const parsed = parseCorpusPrinciple(buildPrinciple());
  assert.equal(parsed.summaryFr.includes('Progression'), true);
  assert.equal(parsed.provenanceRecordIds.length, 1);

  assert.throws(() => parseCorpusPrinciple(buildPrinciple({ summaryFr: '' })));
  assert.throws(() => parseCorpusPrinciple(buildPrinciple({ guidanceFr: '' })));
  assert.throws(() => parseCorpusPrinciple(buildPrinciple({ provenanceRecordIds: [] })));
  assert.throws(() =>
    parseCorpusPrinciple(
      buildPrinciple({
        extraField: 'should be rejected',
      }),
    ),
  );
});

test('snapshot manifest and run report schemas reject unknown fields and invalid stage transitions', () => {
  const manifest = parseCorpusSnapshotManifest({
    snapshotId: '2026-03-05T12-00-00Z',
    schemaVersion: 'v1',
    generatedAt: '2026-03-05T12:00:00.000Z',
    evidenceRecordCount: 3,
    principleCount: 4,
    sourceDomains: ['acsm.org', 'pubmed.ncbi.nlm.nih.gov'],
    artifacts: {
      indexPath: '.planning/knowledge/adaptive-coaching/index.json',
      principlesPath: '.planning/knowledge/adaptive-coaching/principles.json',
      reportPath: '.planning/knowledge/adaptive-coaching/run-report.json',
    },
  });
  assert.equal(manifest.principleCount, 4);

  assert.throws(() =>
    parseCorpusSnapshotManifest({
      ...manifest,
      unknownField: true,
    }),
  );

  const runReport = parseCorpusRunReport({
    runId: 'run-2026-03-05',
    mode: 'refresh',
    startedAt: '2026-03-05T11:58:00.000Z',
    completedAt: '2026-03-05T12:00:00.000Z',
    snapshotId: manifest.snapshotId,
    stageReports: [
      { stage: 'discover', status: 'succeeded' },
      { stage: 'ingest', status: 'succeeded' },
      { stage: 'fulltext', status: 'skipped' },
      { stage: 'extract-study-cards', status: 'skipped' },
      { stage: 'thematic-synthesis', status: 'skipped' },
      { stage: 'synthesize', status: 'succeeded' },
      { stage: 'validate', status: 'succeeded' },
      { stage: 'publish', status: 'succeeded' },
    ],
  });
  assert.equal(runReport.stageReports.length, 8);

  assert.throws(() =>
    parseCorpusRunReport({
      ...runReport,
      stageReports: [
        { stage: 'discover', status: 'succeeded' },
        { stage: 'ingest', status: 'failed' },
        { stage: 'validate', status: 'succeeded' },
      ],
    }),
  );

  assert.throws(() =>
    parseCorpusRunReport({
      ...runReport,
      stageReports: [
        { stage: 'discover', status: 'failed' },
        { stage: 'ingest', status: 'succeeded' },
      ],
    }),
  );

  assert.throws(() =>
    parseCorpusRunReport({
      ...runReport,
      debug: true,
    }),
  );
});

test('adaptive knowledge contracts parse research fronts and work items', () => {
  const front = parseAdaptiveKnowledgeResearchFront({
    id: 'front-progression-load-pubmed',
    source: 'pubmed',
    queryFamily: 'progression-load',
    status: 'active',
    topicKey: 'progression',
    query: 'resistance training load progression hypertrophy strength',
    pageCursor: { page: 0, nextCursor: null },
    attempts: 0,
    evidence: { pagesVisited: 0, reformulationsTried: 0, sourcesVisited: 1 },
  });

  const item = parseAdaptiveKnowledgeWorkItem({
    id: 'discover:front-progression-load-pubmed:page-0',
    kind: 'discover-front-page',
    status: 'ready',
    topicKey: 'progression',
    priorityScore: 0.91,
    blockedBy: [],
    targetId: front.id,
  });

  assert.equal(item.kind, 'discover-front-page');
  assert.equal(item.targetId, front.id);
});

test('adaptive knowledge contracts parse backlog health summaries', () => {
  const summary = parseAdaptiveKnowledgeBacklogHealthSummary({
    readyItems: 7,
    blockedItems: 2,
    noProgressReasons: ['duplicate-heavy', 'blocked-by-downstream'],
  });

  assert.equal(summary.readyItems, 7);
  assert.equal(summary.noProgressReasons.length, 2);
});

test('worker dashboard contracts parse backlog dashboard payloads', () => {
  const payload = parseWorkerCorpusBacklogDashboardPayload({
    generatedAt: '2026-03-23T00:00:00.000Z',
    queueHealth: {
      ready: 7,
      blocked: 2,
      inProgress: 1,
    },
    itemsByKind: {
      'discover-front-page': 4,
      'extract-study-card': 2,
      'publish-doctrine': 1,
    },
    noProgressReasons: ['duplicate-heavy'],
  });

  assert.equal(payload.queueHealth.ready, 7);
  assert.equal(payload.itemsByKind['publish-doctrine'], 1);
});

test('worker dashboard contracts reject backlog payloads missing declared backlog kinds', () => {
  assert.throws(() =>
    parseWorkerCorpusBacklogDashboardPayload({
      generatedAt: '2026-03-23T00:00:00.000Z',
      queueHealth: {
        ready: 7,
        blocked: 2,
        inProgress: 1,
      },
      itemsByKind: {
        'discover-front-page': 4,
        'extract-study-card': 2,
      },
      noProgressReasons: ['duplicate-heavy'],
    }),
  );
});
