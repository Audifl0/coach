import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseStudyCard, studyCardSchema, type StudyCard } from '../../scripts/adaptive-knowledge/contracts';
import { runAdaptiveKnowledgePipeline } from '../../scripts/adaptive-knowledge/pipeline-run';
import { extractStudyCards } from '../../scripts/adaptive-knowledge/study-card-extraction';
import type { CorpusRemoteSynthesisClient } from '../../scripts/adaptive-knowledge/remote-synthesis';
import { buildValidatedSynthesisFromPrinciples, synthesizeCorpusPrinciples } from '../../scripts/adaptive-knowledge/synthesis';
import type { ConnectorFetchResult } from '../../scripts/adaptive-knowledge/connectors/shared';

const baseRecord = {
  id: 'record-1',
  sourceType: 'review' as const,
  sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
  sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
  publishedAt: '2025-01-01',
  title: 'Periodized strength training improves outcomes',
  summaryEn: 'A structured summary of methods and outcomes.',
  tags: ['periodization', 'strength'],
  provenanceIds: ['record-1'],
};

function makeCard(overrides: Partial<StudyCard> = {}): StudyCard {
  return {
    recordId: 'record-1',
    title: 'Periodized strength training improves outcomes',
    authors: 'Doe et al.',
    year: 2024,
    journal: 'Journal of Strength Research',
    doi: '10.1000/example',
    studyType: 'rct',
    population: {
      description: 'Recreational lifters',
      size: 42,
      trainingLevel: 'intermediate',
    },
    protocol: {
      duration: '12 weeks',
      intervention: 'Periodized resistance training',
      comparison: 'Non-periodized program',
    },
    results: {
      primary: 'Strength improved more in the periodized group.',
      secondary: ['Lean mass increased modestly.'],
    },
    practicalTakeaways: ['Use a structured progression model over 12 weeks.'],
    limitations: ['Small sample size.'],
    safetySignals: ['No major adverse events reported.'],
    evidenceLevel: 'moderate',
    topicKeys: ['periodization', 'strength'],
    extractionSource: 'full-text',
    langueFr: {
      titreFr: 'La périodisation améliore les résultats',
      resumeFr: 'Résumé français de l’étude.',
      conclusionFr: 'Conclusion française de l’étude.',
    },
    ...overrides,
  };
}

function createMockRemoteClient(cardsByRecordId: Record<string, StudyCard | Record<string, unknown>>): CorpusRemoteSynthesisClient {
  return {
    async extractStudyCards(input) {
      return input.records.map((record) => cardsByRecordId[record.id] ?? makeCard({ recordId: record.id, title: record.title }));
    },
    async synthesizeLot() {
      throw new Error('not used in study card tests');
    },
    async consolidate() {
      throw new Error('not used in study card tests');
    },
  };
}

function buildConnectorSuccess(source: 'pubmed' | 'crossref' | 'openalex'): ConnectorFetchResult {
  return {
    source,
    skipped: false,
    records: [
      {
        ...baseRecord,
        id: `${source}-1`,
        title: `${source} title`,
        sourceType: source === 'pubmed' ? 'guideline' : source === 'crossref' ? 'review' : 'expertise',
        sourceUrl: `https://${source === 'openalex' ? 'openalex.org' : source === 'crossref' ? 'doi.org' : 'pubmed.ncbi.nlm.nih.gov'}/${source}-1`,
        sourceDomain: source === 'openalex' ? 'openalex.org' : source === 'crossref' ? 'doi.org' : 'pubmed.ncbi.nlm.nih.gov',
        tags: source === 'pubmed' ? ['progression'] : source === 'crossref' ? ['hypertrophy'] : ['fatigue'],
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
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}

test('StudyCard schema validates a complete card and rejects incomplete cards', () => {
  const validCard = makeCard();
  const parsed = parseStudyCard(validCard);
  assert.equal(parsed.recordId, 'record-1');
  assert.equal(studyCardSchema.safeParse(validCard).success, true);
  assert.equal(
    studyCardSchema.safeParse({
      recordId: 'record-1',
      title: 'Incomplete card',
    }).success,
    false,
  );
});

test('extractStudyCards returns validated cards from mock client responses', async () => {
  const records = [baseRecord, { ...baseRecord, id: 'record-2', title: 'Second study', provenanceIds: ['record-2'] }];
  const cards = await extractStudyCards({
    records,
    fullTextMap: new Map([
      ['record-1', { fullText: 'Full text body', sections: { methods: 'Methods' } }],
      ['record-2', { fullText: 'Second full text', sections: { results: 'Results' } }],
    ]),
    client: createMockRemoteClient({
      'record-1': makeCard({ recordId: 'record-1' }),
      'record-2': makeCard({ recordId: 'record-2', title: 'Second study' }),
    }),
    runId: 'run-study-cards',
  });

  assert.equal(cards.length, 2);
  assert.equal(cards[0]?.recordId, 'record-1');
  assert.equal(cards[1]?.recordId, 'record-2');
});

test('extractStudyCards uses full-text payload when available', async () => {
  const observed: Array<{ extractionSource: 'full-text' | 'abstract'; fullText?: string }> = [];
  const client: CorpusRemoteSynthesisClient = {
    async extractStudyCards(input) {
      observed.push(
        ...input.records.map((record) => ({
          extractionSource: input.payloadByRecordId.get(record.id)?.extractionSource ?? 'abstract',
          fullText: input.payloadByRecordId.get(record.id)?.fullText,
        })),
      );
      return input.records.map((record) => makeCard({ recordId: record.id, extractionSource: 'full-text' }));
    },
    async synthesizeLot() {
      throw new Error('not used');
    },
    async consolidate() {
      throw new Error('not used');
    },
  };

  await extractStudyCards({
    records: [baseRecord],
    fullTextMap: new Map([['record-1', { fullText: 'Complete full text', sections: { intro: 'Intro' } }]]),
    client,
    runId: 'run-fulltext',
  });

  assert.deepEqual(observed, [{ extractionSource: 'full-text', fullText: 'Complete full text' }]);
});

test('extractStudyCards falls back to abstract payload when no full-text exists', async () => {
  const observed: Array<{ extractionSource: 'full-text' | 'abstract'; fullText?: string }> = [];
  const client: CorpusRemoteSynthesisClient = {
    async extractStudyCards(input) {
      observed.push(
        ...input.records.map((record) => ({
          extractionSource: input.payloadByRecordId.get(record.id)?.extractionSource ?? 'abstract',
          fullText: input.payloadByRecordId.get(record.id)?.fullText,
        })),
      );
      return input.records.map((record) => makeCard({ recordId: record.id, extractionSource: 'abstract' }));
    },
    async synthesizeLot() {
      throw new Error('not used');
    },
    async consolidate() {
      throw new Error('not used');
    },
  };

  await extractStudyCards({
    records: [baseRecord],
    fullTextMap: new Map(),
    client,
    runId: 'run-abstract',
  });

  assert.deepEqual(observed, [{ extractionSource: 'abstract', fullText: undefined }]);
});

test('pipeline writes study-cards.json when remote synthesis client is configured', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-study-cards-pipeline-'));

  await runAdaptiveKnowledgePipeline({
    runId: 'run-study-cards-pipeline',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir,
    remoteSynthesisClient: {
      async extractStudyCards(input) {
        return input.records.map((record) =>
          makeCard({
            recordId: record.id,
            title: record.title,
            topicKeys: record.tags,
            extractionSource: input.payloadByRecordId.get(record.id)?.extractionSource ?? 'abstract',
          }),
        );
      },
      async synthesizeThematicPrinciples(input) {
        return {
          topicKey: input.topicKey,
          topicLabel: input.topicLabel,
          principlesFr: [
            {
              id: `${input.topicKey}-1`,
              title: 'Principe thématique',
              statement: 'Adapter la progression au contexte du pratiquant.',
              conditions: ['Tolérance de charge stable'],
              guardrail: 'SAFE-03' as const,
              evidenceLevel: 'moderate' as const,
              sourceCardIds: input.studyCards.map((card) => card.recordId),
            },
          ],
          summaryFr: `Synthèse pour ${input.topicLabel}`,
          gapsFr: ['Davantage de données à long terme nécessaires.'],
          studyCount: input.studyCards.length,
          lastUpdated: '2026-03-05T00:00:00.000Z',
        };
      },
      async synthesizeLot() {
        throw new Error('not used');
      },
      async consolidate() {
        throw new Error('not used');
      },
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
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  const artifact = (await loadJson(
    path.join(outputRootDir, 'snapshots', 'run-study-cards-pipeline', 'validated', 'study-cards.json'),
  )) as { studyCards: StudyCard[] };
  const report = (await loadJson(
    path.join(outputRootDir, 'snapshots', 'run-study-cards-pipeline', 'validated', 'run-report.json'),
  )) as { stageReports: Array<{ stage: string; status: string }> };

  assert.equal(Array.isArray(artifact.studyCards), true);
  assert.equal(artifact.studyCards.length > 0, true);
  assert.equal(report.stageReports.some((stage) => stage.stage === 'extract-study-cards' && stage.status === 'succeeded'), true);
});

test('pipeline skips study card extraction when remote synthesis is unavailable', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-study-cards-skip-'));

  await runAdaptiveKnowledgePipeline({
    runId: 'run-study-cards-skipped',
    now: new Date('2026-03-05T00:00:00.000Z'),
    outputRootDir,
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
    connectors: {
      pubmed: async () => buildConnectorSuccess('pubmed'),
      crossref: async () => buildConnectorSuccess('crossref'),
      openalex: async () => buildConnectorSuccess('openalex'),
    },
  });

  const artifact = (await loadJson(
    path.join(outputRootDir, 'snapshots', 'run-study-cards-skipped', 'validated', 'study-cards.json'),
  )) as { studyCards: StudyCard[] };
  const report = (await loadJson(
    path.join(outputRootDir, 'snapshots', 'run-study-cards-skipped', 'validated', 'run-report.json'),
  )) as { stageReports: Array<{ stage: string; status: string }> };

  assert.deepEqual(artifact.studyCards, []);
  assert.equal(report.stageReports.some((stage) => stage.stage === 'extract-study-cards' && stage.status === 'skipped'), true);
});
