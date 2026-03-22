import assert from 'node:assert/strict';
import { mkdtemp, readFile, access, writeFile } from 'node:fs/promises';
import { constants, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ConnectorFetchResult } from '../../scripts/adaptive-knowledge/connectors/shared';
import {
  parseDocumentaryRecordStagingArtifact,
  parseAdaptiveKnowledgeBootstrapCampaignState,
  parseAdaptiveKnowledgeCollectionJob,
  parseCorpusRunReport,
} from '../../scripts/adaptive-knowledge/contracts';
import { parseAdaptiveKnowledgePipelineConfig } from '../../scripts/adaptive-knowledge/config';
import { buildAdaptiveKnowledgeBootstrapCollectionJobs } from '../../scripts/adaptive-knowledge/discovery';
import { runAdaptiveKnowledgePipeline } from '../../scripts/adaptive-knowledge/pipeline-run';
import {
  buildStructuredExtractionPlan,
  buildValidatedSynthesisFromPrinciples,
  synthesizeCorpusPrinciples,
} from '../../scripts/adaptive-knowledge/synthesis';
import { parseWorkerCorpusOverviewResponse } from '../../src/lib/program/contracts';

function buildConnectorSuccess(source: 'pubmed' | 'crossref' | 'openalex'): ConnectorFetchResult {
  const tagsBySource = {
    pubmed: ['progression', 'fatigue-readiness'],
    crossref: ['hypertrophy-dose', 'progression'],
    openalex: ['limitations-pain', 'exercise-selection'],
  } as const;
  return {
    source,
    skipped: false,
    records: [
      {
        id: `${source}-1`,
        sourceType: source === 'pubmed' ? 'guideline' : source === 'crossref' ? 'review' : 'expertise',
        sourceUrl: `https://${source === 'openalex' ? 'openalex.org' : source === 'crossref' ? 'doi.org' : 'pubmed.ncbi.nlm.nih.gov'}/${source}-1`,
        sourceDomain: source === 'openalex' ? 'openalex.org' : source === 'crossref' ? 'doi.org' : 'pubmed.ncbi.nlm.nih.gov',
        publishedAt: '2025-11-02',
        title: `${source} title`,
        summaryEn: `${source} summary`,
        tags: [...tagsBySource[source]],
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

/**
 * Resolve the snapshot directory — candidate/ if unpublished, validated/ if promoted.
 */
function resolveSnapshotDir(outputRootDir: string, runId: string): string {
  const candidate = path.join(outputRootDir, 'snapshots', runId, 'candidate');
  const validated = path.join(outputRootDir, 'snapshots', runId, 'validated');
  try {
    readFileSync(path.join(validated, 'manifest.json'));
    return validated;
  } catch {
    return candidate;
  }
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
    studyExtractions: unknown[];
  };
  const structuredExtractions = (await loadJson(path.join(snapshotDir, 'study-extractions.json'))) as {
    studyExtractions: unknown[];
  };
  const documentaryStaging = (await loadJson(path.join(snapshotDir, 'document-staging.json'))) as {
    records: Array<{
      documentary?: {
        status: string;
        acquisition?: { rejectionReason?: { code: string } | null };
      };
    }>;
  };
  const report = (await loadJson(path.join(snapshotDir, 'run-report.json'))) as {
    stageReports: Array<{ stage: string }>;
  };
  const sourcePayload = (await loadJson(path.join(snapshotDir, 'sources.json'))) as {
    discoveryPlan: Array<{ query: string; topicKey: string; subtopicKey: string; queryFamily: string }>;
    discovery: {
      targetTopicKeys: string[];
      coverageGaps: Array<{ topicKey: string; status: string }>;
    };
    ranking: {
      evaluatedRecordCount: number;
      selectedRecordCount: number;
      rejectedRecordCount: number;
      topRecordIds: string[];
    };
    selectedRecordIds: string[];
    rejectedRecordIds: string[];
    records: Array<{ id: string; ranking?: { compositeScore: number; selected: boolean; reasons: Array<{ code: string }> } }>;
  };

  assert.equal(result.candidateDir, path.join(outputRootDir, 'snapshots', 'run-order-test', 'candidate'));
  assert.equal(activePointer.snapshotId, 'run-order-test');
  assert.equal(sources.records.length, 3);
  assert.equal(principles.principles.length >= 1, true);
  assert.equal(validated.principles.length >= 1, true);
  assert.equal(validated.modelRun.provider, 'deterministic');
  assert.equal(Array.isArray(validated.studyExtractions), true);
  assert.equal(Array.isArray(structuredExtractions.studyExtractions), true);
  assert.equal(documentaryStaging.records.length, 3);
  assert.equal(documentaryStaging.records.every((record) => typeof record.documentary?.status === 'string'), true);
  assert.equal(sourcePayload.discoveryPlan.length >= 3, true);
  assert.equal(sourcePayload.discoveryPlan.every((query) => query.topicKey.length > 0), true);
  assert.equal(sourcePayload.discoveryPlan.every((query) => query.subtopicKey.length > 0), true);
  assert.equal(sourcePayload.discoveryPlan.every((query) => query.queryFamily.length > 0), true);
  assert.equal(sourcePayload.discovery.targetTopicKeys.length >= 1, true);
  assert.equal(sourcePayload.discovery.coverageGaps.length >= 1, true);
  assert.equal(sourcePayload.ranking.evaluatedRecordCount, 3);
  assert.equal(sourcePayload.ranking.selectedRecordCount >= 1, true);
  assert.equal(sourcePayload.selectedRecordIds.length >= 1, true);
  assert.equal(sourcePayload.records.every((record) => typeof record.ranking?.compositeScore === 'number'), true);
  assert.deepEqual(
    report.stageReports.map((stage) => stage.stage),
    ['discover', 'ingest', 'synthesize', 'validate', 'publish'],
  );
});

test('documentary staging persists acquisition statuses and rejection reasons separately from runtime snapshot payloads', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  await runPipelineWithDeterministicSynthesis({
    runId: 'run-document-staging',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir,
    connectors: {
      pubmed: async () => ({
        ...buildConnectorSuccess('pubmed'),
        records: [
          {
            ...buildConnectorSuccess('pubmed').records[0]!,
            id: 'doc-metadata',
            documentary: {
              status: 'metadata-only',
              acquisition: {
                attemptedAt: '2026-03-05T00:00:00.000Z',
                sourceKind: 'metadata',
                rejectionReason: null,
              },
            },
          },
        ],
      }),
      crossref: async () => ({
        ...buildConnectorSuccess('crossref'),
        records: [
          {
            ...buildConnectorSuccess('crossref').records[0]!,
            id: 'doc-full-text',
            documentary: {
              status: 'full-text-ready',
              acquisition: {
                attemptedAt: '2026-03-05T00:01:00.000Z',
                sourceKind: 'full-text',
                rejectionReason: null,
              },
            },
          },
        ],
      }),
      openalex: async () => ({
        ...buildConnectorSuccess('openalex'),
        records: [
          {
            ...buildConnectorSuccess('openalex').records[0]!,
            id: 'doc-blocked',
            documentary: {
              status: 'blocked',
              acquisition: {
                attemptedAt: '2026-03-05T00:02:00.000Z',
                sourceKind: 'abstract',
                rejectionReason: {
                  code: 'paywall-no-access',
                  reason: 'Full text unavailable for bootstrap acquisition.',
                },
              },
            },
          },
        ],
      }),
    },
  });

  const snapshotDir = resolveSnapshotDir(outputRootDir, 'run-document-staging');
  const documentaryArtifact = parseDocumentaryRecordStagingArtifact(
    await loadJson(path.join(snapshotDir, 'document-staging.json')),
  );
  const sourcesArtifact = (await loadJson(path.join(snapshotDir, 'sources.json'))) as {
    records: Array<{ id: string; documentary?: { status: string } }>;
  };

  assert.deepEqual(
    documentaryArtifact.records.map((record) => record.documentary.status),
    ['metadata-only', 'full-text-ready', 'blocked'],
  );
  assert.equal(
    documentaryArtifact.records.find((record) => record.id === 'doc-blocked')?.documentary.acquisition.rejectionReason?.code,
    'paywall-no-access',
  );
  assert.equal(sourcesArtifact.records.some((record) => record.id === 'doc-blocked'), true);
  assert.equal(
    documentaryArtifact.runtimeProjection.recordIds.every((recordId) =>
      sourcesArtifact.records.some((record) => record.id === recordId),
    ),
    true,
  );
});

test('documentary staging contract remains backward-compatible with legacy normalized records', () => {
  const artifact = parseDocumentaryRecordStagingArtifact({
    runId: 'legacy-documentary',
    generatedAt: '2026-03-05T00:00:00.000Z',
    runtimeProjection: {
      recordIds: ['legacy-record'],
      promotedRecordIds: ['legacy-record'],
    },
    records: [
      {
        id: 'legacy-record',
        sourceType: 'review',
        sourceUrl: 'https://doi.org/10.1000/legacy-record',
        sourceDomain: 'doi.org',
        publishedAt: '2025-01-01',
        title: 'Legacy record',
        summaryEn: 'Legacy normalized record without documentary acquisition metadata.',
        tags: ['progression'],
        provenanceIds: ['legacy-record'],
      },
    ],
  });

  assert.equal(artifact.records[0]?.documentary.status, 'metadata-only');
  assert.equal(artifact.records[0]?.documentary.acquisition.rejectionReason, null);
});

test('pipeline triages documentary staging before synthesis and defers non-extractable records', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));
  let synthesizedRecordIds: string[] = [];

  await runAdaptiveKnowledgePipeline({
    runId: 'run-document-triage',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir,
    connectors: {
      pubmed: async () => ({
        ...buildConnectorSuccess('pubmed'),
        records: [
          {
            ...buildConnectorSuccess('pubmed').records[0]!,
            id: 'doc-abstract',
            documentary: {
              status: 'abstract-ready',
              acquisition: {
                attemptedAt: '2026-03-05T00:00:00.000Z',
                sourceKind: 'abstract',
                rejectionReason: null,
              },
            },
          },
          {
            ...buildConnectorSuccess('pubmed').records[0]!,
            id: 'doc-metadata-only',
            title: 'Metadata only document',
            sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/doc-metadata-only',
            sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
            provenanceIds: ['doc-metadata-only'],
            documentary: {
              status: 'metadata-only',
              acquisition: {
                attemptedAt: '2026-03-05T00:01:00.000Z',
                sourceKind: 'metadata',
                rejectionReason: null,
              },
            },
          },
        ],
      }),
      crossref: async () => ({
        ...buildConnectorSuccess('crossref'),
        records: [
          {
            ...buildConnectorSuccess('crossref').records[0]!,
            id: 'doc-full-text',
            documentary: {
              status: 'full-text-ready',
              acquisition: {
                attemptedAt: '2026-03-05T00:02:00.000Z',
                sourceKind: 'full-text',
                rejectionReason: null,
              },
            },
          },
        ],
      }),
      openalex: async () => ({
        ...buildConnectorSuccess('openalex'),
        records: [
          {
            ...buildConnectorSuccess('openalex').records[0]!,
            id: 'doc-blocked',
            documentary: {
              status: 'blocked',
              acquisition: {
                attemptedAt: '2026-03-05T00:03:00.000Z',
                sourceKind: 'abstract',
                rejectionReason: {
                  code: 'license-blocked',
                  reason: 'Blocked for extraction.',
                },
              },
            },
          },
        ],
      }),
    },
    synthesizeImpl: async (records) => {
      synthesizedRecordIds = records.map((record) => record.id);
      const principles = synthesizeCorpusPrinciples(records);
      return {
        principles,
        validatedSynthesis: buildValidatedSynthesisFromPrinciples({
          records,
          principles,
        }),
      };
    },
  });

  const snapshotDir = resolveSnapshotDir(outputRootDir, 'run-document-triage');
  const documentaryArtifact = parseDocumentaryRecordStagingArtifact(
    await loadJson(path.join(snapshotDir, 'document-staging.json')),
  );

  assert.deepEqual(synthesizedRecordIds, ['doc-full-text', 'doc-abstract']);
  assert.deepEqual(documentaryArtifact.triage?.extractableRecordIds, ['doc-full-text', 'doc-abstract']);
  assert.deepEqual(documentaryArtifact.triage?.deferredRecordIds, ['doc-blocked', 'doc-metadata-only']);
});

test('structured extraction planner budgets lots and defers overflow instead of dropping documents', () => {
  const plan = buildStructuredExtractionPlan({
    records: [
      {
        ...buildConnectorSuccess('pubmed').records[0]!,
        id: 'doc-a',
        documentary: {
          status: 'full-text-ready',
          acquisition: { sourceKind: 'full-text', rejectionReason: null },
        },
      },
      {
        ...buildConnectorSuccess('pubmed').records[0]!,
        id: 'doc-b',
        documentary: {
          status: 'full-text-ready',
          acquisition: { sourceKind: 'full-text', rejectionReason: null },
        },
      },
      {
        ...buildConnectorSuccess('crossref').records[0]!,
        id: 'doc-c',
        documentary: {
          status: 'abstract-ready',
          acquisition: { sourceKind: 'abstract', rejectionReason: null },
        },
      },
      {
        ...buildConnectorSuccess('crossref').records[0]!,
        id: 'doc-d',
        documentary: {
          status: 'abstract-ready',
          acquisition: { sourceKind: 'abstract', rejectionReason: null },
        },
      },
      {
        ...buildConnectorSuccess('openalex').records[0]!,
        id: 'doc-e',
        documentary: {
          status: 'metadata-only',
          acquisition: { sourceKind: 'metadata', rejectionReason: null },
        },
      },
    ],
    maxRecordsPerLot: 2,
    maxLots: 2,
  });

  assert.equal(plan.lots.length, 2);
  assert.deepEqual(
    plan.lots.map((lot) => lot.records.map((record) => record.id)),
    [
      ['doc-a', 'doc-b'],
      ['doc-c', 'doc-d'],
    ],
  );
  assert.deepEqual(plan.deferredRecordIds, ['doc-e']);
  assert.equal(plan.telemetry.deferredByBudget, 0);
  assert.equal(plan.telemetry.deferredByDocumentState, 1);
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
  assert.deepEqual(first.runReport.discovery, second.runReport.discovery);
  assert.deepEqual(first.runReport.ranking, second.runReport.ranking);
});

test('run report exposes discovery topics and coverage gaps for operator telemetry', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  const result = await runPipelineWithDeterministicSynthesis({
    runId: 'run-discovery-telemetry',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir,
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  assert.equal((result.runReport.discovery?.targetTopicKeys.length ?? 0) >= 1, true);
  assert.equal((result.runReport.discovery?.coverageGaps.length ?? 0) >= 1, true);
  assert.equal(
    result.runReport.discovery?.coverageGaps.some((gap) => gap.status === 'partial' || gap.status === 'uncovered'),
    true,
  );
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

test('ranking telemetry prioritizes higher-quality records before synthesis', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  const result = await runPipelineWithDeterministicSynthesis({
    runId: 'run-ranking-priority',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir,
    connectors: {
      pubmed: async () => ({
        ...buildConnectorSuccess('pubmed'),
        records: [
          {
            ...buildConnectorSuccess('pubmed').records[0]!,
            id: 'guideline-strong',
            sourceType: 'guideline',
            title: 'Comprehensive progression guideline',
            summaryEn: 'Detailed guidance on progression, fatigue management, readiness, and safe adaptation.',
            tags: ['progression', 'fatigue', 'readiness', 'limitations-pain'],
          },
        ],
      }),
      crossref: async () => ({
        ...buildConnectorSuccess('crossref'),
        records: [
          {
            ...buildConnectorSuccess('crossref').records[0]!,
            id: 'expertise-weak',
            sourceType: 'expertise',
            publishedAt: '2020-01-01',
            summaryEn: 'Short note.',
            tags: ['progression'],
          },
        ],
      }),
      openalex: async () => ({
        ...buildConnectorSuccess('openalex'),
        records: [
          {
            ...buildConnectorSuccess('openalex').records[0]!,
            id: 'review-mid',
            sourceType: 'review',
            tags: ['progression', 'fatigue-readiness'],
          },
        ],
      }),
    },
  });

  assert.equal((result.runReport.ranking?.selectedRecordCount ?? 0) >= 1, true);
  assert.equal(
    (result.normalizedRecords[0]?.ranking?.compositeScore ?? 0) >=
      (result.normalizedRecords[2]?.ranking?.compositeScore ?? 0),
    true,
  );
  assert.equal(
    result.normalizedRecords.some((record) =>
      record.ranking?.reasons.some((reason) => reason.code === 'score_below_selection_threshold'),
    ),
    true,
  );
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

test('bootstrap config exposes dedicated campaign budgets without mutating refresh defaults', () => {
  const config = parseAdaptiveKnowledgePipelineConfig({
    freshnessWindowDays: 365,
    backfillMaxDays: 1825,
    maxQueriesPerRun: 6,
    bootstrapMaxJobsPerRun: 12,
    bootstrapMaxPagesPerJob: 7,
    bootstrapMaxCanonicalRecordsPerRun: 240,
    bootstrapMaxRuntimeMs: 900_000,
  });

  assert.equal(config.maxQueriesPerRun, 6);
  assert.deepEqual(config.bootstrap, {
    maxJobsPerRun: 12,
    maxPagesPerJob: 7,
    maxCanonicalRecordsPerRun: 240,
    maxRuntimeMs: 900_000,
  });
});

test('bootstrap campaign state and run reports accept durable bootstrap mode metadata', () => {
  const campaign = parseAdaptiveKnowledgeBootstrapCampaignState({
    schemaVersion: 'v1',
    campaignId: 'bootstrap-2026-03-13',
    status: 'running',
    mode: 'bootstrap',
    startedAt: '2026-03-13T10:00:00.000Z',
    updatedAt: '2026-03-13T10:05:00.000Z',
    lastRunId: 'run-bootstrap-1',
    activeJobId: 'job-pubmed-progressive',
    backlog: {
      pending: 18,
      running: 1,
      blocked: 0,
      completed: 4,
    },
    progress: {
      discoveredQueryFamilies: 6,
      canonicalRecordCount: 120,
      extractionBacklogCount: 42,
      publicationCandidateCount: 15,
    },
  });

  assert.equal(campaign.mode, 'bootstrap');
  assert.equal(campaign.backlog.pending, 18);

  const report = parseCorpusRunReport({
    runId: 'run-bootstrap-1',
    mode: 'bootstrap',
    startedAt: '2026-03-13T10:00:00.000Z',
    completedAt: '2026-03-13T10:15:00.000Z',
    snapshotId: 'run-bootstrap-1',
    stageReports: [
      { stage: 'discover', status: 'succeeded', message: 'ok' },
      { stage: 'ingest', status: 'succeeded', message: 'ok' },
      { stage: 'synthesize', status: 'skipped', message: 'deferred-to-bootstrap' },
      { stage: 'validate', status: 'skipped', message: 'deferred-to-bootstrap' },
      { stage: 'publish', status: 'skipped', message: 'deferred-to-bootstrap' },
    ],
  });

  assert.equal(report.mode, 'bootstrap');
});

test('bootstrap mode persists and reloads campaign progress across reruns', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  await runPipelineWithDeterministicSynthesis({
    runId: 'run-bootstrap-a',
    mode: 'bootstrap',
    now: new Date('2026-03-13T10:00:00.000Z'),
    outputRootDir,
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  const firstCampaign = parseAdaptiveKnowledgeBootstrapCampaignState(
    await loadJson(path.join(outputRootDir, 'bootstrap-state.json')),
  );
  assert.equal(firstCampaign.status, 'completed');
  assert.equal(firstCampaign.lastRunId, 'run-bootstrap-a');
  assert.equal(firstCampaign.progress.canonicalRecordCount, 3);

  await runPipelineWithDeterministicSynthesis({
    runId: 'run-bootstrap-b',
    mode: 'bootstrap',
    now: new Date('2026-03-14T10:00:00.000Z'),
    outputRootDir,
    connectors: {
      pubmed: async () => ({
        ...buildConnectorSuccess('pubmed'),
        records: [
          {
            ...buildConnectorSuccess('pubmed').records[0]!,
            id: 'pubmed-2',
            provenanceIds: ['pubmed-2'],
          },
        ],
      }),
      crossref: async (input) => ({
        ...buildConnectorSuccess('crossref'),
        records: input.cursorState?.seenRecordIds.includes('crossref-1') ? [] : buildConnectorSuccess('crossref').records,
      }),
      openalex: async (input) => ({
        ...buildConnectorSuccess('openalex'),
        records: input.cursorState?.seenRecordIds.includes('openalex-1') ? [] : buildConnectorSuccess('openalex').records,
      }),
    },
  });

  const secondCampaign = parseAdaptiveKnowledgeBootstrapCampaignState(
    await loadJson(path.join(outputRootDir, 'bootstrap-state.json')),
  );
  assert.equal(secondCampaign.campaignId, firstCampaign.campaignId);
  assert.equal(secondCampaign.startedAt, firstCampaign.startedAt);
  assert.equal(secondCampaign.lastRunId, 'run-bootstrap-b');
  assert.equal(secondCampaign.progress.canonicalRecordCount, 3);
});

test('shared worker dashboard contracts accept bootstrap campaign metadata', () => {
  const overview = parseWorkerCorpusOverviewResponse({
    generatedAt: '2026-03-13T10:30:00.000Z',
    control: {
      state: 'running',
      pid: 4242,
      mode: 'bootstrap',
      startedAt: '2026-03-13T10:00:00.000Z',
      stoppedAt: null,
      pauseRequestedAt: null,
      message: 'bootstrap campaign active',
      campaign: {
        campaignId: 'bootstrap-run',
        status: 'running',
        startedAt: '2026-03-13T10:00:00.000Z',
        updatedAt: '2026-03-13T10:30:00.000Z',
        lastRunId: 'run-bootstrap-b',
        activeJobId: 'job-pubmed',
        backlog: {
          pending: 12,
          running: 1,
          blocked: 0,
          completed: 4,
          exhausted: 0,
        },
        progress: {
          discoveredQueryFamilies: 6,
          canonicalRecordCount: 4,
          extractionBacklogCount: 2,
          publicationCandidateCount: 1,
        },
        cursors: {
          resumableJobCount: 3,
          activeCursorCount: 2,
          sampleJobIds: ['job-pubmed'],
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
      state: 'heartbeat',
      severity: 'healthy',
      runId: 'run-bootstrap-b',
      mode: 'bootstrap',
      startedAt: '2026-03-13T10:00:00.000Z',
      heartbeatAt: '2026-03-13T10:30:00.000Z',
      leaseExpiresAt: '2026-03-13T10:35:00.000Z',
      message: 'running',
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
      lastRunAgeHours: 0.5,
    },
    recentRuns: [],
  });

  assert.equal(overview.control.mode, 'bootstrap');
  assert.equal(overview.control.campaign?.progress.canonicalRecordCount, 4);
});

test('bootstrap discovery generates prioritized collection jobs and skips already completed ones', () => {
  const jobs = buildAdaptiveKnowledgeBootstrapCollectionJobs({
    sources: ['pubmed', 'crossref', 'openalex'],
    maxJobs: 4,
    existingJobs: [
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
        status: 'completed',
        targetPopulation: null,
        cursor: null,
        pagesFetched: 1,
        recordsFetched: 20,
        canonicalRecords: 12,
        lastError: null,
      },
    ],
  });

  assert.equal(jobs.length, 4);
  assert.equal(jobs.some((job) => job.id === 'pubmed:progression-load'), false);
  assert.deepEqual(
    jobs.map((job) => parseAdaptiveKnowledgeCollectionJob(job).status),
    ['pending', 'pending', 'pending', 'pending'],
  );
  assert.equal(jobs[0]?.priority <= jobs[1]?.priority!, true);
});

test('bootstrap mode persists collection jobs and does not recreate completed work on rerun', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  await runPipelineWithDeterministicSynthesis({
    runId: 'run-bootstrap-jobs-a',
    mode: 'bootstrap',
    now: new Date('2026-03-13T10:00:00.000Z'),
    outputRootDir,
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  const firstJobs = (await loadJson(path.join(outputRootDir, 'bootstrap-jobs.json'))) as unknown[];
  assert.equal(firstJobs.length >= 3, true);
  assert.equal(
    firstJobs.some((job) => ['completed', 'exhausted'].includes(parseAdaptiveKnowledgeCollectionJob(job).status)),
    true,
  );

  await runPipelineWithDeterministicSynthesis({
    runId: 'run-bootstrap-jobs-b',
    mode: 'bootstrap',
    now: new Date('2026-03-14T10:00:00.000Z'),
    outputRootDir,
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  const secondJobs = (await loadJson(path.join(outputRootDir, 'bootstrap-jobs.json'))) as unknown[];
  const parsedJobs = secondJobs.map((job) => parseAdaptiveKnowledgeCollectionJob(job));
  const completedIds = parsedJobs
    .filter((job) => ['completed', 'exhausted'].includes(job.status))
    .map((job) => job.id);
  assert.equal(new Set(completedIds).size, completedIds.length);
  assert.deepEqual(
    completedIds.filter((id) => id === 'pubmed:progression-load'),
    ['pubmed:progression-load'],
  );
});

test('bootstrap connectors receive job-specific cursor and query family on rerun', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  const existingJobs = [
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
  ];
  await writeFile(path.join(outputRootDir, 'bootstrap-jobs.json'), JSON.stringify(existingJobs, null, 2) + '\n', 'utf8');

  const seenJobs: Array<{ id: string | null; cursor: string | null; queryFamily: string | null }> = [];

  await runPipelineWithDeterministicSynthesis({
    runId: 'run-bootstrap-cursor',
    mode: 'bootstrap',
    now: new Date('2026-03-15T10:00:00.000Z'),
    outputRootDir,
    connectors: {
      pubmed: async (input) => {
        seenJobs.push({
          id: input.collectionJob?.id ?? null,
          cursor: input.collectionJob?.cursor ?? null,
          queryFamily: input.collectionJob?.queryFamily ?? null,
        });
        return buildConnectorSuccess('pubmed');
      },
      crossref: async () => ({ ...buildConnectorSuccess('crossref'), records: [] }),
      openalex: async () => ({ ...buildConnectorSuccess('openalex'), records: [] }),
    },
  });

  assert.deepEqual(seenJobs, [
    {
      id: 'pubmed:progression-load',
      cursor: 'cursor-pubmed-2',
      queryFamily: 'progression-load',
    },
  ]);
});

test('pipeline dedupes cross-source records that collapse to the same canonical identity', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  const pubmedRecord = buildConnectorSuccess('pubmed').records[0]!;
  const crossrefRecord = {
    ...buildConnectorSuccess('crossref').records[0]!,
    id: 'crossref-doi-1',
    title: pubmedRecord.title,
    summaryEn: pubmedRecord.summaryEn,
  };

  const result = await runPipelineWithDeterministicSynthesis({
    runId: 'run-bootstrap-canonical',
    now: new Date('2026-03-15T10:00:00.000Z'),
    outputRootDir,
    connectors: {
      pubmed: async () => ({
        ...buildConnectorSuccess('pubmed'),
        records: [pubmedRecord],
      }),
      crossref: async () => ({
        ...buildConnectorSuccess('crossref'),
        records: [crossrefRecord],
      }),
      openalex: async () => ({ ...buildConnectorSuccess('openalex'), records: [] }),
    },
  });

  assert.equal(result.normalizedRecords.length, 1);
  assert.equal(result.normalizedRecords[0]?.canonicalId?.length ? true : false, true);
  assert.deepEqual(result.normalizedRecords[0]?.provenanceIds.sort(), ['crossref-doi-1', 'pubmed-1']);
});

test('bootstrap reports expose queue depth, pages consumed, and exhaustion reasons', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  const existingJobs = [
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
      cursor: 'cursor-pubmed-3',
      pagesFetched: 3,
      recordsFetched: 24,
      canonicalRecords: 12,
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
      status: 'pending',
      targetPopulation: null,
      cursor: null,
      pagesFetched: 0,
      recordsFetched: 0,
      canonicalRecords: 0,
      lastError: null,
    },
  ];
  await writeFile(path.join(outputRootDir, 'bootstrap-jobs.json'), JSON.stringify(existingJobs, null, 2) + '\n', 'utf8');

  const result = await runPipelineWithDeterministicSynthesis({
    runId: 'run-bootstrap-progress-report',
    mode: 'bootstrap',
    now: new Date('2026-03-15T11:00:00.000Z'),
    outputRootDir,
    configOverrides: {
      bootstrapMaxJobsPerRun: 1,
    },
    connectors: {
      pubmed: async () => ({
        source: 'pubmed',
        skipped: false,
        records: [],
        recordsFetched: 0,
        recordsSkipped: 20,
        telemetry: {
          attempts: 1,
          rawResults: 20,
          skipReasons: {
            disallowedDomain: 0,
            stalePublication: 0,
            alreadySeen: 20,
            invalidUrl: 0,
            offTopic: 0,
          },
        },
      }),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  assert.deepEqual(result.runReport.bootstrap?.queueDepth, {
    pending: 1,
    running: 0,
    blocked: 0,
    completed: 0,
    exhausted: 1,
    total: 2,
  });
  assert.equal(result.runReport.bootstrap?.jobsProcessed, 1);
  assert.equal(result.runReport.bootstrap?.pagesConsumed, 1);
  assert.deepEqual(result.runReport.bootstrap?.exhaustionReasons, {
    sourceExhausted: 1,
    maxPagesReached: 0,
    blocked: 0,
    deferred: 1,
  });
  assert.equal(result.runReport.stageReports.find((stage) => stage.stage === 'ingest')?.status, 'succeeded');
});

test('bootstrap tick can leave pending jobs without being considered a failure', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  await writeFile(
    path.join(outputRootDir, 'bootstrap-jobs.json'),
    JSON.stringify(
      [
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
          cursor: null,
          pagesFetched: 0,
          recordsFetched: 0,
          canonicalRecords: 0,
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
          status: 'pending',
          targetPopulation: null,
          cursor: null,
          pagesFetched: 0,
          recordsFetched: 0,
          canonicalRecords: 0,
          lastError: null,
        },
      ],
      null,
      2,
    ) + '\n',
    'utf8',
  );

  const result = await runPipelineWithDeterministicSynthesis({
    runId: 'run-bootstrap-short-tick',
    mode: 'bootstrap',
    now: new Date('2026-03-15T12:00:00.000Z'),
    outputRootDir,
    configOverrides: {
      bootstrapMaxJobsPerRun: 1,
    },
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  const persistedJobs = ((await loadJson(path.join(outputRootDir, 'bootstrap-jobs.json'))) as unknown[]).map((job) =>
    parseAdaptiveKnowledgeCollectionJob(job),
  );

  assert.equal(result.runReport.stageReports.some((stage) => stage.status === 'failed'), false);
  assert.equal(result.runReport.bootstrap?.queueDepth.pending, 1);
  assert.equal(result.runReport.bootstrap?.queueDepth.total, 2);
  assert.deepEqual(
    persistedJobs.map((job) => `${job.id}:${job.status}`),
    ['pubmed:progression-load:exhausted', 'crossref:progression-split:pending'],
  );
});

test('bootstrap resumes pending queue without duplicating work units', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-pipeline-'));

  await writeFile(
    path.join(outputRootDir, 'bootstrap-jobs.json'),
    JSON.stringify(
      [
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
          status: 'completed',
          targetPopulation: null,
          cursor: 'cursor-pubmed-4',
          pagesFetched: 4,
          recordsFetched: 32,
          canonicalRecords: 16,
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
          status: 'pending',
          targetPopulation: null,
          cursor: null,
          pagesFetched: 0,
          recordsFetched: 0,
          canonicalRecords: 0,
          lastError: null,
        },
      ],
      null,
      2,
    ) + '\n',
    'utf8',
  );

  await runPipelineWithDeterministicSynthesis({
    runId: 'run-bootstrap-resume-a',
    mode: 'bootstrap',
    now: new Date('2026-03-16T12:00:00.000Z'),
    outputRootDir,
    configOverrides: {
      bootstrapMaxJobsPerRun: 1,
    },
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  await runPipelineWithDeterministicSynthesis({
    runId: 'run-bootstrap-resume-b',
    mode: 'bootstrap',
    now: new Date('2026-03-17T12:00:00.000Z'),
    outputRootDir,
    configOverrides: {
      bootstrapMaxJobsPerRun: 1,
    },
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  const persistedJobs = ((await loadJson(path.join(outputRootDir, 'bootstrap-jobs.json'))) as unknown[]).map((job) =>
    parseAdaptiveKnowledgeCollectionJob(job),
  );
  const persistedJobIds = persistedJobs.map((job) => job.id);

  assert.equal(new Set(persistedJobIds).size, persistedJobIds.length);
  assert.deepEqual(persistedJobIds.slice(0, 2), ['pubmed:progression-load', 'crossref:progression-split']);
  assert.deepEqual(persistedJobs.slice(0, 2).map((job) => job.status), ['completed', 'exhausted']);
});
