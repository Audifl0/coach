import assert from 'node:assert/strict';
import { access, mkdtemp, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ConnectorFetchResult } from '../../scripts/adaptive-knowledge/connectors/shared';
import { runAdaptiveKnowledgePipeline } from '../../scripts/adaptive-knowledge/pipeline-run';
import { evaluateCorpusQualityGate } from '../../scripts/adaptive-knowledge/quality-gates';

function buildConnectorSuccess(source: 'pubmed' | 'crossref' | 'openalex'): ConnectorFetchResult {
  return {
    source,
    skipped: false,
    records: [
      {
        id: `${source}-1`,
        sourceType: source === 'pubmed' ? 'guideline' : 'review',
        sourceUrl: `https://${source === 'openalex' ? 'openalex.org' : source === 'crossref' ? 'doi.org' : 'pubmed.ncbi.nlm.nih.gov'}/${source}-1`,
        sourceDomain: source === 'openalex' ? 'openalex.org' : source === 'crossref' ? 'doi.org' : 'pubmed.ncbi.nlm.nih.gov',
        publishedAt: '2025-11-02',
        title: `${source} title`,
        summaryEn: `${source} summary`,
        tags: ['progression'],
        provenanceIds: [`${source}-1`],
      },
    ],
    recordsFetched: 1,
    recordsSkipped: 0,
    telemetry: {
      attempts: 1,
    },
  };
}

async function loadJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as unknown;
}

test('candidate with score below threshold is not publishable and active pointer remains unchanged', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-publish-'));
  const activePointerPath = path.join(outputRootDir, 'active.json');

  const result = await runAdaptiveKnowledgePipeline({
    runId: 'run-quality-score-blocked',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir,
    qualityGateOverrides: {
      threshold: 0.99,
    },
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  assert.equal(result.publish.publishable, false);
  assert.deepEqual(result.publish.reasons, ['score_below_threshold']);
  await assert.rejects(() => access(activePointerPath, constants.F_OK));
});

test('critical contradiction blocks publish even when quality score is high', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-publish-'));

  const result = await runAdaptiveKnowledgePipeline({
    runId: 'run-contradiction-blocked',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir,
    qualityGateOverrides: {
      threshold: 0.2,
      criticalContradictions: [{ code: 'incompatible_guardrail', severity: 'critical' }],
    },
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  assert.equal(result.publish.publishable, false);
  assert.deepEqual(result.publish.reasons, ['critical_contradiction']);
});

test('quality gate emits deterministic reasons for observability', async () => {
  const gate = evaluateCorpusQualityGate({
    now: new Date('2026-03-05T00:00:00.000Z'),
    threshold: 0.95,
    records: [
      {
        id: 'record-1',
        sourceType: 'review',
        sourceUrl: 'https://doi.org/10.1000/test',
        sourceDomain: 'doi.org',
        publishedAt: '2018-01-01',
        title: 'Old review',
        summaryEn: 'Aging source with weak recency.',
        tags: ['fatigue'],
        provenanceIds: ['record-1'],
      },
    ],
    criticalContradictions: [{ code: 'mutually-exclusive-principles', severity: 'critical' }],
  });

  assert.equal(gate.publishable, false);
  assert.deepEqual(gate.reasons, ['score_below_threshold', 'critical_contradiction']);
  assert.equal(gate.criticalContradictions, 1);
});

test('run report includes deterministic publish-block reason codes', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-publish-'));

  await runAdaptiveKnowledgePipeline({
    runId: 'run-publish-reason-codes',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir,
    qualityGateOverrides: {
      threshold: 0.99,
      criticalContradictions: [{ code: 'mutually-exclusive-principles', severity: 'critical' }],
    },
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  const report = (await loadJson(
    path.join(outputRootDir, 'snapshots', 'run-publish-reason-codes', 'candidate', 'run-report.json'),
  )) as {
    stageReports: Array<{ stage: string; message?: string }>;
  };
  const publishStage = report.stageReports.find((stage) => stage.stage === 'publish');
  assert.equal(publishStage?.message?.includes('score_below_threshold'), true);
  assert.equal(publishStage?.message?.includes('critical_contradiction'), true);
});
