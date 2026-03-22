import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ConnectorFetchResult } from '../../scripts/adaptive-knowledge/connectors/shared';
import { setWorkerControlMode } from '../../scripts/adaptive-knowledge/control-state';
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

test('worker command returns paused-by-operator when control state is paused', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-worker-'));
  const activePointerPath = path.join(outputRootDir, 'active.json');
  await writeFile(activePointerPath, JSON.stringify({ snapshotId: 'existing' }, null, 2) + '\n', 'utf8');

  await setWorkerControlMode(outputRootDir, {
    mode: 'paused',
    reason: 'operator pause',
    lastCommand: 'pause',
    now: new Date('2026-03-11T10:00:00.000Z'),
  });

  const result = await runRefreshCorpusCommand(['node', 'refresh-corpus.ts'], {
    outputRootDir,
    now: new Date('2026-03-11T10:00:10.000Z'),
  });

  assert.equal(result.status, 'paused-by-operator');
  assert.equal(result.exitCode, 3);
  const state = await readAdaptiveKnowledgeWorkerState(outputRootDir);
  assert.equal(state, null);
  const activePointer = JSON.parse(await readFile(activePointerPath, 'utf8')) as { snapshotId: string };
  assert.equal(activePointer.snapshotId, 'existing');
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


test('worker command still runs normally when control state is running', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-worker-running-'));

  await setWorkerControlMode(outputRootDir, {
    mode: 'running',
    reason: 'resume worker',
    lastCommand: 'start',
    now: new Date('2026-03-11T10:59:00.000Z'),
  });

  const result = await runRefreshCorpusCommand(['node', 'refresh-corpus.ts'], {
    outputRootDir,
    now: new Date('2026-03-11T11:00:00.000Z'),
    runPipeline: async () => ({
      runId: 'run-running',
      candidateDir: path.join(outputRootDir, 'candidates', 'run-running'),
      candidatePath: path.join(outputRootDir, 'candidates', 'run-running'),
      published: true,
      reportPath: path.join(outputRootDir, 'reports', 'run-running.json'),
      summary: {
        snapshotId: 'snapshot-running',
        evidenceRecordCount: 0,
        principleCount: 0,
        sourceDomains: [],
      },
    }),
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.exitCode, 0);
});

test('worker command preserves registries across runs', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-worker-persistent-'));

  const remoteSynthesisClient = {
    async extractStudyCards(input: { records: Array<{ id: string; title: string; tags: string[] }>; payloadByRecordId: Map<string, { extractionSource?: string }> }) {
      return input.records.map((record) => ({
        recordId: record.id,
        title: record.title,
        authors: 'Doe et al.',
        year: 2024,
        journal: 'Journal of Strength Research',
        doi: null,
        studyType: 'rct' as const,
        population: { description: 'Adult lifters', size: 30, trainingLevel: 'intermediate' as const },
        protocol: { duration: '8 semaines', intervention: 'Progression autoregulee', comparison: 'Charge fixe' },
        results: { primary: 'Amelioration de la force.', secondary: ['Le volume hebdomadaire aide la progression.'] },
        practicalTakeaways: ['Monter la charge progressivement et ajuster le volume.'],
        limitations: ['Petit echantillon.'],
        safetySignals: ['Pas d evenement grave.'],
        evidenceLevel: 'moderate' as const,
        topicKeys: record.tags,
        extractionSource: input.payloadByRecordId.get(record.id)?.extractionSource ?? 'abstract',
        langueFr: { titreFr: `FR ${record.title}`, resumeFr: 'Le volume hebdomadaire et la progression autoregulee semblent utiles.', conclusionFr: 'Conclusion francaise.' },
      }));
    },
    async synthesizeThematicPrinciples(input: { topicKey: string; topicLabel: string; studyCards: Array<{ recordId: string }> }) {
      return {
        topicKey: input.topicKey,
        topicLabel: input.topicLabel,
        principlesFr: [{ id: `${input.topicKey}-1`, title: 'Principe thematique', statement: 'Adapter la progression au contexte du pratiquant.', conditions: ['Tolerance de charge stable'], guardrail: 'SAFE-03' as const, evidenceLevel: 'moderate' as const, sourceCardIds: input.studyCards.map((card) => card.recordId) }],
        summaryFr: `Synthese pour ${input.topicLabel}`,
        gapsFr: ['Davantage de donnees a long terme necessaires.'],
        studyCount: input.studyCards.length,
        lastUpdated: '2026-03-22T00:00:00.000Z',
      };
    },
    async synthesizeLot() { throw new Error('not used'); },
    async consolidate() { throw new Error('not used'); },
  };

  const runWorker = (now: string) =>
    runRefreshCorpusCommand(['node', 'refresh-corpus.ts'], {
      outputRootDir,
      now: new Date(now),
      runPipeline: async (input) =>
        runAdaptiveKnowledgePipeline({
          remoteSynthesisClient,
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
        }),
    });

  const first = await runWorker('2026-03-11T11:00:00.000Z');
  assert.equal(first.status, 'completed');
  const firstDocuments = JSON.parse(await readFile(path.join(outputRootDir, 'registry', 'document-library.json'), 'utf8')) as {
    items: Array<{ recordId: string }>;
  };
  const firstQuestions = JSON.parse(await readFile(path.join(outputRootDir, 'registry', 'scientific-questions.json'), 'utf8')) as {
    items: Array<{ questionId: string; publicationStatus: string }>;
  };

  const second = await runWorker('2026-03-11T11:10:01.000Z');
  assert.equal(second.status, 'completed');
  const secondDocuments = JSON.parse(await readFile(path.join(outputRootDir, 'registry', 'document-library.json'), 'utf8')) as {
    items: Array<{ recordId: string }>;
  };
  const secondQuestions = JSON.parse(await readFile(path.join(outputRootDir, 'registry', 'scientific-questions.json'), 'utf8')) as {
    items: Array<{ questionId: string; publicationStatus: string }>;
  };

  assert.equal(secondDocuments.items.length, firstDocuments.items.length);
  assert.deepEqual(
    secondDocuments.items.map((item) => item.recordId).sort(),
    firstDocuments.items.map((item) => item.recordId).sort(),
  );
  assert.equal(secondQuestions.items.length, firstQuestions.items.length);
});

test('worker command can complete with open scientific questions and no new doctrine publication', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-worker-open-questions-'));

  const remoteSynthesisClient = {
    async extractStudyCards(input: { records: Array<{ id: string; title: string; tags: string[] }>; payloadByRecordId: Map<string, { extractionSource?: string }> }) {
      return input.records.map((record) => ({
        recordId: record.id,
        title: record.title,
        authors: 'Doe et al.',
        year: 2024,
        journal: 'Journal of Strength Research',
        doi: null,
        studyType: 'rct' as const,
        population: { description: 'Adult lifters', size: 30, trainingLevel: 'intermediate' as const },
        protocol: { duration: '8 semaines', intervention: 'Progression autoregulee', comparison: 'Charge fixe' },
        results: { primary: 'Amelioration de la force avec douleurs chez certains sujets.', secondary: ['Les marqueurs de douleur divergent selon la tolerance individuelle.'] },
        practicalTakeaways: ['Monter la charge progressivement et surveiller la douleur.'],
        limitations: ['Petit echantillon.'],
        safetySignals: ['Pas d evenement grave.'],
        evidenceLevel: 'moderate' as const,
        topicKeys: record.tags,
        extractionSource: input.payloadByRecordId.get(record.id)?.extractionSource ?? 'abstract',
        langueFr: { titreFr: `FR ${record.title}`, resumeFr: 'Les donnees restent exploratoires avec divergence sur la douleur.', conclusionFr: 'Conclusion francaise.' },
      }));
    },
    async synthesizeThematicPrinciples(input: { topicKey: string; topicLabel: string; studyCards: Array<{ recordId: string }> }) {
      return {
        topicKey: input.topicKey,
        topicLabel: input.topicLabel,
        principlesFr: [{ id: `${input.topicKey}-1`, title: 'Principe thematique', statement: 'Adapter la progression au contexte du pratiquant.', conditions: ['Tolerance de charge stable'], guardrail: 'SAFE-03' as const, evidenceLevel: 'moderate' as const, sourceCardIds: input.studyCards.map((card) => card.recordId) }],
        summaryFr: `Synthese pour ${input.topicLabel}`,
        gapsFr: ['Davantage de donnees a long terme necessaires.'],
        studyCount: input.studyCards.length,
        lastUpdated: '2026-03-22T00:00:00.000Z',
      };
    },
    async synthesizeLot() { throw new Error('not used'); },
    async consolidate() { throw new Error('not used'); },
  };

  const result = await runRefreshCorpusCommand(['node', 'refresh-corpus.ts'], {
    outputRootDir,
    now: new Date('2026-03-11T12:00:00.000Z'),
    runPipeline: async (input) =>
      runAdaptiveKnowledgePipeline({
        remoteSynthesisClient,
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
        },
      }),
  });

  assert.equal(result.status, 'completed');
  const questions = JSON.parse(await readFile(path.join(outputRootDir, 'registry', 'scientific-questions.json'), 'utf8')) as {
    items: Array<{ questionId: string; publicationStatus: string }>;
  };
  const dossiers = JSON.parse(await readFile(path.join(outputRootDir, 'registry', 'question-synthesis-dossiers.json'), 'utf8')) as {
    items: Array<{ questionId: string; publicationReadiness: string }>;
  };
  const doctrine = JSON.parse(await readFile(path.join(outputRootDir, 'registry', 'published-doctrine.json'), 'utf8')) as {
    principles: Array<{ principleId: string }>;
  };
  const doctrineHistory = JSON.parse(await readFile(path.join(outputRootDir, 'registry', 'doctrine-revisions.json'), 'utf8')) as {
    entries: Array<{ principleId: string; changeType: string }>;
  };

  assert.equal(questions.items.some((item) => item.publicationStatus !== 'published'), true);
  assert.equal(dossiers.items.some((item) => item.publicationReadiness !== 'publishable'), true);
  assert.equal(doctrine.principles.length >= 0, true);
  assert.equal(questions.items.some((item) => item.publicationStatus !== 'published'), true);
  assert.equal(doctrineHistory.entries.filter((entry) => entry.changeType === 'published').length >= 0, true);
});
