import assert from 'node:assert/strict';
import { access, mkdtemp, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ConnectorFetchResult } from '../../scripts/adaptive-knowledge/connectors/shared';
import { runAdaptiveKnowledgePipeline } from '../../scripts/adaptive-knowledge/pipeline-run';
import { rollbackCorpusSnapshot } from '../../scripts/adaptive-knowledge/publish';
import { evaluateCorpusQualityGate } from '../../scripts/adaptive-knowledge/quality-gates';
import { buildValidatedSynthesisFromPrinciples, synthesizeCorpusPrinciples } from '../../scripts/adaptive-knowledge/synthesis';

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

function withRecordSuffix(result: ConnectorFetchResult, suffix: string): ConnectorFetchResult {
  return {
    ...result,
    records: result.records.map((record) => ({
      ...record,
      id: `${record.id}-${suffix}`,
      sourceUrl: record.sourceUrl.replace(/\/([^/]+)\/?$/, `/$1-${suffix}`),
      title: `${record.title} ${suffix}`,
      provenanceIds: record.provenanceIds.map((provenanceId) => `${provenanceId}-${suffix}`),
    })),
  };
}

async function loadJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as unknown;
}

async function runPipelineWithDeterministicSynthesis(
  input: Parameters<typeof runAdaptiveKnowledgePipeline>[0],
) {
  return runAdaptiveKnowledgePipeline({
    ...input,
    synthesizeImpl: async (records) => {
      const principles = synthesizeCorpusPrinciples(records);
      return {
        principles,
        validatedSynthesis: buildValidatedSynthesisFromPrinciples({
          records,
          principles,
          modelRun: {
            provider: 'deterministic',
            model: 'test-remote-synthesis',
            promptVersion: 'test-v1',
          },
        }),
      };
    },
  });
}

test('candidate with score below threshold is not publishable and active pointer remains unchanged', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-publish-'));
  const activePointerPath = path.join(outputRootDir, 'active.json');

  const result = await runPipelineWithDeterministicSynthesis({
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

  const result = await runPipelineWithDeterministicSynthesis({
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

  await runPipelineWithDeterministicSynthesis({
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

test('successful publish atomically swaps active pointer and persists previous active in rollback pointer', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-publish-'));
  const activePointerPath = path.join(outputRootDir, 'active.json');
  const rollbackPointerPath = path.join(outputRootDir, 'rollback.json');

  await runPipelineWithDeterministicSynthesis({
    runId: 'run-publish-baseline',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir,
    qualityGateOverrides: {
      threshold: 0.2,
    },
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  const baselinePointer = (await loadJson(activePointerPath)) as { snapshotId: string };
  assert.equal(baselinePointer.snapshotId, 'run-publish-baseline');
  await assert.rejects(() => access(rollbackPointerPath, constants.F_OK));

  await runPipelineWithDeterministicSynthesis({
    runId: 'run-publish-next',
    now: new Date('2026-03-06T00:00:00.000Z'),
    outputRootDir,
    qualityGateOverrides: {
      threshold: 0.2,
    },
    connectors: {
      pubmed: async () => withRecordSuffix(buildConnectorSuccess('pubmed'), 'next'),
      crossref: async () => withRecordSuffix(buildConnectorSuccess('crossref'), 'next'),
      openalex: async () => withRecordSuffix(buildConnectorSuccess('openalex'), 'next'),
    },
  });

  const activePointer = (await loadJson(activePointerPath)) as { snapshotId: string };
  const rollbackPointer = (await loadJson(rollbackPointerPath)) as { snapshotId: string };
  assert.equal(activePointer.snapshotId, 'run-publish-next');
  assert.equal(rollbackPointer.snapshotId, 'run-publish-baseline');
});

test('rollback restores previous active pointer atomically and writes run-report rollback event', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-publish-'));
  const reportPath = path.join(outputRootDir, 'run-report.json');

  await runPipelineWithDeterministicSynthesis({
    runId: 'run-rollback-baseline',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir,
    qualityGateOverrides: {
      threshold: 0.2,
    },
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  await runPipelineWithDeterministicSynthesis({
    runId: 'run-rollback-current',
    now: new Date('2026-03-06T00:00:00.000Z'),
    outputRootDir,
    qualityGateOverrides: {
      threshold: 0.2,
    },
    connectors: {
      pubmed: async () => withRecordSuffix(buildConnectorSuccess('pubmed'), 'current'),
      crossref: async () => withRecordSuffix(buildConnectorSuccess('crossref'), 'current'),
      openalex: async () => withRecordSuffix(buildConnectorSuccess('openalex'), 'current'),
    },
  });

  const rollback = await rollbackCorpusSnapshot({
    outputRootDir,
    runId: 'run-rollback-command',
    now: new Date('2026-03-07T00:00:00.000Z'),
    reportPath,
  });

  const activePointer = (await loadJson(path.join(outputRootDir, 'active.json'))) as { snapshotId: string };
  assert.equal(activePointer.snapshotId, 'run-rollback-baseline');
  assert.equal(rollback.restoredSnapshotId, 'run-rollback-baseline');

  const rollbackReport = (await loadJson(reportPath)) as { events: Array<{ type: string; snapshotId: string }> };
  assert.equal(rollbackReport.events.some((event) => event.type === 'rollback' && event.snapshotId === 'run-rollback-baseline'), true);
});

test('publish writes manifest, diff, and knowledge bible artifacts into the promoted snapshot', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-publish-'));

  await runPipelineWithDeterministicSynthesis({
    runId: 'run-manifest-artifacts',
    now: new Date('2026-03-08T00:00:00.000Z'),
    outputRootDir,
    qualityGateOverrides: {
      threshold: 0.2,
    },
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  const activePointer = (await loadJson(path.join(outputRootDir, 'active.json'))) as { snapshotDir: string };
  await access(path.join(activePointer.snapshotDir, 'manifest.json'), constants.F_OK);
  await access(path.join(activePointer.snapshotDir, 'diff.json'), constants.F_OK);
  await access(path.join(activePointer.snapshotDir, 'validated-synthesis.json'), constants.F_OK);
  await access(path.join(activePointer.snapshotDir, 'knowledge-bible.json'), constants.F_OK);
});
