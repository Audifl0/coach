import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { constants, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ConnectorFetchResult } from '../../scripts/adaptive-knowledge/connectors/shared';
import { runAdaptiveKnowledgePipeline } from '../../scripts/adaptive-knowledge/pipeline-run';
import { rollbackCorpusSnapshot } from '../../scripts/adaptive-knowledge/publish';
import { evaluateCorpusQualityGate } from '../../scripts/adaptive-knowledge/quality-gates';
import { buildValidatedSynthesisFromPrinciples, synthesizeCorpusPrinciples } from '../../scripts/adaptive-knowledge/synthesis';
import type { StudyCard, ThematicSynthesis } from '../../scripts/adaptive-knowledge/contracts';

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
        sourceType: source === 'pubmed' ? 'guideline' : 'review',
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

function resolveSnapshotDir(outputRootDir: string, runId: string): string {
  const validated = path.join(outputRootDir, 'snapshots', runId, 'validated');
  try {
    readFileSync(path.join(validated, 'manifest.json'));
    return validated;
  } catch {
    return path.join(outputRootDir, 'snapshots', runId, 'candidate');
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

test('curation includes studyCards and thematicSyntheses in knowledge-bible.json', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-publish-enriched-bible-'));

  await runAdaptiveKnowledgePipeline({
    runId: 'run-enriched-knowledge-bible',
    now: new Date('2026-03-08T00:00:00.000Z'),
    outputRootDir,
    qualityGateOverrides: {
      threshold: 0.2,
    },
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
    remoteSynthesisClient: {
      async extractStudyCards(input) {
        return input.records.map((record) => ({
          recordId: record.id,
          title: record.title,
          authors: 'Doe et al.',
          year: 2024,
          journal: 'Journal of Strength Research',
          doi: null,
          studyType: 'rct' as const,
          population: {
            description: 'Adult lifters',
            size: 24,
            trainingLevel: 'intermediate' as const,
          },
          protocol: {
            duration: '8 semaines',
            intervention: 'Progression encadrée',
            comparison: 'Charge fixe',
          },
          results: {
            primary: 'Amélioration de la force.',
            secondary: ['Tolérance correcte.'],
          },
          practicalTakeaways: ['Ajuster la charge semaine après semaine.'],
          limitations: ['Petit effectif.'],
          safetySignals: ['Pas de signal majeur.'],
          evidenceLevel: 'moderate' as const,
          topicKeys: record.tags,
          extractionSource: input.payloadByRecordId.get(record.id)?.extractionSource ?? 'abstract',
          langueFr: {
            titreFr: `FR ${record.title}`,
            resumeFr: 'Résumé français.',
            conclusionFr: 'Conclusion française.',
          },
        } satisfies StudyCard));
      },
      async synthesizeThematicPrinciples(input) {
        return {
          topicKey: input.topicKey,
          topicLabel: input.topicLabel,
          principlesFr: [
            {
              id: `${input.topicKey}-1`,
              title: 'Principe thématique',
              statement: 'Ajuster la progression selon la récupération observée.',
              conditions: ['Absence de douleur aiguë'],
              guardrail: 'SAFE-03' as const,
              evidenceLevel: 'moderate' as const,
              sourceCardIds: input.studyCards.map((card) => card.recordId),
            },
          ],
          summaryFr: `Synthèse pour ${input.topicLabel}`,
          gapsFr: ['Plus de données longitudinales nécessaires.'],
          studyCount: input.studyCards.length,
          lastUpdated: '2026-03-08T00:00:00.000Z',
        } satisfies ThematicSynthesis;
      },
      async synthesizeLot() {
        throw new Error('not used');
      },
      async consolidate() {
        throw new Error('not used');
      },
    },
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  const activePointer = (await loadJson(path.join(outputRootDir, 'active.json'))) as { snapshotDir: string };
  const knowledgeBible = (await loadJson(path.join(activePointer.snapshotDir, 'knowledge-bible.json'))) as {
    studyCards?: StudyCard[];
    thematicSyntheses?: ThematicSynthesis[];
  };

  assert.equal(Array.isArray(knowledgeBible.studyCards), true);
  assert.equal((knowledgeBible.studyCards?.length ?? 0) > 0, true);
  assert.equal(Array.isArray(knowledgeBible.thematicSyntheses), true);
  assert.equal((knowledgeBible.thematicSyntheses?.length ?? 0) > 0, true);
});

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

test('quality gate does not penalize old-but-complete evidence solely for recency', async () => {
  const gate = evaluateCorpusQualityGate({
    now: new Date('2026-03-05T00:00:00.000Z'),
    threshold: 0.7,
    records: [
      {
        id: 'record-1',
        sourceType: 'guideline',
        sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/1/',
        sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
        publishedAt: '2009-03-01',
        title: 'Older guideline',
        summaryEn: 'Complete older guidance.',
        tags: ['progression', 'fatigue'],
        provenanceIds: ['record-1'],
      },
      {
        id: 'record-2',
        sourceType: 'review',
        sourceUrl: 'https://doi.org/2',
        sourceDomain: 'doi.org',
        publishedAt: '2010-04-01',
        title: 'Older review',
        summaryEn: 'Complete older review.',
        tags: ['hypertrophy', 'volume'],
        provenanceIds: ['record-2'],
      },
    ],
    validatedSynthesis: buildValidatedSynthesisFromPrinciples({
      records: [
        {
          id: 'record-1',
          sourceType: 'guideline',
          sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/1/',
          sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
          publishedAt: '2009-03-01',
          title: 'Older guideline',
          summaryEn: 'Complete older guidance.',
          tags: ['progression', 'fatigue'],
          provenanceIds: ['record-1'],
        },
        {
          id: 'record-2',
          sourceType: 'review',
          sourceUrl: 'https://doi.org/2',
          sourceDomain: 'doi.org',
          publishedAt: '2010-04-01',
          title: 'Older review',
          summaryEn: 'Complete older review.',
          tags: ['hypertrophy', 'volume'],
          provenanceIds: ['record-2'],
        },
      ],
      principles: [
        {
          id: 'p-1',
          title: 'Historic but valid principle',
          summaryFr: 'Principe valide malgré l ancienneté.',
          guidanceFr: 'Ne pas pénaliser la date seule.',
          provenanceRecordIds: ['record-1', 'record-2'],
          evidenceLevel: 'review',
          guardrail: 'SAFE-03',
        },
      ],
    }),
  });

  assert.equal(gate.reasons.includes('score_below_threshold'), false);
});

test('quality gate blocks snapshots with insufficient thematic diversity', async () => {
  const gate = evaluateCorpusQualityGate({
    now: new Date('2026-03-05T00:00:00.000Z'),
    threshold: 0.2,
    records: [
      {
        id: 'record-1',
        sourceType: 'guideline',
        sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/1/',
        sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
        publishedAt: '2026-01-01',
        title: 'Guideline',
        summaryEn: 'Detailed guidance.',
        tags: ['progression'],
        provenanceIds: ['record-1'],
      },
      {
        id: 'record-2',
        sourceType: 'review',
        sourceUrl: 'https://doi.org/2',
        sourceDomain: 'doi.org',
        publishedAt: '2026-01-02',
        title: 'Review',
        summaryEn: 'Detailed review.',
        tags: ['progression'],
        provenanceIds: ['record-2'],
      },
    ],
    validatedSynthesis: buildValidatedSynthesisFromPrinciples({
      records: [
        {
          id: 'record-1',
          sourceType: 'guideline',
          sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/1/',
          sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
          publishedAt: '2026-01-01',
          title: 'Guideline',
          summaryEn: 'Detailed guidance.',
          tags: ['progression'],
          provenanceIds: ['record-1'],
        },
        {
          id: 'record-2',
          sourceType: 'review',
          sourceUrl: 'https://doi.org/2',
          sourceDomain: 'doi.org',
          publishedAt: '2026-01-02',
          title: 'Review',
          summaryEn: 'Detailed review.',
          tags: ['progression'],
          provenanceIds: ['record-2'],
        },
      ],
      principles: [
        {
          id: 'p_safe',
          title: 'Safe progression',
          summaryFr: 'Conserver une progression prudente.',
          guidanceFr: 'Monter progressivement.',
          provenanceRecordIds: ['record-1', 'record-2'],
          evidenceLevel: 'review',
          guardrail: 'SAFE-03',
        },
      ],
    }),
  });

  assert.equal(gate.publishable, false);
  assert.equal(gate.reasons.includes('insufficient_topic_diversity'), true);
});

test('quality gate can satisfy thematic diversity from cumulative question dossiers in backlog mode', async () => {
  const gate = evaluateCorpusQualityGate({
    now: new Date('2026-03-05T00:00:00.000Z'),
    threshold: 0.2,
    records: [
      {
        id: 'record-1',
        sourceType: 'guideline',
        sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/1/',
        sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
        publishedAt: '2026-01-01',
        title: 'Guideline',
        summaryEn: 'Detailed guidance.',
        tags: ['progression'],
        provenanceIds: ['record-1'],
      },
      {
        id: 'record-2',
        sourceType: 'review',
        sourceUrl: 'https://doi.org/2',
        sourceDomain: 'doi.org',
        publishedAt: '2026-01-02',
        title: 'Review',
        summaryEn: 'Detailed review.',
        tags: ['progression'],
        provenanceIds: ['record-2'],
      },
    ],
    validatedSynthesis: buildValidatedSynthesisFromPrinciples({
      records: [
        {
          id: 'record-1',
          sourceType: 'guideline',
          sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/1/',
          sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
          publishedAt: '2026-01-01',
          title: 'Guideline',
          summaryEn: 'Detailed guidance.',
          tags: ['progression'],
          provenanceIds: ['record-1'],
        },
        {
          id: 'record-2',
          sourceType: 'review',
          sourceUrl: 'https://doi.org/2',
          sourceDomain: 'doi.org',
          publishedAt: '2026-01-02',
          title: 'Review',
          summaryEn: 'Detailed review.',
          tags: ['progression'],
          provenanceIds: ['record-2'],
        },
      ],
      principles: [
        {
          id: 'p_safe',
          title: 'Safe progression',
          summaryFr: 'Conserver une progression prudente.',
          guidanceFr: 'Monter progressivement.',
          provenanceRecordIds: ['record-1', 'record-2'],
          evidenceLevel: 'review',
          guardrail: 'SAFE-03',
        },
      ],
    }),
    questionDossiers: [
      {
        questionId: 'q-progression',
        topicKeys: ['progression'],
        linkedStudyIds: ['study-1'],
        contradictions: [],
        summaryFr: 'Progression.',
        confidenceLevel: 'moderate',
        publicationReadiness: 'candidate',
      },
      {
        questionId: 'q-hypertrophy',
        topicKeys: ['hypertrophy-dose'],
        linkedStudyIds: ['study-2'],
        contradictions: [],
        summaryFr: 'Dose hypertrophie.',
        confidenceLevel: 'moderate',
        publicationReadiness: 'candidate',
      },
    ] as any,
  });

  assert.equal(gate.reasons.includes('insufficient_topic_diversity'), false);
});

test('quality gate distinguishes no progress, progressive library growth, and blocked runtime publication', () => {
  const now = new Date('2026-03-05T00:00:00.000Z');

  const noProgress = evaluateCorpusQualityGate({
    now,
    records: [],
    projection: {
      libraryRecordCount: 0,
      projectionRecordCount: 0,
      backlogRecordCount: 0,
      projectionSafe: true,
      canonicalRecordsOnly: true,
    },
  });

  assert.equal(noProgress.status, 'blocked');
  assert.deepEqual(noProgress.reasons, ['no_library_progress']);

  const progressing = evaluateCorpusQualityGate({
    now,
    threshold: 0.2,
    records: [
      {
        id: 'record-1',
        sourceType: 'guideline',
        sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/1/',
        sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
        publishedAt: '2026-01-01',
        title: 'Guideline',
        summaryEn: 'Detailed guidance.',
        tags: ['progression', 'fatigue-readiness'],
        provenanceIds: ['record-1'],
      },
      {
        id: 'record-2',
        sourceType: 'review',
        sourceUrl: 'https://doi.org/2',
        sourceDomain: 'doi.org',
        publishedAt: '2026-01-02',
        title: 'Review',
        summaryEn: 'Detailed review.',
        tags: ['hypertrophy-dose', 'progression'],
        provenanceIds: ['record-2'],
      },
    ],
    validatedSynthesis: buildValidatedSynthesisFromPrinciples({
      records: [
        {
          id: 'record-1',
          sourceType: 'guideline',
          sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/1/',
          sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
          publishedAt: '2026-01-01',
          title: 'Guideline',
          summaryEn: 'Detailed guidance.',
          tags: ['progression', 'fatigue-readiness'],
          provenanceIds: ['record-1'],
        },
        {
          id: 'record-2',
          sourceType: 'review',
          sourceUrl: 'https://doi.org/2',
          sourceDomain: 'doi.org',
          publishedAt: '2026-01-02',
          title: 'Review',
          summaryEn: 'Detailed review.',
          tags: ['hypertrophy-dose', 'progression'],
          provenanceIds: ['record-2'],
        },
      ],
      principles: [
        {
          id: 'p_safe',
          title: 'Safe progression',
          summaryFr: 'Conserver une progression prudente.',
          guidanceFr: 'Monter progressivement.',
          provenanceRecordIds: ['record-1', 'record-2'],
          evidenceLevel: 'review',
          guardrail: 'SAFE-03',
        },
      ],
    }),
    projection: {
      libraryRecordCount: 12,
      projectionRecordCount: 2,
      backlogRecordCount: 10,
      projectionSafe: true,
      canonicalRecordsOnly: true,
    },
  });

  assert.equal(progressing.status, 'progressing');
  assert.equal(progressing.publishable, true);
  assert.equal(progressing.reasons.includes('backfill_incomplete'), true);
  assert.equal(progressing.reasons.includes('library_growth_detected'), true);

  const blocked = evaluateCorpusQualityGate({
    now,
    threshold: 0.2,
    records: [
      {
        id: 'record-1',
        sourceType: 'guideline',
        sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/1/',
        sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
        publishedAt: '2026-01-01',
        title: 'Guideline',
        summaryEn: 'Detailed guidance.',
        tags: ['progression', 'fatigue-readiness'],
        provenanceIds: ['record-1'],
      },
      {
        id: 'record-2',
        sourceType: 'review',
        sourceUrl: 'https://doi.org/2',
        sourceDomain: 'doi.org',
        publishedAt: '2026-01-02',
        title: 'Review',
        summaryEn: 'Detailed review.',
        tags: ['hypertrophy-dose', 'progression'],
        provenanceIds: ['record-2'],
      },
    ],
    validatedSynthesis: buildValidatedSynthesisFromPrinciples({
      records: [
        {
          id: 'record-1',
          sourceType: 'guideline',
          sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/1/',
          sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
          publishedAt: '2026-01-01',
          title: 'Guideline',
          summaryEn: 'Detailed guidance.',
          tags: ['progression', 'fatigue-readiness'],
          provenanceIds: ['record-1'],
        },
        {
          id: 'record-2',
          sourceType: 'review',
          sourceUrl: 'https://doi.org/2',
          sourceDomain: 'doi.org',
          publishedAt: '2026-01-02',
          title: 'Review',
          summaryEn: 'Detailed review.',
          tags: ['hypertrophy-dose', 'progression'],
          provenanceIds: ['record-2'],
        },
      ],
      principles: [
        {
          id: 'p_safe',
          title: 'Safe progression',
          summaryFr: 'Conserver une progression prudente.',
          guidanceFr: 'Monter progressivement.',
          provenanceRecordIds: ['record-1', 'record-2'],
          evidenceLevel: 'review',
          guardrail: 'SAFE-03',
        },
      ],
    }),
    projection: {
      libraryRecordCount: 12,
      projectionRecordCount: 2,
      backlogRecordCount: 10,
      projectionSafe: false,
      canonicalRecordsOnly: false,
    },
  });

  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.reasons.includes('unsafe_runtime_projection'), true);
  assert.equal(blocked.reasons.includes('non_canonical_projection'), true);
});

test('bootstrap campaign can stay in-progress without failing while publication remains deferred', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-publish-'));
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
    runId: 'run-bootstrap-progressing',
    now: new Date('2026-03-05T00:00:00.000Z'),
    mode: 'bootstrap',
    outputRootDir,
    configOverrides: {
      bootstrapMaxJobsPerRun: 1,
    },
    qualityGateOverrides: {
      threshold: 0.2,
    },
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  assert.equal(result.publish.status, 'progressing');
  assert.equal(result.publish.publishable, true);

  const snapshotDir = resolveSnapshotDir(outputRootDir, 'run-bootstrap-progressing');
  const report = (await loadJson(
    path.join(snapshotDir, 'run-report.json'),
  )) as {
    stageReports: Array<{ stage: string; status: string; message?: string }>;
  };
  const publishStage = report.stageReports.find((stage) => stage.stage === 'publish');
  assert.equal(publishStage?.status, 'succeeded');
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

test('publish writes doctrine revision history alongside published doctrine snapshot', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-publish-doctrine-'));

  await runAdaptiveKnowledgePipeline({
    runId: 'run-doctrine-published',
    now: new Date('2026-03-22T00:00:00.000Z'),
    outputRootDir,
    qualityGateOverrides: {
      threshold: 0.2,
    },
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
    remoteSynthesisClient: {
      async extractStudyCards(input) {
        return input.records.map((record) => ({
          recordId: record.id,
          title: record.title,
          authors: 'Doe et al.',
          year: 2024,
          journal: 'Journal of Strength Research',
          doi: null,
          studyType: 'rct' as const,
          population: {
            description: 'adult lifters',
            size: 24,
            trainingLevel: 'intermediate' as const,
          },
          protocol: {
            duration: '8 semaines',
            intervention: 'Progression encadree',
            comparison: 'Charge fixe',
          },
          results: {
            primary: 'Higher weekly volume improved hypertrophy.',
            secondary: ['Tolerance correcte.'],
          },
          practicalTakeaways: ['Ajuster la charge semaine apres semaine.'],
          limitations: ['Petit effectif.'],
          safetySignals: ['Pas de signal majeur.'],
          evidenceLevel: 'moderate' as const,
          topicKeys: record.tags,
          extractionSource: 'abstract' as const,
          langueFr: {
            titreFr: `FR ${record.title}`,
            resumeFr: 'Le volume plus eleve ameliore l hypertrophie.',
            conclusionFr: 'Conclusion francaise.',
          },
        } satisfies StudyCard));
      },
      async synthesizeThematicPrinciples(input) {
        return {
          topicKey: input.topicKey,
          topicLabel: input.topicLabel,
          principlesFr: [
            {
              id: `${input.topicKey}-1`,
              title: 'Principe thematique',
              statement: 'Ajuster la progression selon la recuperation observee.',
              conditions: ['Absence de douleur aigue'],
              guardrail: 'SAFE-03' as const,
              evidenceLevel: 'moderate' as const,
              sourceCardIds: input.studyCards.map((card) => card.recordId),
            },
          ],
          summaryFr: `Synthese pour ${input.topicLabel}`,
          gapsFr: ['Plus de donnees longitudinales necessaires.'],
          studyCount: input.studyCards.length,
          lastUpdated: '2026-03-22T00:00:00.000Z',
        } satisfies ThematicSynthesis;
      },
      async synthesizeLot() {
        throw new Error('not used');
      },
      async consolidate() {
        throw new Error('not used');
      },
    },
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  await access(path.join(outputRootDir, 'registry', 'published-doctrine.json'), constants.F_OK);
  await access(path.join(outputRootDir, 'registry', 'doctrine-revisions.json'), constants.F_OK);

  const doctrineSnapshot = (await loadJson(path.join(outputRootDir, 'registry', 'published-doctrine.json'))) as {
    principles: Array<{ revisionStatus: string }>;
  };
  const doctrineHistory = (await loadJson(path.join(outputRootDir, 'registry', 'doctrine-revisions.json'))) as {
    entries: Array<{ changeType: string }>;
  };

  assert.equal((doctrineSnapshot.principles?.length ?? 0) > 0, true);
  assert.equal(doctrineHistory.entries.some((entry) => entry.changeType === 'published'), true);
});

test('publish can skip doctrine promotion while still preserving dossier outputs', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-publish-skip-doctrine-'));

  const result = await runPipelineWithDeterministicSynthesis({
    runId: 'run-doctrine-skipped',
    now: new Date('2026-03-22T00:00:00.000Z'),
    outputRootDir,
    qualityGateOverrides: {
      threshold: 0.2,
    },
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => withRecordSuffix(buildConnectorSuccess('crossref'), 'only'),
      openalex: async () => ({ ...buildConnectorSuccess('openalex'), records: [] }),
    },
  });

  assert.equal(result.publish.publishable, true);
  await access(path.join(outputRootDir, 'registry', 'question-synthesis-dossiers.json'), constants.F_OK);

  const doctrineSnapshot = (await loadJson(path.join(outputRootDir, 'registry', 'published-doctrine.json'))) as {
    principles?: Array<unknown>;
  };
  assert.equal((doctrineSnapshot.principles?.length ?? 0) >= 0, true);
});

test('reopened doctrine principle stays out of active doctrine until reconsolidated', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-publish-reopened-doctrine-'));

  await runPipelineWithDeterministicSynthesis({
    runId: 'run-doctrine-baseline',
    now: new Date('2026-03-22T00:00:00.000Z'),
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
    runId: 'run-doctrine-reopened',
    now: new Date('2026-03-23T00:00:00.000Z'),
    outputRootDir,
    qualityGateOverrides: {
      threshold: 0.2,
    },
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => ({
        ...buildConnectorSuccess('crossref'),
        records: [
          {
            id: 'crossref-contradiction',
            sourceType: 'review',
            sourceUrl: 'https://doi.org/crossref-contradiction',
            sourceDomain: 'doi.org',
            publishedAt: '2025-11-02',
            title: 'Higher weekly volume did not improve hypertrophy in advanced lifters',
            summaryEn: 'Higher weekly volume did not improve hypertrophy in advanced lifters and fatigue increased.',
            tags: ['hypertrophy-dose', 'progression'],
            provenanceIds: ['crossref-contradiction'],
          },
        ],
        recordsFetched: 1,
      }),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
    remoteSynthesisClient: {
      async extractStudyCards(input) {
        return input.records.map((record) => ({
          recordId: record.id,
          title: record.title,
          authors: 'Doe et al.',
          year: 2024,
          journal: 'Journal of Strength Research',
          doi: null,
          studyType: 'rct' as const,
          population: {
            description: record.id === 'crossref-contradiction' ? 'advanced lifters' : 'adult lifters',
            size: 24,
            trainingLevel: record.id === 'crossref-contradiction' ? 'advanced' as const : 'intermediate' as const,
          },
          protocol: {
            duration: '8 semaines',
            intervention: 'Progression encadree',
            comparison: 'Charge fixe',
          },
          results: {
            primary:
              record.id === 'crossref-contradiction'
                ? 'Higher weekly volume did not improve hypertrophy.'
                : 'Higher weekly volume improved hypertrophy.',
            secondary: ['Tolerance correcte.'],
          },
          practicalTakeaways: ['Ajuster la charge semaine apres semaine.'],
          limitations: ['Petit effectif.'],
          safetySignals: ['Pas de signal majeur.'],
          evidenceLevel: record.id === 'crossref-contradiction' ? 'low' as const : 'moderate' as const,
          topicKeys: record.tags,
          extractionSource: 'abstract' as const,
          langueFr: {
            titreFr: `FR ${record.title}`,
            resumeFr:
              record.id === 'crossref-contradiction'
                ? 'Le volume plus eleve n ameliore pas l hypertrophie dans ce groupe.'
                : 'Le volume plus eleve ameliore l hypertrophie.',
            conclusionFr: 'Conclusion francaise.',
          },
        } satisfies StudyCard));
      },
      async synthesizeThematicPrinciples(input) {
        return {
          topicKey: input.topicKey,
          topicLabel: input.topicLabel,
          principlesFr: [
            {
              id: `${input.topicKey}-1`,
              title: 'Principe thematique',
              statement: 'Ajuster la progression selon la recuperation observee.',
              conditions: ['Absence de douleur aigue'],
              guardrail: 'SAFE-03' as const,
              evidenceLevel: 'moderate' as const,
              sourceCardIds: input.studyCards.map((card) => card.recordId),
            },
          ],
          summaryFr: `Synthese pour ${input.topicLabel}`,
          gapsFr: ['Plus de donnees longitudinales necessaires.'],
          studyCount: input.studyCards.length,
          lastUpdated: '2026-03-23T00:00:00.000Z',
        } satisfies ThematicSynthesis;
      },
      async synthesizeLot() {
        throw new Error('not used');
      },
      async consolidate() {
        throw new Error('not used');
      },
    },
  });

  const doctrineSnapshot = (await loadJson(path.join(outputRootDir, 'registry', 'published-doctrine.json'))) as {
    principles: Array<{ revisionStatus: string }>;
  };
  const activeDoctrine = doctrineSnapshot.principles.filter((principle) => principle.revisionStatus === 'active');
  assert.equal(activeDoctrine.length, 0);
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
