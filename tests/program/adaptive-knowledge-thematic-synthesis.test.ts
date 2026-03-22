import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseStudyCard,
  parseThematicSynthesis,
  thematicSynthesisSchema,
  type StudyCard,
  type ThematicSynthesis,
} from '../../scripts/adaptive-knowledge/contracts';
import { synthesizeThematicPrinciples } from '../../scripts/adaptive-knowledge/thematic-synthesis';
import type { CorpusRemoteSynthesisClient } from '../../scripts/adaptive-knowledge/remote-synthesis';

function makeStudyCard(overrides: Partial<StudyCard> = {}): StudyCard {
  return parseStudyCard({
    recordId: 'record-1',
    title: 'Progressive overload and hypertrophy',
    authors: 'Doe et al.',
    year: 2024,
    journal: 'Journal of Strength Research',
    doi: '10.1000/example',
    studyType: 'rct',
    population: {
      description: 'Adult recreational lifters',
      size: 40,
      trainingLevel: 'intermediate',
    },
    protocol: {
      duration: '12 semaines',
      intervention: 'Entraînement en résistance progressif',
      comparison: 'Charge fixe',
    },
    results: {
      primary: 'Meilleure progression de force.',
      secondary: ['Hypertrophie modérée.'],
    },
    practicalTakeaways: ['Ajuster la charge progressivement.'],
    limitations: ['Échantillon limité.'],
    safetySignals: ['Aucun événement grave rapporté.'],
    evidenceLevel: 'moderate',
    topicKeys: ['progression'],
    extractionSource: 'full-text',
    langueFr: {
      titreFr: 'La surcharge progressive améliore les résultats',
      resumeFr: 'Résumé français.',
      conclusionFr: 'Conclusion française.',
    },
    ...overrides,
  });
}

function makeThematicSynthesis(overrides: Partial<ThematicSynthesis> = {}): ThematicSynthesis {
  return parseThematicSynthesis({
    topicKey: 'progression',
    topicLabel: 'Progression et surcharge progressive',
    principlesFr: [
      {
        id: 'progression-1',
        title: 'Progression graduelle',
        statement: 'Augmenter la charge ou le volume de façon progressive selon la tolérance.',
        conditions: ['Chez des pratiquants sans douleur aiguë', 'Avec suivi de la récupération'],
        guardrail: 'SAFE-03',
        evidenceLevel: 'moderate',
        sourceCardIds: ['record-1', 'record-2'],
      },
    ],
    summaryFr: 'La progression graduelle est soutenue par plusieurs études chez des pratiquants entraînés.',
    gapsFr: ['Peu de données chez les débutants plus âgés.'],
    studyCount: 2,
    lastUpdated: '2026-03-22T00:00:00.000Z',
    ...overrides,
  });
}

function createMockRemoteClient(thematicSynthesis: ThematicSynthesis): CorpusRemoteSynthesisClient {
  return {
    async extractStudyCards() {
      throw new Error('not used');
    },
    async synthesizeLot() {
      throw new Error('not used');
    },
    async consolidate() {
      throw new Error('not used');
    },
    async synthesizeThematicPrinciples() {
      return thematicSynthesis;
    },
  };
}

test('ThematicSynthesis schema validates complete payload and rejects incomplete payload', () => {
  const valid = makeThematicSynthesis();
  assert.equal(thematicSynthesisSchema.safeParse(valid).success, true);
  assert.equal(parseThematicSynthesis(valid).topicKey, 'progression');
  assert.equal(
    thematicSynthesisSchema.safeParse({
      topicKey: 'progression',
      topicLabel: 'Progression',
    }).success,
    false,
  );
});

test('synthesizeThematicPrinciples returns validated thematic synthesis from mock client', async () => {
  const studyCards = [makeStudyCard(), makeStudyCard({ recordId: 'record-2', title: 'Second study' })];
  const thematicSynthesis = makeThematicSynthesis();

  const result = await synthesizeThematicPrinciples({
    topicKey: 'progression',
    topicLabel: 'Progression et surcharge progressive',
    studyCards,
    client: createMockRemoteClient(thematicSynthesis),
    runId: 'run-thematic-1',
  });

  assert.deepEqual(result, thematicSynthesis);
});

test('synthesizeThematicPrinciples includes sourceCardIds from input study cards', async () => {
  const studyCards = [makeStudyCard({ recordId: 'record-a' }), makeStudyCard({ recordId: 'record-b' })];
  const thematicSynthesis = makeThematicSynthesis({
    principlesFr: [
      {
        id: 'progression-1',
        title: 'Progression graduelle',
        statement: 'Augmenter progressivement.',
        conditions: ['Surveillance de la récupération'],
        guardrail: 'SAFE-03',
        evidenceLevel: 'moderate',
        sourceCardIds: ['record-a', 'record-b'],
      },
    ],
  });

  const result = await synthesizeThematicPrinciples({
    topicKey: 'progression',
    topicLabel: 'Progression et surcharge progressive',
    studyCards,
    client: createMockRemoteClient(thematicSynthesis),
    runId: 'run-thematic-2',
  });

  const inputIds = new Set(studyCards.map((card) => card.recordId));
  for (const principle of result.principlesFr) {
    for (const sourceCardId of principle.sourceCardIds) {
      assert.equal(inputIds.has(sourceCardId), true);
    }
  }
});
