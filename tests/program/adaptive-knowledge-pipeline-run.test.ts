import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ConnectorFetchResult } from '../../scripts/adaptive-knowledge/connectors/shared';
import { runAdaptiveKnowledgePipeline } from '../../scripts/adaptive-knowledge/pipeline-run';

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

test('pipeline executes deterministic stage order and writes candidate artifacts', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  const result = await runAdaptiveKnowledgePipeline({
    runId: 'run-order-test',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir,
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  const candidateDir = path.join(outputRootDir, 'snapshots', 'run-order-test', 'candidate');
  const sources = (await loadJson(path.join(candidateDir, 'sources.json'))) as { records: unknown[] };
  const principles = (await loadJson(path.join(candidateDir, 'principles.json'))) as { principles: unknown[] };
  const report = (await loadJson(path.join(candidateDir, 'run-report.json'))) as {
    stageReports: Array<{ stage: string }>;
  };

  assert.equal(result.candidateDir, candidateDir);
  assert.equal(sources.records.length, 3);
  assert.equal(principles.principles.length >= 1, true);
  assert.deepEqual(
    report.stageReports.map((stage) => stage.stage),
    ['discover', 'ingest', 'synthesize', 'validate', 'publish'],
  );
});

test('single-source fetch failure marks source skipped and completes run', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  const result = await runAdaptiveKnowledgePipeline({
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

  await runAdaptiveKnowledgePipeline({
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

  assert.deepEqual(windows, [730, 730, 730]);
});

test('synthesis output includes FR fields and non-empty provenance references', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  const result = await runAdaptiveKnowledgePipeline({
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

  const result = await runAdaptiveKnowledgePipeline({
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
        runId: 'run-synthesis-failure',
        now: new Date('2026-03-05T00:00:00.000Z'),
        outputRootDir,
        connectors: {
          pubmed: async () => buildConnectorSuccess('pubmed'),
          crossref: async () => buildConnectorSuccess('crossref'),
          openalex: async () => buildConnectorSuccess('openalex'),
        },
        synthesizeImpl: async () => {
          throw new Error('forced synthesis failure');
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
