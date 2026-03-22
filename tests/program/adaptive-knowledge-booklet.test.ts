import assert from 'node:assert/strict';
import test from 'node:test';

import type { StudyCard, ThematicSynthesis } from '../../scripts/adaptive-knowledge/contracts';
import { renderBookletMarkdown } from '../../scripts/adaptive-knowledge/booklet-renderer';

function buildStudyCard(overrides: Partial<StudyCard> = {}): StudyCard {
  return {
    recordId: 'study-1',
    title: 'Resistance Training Study',
    authors: 'Doe et al.',
    year: 2024,
    journal: 'Journal of Strength Research',
    doi: '10.1000/study-1',
    studyType: 'rct',
    population: {
      description: 'Adult lifters',
      size: 30,
      trainingLevel: 'intermediate',
    },
    protocol: {
      duration: '8 semaines',
      intervention: 'Progression encadrée',
      comparison: 'Charge fixe',
    },
    results: {
      primary: 'Amélioration de la force.',
      secondary: ['Amélioration légère de la masse maigre.'],
    },
    practicalTakeaways: ['Monter la charge progressivement.'],
    limitations: ['Petit échantillon.'],
    safetySignals: ['Pas d’événement grave.'],
    evidenceLevel: 'moderate',
    topicKeys: ['progression'],
    extractionSource: 'abstract',
    langueFr: {
      titreFr: 'Étude sur la progression',
      resumeFr: 'Résumé français.',
      conclusionFr: 'Conclusion française.',
    },
    ...overrides,
  };
}

function buildThematicSynthesis(overrides: Partial<ThematicSynthesis> = {}): ThematicSynthesis {
  return {
    topicKey: 'progression',
    topicLabel: 'Progression',
    principlesFr: [
      {
        id: 'progression-1',
        title: 'Surcharge progressive',
        statement: 'Augmenter progressivement la difficulté au fil du temps.',
        conditions: ['Tolérance de charge stable', 'Technique maîtrisée'],
        guardrail: 'SAFE-03',
        evidenceLevel: 'moderate',
        sourceCardIds: ['study-1'],
      },
    ],
    summaryFr: 'Résumé du thème progression.',
    gapsFr: ['Davantage de données à long terme nécessaires.'],
    studyCount: 1,
    lastUpdated: '2026-03-05T00:00:00.000Z',
    ...overrides,
  };
}

test('renderBookletMarkdown renders title, date, topic sections, principles, study table, and bibliography', () => {
  const markdown = renderBookletMarkdown({
    thematicSyntheses: [buildThematicSynthesis()],
    studyCards: [buildStudyCard()],
    generatedAt: '2026-03-05T00:00:00.000Z',
    snapshotId: 'snapshot-1',
  });

  assert.match(markdown, /^# Bibliothèque Scientifique — Coach Musculation IA/m);
  assert.match(markdown, /^## Généré le 2026-03-05 — 1 études analysées$/m);
  assert.match(markdown, /^### 1\. Progression$/m);
  assert.match(markdown, /^#### Synthèse$/m);
  assert.match(markdown, /^Résumé du thème progression\.$/m);
  assert.match(markdown, /^#### Principes$/m);
  assert.match(markdown, /^- \*\*Principe 1 : Surcharge progressive\*\* — Augmenter progressivement la difficulté au fil du temps\.$/m);
  assert.match(markdown, /^  - Conditions d'application : Tolérance de charge stable ; Technique maîtrisée$/m);
  assert.match(markdown, /^  - Niveau d'évidence : moderate$/m);
  assert.match(markdown, /^  - Garde-fou : SAFE-03$/m);
  assert.match(markdown, /^#### Études de référence$/m);
  assert.match(markdown, /^\| Étude \| Type \| Population \| Résultat principal \| Takeaway \|$/m);
  assert.match(markdown, /^\| Étude sur la progression \(2024\) \| rct \| Adult lifters \| Amélioration de la force\. \| Monter la charge progressivement\. \|$/m);
  assert.match(markdown, /^### Bibliographie complète$/m);
  assert.match(markdown, /^- 10\.1000\/study-1 — Resistance Training Study \(2024\), Journal of Strength Research$/m);
  assert.equal(markdown.endsWith('\n'), true);
});

test('renderBookletMarkdown omits study table when no matching sourceCardIds exist', () => {
  const markdown = renderBookletMarkdown({
    thematicSyntheses: [
      buildThematicSynthesis({
        principlesFr: [
          {
            id: 'progression-1',
            title: 'Surcharge progressive',
            statement: 'Augmenter progressivement la difficulté au fil du temps.',
            conditions: ['Tolérance de charge stable'],
            guardrail: 'SAFE-03',
            evidenceLevel: 'moderate',
            sourceCardIds: ['missing-study'],
          },
        ],
      }),
    ],
    studyCards: [buildStudyCard()],
    generatedAt: '2026-03-05T00:00:00.000Z',
    snapshotId: 'snapshot-1',
  });

  assert.equal(markdown.includes('#### Études de référence'), false);
  assert.equal(markdown.includes('| Étude | Type | Population | Résultat principal | Takeaway |'), false);
});

test('renderBookletMarkdown escapes pipe characters in markdown tables', () => {
  const markdown = renderBookletMarkdown({
    thematicSyntheses: [buildThematicSynthesis()],
    studyCards: [
      buildStudyCard({
        langueFr: {
          titreFr: 'Étude A | B',
          resumeFr: 'Résumé français.',
          conclusionFr: 'Conclusion française.',
        },
        population: {
          description: 'Adultes | confirmés',
          size: 30,
          trainingLevel: 'intermediate',
        },
        results: {
          primary: 'Gain | principal',
          secondary: [],
        },
        practicalTakeaways: ['Action | utile'],
      }),
    ],
    generatedAt: '2026-03-05T00:00:00.000Z',
    snapshotId: 'snapshot-1',
  });

  assert.match(markdown, /Étude A \\\| B \(2024\)/);
  assert.match(markdown, /Adultes \\\| confirmés/);
  assert.match(markdown, /Gain \\\| principal/);
  assert.match(markdown, /Action \\\| utile/);
});

test('renderBookletMarkdown sorts bibliography by year descending', () => {
  const markdown = renderBookletMarkdown({
    thematicSyntheses: [buildThematicSynthesis()],
    studyCards: [
      buildStudyCard({ recordId: 'study-older', title: 'Older Study', doi: '10.1000/older', year: 2021 }),
      buildStudyCard({ recordId: 'study-newer-b', title: 'B Study', doi: '10.1000/newer-b', year: 2024 }),
      buildStudyCard({ recordId: 'study-newer-a', title: 'A Study', doi: '10.1000/newer-a', year: 2024 }),
    ],
    generatedAt: '2026-03-05T00:00:00.000Z',
    snapshotId: 'snapshot-1',
  });

  const bibliography = markdown.slice(markdown.indexOf('### Bibliographie complète'));
  const entries = bibliography
    .split('\n')
    .filter((line) => line.startsWith('- '));

  assert.deepEqual(entries, [
    '- 10.1000/newer-a — A Study (2024), Journal of Strength Research',
    '- 10.1000/newer-b — B Study (2024), Journal of Strength Research',
    '- 10.1000/older — Older Study (2021), Journal of Strength Research',
  ]);
});
