import {
  parseQuestionSynthesisDossier,
  parseScientificContradiction,
  type QuestionSynthesisDossier,
  type ScientificContradiction,
  type ScientificQuestion,
  type StudyDossierRegistryRecord,
} from './contracts';

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function inferOutcomeDirection(study: StudyDossierRegistryRecord): 'positive' | 'negative' | 'neutral' {
  const haystack = normalizeText([
    study.title,
    study.studyCard.title,
    study.studyCard.results.primary,
    ...study.studyCard.results.secondary,
    ...study.studyCard.practicalTakeaways,
    study.studyCard.langueFr.resumeFr,
    study.studyCard.langueFr.conclusionFr,
  ].join(' '));

  const negativeSignals = [
    'did not improve',
    'no improvement',
    'no better',
    'n ameliore pas',
    'pas d amelioration',
    'worse',
    'fatigue increased',
    'augmente la fatigue',
    'ineffective',
  ];
  if (negativeSignals.some((signal) => haystack.includes(signal))) {
    return 'negative';
  }

  const positiveSignals = [
    'improved',
    'improves',
    'better',
    'increased hypertrophy',
    'ameliore',
    'favorise',
    'utile',
    'preferable',
    'supports',
  ];
  if (positiveSignals.some((signal) => haystack.includes(signal))) {
    return 'positive';
  }

  return 'neutral';
}

function uniqueStudyIds(studies: readonly StudyDossierRegistryRecord[]): string[] {
  return [...new Set(studies.map((study) => study.studyId))].sort();
}

export function analyzeQuestionContradictions(input: {
  question: ScientificQuestion;
  linkedStudies: readonly StudyDossierRegistryRecord[];
}): ScientificContradiction[] {
  const contradictions: ScientificContradiction[] = [];
  const studies = input.linkedStudies;

  if (studies.length <= 1) {
    return contradictions;
  }

  const outcomeDirections = new Set(studies.map(inferOutcomeDirection));
  if (outcomeDirections.has('positive') && outcomeDirections.has('negative')) {
    contradictions.push(
      parseScientificContradiction({
        questionId: input.question.questionId,
        studyIds: uniqueStudyIds(studies),
        reasonCode: 'outcome-direction-divergence',
        summaryFr: 'Les etudes liees donnent des directions de resultat contradictoires pour cette question.',
        severity: 'blocking',
        resolved: false,
      }),
    );
  }

  const trainingLevels = new Set(studies.map((study) => study.studyCard.population.trainingLevel).filter(Boolean));
  if (trainingLevels.size > 1) {
    contradictions.push(
      parseScientificContradiction({
        questionId: input.question.questionId,
        studyIds: uniqueStudyIds(studies),
        reasonCode: 'population-training-level-mismatch',
        summaryFr: 'Les populations et niveaux d entrainement divergent, ce qui limite une conclusion unique.',
        severity: outcomeDirections.has('positive') && outcomeDirections.has('negative') ? 'blocking' : 'caution',
        resolved: false,
      }),
    );
  }

  const evidenceLevels = new Set(studies.map((study) => study.studyCard.evidenceLevel));
  if (evidenceLevels.size > 1) {
    contradictions.push(
      parseScientificContradiction({
        questionId: input.question.questionId,
        studyIds: uniqueStudyIds(studies),
        reasonCode: 'evidence-level-mismatch',
        summaryFr: 'Le niveau de preuve n est pas homogène entre les etudes soutenant cette question.',
        severity: 'caution',
        resolved: false,
      }),
    );
  }

  return contradictions;
}

export function refreshQuestionContradictions(input: {
  question: ScientificQuestion;
  linkedStudies: readonly StudyDossierRegistryRecord[];
}): ScientificContradiction[] {
  return analyzeQuestionContradictions(input);
}

export function mergeQuestionContradictions(input: {
  existing: readonly ScientificContradiction[];
  refreshed: readonly ScientificContradiction[];
}): ScientificContradiction[] {
  const merged = new Map<string, ScientificContradiction>();

  for (const contradiction of [...input.existing, ...input.refreshed]) {
    const key = `${contradiction.questionId}:${contradiction.reasonCode}:${contradiction.studyIds.join('|')}`;
    merged.set(key, parseScientificContradiction(contradiction));
  }

  return [...merged.values()];
}

export function buildQuestionSynthesisDossier(input: {
  question: ScientificQuestion;
  linkedStudies: readonly StudyDossierRegistryRecord[];
  contradictions: readonly ScientificContradiction[];
  now?: Date;
}): QuestionSynthesisDossier {
  const unresolvedBlocking = input.contradictions.some((item) => item.resolved === false && item.severity === 'blocking');
  const linkedStudyIds = uniqueStudyIds(input.linkedStudies);

  let confidenceLevel: QuestionSynthesisDossier['confidenceLevel'] = 'low';
  if (linkedStudyIds.length >= 4 && !unresolvedBlocking) {
    confidenceLevel = 'high';
  } else if (linkedStudyIds.length >= 2 && !unresolvedBlocking) {
    confidenceLevel = 'moderate';
  }

  let publicationReadiness: QuestionSynthesisDossier['publicationReadiness'] = 'insufficient';
  if (unresolvedBlocking) {
    publicationReadiness = 'blocked';
  } else if (linkedStudyIds.length >= 3) {
    publicationReadiness = 'ready';
  } else if (linkedStudyIds.length >= 2) {
    publicationReadiness = 'candidate';
  }

  const summaryFr = unresolvedBlocking
    ? `Des contradictions non resolues restent presentes pour ${input.question.labelFr}. Publication conservative bloquee.`
    : `Question ${input.question.labelFr} avec ${linkedStudyIds.length} etudes liees et limites explicites.`;

  return parseQuestionSynthesisDossier({
    questionId: input.question.questionId,
    coverageStatus: input.question.coverageStatus,
    linkedStudyIds,
    contradictions: input.contradictions,
    summaryFr,
    confidenceLevel,
    publicationReadiness,
    generatedAt: nowIso(input.now),
  });
}
