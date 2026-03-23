import {
  parseAdaptiveKnowledgeBacklogHealthSummary,
  parseAdaptiveKnowledgeWorkItem,
  type AdaptiveKnowledgeBacklogHealthSummary,
  type AdaptiveKnowledgeWorkItem,
} from './contracts';

type WorkItemKind = AdaptiveKnowledgeWorkItem['kind'];

export type AdaptiveKnowledgeSchedulerLimits = {
  readonly maxItems: number;
  readonly perKind?: Partial<Record<WorkItemKind, number>>;
};

export type AdaptiveKnowledgeSchedulerPlan = {
  readonly selectedItems: AdaptiveKnowledgeWorkItem[];
  readonly skippedItems: Array<{
    readonly id: string;
    readonly reason: 'blocked' | 'blocked-status' | 'budget-exceeded' | 'kind-cap-reached';
  }>;
  readonly noProgressSummary: AdaptiveKnowledgeBacklogHealthSummary | null;
};

export type ScheduleAdaptiveKnowledgeWorkInput = {
  readonly items: readonly AdaptiveKnowledgeWorkItem[];
  readonly limits: AdaptiveKnowledgeSchedulerLimits;
};

function byPriorityDescending(left: AdaptiveKnowledgeWorkItem, right: AdaptiveKnowledgeWorkItem): number {
  if (right.priorityScore !== left.priorityScore) {
    return right.priorityScore - left.priorityScore;
  }
  return left.id.localeCompare(right.id);
}

function mapBlockedReason(blocker: string): string | null {
  if (blocker === 'front:cooldown') {
    return 'waiting-for-cooldown';
  }
  if (blocker === 'front:deferred') {
    return 'deferred';
  }
  if (blocker === 'front:duplicate-heavy') {
    return 'duplicate-heavy';
  }
  if (blocker === 'front:source-cold') {
    return 'source-cold';
  }
  if (blocker === 'front:no-extractable-documents') {
    return 'no-extractable-documents';
  }
  if (blocker === 'publication:contradiction-backlog-only') {
    return 'contradiction-backlog-only';
  }
  if (blocker === 'publication:not-yet-justified') {
    return 'publication-not-yet-justified';
  }
  if (blocker.startsWith('contradiction:')) {
    return 'contradiction-backlog-only';
  }
  if (blocker.startsWith('front:')) {
    return blocker.slice('front:'.length);
  }
  if (blocker.startsWith('publication:')) {
    return blocker.slice('publication:'.length);
  }
  return null;
}

function buildNoProgressSummary(items: readonly AdaptiveKnowledgeWorkItem[]): AdaptiveKnowledgeBacklogHealthSummary | null {
  const readyItems = items.filter((item) => item.status === 'ready' && item.blockedBy.length === 0).length;
  if (readyItems > 0) {
    return null;
  }

  const reasons = new Set<string>();
  for (const item of items) {
    for (const blocker of item.blockedBy) {
      const mappedReason = mapBlockedReason(blocker);
      if (mappedReason) {
        reasons.add(mappedReason);
      }
    }

    if (item.status !== 'ready' && item.blockedBy.length === 0) {
      reasons.add('blocked-by-status');
    }
  }

  if (reasons.size === 0 && items.length > 0) {
    reasons.add('blocked-by-status');
  }

  return parseAdaptiveKnowledgeBacklogHealthSummary({
    readyItems: 0,
    blockedItems: items.length,
    noProgressReasons: [...reasons].sort(),
  });
}

export function scheduleAdaptiveKnowledgeWork(input: ScheduleAdaptiveKnowledgeWorkInput): AdaptiveKnowledgeSchedulerPlan {
  const items = input.items.map((item) => parseAdaptiveKnowledgeWorkItem(item)).sort(byPriorityDescending);
  const selectedItems: AdaptiveKnowledgeWorkItem[] = [];
  const skippedItems: AdaptiveKnowledgeSchedulerPlan['skippedItems'] = [];
  const selectedByKind = new Map<WorkItemKind, number>();

  for (const item of items) {
    if (item.status !== 'ready') {
      skippedItems.push({ id: item.id, reason: 'blocked-status' });
      continue;
    }

    if (item.blockedBy.length > 0) {
      skippedItems.push({ id: item.id, reason: 'blocked' });
      continue;
    }

    const kindCap = input.limits.perKind?.[item.kind];
    const kindCount = selectedByKind.get(item.kind) ?? 0;
    if (kindCap !== undefined && kindCount >= kindCap) {
      skippedItems.push({ id: item.id, reason: 'kind-cap-reached' });
      continue;
    }

    if (selectedItems.length >= input.limits.maxItems) {
      skippedItems.push({ id: item.id, reason: 'budget-exceeded' });
      continue;
    }

    selectedItems.push(item);
    selectedByKind.set(item.kind, kindCount + 1);
  }

  return {
    selectedItems,
    skippedItems,
    noProgressSummary: buildNoProgressSummary(items),
  };
}
