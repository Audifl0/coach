import assert from 'node:assert/strict';
import test from 'node:test';

import { parseScientificQuestion, type ScientificQuestion, type StudyDossierRegistryRecord } from '../../scripts/adaptive-knowledge/contracts';
import {
  analyzeQuestionContradictions,
  buildQuestionSynthesisDossier,
} from '../../scripts/adaptive-knowledge/contradiction-analysis';

function buildQuestion(overrides: Partial<ScientificQuestion> = {}): ScientificQuestion {
  return parseScientificQuestion({
    questionId: overrides.questionId ?? 'q-weekly-volume-hypertrophy',
    labelFr: overrides.labelFr ?? 'Volume hebdomadaire et hypertrophie',
    promptFr: overrides.promptFr ?? 'Quel volume hebdomadaire favorise le mieux l hypertrophie ?',
    topicKeys: overrides.topicKeys ?? ['hypertrophy-dose', 'hypertrophy', 'volume'],
    inclusionCriteria: overrides.inclusionCriteria ?? ['Etudes comparant le volume hebdomadaire.'],
    exclusionCriteria: overrides.exclusionCriteria ?? ['Etudes sans outcome hypertrophie.'],
    linkedStudyIds: overrides.linkedStudyIds ?? [],
    coverageStatus: overrides.coverageStatus ?? 'developing',
    publicationStatus: overrides.publicationStatus ?? 'candidate',
    updatedAt: overrides.updatedAt ?? '2026-03-22T00:00:00.000Z',
  });
}

function buildStudy(overrides: Partial<StudyDossierRegistryRecord> = {}): StudyDossierRegistryRecord {
  const studyId = overrides.studyId ?? overrides.recordId ?? 'study-1';
  const recordId = overrides.recordId ?? studyId;
  const title = overrides.title ?? 'Weekly set volume and hypertrophy in trained adults';
  return {
    studyId,
    recordId,
    title,
    status: overrides.status ?? 'validated-structure',
    topicKeys: overrides.topicKeys ?? ['hypertrophy-dose', 'hypertrophy'],
    studyCard:
      overrides.studyCard ??
      {
        recordId,
        title,
        authors: 'Doe et al.',
        year: 2024,
        journal: 'Journal of Strength Research',
        doi: null,
        studyType: 'rct',
        population: {
          description: 'trained adults',
          size: 28,
          trainingLevel: 'intermediate',
        },
        protocol: {
          duration: '8 weeks',
          intervention: 'higher weekly set volume',
          comparison: 'lower weekly set volume',
        },
        results: {
          primary: 'Higher weekly volume improved hypertrophy outcomes.',
          secondary: ['No major safety signals.'],
        },
        practicalTakeaways: ['Increase sets cautiously when recovery remains stable.'],
        limitations: ['Small sample.'],
        safetySignals: ['No major adverse events.'],
        evidenceLevel: 'moderate',
        topicKeys: overrides.topicKeys ?? ['hypertrophy-dose', 'hypertrophy'],
        extractionSource: 'abstract',
        langueFr: {
          titreFr: `FR ${title}`,
          resumeFr: 'Le volume plus eleve ameliore l hypertrophie.',
          conclusionFr: 'Le volume plus eleve semble utile dans ce contexte.',
        },
      },
    createdAt: overrides.createdAt ?? '2026-03-22T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-03-22T00:00:00.000Z',
  };
}

test('contradiction analysis identifies divergent signals for the same question', () => {
  const question = buildQuestion({ linkedStudyIds: ['study-positive', 'study-negative'] });
  const positiveStudy = buildStudy({
    studyId: 'study-positive',
    recordId: 'study-positive',
    studyCard: {
      ...buildStudy().studyCard,
      recordId: 'study-positive',
      title: 'Higher weekly volume improved hypertrophy',
      population: {
        description: 'trained adults',
        size: 32,
        trainingLevel: 'intermediate',
      },
      results: {
        primary: 'Higher weekly volume improved hypertrophy outcomes.',
        secondary: ['Improved regional growth.'],
      },
      practicalTakeaways: ['A bit more weekly volume can help.'],
      langueFr: {
        titreFr: 'Volume eleve et hypertrophie',
        resumeFr: 'Le volume plus eleve ameliore clairement l hypertrophie.',
        conclusionFr: 'Le volume eleve semble preferable.',
      },
      evidenceLevel: 'high',
    },
  });
  const negativeStudy = buildStudy({
    studyId: 'study-negative',
    recordId: 'study-negative',
    studyCard: {
      ...buildStudy().studyCard,
      recordId: 'study-negative',
      title: 'Higher weekly volume did not improve hypertrophy',
      population: {
        description: 'trained adults',
        size: 18,
        trainingLevel: 'advanced',
      },
      results: {
        primary: 'Higher weekly volume did not improve hypertrophy compared with lower volume.',
        secondary: ['Fatigue increased.'],
      },
      practicalTakeaways: ['Higher volume may not help advanced lifters.'],
      langueFr: {
        titreFr: 'Volume eleve sans gain supplementaire',
        resumeFr: 'Le volume plus eleve n ameliore pas l hypertrophie ici.',
        conclusionFr: 'Le gain attendu n apparait pas.',
      },
      evidenceLevel: 'low',
    },
  });

  const contradictions = analyzeQuestionContradictions({
    question,
    linkedStudies: [positiveStudy, negativeStudy],
  });

  assert.equal(contradictions.some((item) => item.reasonCode === 'outcome-direction-divergence'), true);
  assert.equal(contradictions.some((item) => item.reasonCode === 'population-training-level-mismatch'), true);
  assert.equal(contradictions.some((item) => item.reasonCode === 'evidence-level-mismatch'), true);
  assert.equal(contradictions.some((item) => item.resolved === false), true);
});

test('convergent studies do not create blocking contradictions', () => {
  const question = buildQuestion({ linkedStudyIds: ['study-1', 'study-2'] });
  const studyA = buildStudy({
    studyId: 'study-1',
    recordId: 'study-1',
  });
  const studyB = buildStudy({
    studyId: 'study-2',
    recordId: 'study-2',
    studyCard: {
      ...buildStudy().studyCard,
      recordId: 'study-2',
      title: 'Slightly higher weekly volume improved hypertrophy too',
      results: {
        primary: 'Slightly higher weekly volume improved hypertrophy outcomes.',
        secondary: ['Adherence remained acceptable.'],
      },
      evidenceLevel: 'moderate',
    },
  });

  const contradictions = analyzeQuestionContradictions({
    question,
    linkedStudies: [studyA, studyB],
  });

  assert.equal(contradictions.some((item) => item.severity === 'blocking'), false);
});

test('question dossier records unresolved contradictions explicitly', () => {
  const question = buildQuestion({ linkedStudyIds: ['study-positive', 'study-negative'] });
  const positiveStudy = buildStudy({ studyId: 'study-positive', recordId: 'study-positive' });
  const negativeStudy = buildStudy({
    studyId: 'study-negative',
    recordId: 'study-negative',
    studyCard: {
      ...buildStudy().studyCard,
      recordId: 'study-negative',
      title: 'Higher weekly volume did not improve hypertrophy',
      results: {
        primary: 'Higher weekly volume did not improve hypertrophy compared with lower volume.',
        secondary: ['Fatigue increased.'],
      },
      evidenceLevel: 'low',
    },
  });

  const contradictions = analyzeQuestionContradictions({
    question,
    linkedStudies: [positiveStudy, negativeStudy],
  });
  const dossier = buildQuestionSynthesisDossier({
    question,
    linkedStudies: [positiveStudy, negativeStudy],
    contradictions,
    now: new Date('2026-03-22T12:00:00.000Z'),
  });

  assert.equal(dossier.questionId, question.questionId);
  assert.equal(dossier.contradictions.some((item) => item.resolved === false), true);
  assert.equal(dossier.publicationReadiness, 'blocked');
  assert.match(dossier.summaryFr, /contradiction|diverg/i);
});
