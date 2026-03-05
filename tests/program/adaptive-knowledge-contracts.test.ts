import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseCorpusPrinciple,
  parseCorpusRunReport,
  parseCorpusSnapshotManifest,
  parseNormalizedEvidenceRecord,
} from '../../scripts/adaptive-knowledge/contracts';

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
      { stage: 'synthesize', status: 'succeeded' },
      { stage: 'validate', status: 'succeeded' },
      { stage: 'publish', status: 'succeeded' },
    ],
  });
  assert.equal(runReport.stageReports.length, 5);

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
