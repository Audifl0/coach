import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseScientificQuestion,
  type ScientificQuestion,
  type StudyDossierRegistryRecord,
} from '../../scripts/adaptive-knowledge/contracts';
import { linkStudiesToScientificQuestions } from '../../scripts/adaptive-knowledge/question-linking';

function buildStudyDossier(overrides: Partial<StudyDossierRegistryRecord> = {}): StudyDossierRegistryRecord {
  const recordId = overrides.recordId ?? overrides.studyId ?? 'study-1';
  const title = overrides.title ?? 'Weekly set volume and hypertrophy in trained adults';
  return {
    studyId: recordId,
    recordId,
    title,
    status: overrides.status ?? 'validated-structure',
    topicKeys: overrides.topicKeys ?? ['hypertrophy-dose', 'progression'],
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
          size: 24,
          trainingLevel: 'intermediate',
        },
        protocol: {
          duration: '8 weeks',
          intervention: 'higher weekly set volume with autoregulated loading',
          comparison: 'lower weekly set volume',
        },
        results: {
          primary: 'Higher weekly volume improved hypertrophy outcomes.',
          secondary: ['Autoregulated progression improved adherence.'],
        },
        practicalTakeaways: [
          'Increase weekly sets when recovery remains stable.',
          'Use autoregulation to progress load when readiness is high.',
        ],
        limitations: ['Small sample.'],
        safetySignals: ['No serious adverse events.'],
        evidenceLevel: 'moderate',
        topicKeys: overrides.topicKeys ?? ['hypertrophy-dose', 'progression'],
        extractionSource: 'abstract',
        langueFr: {
          titreFr: `FR ${title}`,
          resumeFr: 'Le volume hebdomadaire plus eleve favorise l hypertrophie et l autoregulation aide la progression.',
          conclusionFr: 'Conclusion francaise.',
        },
      },
    createdAt: overrides.createdAt ?? '2026-03-22T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-03-22T00:05:00.000Z',
  };
}

function buildQuestion(overrides: Partial<ScientificQuestion> = {}): ScientificQuestion {
  return parseScientificQuestion({
    questionId: overrides.questionId ?? 'q-weekly-volume-hypertrophy',
    labelFr: overrides.labelFr ?? 'Volume hebdomadaire et hypertrophie',
    promptFr:
      overrides.promptFr ?? 'Quel volume hebdomadaire de travail favorise le mieux l hypertrophie musculaire ? ',
    topicKeys: overrides.topicKeys ?? ['hypertrophy-dose', 'hypertrophy', 'volume'],
    inclusionCriteria:
      overrides.inclusionCriteria ?? ['Etudes comparant des doses de volume ou le nombre de series hebdomadaires.'],
    exclusionCriteria:
      overrides.exclusionCriteria ?? ['Etudes sans outcome hypertrophie.', 'Modeles non entraines uniquement.'],
    linkedStudyIds: overrides.linkedStudyIds ?? [],
    coverageStatus: overrides.coverageStatus ?? 'empty',
    publicationStatus: overrides.publicationStatus ?? 'not-ready',
    updatedAt: overrides.updatedAt ?? '2026-03-22T00:00:00.000Z',
  });
}

test('scientific question contract accepts explicit inclusion and exclusion criteria', () => {
  const question = parseScientificQuestion({
    questionId: 'q-rest-intervals-strength',
    labelFr: 'Temps de repos et force',
    promptFr: 'Quels temps de repos soutiennent le mieux les gains de force ?',
    topicKeys: ['strength', 'rest-intervals'],
    inclusionCriteria: ['Essais comparant differents temps de repos entre series.'],
    exclusionCriteria: ['Etudes sans outcome de force maximale.'],
    linkedStudyIds: ['study-1'],
    coverageStatus: 'partial',
    publicationStatus: 'candidate',
    updatedAt: '2026-03-22T00:00:00.000Z',
  });

  assert.equal(question.inclusionCriteria.length, 1);
  assert.equal(question.exclusionCriteria.length, 1);
  assert.equal(question.linkedStudyIds[0], 'study-1');
});

test('volume-oriented study links to hypertrophy-volume question', () => {
  const study = buildStudyDossier();
  const question = buildQuestion();

  const result = linkStudiesToScientificQuestions({
    studyDossiers: [study],
    questions: [question],
  });

  assert.equal(result.links.some((link) => link.questionId === question.questionId && link.studyId === study.studyId), true);
  assert.deepEqual(result.questions[0]?.linkedStudyIds, [study.studyId]);
  assert.equal(result.questions[0]?.coverageStatus, 'partial');
});

test('study can link to multiple compatible questions', () => {
  const study = buildStudyDossier();
  const volumeQuestion = buildQuestion();
  const autoregulationQuestion = buildQuestion({
    questionId: 'q-autoregulation-progression',
    labelFr: 'Autoregulation et progression',
    promptFr: 'Comment l autoregulation influence-t-elle la progression de charge ?',
    topicKeys: ['progression', 'autoregulation'],
    inclusionCriteria: ['Etudes sur la progression autoregulee ou l ajustement de charge.'],
    exclusionCriteria: ['Etudes sans strategie de progression.'],
  });

  const result = linkStudiesToScientificQuestions({
    studyDossiers: [study],
    questions: [volumeQuestion, autoregulationQuestion],
  });

  assert.equal(result.links.length, 2);
  assert.equal(result.questions.every((item) => item.linkedStudyIds.includes(study.studyId)), true);
});

test('question remains partial when coverage is still thin', () => {
  const study = buildStudyDossier({ recordId: 'study-thin-1', studyId: 'study-thin-1' });
  const question = buildQuestion({ linkedStudyIds: [] });

  const result = linkStudiesToScientificQuestions({
    studyDossiers: [study],
    questions: [question],
  });

  assert.equal(result.questions[0]?.linkedStudyIds.length, 1);
  assert.equal(result.questions[0]?.coverageStatus, 'partial');
});

test('question linking reports undercovered backlog reasons for non-mature questions', () => {
  const emptyQuestion = buildQuestion({
    questionId: 'q-empty',
    topicKeys: ['progression'],
    coverageStatus: 'empty',
    linkedStudyIds: [],
  });
  const partialQuestion = buildQuestion({
    questionId: 'q-partial',
    topicKeys: ['hypertrophy-dose'],
    coverageStatus: 'partial',
    linkedStudyIds: ['study-1'],
  });
  const matureQuestion = buildQuestion({
    questionId: 'q-mature',
    topicKeys: ['rest-intervals'],
    coverageStatus: 'mature',
    linkedStudyIds: ['study-1', 'study-2', 'study-3', 'study-4'],
  });

  const result = linkStudiesToScientificQuestions({
    studyDossiers: [],
    questions: [emptyQuestion, partialQuestion, matureQuestion],
  });

  assert.deepEqual(result.undercoveredQuestionIds, ['q-empty', 'q-partial']);
  assert.deepEqual(result.backlogReasons, ['undercovered-question']);
});
