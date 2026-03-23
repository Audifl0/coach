import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadWorkerCorpusDeliverables } from '../../src/server/services/worker-corpus-deliverables';

async function writeJson(filePath: string, payload: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

async function buildFixture(options?: { noDoctrine?: boolean; noActiveSnapshot?: boolean }) {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'worker-corpus-deliverables-'));
  const snapshotId = 'run-ready';
  const snapshotDir = path.join(rootDir, 'snapshots', snapshotId, 'validated');

  if (!options?.noActiveSnapshot) {
    await writeJson(path.join(rootDir, 'active.json'), {
      snapshotId,
      snapshotDir,
      promotedAt: '2026-03-23T10:02:00.000Z',
    });
  }

  await writeJson(path.join(snapshotDir, 'run-report.json'), {
    runId: snapshotId,
    mode: 'refresh',
    startedAt: '2026-03-23T10:00:00.000Z',
    completedAt: '2026-03-23T10:01:00.000Z',
    snapshotId,
    stageReports: [
      { stage: 'discover', status: 'succeeded', message: 'discovered=3' },
      { stage: 'publish', status: 'succeeded', message: 'promoted:run-ready;rollback=none' },
    ],
  });

  await writeJson(path.join(snapshotDir, 'manifest.json'), {
    snapshotId,
    schemaVersion: 'v1',
    generatedAt: '2026-03-23T10:01:00.000Z',
    evidenceRecordCount: 5,
    principleCount: options?.noDoctrine ? 0 : 2,
    sourceDomains: ['doi.org', 'pubmed.ncbi.nlm.nih.gov'],
    artifacts: {
      indexPath: 'snapshots/run-ready/validated/sources.json',
      principlesPath: 'snapshots/run-ready/validated/principles.json',
      reportPath: 'snapshots/run-ready/validated/run-report.json',
      validatedSynthesisPath: 'snapshots/run-ready/validated/validated-synthesis.json',
      bookletPath: 'snapshots/run-ready/validated/booklet-fr.md',
    },
  });

  await writeJson(path.join(snapshotDir, 'validated-synthesis.json'), {
    principles: options?.noDoctrine
      ? []
      : [
          {
            id: 'principle_1',
            title: 'Progressive overload',
            summaryFr: 'Résumé doctrine',
            guidanceFr: 'Guide doctrine',
            provenanceRecordIds: ['record_1'],
            evidenceLevel: 'strong',
            guardrail: 'SAFE-03',
          },
        ],
    studyExtractions: [
      {
        recordId: 'record_1',
        topicKeys: ['progression'],
        population: 'Adult lifters',
        intervention: 'Progressive overload',
        applicationContext: 'Hypertrophy block',
        outcomes: ['Strength', 'Hypertrophy'],
        evidenceSignals: ['Positive signal'],
        limitations: ['Small sample'],
        safetySignals: ['No serious adverse events'],
      },
    ],
    rejectedClaims: [],
    coverage: {
      recordCount: 5,
      batchCount: 1,
      retainedClaimCount: options?.noDoctrine ? 0 : 1,
      sourceDomains: ['doi.org', 'pubmed.ncbi.nlm.nih.gov'],
      coveredTags: ['progression'],
    },
    contradictions: [],
    modelRun: {
      provider: 'openai',
      model: 'gpt-5',
      promptVersion: 'v1',
      requestId: 'req_1',
      latencyMs: 1200,
      totalLatencyMs: 1200,
    },
  });

  await writeJson(path.join(snapshotDir, 'sources.json'), {
    records: [
      {
        id: 'record_1',
        sourceType: 'review',
        sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/12345',
        sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
        publishedAt: '2026-03-22',
        title: 'Useful review',
        summaryEn: 'Summary',
        tags: ['progression'],
        provenanceIds: ['record_1'],
      },
    ],
  });

  await writeJson(path.join(rootDir, 'registry', 'scientific-questions.json'), {
    version: 'v1',
    generatedAt: '2026-03-23T10:01:00.000Z',
    items: [
      {
        questionId: 'q-autoregulation-progression',
        labelFr: 'Autoregulation et progression',
        promptFr: 'Comment l autoregulation influence-t-elle la progression ?',
        topicKeys: ['progression'],
        inclusionCriteria: ['Intermédiaires'],
        exclusionCriteria: ['Débutants complets'],
        linkedStudyIds: ['study-1'],
        coverageStatus: 'developing',
        publicationStatus: options?.noDoctrine ? 'candidate' : 'published',
        updatedAt: '2026-03-23T10:01:00.000Z',
      },
    ],
  });

  await writeJson(path.join(rootDir, 'registry', 'question-synthesis-dossiers.json'), [
    {
      questionId: 'q-autoregulation-progression',
      coverageStatus: 'developing',
      linkedStudyIds: ['study-1'],
      contradictions: [],
      summaryFr: 'Synthèse question progression.',
      confidenceLevel: 'moderate',
      publicationReadiness: options?.noDoctrine ? 'candidate' : 'ready',
      generatedAt: '2026-03-23T10:01:00.000Z',
    },
  ]);

  await writeJson(path.join(rootDir, 'registry', 'published-doctrine.json'), {
    version: 'v1',
    generatedAt: '2026-03-23T10:01:00.000Z',
    principles: options?.noDoctrine
      ? []
      : [
          {
            principleId: 'doctrine:q-autoregulation-progression',
            statementFr: 'Progresser avec autoregulation prudente.',
            conditionsFr: 'Intermédiaires',
            limitsFr: 'Faible volume de preuve',
            confidenceLevel: 'moderate',
            questionIds: ['q-autoregulation-progression'],
            studyIds: ['study-1'],
            revisionStatus: 'active',
            publishedAt: '2026-03-23T10:01:00.000Z',
          },
        ],
  });

  await writeFile(path.join(snapshotDir, 'booklet-fr.md'), '# booklet\n', 'utf8');
  await writeJson(path.join(snapshotDir, 'knowledge-bible.json'), {
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
  });

  return rootDir;
}

test('deliverables service prioritizes doctrine, dossiers, study extractions, and artifacts from active snapshot', async () => {
  const rootDir = await buildFixture();
  const payload = await loadWorkerCorpusDeliverables({ knowledgeRootDir: rootDir, now: new Date('2026-03-23T10:05:00.000Z') });

  assert.equal(payload.source.snapshotId, 'run-ready');
  assert.equal(payload.source.runId, 'run-ready');
  assert.equal(payload.source.generatedAt, '2026-03-23T10:01:00.000Z');
  assert.equal(payload.source.promotedAt, '2026-03-23T10:02:00.000Z');
  assert.equal(payload.source.artifactState, 'validated');
  assert.equal(payload.doctrine.length > 0, true);
  assert.equal(payload.questions.length > 0, true);
  assert.equal(payload.studyExtractions.length > 0, true);
  assert.equal(payload.artifacts.booklet.available, true);
  assert.equal(payload.artifacts.knowledgeBible.available, true);
  assert.equal(payload.artifacts.validatedSynthesis.available, true);
  assert.equal(payload.artifacts.runReport.available, true);
  assert.equal(payload.artifacts.snapshot.available, true);
  assert.equal(payload.emptyReason, 'none');
});

test('deliverables service falls back to non-doctrine outputs when no doctrine exists', async () => {
  const rootDir = await buildFixture({ noDoctrine: true });
  const payload = await loadWorkerCorpusDeliverables({ knowledgeRootDir: rootDir, now: new Date('2026-03-23T10:05:00.000Z') });

  assert.deepEqual(payload.doctrine, []);
  assert.equal(payload.questions.length > 0 || payload.studyExtractions.length > 0, true);
  assert.equal(payload.emptyReason, 'none');
});

test('deliverables service returns honest empty state when no active snapshot exists', async () => {
  const rootDir = await buildFixture({ noActiveSnapshot: true });
  const payload = await loadWorkerCorpusDeliverables({ knowledgeRootDir: rootDir, now: new Date('2026-03-23T10:05:00.000Z') });

  assert.equal(payload.source.snapshotId, null);
  assert.equal(payload.source.runId, null);
  assert.equal(payload.emptyReason, 'no-active-snapshot');
  assert.deepEqual(payload.doctrine, []);
  assert.deepEqual(payload.questions, []);
  assert.deepEqual(payload.studyExtractions, []);
});
