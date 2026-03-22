import {
  parseDoctrineRevisionEntry,
  parsePublishedDoctrinePrinciple,
  parsePublishedDoctrineSnapshot,
  type DoctrineRevisionEntry,
  type PublishedDoctrinePrinciple,
  type PublishedDoctrineSnapshot,
  type QuestionSynthesisDossier,
} from './contracts';

const MIN_STUDIES = 2;

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function buildRevisionId(principleId: string, changedAt: string, changeType: DoctrineRevisionEntry['changeType']): string {
  return `${principleId}:${changeType}:${changedAt}`;
}

export function evaluateDoctrineCandidatePublication(input: {
  candidate: PublishedDoctrinePrinciple;
  dossier: QuestionSynthesisDossier;
}): {
  published: boolean;
  reasons: Array<
    | 'insufficient_supporting_studies'
    | 'unresolved_blocking_contradiction'
    | 'missing_summary_or_limits'
    | 'missing_confidence'
  >;
  principle?: PublishedDoctrinePrinciple;
} {
  const reasons: Array<
    | 'insufficient_supporting_studies'
    | 'unresolved_blocking_contradiction'
    | 'missing_summary_or_limits'
    | 'missing_confidence'
  > = [];

  if (new Set(input.candidate.studyIds).size < MIN_STUDIES || new Set(input.dossier.linkedStudyIds).size < MIN_STUDIES) {
    reasons.push('insufficient_supporting_studies');
  }

  if (input.dossier.contradictions.some((item) => item.resolved === false && item.severity === 'blocking')) {
    reasons.push('unresolved_blocking_contradiction');
  }

  if (!input.candidate.statementFr.trim() || !input.candidate.conditionsFr.trim() || !input.candidate.limitsFr.trim()) {
    reasons.push('missing_summary_or_limits');
  }

  if (!input.candidate.confidenceLevel) {
    reasons.push('missing_confidence');
  }

  if (reasons.length > 0) {
    return { published: false, reasons };
  }

  return {
    published: true,
    reasons: [],
    principle: parsePublishedDoctrinePrinciple({
      ...input.candidate,
      revisionStatus: 'active',
    }),
  };
}

export function reconcileDoctrineAgainstDossiers(input: {
  snapshot: PublishedDoctrineSnapshot;
  dossiers: readonly QuestionSynthesisDossier[];
  now?: Date;
}): {
  snapshot: PublishedDoctrineSnapshot;
  revisions: DoctrineRevisionEntry[];
} {
  const dossierByQuestionId = new Map(input.dossiers.map((dossier) => [dossier.questionId, dossier]));
  const changedAt = nowIso(input.now);
  const revisions: DoctrineRevisionEntry[] = [];

  const principles = input.snapshot.principles.map((principle) => {
    const affectedDossiers = principle.questionIds
      .map((questionId) => dossierByQuestionId.get(questionId))
      .filter((value): value is QuestionSynthesisDossier => Boolean(value));

    const shouldReopen = affectedDossiers.some((dossier) =>
      dossier.contradictions.some((item) => item.resolved === false && item.severity === 'blocking'),
    );

    if (!shouldReopen || principle.revisionStatus === 'reopened') {
      return principle;
    }

    revisions.push(
      parseDoctrineRevisionEntry({
        revisionId: buildRevisionId(principle.principleId, changedAt, 'reopened'),
        principleId: principle.principleId,
        changedAt,
        changeType: 'reopened',
        reason: 'New unresolved blocking contradictions appeared in linked question dossiers.',
      }),
    );

    return parsePublishedDoctrinePrinciple({
      ...principle,
      revisionStatus: 'reopened',
    });
  });

  return {
    snapshot: parsePublishedDoctrineSnapshot({
      ...input.snapshot,
      generatedAt: changedAt,
      principles,
    }),
    revisions,
  };
}
