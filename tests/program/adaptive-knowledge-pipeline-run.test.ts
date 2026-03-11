import assert from 'node:assert/strict';
import { mkdtemp, readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ConnectorFetchResult } from '../../scripts/adaptive-knowledge/connectors/shared';
import { runAdaptiveKnowledgePipeline } from '../../scripts/adaptive-knowledge/pipeline-run';
import { buildValidatedSynthesisFromPrinciples, synthesizeCorpusPrinciples } from '../../scripts/adaptive-knowledge/synthesis';

function buildConnectorSuccess(source: 'pubmed' | 'crossref' | 'openalex'): ConnectorFetchResult {
  return {
    source,
    skipped: false,
    records: [
      {
        id: `${source}-1`,
        sourceType: 'review',
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

test('pipeline executes deterministic stage order and writes snapshot artifacts', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  const result = await runPipelineWithDeterministicSynthesis({
    runId: 'run-order-test',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir,
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  const activePointerPath = path.join(outputRootDir, 'active.json');
  const activePointer = (await loadJson(activePointerPath)) as { snapshotId: string };
  const snapshotDir = path.join(outputRootDir, 'snapshots', activePointer.snapshotId, 'validated');
  const sources = (await loadJson(path.join(snapshotDir, 'sources.json'))) as { records: unknown[] };
  const principles = (await loadJson(path.join(snapshotDir, 'principles.json'))) as { principles: unknown[] };
  const validated = (await loadJson(path.join(snapshotDir, 'validated-synthesis.json'))) as {
    principles: unknown[];
    modelRun: { provider: string };
  };
  const report = (await loadJson(path.join(snapshotDir, 'run-report.json'))) as {
    stageReports: Array<{ stage: string }>;
  };
  const sourcePayload = (await loadJson(path.join(snapshotDir, 'sources.json'))) as {
    discoveryPlan: Array<{ query: string }>;
  };

  assert.equal(result.candidateDir, path.join(outputRootDir, 'snapshots', 'run-order-test', 'candidate'));
  assert.equal(activePointer.snapshotId, 'run-order-test');
  assert.equal(sources.records.length, 3);
  assert.equal(principles.principles.length >= 1, true);
  assert.equal(validated.principles.length >= 1, true);
  assert.equal(validated.modelRun.provider, 'deterministic');
  assert.equal(sourcePayload.discoveryPlan.length >= 3, true);
  assert.deepEqual(
    report.stageReports.map((stage) => stage.stage),
    ['discover', 'ingest', 'synthesize', 'validate', 'publish'],
  );
});

test('single-source fetch failure marks source skipped and completes run', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  const result = await runPipelineWithDeterministicSynthesis({
    runId: 'run-source-skip',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir,
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => ({
        source: 'crossref',
        skipped: true,
        records: [],
        recordsFetched: 0,
        recordsSkipped: 0,
        telemetry: {
          attempts: 3,
        },
        error: {
          message: 'crossref down',
          attempts: 3,
        },
      }),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  const report = result.runReport;
  assert.equal(report.stageReports.find((stage) => stage.stage === 'ingest')?.status, 'succeeded');

  const sourceState = result.sources.find((source) => source.source === 'crossref');
  assert.equal(sourceState?.skipped, true);
  assert.equal(result.normalizedRecords.some((record) => record.id === 'crossref-1'), false);
});

test('backfill window passed to source fetch is bounded by active freshness window', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));
  const windows: number[] = [];

  await runPipelineWithDeterministicSynthesis({
    runId: 'run-backfill-window',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir,
    configOverrides: {
      freshnessWindowDays: 730,
      backfillMaxDays: 1460,
    },
    connectors: {
      pubmed: async (input) => {
        windows.push(input.freshnessWindowDays ?? 0);
        return buildConnectorSuccess('pubmed');
      },
      crossref: async (input) => {
        windows.push(input.freshnessWindowDays ?? 0);
        return buildConnectorSuccess('crossref');
      },
      openalex: async (input) => {
        windows.push(input.freshnessWindowDays ?? 0);
        return buildConnectorSuccess('openalex');
      },
    },
  });

  assert.deepEqual(windows, [730, 730, 730, 730, 730, 730]);
});

test('synthesis output includes FR fields and non-empty provenance references', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  const result = await runPipelineWithDeterministicSynthesis({
    runId: 'run-synthesis-fr',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir,
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  assert.equal(result.principles.length >= 1, true);
  for (const principle of result.principles) {
    assert.equal(principle.summaryFr.length > 0, true);
    assert.equal(principle.guidanceFr.length > 0, true);
    assert.equal(principle.provenanceRecordIds.length > 0, true);
  }
});

test('synthesis provenance references map only to records ingested in current run', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  const result = await runPipelineWithDeterministicSynthesis({
    runId: 'run-synthesis-provenance',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir,
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  const validRecordIds = new Set(result.normalizedRecords.map((record) => record.id));
  for (const principle of result.principles) {
    for (const provenanceId of principle.provenanceRecordIds) {
      assert.equal(validRecordIds.has(provenanceId), true);
    }
  }
});

test('synthesis failure yields deterministic stage error and blocks validation stage', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  await assert.rejects(
    () =>
      runAdaptiveKnowledgePipeline({
        synthesizeImpl: async (records) => {
          const principles = synthesizeCorpusPrinciples(records);
          buildValidatedSynthesisFromPrinciples({ records, principles });
          throw new Error('forced synthesis failure');
        },
        runId: 'run-synthesis-failure',
        now: new Date('2026-03-05T00:00:00.000Z'),
        outputRootDir,
        connectors: {
          pubmed: async () => buildConnectorSuccess('pubmed'),
          crossref: async () => buildConnectorSuccess('crossref'),
          openalex: async () => buildConnectorSuccess('openalex'),
        },
      }),
    /synthesize stage failed/i,
  );

  const reportPath = path.join(outputRootDir, 'snapshots', 'run-synthesis-failure', 'candidate', 'run-report.json');
  const report = (await loadJson(reportPath)) as {
    stageReports: Array<{ stage: string; status: string }>;
  };
  assert.equal(report.stageReports.find((stage) => stage.stage === 'synthesize')?.status, 'failed');
  assert.equal(report.stageReports.find((stage) => stage.stage === 'validate')?.status, 'skipped');
});

test('discovery plan stays deterministic for the same date/config input', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  const first = await runPipelineWithDeterministicSynthesis({
    runId: 'run-discovery-a',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir,
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  const second = await runPipelineWithDeterministicSynthesis({
    runId: 'run-discovery-b',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir: await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-')),
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  assert.equal(first.runReport.stageReports[0]?.message, second.runReport.stageReports[0]?.message);
});

test('run dedupes duplicate evidence records across discovered topics', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  const result = await runPipelineWithDeterministicSynthesis({
    runId: 'run-dedup',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir,
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => ({
        ...buildConnectorSuccess('crossref'),
        records: buildConnectorSuccess('pubmed').records,
      }),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  const uniqueIds = new Set(result.normalizedRecords.map((record) => record.id));
  assert.equal(result.normalizedRecords.length, uniqueIds.size);
  assert.equal(result.runReport.stageReports[1]?.message?.includes('deduped='), true);
});

test('rerun incremental cursor state is persisted and surfaced in run telemetry', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  await runPipelineWithDeterministicSynthesis({
    runId: 'run-incremental-a',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir,
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  const result = await runPipelineWithDeterministicSynthesis({
    runId: 'run-incremental-b',
    now: new Date('2026-03-06T00:00:00.000Z'),
    outputRootDir,
    connectors: {
      pubmed: async (input) => ({
        ...buildConnectorSuccess('pubmed'),
        records: (input.cursorState?.seenRecordIds.includes('pubmed-1') ? [] : buildConnectorSuccess('pubmed').records),
      }),
      crossref: async (input) => ({
        ...buildConnectorSuccess('crossref'),
        records: (input.cursorState?.seenRecordIds.includes('crossref-1') ? [] : buildConnectorSuccess('crossref').records),
      }),
      openalex: async (input) => ({
        ...buildConnectorSuccess('openalex'),
        records: (input.cursorState?.seenRecordIds.includes('openalex-1') ? [] : buildConnectorSuccess('openalex').records),
      }),
    },
  });

  await access(path.join(outputRootDir, 'connector-state.json'), constants.F_OK);
  assert.equal(result.runReport.stageReports[1]?.message?.includes('incrementalSkipped='), true);
});
