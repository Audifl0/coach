import {
  appendDoctrineRevisionEntries,
  loadPublishedDoctrineSnapshot,
  writePublishedDoctrineSnapshot,
} from '../registry/doctrine';
import { getDoctrineEligibleSourceTiers } from '../source-catalog';
import {
  evaluateDoctrineCandidatePublication,
  type DoctrineCandidateEvaluation,
} from '../conservative-publication';
import {
  parseAdaptiveKnowledgeWorkItem,
  parseDoctrineRevisionEntry,
  parsePublishedDoctrineSnapshot,
  type AdaptiveKnowledgeWorkItem,
  type AdaptiveKnowledgeSourceTier,
  type PublishedDoctrinePrinciple,
  type PublishedDoctrineSnapshot,
  type QuestionSynthesisDossier,
} from '../contracts';

export type ExecuteDoctrineWorkItemContext = {
  outputRootDir: string;
  now: Date;
  candidate: PublishedDoctrinePrinciple;
  dossier: QuestionSynthesisDossier;
  sourceTiersByStudyId: Record<string, AdaptiveKnowledgeSourceTier | undefined>;
};

export type ExecuteDoctrineWorkItemResult = {
  status: 'completed' | 'blocked';
  reason?: string;
  delta: {
    publishedPrinciples: number;
    revisedPrinciples: number;
  };
  snapshot: PublishedDoctrineSnapshot;
  evaluation: DoctrineCandidateEvaluation;
};

function hasEligibleProofTier(input: ExecuteDoctrineWorkItemContext): boolean {
  const eligible = new Set<AdaptiveKnowledgeSourceTier>(getDoctrineEligibleSourceTiers());
  return input.dossier.linkedStudyIds.some((studyId) => {
    const tier = input.sourceTiersByStudyId[studyId];
    return tier ? eligible.has(tier) : false;
  });
}

export async function executeDoctrineWorkItem(
  item: AdaptiveKnowledgeWorkItem,
  context: ExecuteDoctrineWorkItemContext,
): Promise<ExecuteDoctrineWorkItemResult> {
  const parsedItem = parseAdaptiveKnowledgeWorkItem(item);
  const currentSnapshot = await loadPublishedDoctrineSnapshot(context.outputRootDir);

  if (parsedItem.kind !== 'publish-doctrine') {
    return {
      status: 'blocked',
      reason: 'unsupported-doctrine-work-item',
      delta: {
        publishedPrinciples: 0,
        revisedPrinciples: 0,
      },
      snapshot: currentSnapshot,
      evaluation: { published: false, reasons: ['missing_confidence'] },
    };
  }

  if (!hasEligibleProofTier(context)) {
    return {
      status: 'blocked',
      reason: 'insufficient-proof-tier',
      delta: {
        publishedPrinciples: 0,
        revisedPrinciples: 0,
      },
      snapshot: currentSnapshot,
      evaluation: { published: false, reasons: ['insufficient_proof_tier'] },
    };
  }

  const evaluation = evaluateDoctrineCandidatePublication({
    candidate: context.candidate,
    dossier: context.dossier,
    sourceTiersByStudyId: context.sourceTiersByStudyId,
  });

  if (!evaluation.published || !evaluation.principle) {
    return {
      status: 'blocked',
      reason: evaluation.reasons[0] ?? 'publication-blocked',
      delta: {
        publishedPrinciples: 0,
        revisedPrinciples: 0,
      },
      snapshot: currentSnapshot,
      evaluation,
    };
  }

  const nextSnapshot = parsePublishedDoctrineSnapshot({
    ...currentSnapshot,
    generatedAt: context.now.toISOString(),
    principles: [...currentSnapshot.principles, evaluation.principle].filter(
      (principle, index, list) => list.findIndex((entry) => entry.principleId === principle.principleId) === index,
    ),
  });
  await writePublishedDoctrineSnapshot(context.outputRootDir, nextSnapshot);
  await appendDoctrineRevisionEntries(
    context.outputRootDir,
    [
      parseDoctrineRevisionEntry({
        revisionId: `${evaluation.principle.principleId}:published:${context.now.toISOString()}`,
        principleId: evaluation.principle.principleId,
        changedAt: context.now.toISOString(),
        changeType: 'published',
        reason: 'Conservative doctrine publication gate accepted this principle.',
      }),
    ],
    context.now,
  );

  return {
    status: 'completed',
    delta: {
      publishedPrinciples: 1,
      revisedPrinciples: 0,
    },
    snapshot: nextSnapshot,
    evaluation,
  };
}
