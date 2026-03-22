import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ConnectorFetchResult } from '../../scripts/adaptive-knowledge/connectors/shared';
import { runAdaptiveKnowledgePipeline } from '../../scripts/adaptive-knowledge/pipeline-run';
import { runRefreshCorpusCommand } from '../../scripts/adaptive-knowledge/refresh-corpus';
import { buildValidatedSynthesisFromPrinciples, synthesizeCorpusPrinciples } from '../../scripts/adaptive-knowledge/synthesis';
import {
  acquireAdaptiveKnowledgeLease,
  heartbeatAdaptiveKnowledgeLease,
  readAdaptiveKnowledgeWorkerState,
} from '../../scripts/adaptive-knowledge/worker-state';

function buildConnectorSuccess(source: 'pubmed' | 'crossref' | 'openalex'): ConnectorFetchResult {
  const tagsBySource = {
    pubmed: ['progression', 'strength'],
    crossref: ['hypertrophy', 'volume'],
    openalex: ['fatigue', 'readiness'],
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
        title: `${source} resistance training progression study`,
        summaryEn: `${source} study on progressive overload and hypertrophy volume in strength training`,
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

test('second worker run is blocked while active lease is valid', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-worker-'));
  const now = new Date('2026-03-11T10:00:00.000Z');

  const first = await acquireAdaptiveKnowledgeLease({
    outputRootDir,
    runId: 'run-1',
    mode: 'refresh',
    now,
    leaseMs: 30_000,
  });
  assert.equal(first.acquired, true);

  const second = await acquireAdaptiveKnowledgeLease({
    outputRootDir,
    runId: 'run-2',
    mode: 'refresh',
    now: new Date(now.getTime() + 5_000),
    leaseMs: 30_000,
  });
  assert.equal(second.acquired, false);
  assert.equal(second.state?.runId, 'run-1');
  assert.equal(second.state?.status, 'started');
});

test('stale lease is marked and replaced by a fresh run', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-worker-'));
  const now = new Date('2026-03-11T10:00:00.000Z');

  await acquireAdaptiveKnowledgeLease({
    outputRootDir,
    runId: 'stale-run',
    mode: 'refresh',
    now,
    leaseMs: 5_000,
  });

  const recovered = await acquireAdaptiveKnowledgeLease({
    outputRootDir,
    runId: 'fresh-run',
    mode: 'refresh',
    now: new Date(now.getTime() + 10_000),
    leaseMs: 30_000,
  });

  assert.equal(recovered.acquired, true);
  const state = await readAdaptiveKnowledgeWorkerState(outputRootDir);
  assert.equal(state?.runId, 'fresh-run');
  assert.equal(state?.status, 'started');
});

test('heartbeat updates lease metadata for the active run', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-worker-'));
  const now = new Date('2026-03-11T10:00:00.000Z');

  await acquireAdaptiveKnowledgeLease({
    outputRootDir,
    runId: 'heartbeat-run',
    mode: 'refresh',
    now,
    leaseMs: 10_000,
  });

  const heartbeat = await heartbeatAdaptiveKnowledgeLease({
    outputRootDir,
    runId: 'heartbeat-run',
    now: new Date(now.getTime() + 2_000),
    leaseMs: 15_000,
    message: 'mid-run',
  });

  assert.equal(heartbeat.status, 'heartbeat');
  assert.equal(heartbeat.message, 'mid-run');
  assert.equal(Date.parse(heartbeat.leaseExpiresAt) > Date.parse(heartbeat.heartbeatAt), true);
});

test('worker command returns blocked-by-lease without mutating active snapshot', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-worker-'));
  const activePointerPath = path.join(outputRootDir, 'active.json');
  await writeFile(activePointerPath, JSON.stringify({ snapshotId: 'existing' }, null, 2) + '\n', 'utf8');

  await acquireAdaptiveKnowledgeLease({
    outputRootDir,
    runId: 'blocking-run',
    mode: 'refresh',
    now: new Date('2026-03-11T10:00:00.000Z'),
    leaseMs: 60_000,
  });

  const result = await runRefreshCorpusCommand(['node', 'refresh-corpus.ts'], {
    outputRootDir,
    now: new Date('2026-03-11T10:00:10.000Z'),
  });

  assert.equal(result.status, 'blocked-by-lease');
  assert.equal(result.exitCode, 3);
  const activePointer = JSON.parse(await readFile(activePointerPath, 'utf8')) as { snapshotId: string };
  assert.equal(activePointer.snapshotId, 'existing');
});

test('worker command marks failures without corrupting active pointer', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-worker-'));
  const activePointerPath = path.join(outputRootDir, 'active.json');
  await writeFile(activePointerPath, JSON.stringify({ snapshotId: 'existing' }, null, 2) + '\n', 'utf8');

  const result = await runRefreshCorpusCommand(['node', 'refresh-corpus.ts'], {
    outputRootDir,
    now: new Date('2026-03-11T10:01:00.000Z'),
    runPipeline: async () => {
      throw new Error('forced pipeline failure');
    },
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.exitCode, 1);
  const state = await readAdaptiveKnowledgeWorkerState(outputRootDir);
  assert.equal(state?.status, 'failed');
  const activePointer = JSON.parse(await readFile(activePointerPath, 'utf8')) as { snapshotId: string };
  assert.equal(activePointer.snapshotId, 'existing');
});

test('check mode completes without promoting a new active snapshot', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-worker-'));

  await runPipelineWithDeterministicSynthesis({
    runId: 'baseline',
    now: new Date('2026-03-10T00:00:00.000Z'),
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

  const result = await runRefreshCorpusCommand(['node', 'refresh-corpus.ts', '--check'], {
    outputRootDir,
    now: new Date('2026-03-11T10:02:00.000Z'),
    runPipeline: async (input) =>
      runAdaptiveKnowledgePipeline({
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
        ...input,
        outputRootDir,
        connectors: {
          pubmed: async () => buildConnectorSuccess('pubmed'),
          crossref: async () => buildConnectorSuccess('crossref'),
          openalex: async () => buildConnectorSuccess('openalex'),
        },
        qualityGateOverrides: {
          threshold: 0.2,
        },
      }),
  });

  assert.equal(result.status, 'completed');
  const activePointer = JSON.parse(await readFile(path.join(outputRootDir, 'active.json'), 'utf8')) as { snapshotId: string };
  assert.equal(activePointer.snapshotId, 'baseline');
});
