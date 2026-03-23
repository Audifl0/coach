import {
  parseAdaptiveKnowledgeResearchFront,
  parseAdaptiveKnowledgeWorkItem,
  type AdaptiveKnowledgeResearchFront,
  type AdaptiveKnowledgeWorkItem,
  type DocumentRegistryRecord,
} from './contracts';

type AdaptiveKnowledgeQuestionLike = {
  readonly id: string;
  readonly topicKey: string;
  readonly coverage: 'empty' | 'partial' | 'developing' | 'mature' | 'blocked';
  readonly publicationStatus: 'not-ready' | 'candidate' | 'published' | 'reopened';
};

type AdaptiveKnowledgeContradictionLike = {
  readonly id: string;
  readonly topicKey: string;
  readonly severity: 'note' | 'caution' | 'blocking';
  readonly resolved: boolean;
};

type AdaptiveKnowledgeDoctrineCandidateLike = {
  readonly id: string;
  readonly topicKey: string;
  readonly publicationReadiness: 'insufficient' | 'candidate' | 'ready' | 'blocked';
};

export type BuildAdaptiveKnowledgeWorkItemsInput = {
  readonly researchFronts: readonly AdaptiveKnowledgeResearchFront[];
  readonly documents: readonly DocumentRegistryRecord[];
  readonly questions: readonly AdaptiveKnowledgeQuestionLike[];
  readonly contradictions: readonly AdaptiveKnowledgeContradictionLike[];
  readonly doctrineCandidates: readonly AdaptiveKnowledgeDoctrineCandidateLike[];
  readonly now: Date;
  readonly freshnessPriorityWeight?: number;
};

const BASE_SCORES: Record<AdaptiveKnowledgeWorkItem['kind'], number> = {
  'discover-front-page': 0.45,
  'revisit-front': 0.35,
  'acquire-fulltext': 0.68,
  'extract-study-card': 0.74,
  'link-study-question': 0.7,
  'analyze-contradiction': 0.86,
  'publish-doctrine': 0.9,
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}

function scoreRecency(updatedAt: string | undefined, now: Date): number {
  if (!updatedAt) {
    return 0;
  }

  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) {
    return 0;
  }

  const ageDays = Math.max(0, (now.getTime() - updated.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, 1 - Math.min(ageDays, 3650) / 3650);
}

function buildFrontWorkItem(front: AdaptiveKnowledgeResearchFront, now: Date, freshnessWeight: number): AdaptiveKnowledgeWorkItem | null {
  if (front.status === 'active') {
    const freshnessBonus = 0;
    return parseAdaptiveKnowledgeWorkItem({
      id: `discover:${front.id}:page-${front.pageCursor.page}`,
      kind: 'discover-front-page',
      status: 'ready',
      topicKey: front.topicKey,
      priorityScore: clampScore(BASE_SCORES['discover-front-page'] + freshnessBonus),
      blockedBy: [],
      targetId: front.id,
    });
  }

  const freshnessBonus = scoreRecency(front.cooldownUntil ?? undefined, now) * freshnessWeight;

  if (front.status === 'archived' || front.status === 'exhausted') {
    return null;
  }

  const blockedBy =
    front.status === 'cooldown'
      ? ['front:cooldown']
      : front.status === 'deferred'
        ? ['front:deferred']
        : ['front:blocked'];

  return parseAdaptiveKnowledgeWorkItem({
    id: `revisit:${front.id}`,
    kind: 'revisit-front',
    status: 'blocked',
    topicKey: front.topicKey,
    priorityScore: clampScore(BASE_SCORES['revisit-front'] + freshnessBonus),
    blockedBy,
    targetId: front.id,
  });
}

function buildDocumentWorkItems(document: DocumentRegistryRecord, now: Date, freshnessWeight: number): AdaptiveKnowledgeWorkItem[] {
  const topicKey = document.topicKeys[0] ?? 'unknown-topic';
  const freshnessBonus = scoreRecency(document.updatedAt, now) * freshnessWeight;

  if (document.status === 'abstract-ready' || document.status === 'full-text-ready') {
    return [
      parseAdaptiveKnowledgeWorkItem({
        id: `fulltext:${document.documentId}`,
        kind: 'acquire-fulltext',
        status: 'ready',
        topicKey,
        priorityScore: clampScore(BASE_SCORES['acquire-fulltext'] + freshnessBonus),
        blockedBy: [],
        targetId: document.documentId,
      }),
    ];
  }

  if (document.status === 'extractible') {
    return [
      parseAdaptiveKnowledgeWorkItem({
        id: `extract:${document.documentId}`,
        kind: 'extract-study-card',
        status: 'ready',
        topicKey,
        priorityScore: clampScore(BASE_SCORES['extract-study-card'] + freshnessBonus),
        blockedBy: [],
        targetId: document.documentId,
      }),
    ];
  }

  return [];
}

function buildQuestionWorkItem(question: AdaptiveKnowledgeQuestionLike): AdaptiveKnowledgeWorkItem | null {
  if (question.coverage === 'mature' || question.coverage === 'blocked') {
    return null;
  }

  return parseAdaptiveKnowledgeWorkItem({
    id: `question:${question.id}`,
    kind: 'link-study-question',
    status: 'ready',
    topicKey: question.topicKey,
    priorityScore: clampScore(BASE_SCORES['link-study-question'] + (question.coverage === 'empty' ? 0.08 : 0.03)),
    blockedBy: [],
    targetId: question.id,
  });
}

function buildContradictionWorkItem(contradiction: AdaptiveKnowledgeContradictionLike): AdaptiveKnowledgeWorkItem | null {
  if (contradiction.resolved) {
    return null;
  }

  const severityBoost = contradiction.severity === 'blocking' ? 0.08 : contradiction.severity === 'caution' ? 0.04 : 0.01;
  return parseAdaptiveKnowledgeWorkItem({
    id: `contradiction:${contradiction.id}`,
    kind: 'analyze-contradiction',
    status: 'ready',
    topicKey: contradiction.topicKey,
    priorityScore: clampScore(BASE_SCORES['analyze-contradiction'] + severityBoost),
    blockedBy: [],
    targetId: contradiction.id,
  });
}

function buildDoctrineWorkItem(
  candidate: AdaptiveKnowledgeDoctrineCandidateLike,
  contradictions: readonly AdaptiveKnowledgeContradictionLike[],
): AdaptiveKnowledgeWorkItem | null {
  if (candidate.publicationReadiness !== 'ready') {
    return null;
  }

  const blockingContradictions = contradictions
    .filter((item) => item.topicKey === candidate.topicKey && item.resolved === false && item.severity === 'blocking')
    .map((item) => `contradiction:${item.id}`);

  return parseAdaptiveKnowledgeWorkItem({
    id: `doctrine:${candidate.id}`,
    kind: 'publish-doctrine',
    status: blockingContradictions.length > 0 ? 'blocked' : 'ready',
    topicKey: candidate.topicKey,
    priorityScore: clampScore(BASE_SCORES['publish-doctrine']),
    blockedBy: blockingContradictions,
    targetId: candidate.id,
  });
}

export function buildAdaptiveKnowledgeWorkItems(input: BuildAdaptiveKnowledgeWorkItemsInput): AdaptiveKnowledgeWorkItem[] {
  const freshnessWeight = input.freshnessPriorityWeight ?? 0.05;
  const items: AdaptiveKnowledgeWorkItem[] = [];

  for (const rawFront of input.researchFronts) {
    const front = parseAdaptiveKnowledgeResearchFront(rawFront);
    const item = buildFrontWorkItem(front, input.now, freshnessWeight);
    if (item) {
      items.push(item);
    }
  }

  for (const document of input.documents) {
    items.push(...buildDocumentWorkItems(document, input.now, freshnessWeight));
  }

  for (const question of input.questions) {
    const item = buildQuestionWorkItem(question);
    if (item) {
      items.push(item);
    }
  }

  for (const contradiction of input.contradictions) {
    const item = buildContradictionWorkItem(contradiction);
    if (item) {
      items.push(item);
    }
  }

  for (const candidate of input.doctrineCandidates) {
    const item = buildDoctrineWorkItem(candidate, input.contradictions);
    if (item) {
      items.push(item);
    }
  }

  return items;
}
