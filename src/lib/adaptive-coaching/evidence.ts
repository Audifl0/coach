import { loadActiveAdaptiveEvidenceCorpus } from './evidence-corpus';

export type AdaptiveEvidenceSourceClass = 'guideline' | 'review' | 'expertise';

export type AdaptiveEvidenceCorpusEntry = {
  id: string;
  sourceClass: AdaptiveEvidenceSourceClass;
  title: string;
  summary: string;
  tags: string[];
};

export type AdaptiveEvidenceReference = {
  ref: string;
  sourceClass: AdaptiveEvidenceSourceClass;
  title: string;
  summary: string;
};

export type RetrieveAdaptiveEvidenceInput = {
  queryTags: string[];
  topK?: number;
  corpus?: AdaptiveEvidenceCorpusEntry[];
  knowledgeRootDir?: string;
};

const SOURCE_PRIORITY: Record<AdaptiveEvidenceSourceClass, number> = {
  guideline: 3,
  review: 2,
  expertise: 1,
};

const DEFAULT_ADAPTIVE_CORPUS: AdaptiveEvidenceCorpusEntry[] = [
  {
    id: 'guideline-load-management-001',
    sourceClass: 'guideline',
    title: 'Progressive Overload Boundaries',
    summary: 'Keep weekly load progression conservative when fatigue markers rise.',
    tags: ['load', 'fatigue', 'progression'],
  },
  {
    id: 'guideline-readiness-002',
    sourceClass: 'guideline',
    title: 'Readiness-Adjusted Session Planning',
    summary: 'Shift to hold/deload when readiness and recovery trends deteriorate.',
    tags: ['readiness', 'recovery', 'deload'],
  },
  {
    id: 'review-adherence-101',
    sourceClass: 'review',
    title: 'Adherence and Training Adaptation',
    summary: 'Low adherence should bias toward simpler and lower-risk adaptations.',
    tags: ['adherence', 'risk', 'consistency'],
  },
  {
    id: 'review-fatigue-102',
    sourceClass: 'review',
    title: 'Fatigue Signals in Resistance Training',
    summary: 'Elevated fatigue plus high RPE predicts reduced near-term performance.',
    tags: ['fatigue', 'rpe', 'performance'],
  },
  {
    id: 'expertise-autoregulation-201',
    sourceClass: 'expertise',
    title: 'Autoregulation Field Heuristics',
    summary: 'If performance and readiness diverge, prioritize the safer load adjustment.',
    tags: ['autoregulation', 'readiness', 'safety'],
  },
  {
    id: 'expertise-substitution-202',
    sourceClass: 'expertise',
    title: 'Exercise Substitution Heuristic',
    summary: 'Use substitutions when limitation flags are persistent across sessions.',
    tags: ['substitution', 'limitation', 'pain'],
  },
];

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function toShortEvidenceRef(entry: AdaptiveEvidenceCorpusEntry): string {
  const prefix = entry.sourceClass === 'guideline' ? 'G' : entry.sourceClass === 'review' ? 'R' : 'E';
  const numericPart = (entry.id.match(/\d+/g) ?? ['000']).join('').slice(-3).padStart(3, '0');
  return `${prefix}-${numericPart}`;
}

function compareMatchedEntries(
  left: { entry: AdaptiveEvidenceCorpusEntry; score: number },
  right: { entry: AdaptiveEvidenceCorpusEntry; score: number },
): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  if (left.entry.sourceClass !== right.entry.sourceClass) {
    return SOURCE_PRIORITY[right.entry.sourceClass] - SOURCE_PRIORITY[left.entry.sourceClass];
  }

  return left.entry.id.localeCompare(right.entry.id);
}

function compareFillEntries(left: AdaptiveEvidenceCorpusEntry, right: AdaptiveEvidenceCorpusEntry): number {
  if (left.sourceClass !== right.sourceClass) {
    return SOURCE_PRIORITY[right.sourceClass] - SOURCE_PRIORITY[left.sourceClass];
  }

  return left.id.localeCompare(right.id);
}

function toEvidenceReference(entry: AdaptiveEvidenceCorpusEntry): AdaptiveEvidenceReference {
  return {
    ref: toShortEvidenceRef(entry),
    sourceClass: entry.sourceClass,
    title: entry.title,
    summary: entry.summary,
  };
}

export function retrieveAdaptiveEvidence(input: RetrieveAdaptiveEvidenceInput): AdaptiveEvidenceReference[] {
  const topK = Math.max(1, Math.min(input.topK ?? 3, 5));
  const runtimeCorpus =
    input.corpus ??
    loadActiveAdaptiveEvidenceCorpus({
      knowledgeRootDir: input.knowledgeRootDir,
    }).entries;
  const corpus = runtimeCorpus.length > 0 ? runtimeCorpus : DEFAULT_ADAPTIVE_CORPUS;
  const query = new Set(input.queryTags.map(normalizeToken).filter(Boolean));

  const matched = corpus
    .map((entry) => {
      const overlap = entry.tags.map(normalizeToken).filter((tag) => query.has(tag)).length;
      const score = overlap * 10 + SOURCE_PRIORITY[entry.sourceClass];
      return { entry, overlap, score };
    })
    .filter((item) => item.overlap > 0)
    .sort(compareMatchedEntries);

  const selected = matched.slice(0, topK).map(({ entry }) => entry);
  if (selected.length < topK) {
    const selectedIds = new Set(selected.map((entry) => entry.id));
    const fill = corpus
      .filter((entry) => !selectedIds.has(entry.id))
      .sort(compareFillEntries)
      .slice(0, topK - selected.length);

    selected.push(...fill);
  }

  return selected.map(toEvidenceReference);
}

export function buildAdaptiveExplanationEnvelope(input: {
  reasons: string[];
  evidence: AdaptiveEvidenceReference[];
}): {
  reasons: string[];
  evidenceTags: string[];
} {
  const reasons = input.reasons.map((reason) => reason.trim()).filter(Boolean);
  if (reasons.length < 2 || reasons.length > 3) {
    throw new Error('Explanation requires 2-3 reasons');
  }

  if (input.evidence.length === 0) {
    throw new Error('Explanation requires at least one evidence reference');
  }

  return {
    reasons,
    evidenceTags: input.evidence.map((item) => item.ref),
  };
}

export function deriveEvidenceContextQuality(hitCount: number): number {
  if (hitCount <= 0) {
    return 0.25;
  }

  if (hitCount === 1) {
    return 0.55;
  }

  return 0.85;
}
