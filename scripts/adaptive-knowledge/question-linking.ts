import {
  parseScientificQuestion,
  parseScientificQuestionCoverage,
  parseScientificQuestionStudyLink,
  type ScientificQuestion,
  type ScientificQuestionCoverage,
  type ScientificQuestionStudyLink,
  type StudyDossierRegistryRecord,
} from './contracts';

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase();
}

function computeCoverageStatus(linkedStudyCount: number): ScientificQuestion['coverageStatus'] {
  if (linkedStudyCount <= 0) {
    return 'empty';
  }
  if (linkedStudyCount === 1) {
    return 'partial';
  }
  if (linkedStudyCount <= 3) {
    return 'developing';
  }
  return 'mature';
}

function collectStudySignals(study: StudyDossierRegistryRecord): string[] {
  const card = study.studyCard;
  return [
    ...study.topicKeys,
    ...card.topicKeys,
    study.title,
    card.title,
    card.studyType,
    card.results.primary,
    ...card.results.secondary,
    ...card.practicalTakeaways,
    card.langueFr.titreFr,
    card.langueFr.resumeFr,
    card.langueFr.conclusionFr,
    card.protocol.intervention,
    card.protocol.comparison ?? '',
  ].map((value) => normalizeText(value));
}

function matchQuestionToStudy(question: ScientificQuestion, study: StudyDossierRegistryRecord): {
  matchedTopicKeys: string[];
  matchedSignals: string[];
} {
  const studySignals = collectStudySignals(study);
  const matchedTopicKeys = question.topicKeys.filter((topicKey) =>
    study.topicKeys.includes(topicKey) || study.studyCard.topicKeys.includes(topicKey),
  );

  const matchedSignals = question.topicKeys.filter((topicKey) => {
    const normalizedTopicKey = normalizeText(topicKey).replace(/[-_]/g, ' ');
    return studySignals.some((signal) => signal.includes(normalizedTopicKey));
  });

  if (question.questionId === 'q-weekly-volume-hypertrophy') {
    const hasVolumeSignal = studySignals.some((signal) => /volume|series|set|hypertroph/.test(signal));
    if (hasVolumeSignal) {
      matchedSignals.push('volume-hypertrophy-heuristic');
    }
  }

  if (question.questionId === 'q-rest-intervals-strength') {
    const hasRestStrengthSignal = studySignals.some((signal) => /repos|rest/.test(signal)) && studySignals.some((signal) => /force|strength/.test(signal));
    if (hasRestStrengthSignal) {
      matchedSignals.push('rest-strength-heuristic');
    }
  }

  if (question.questionId === 'q-autoregulation-progression') {
    const hasAutoregulationSignal = studySignals.some((signal) => /autoregulat|readiness|progress/.test(signal));
    if (hasAutoregulationSignal) {
      matchedSignals.push('autoregulation-progression-heuristic');
    }
  }

  if (question.questionId === 'q-exercise-selection-hypertrophy') {
    const hasExerciseSelectionSignal = studySignals.some((signal) => /exercise|exercice|selection/.test(signal)) && studySignals.some((signal) => /hypertroph/.test(signal));
    if (hasExerciseSelectionSignal) {
      matchedSignals.push('exercise-selection-hypertrophy-heuristic');
    }
  }

  if (question.questionId === 'q-pain-safe-load-adaptation') {
    const hasPainSignal = studySignals.some((signal) => /pain|douleur|limitation|load adaptation|adaptation de charge/.test(signal));
    if (hasPainSignal) {
      matchedSignals.push('pain-safe-load-adaptation-heuristic');
    }
  }

  return {
    matchedTopicKeys: [...new Set(matchedTopicKeys)].sort(),
    matchedSignals: [...new Set(matchedSignals)].sort(),
  };
}

export function linkStudiesToScientificQuestions(input: {
  studyDossiers: readonly StudyDossierRegistryRecord[];
  questions: readonly ScientificQuestion[];
  now?: Date;
}): {
  questions: ScientificQuestion[];
  links: ScientificQuestionStudyLink[];
  coverage: ScientificQuestionCoverage[];
} {
  const linkedAt = nowIso(input.now);
  const links: ScientificQuestionStudyLink[] = [];

  for (const question of input.questions) {
    for (const study of input.studyDossiers) {
      const match = matchQuestionToStudy(question, study);
      if (match.matchedTopicKeys.length === 0 && match.matchedSignals.length === 0) {
        continue;
      }

      links.push(
        parseScientificQuestionStudyLink({
          questionId: question.questionId,
          studyId: study.studyId,
          matchedTopicKeys: match.matchedTopicKeys,
          matchedSignals: match.matchedSignals,
          linkedAt,
        }),
      );
    }
  }

  const linkMap = new Map<string, Set<string>>();
  for (const link of links) {
    const current = linkMap.get(link.questionId) ?? new Set<string>();
    current.add(link.studyId);
    linkMap.set(link.questionId, current);
  }

  const questions = input.questions.map((question) => {
    const linkedStudyIds = [...new Set([...(question.linkedStudyIds ?? []), ...(linkMap.get(question.questionId) ?? new Set<string>())])].sort();
    const coverageStatus = computeCoverageStatus(linkedStudyIds.length);
    return parseScientificQuestion({
      ...question,
      linkedStudyIds,
      coverageStatus,
      updatedAt: linkedAt,
    });
  });

  const coverage = questions.map((question) =>
    parseScientificQuestionCoverage({
      questionId: question.questionId,
      linkedStudyCount: question.linkedStudyIds.length,
      coverageStatus: question.coverageStatus,
      updatedAt: linkedAt,
    }),
  );

  return { questions, links, coverage };
}
