import type { NormalizedEvidenceRecord, ValidatedSynthesis } from './contracts';

export type QualityGateReason =
  | 'score_below_threshold'
  | 'critical_contradiction'
  | 'insufficient_provenance'
  | 'insufficient_coverage'
  | 'insufficient_topic_diversity'
  | 'insufficient_source_diversity'
  | 'unresolved_contradiction';

export type QualityGateContradiction = {
  code: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
};

export type EvaluateCorpusQualityGateInput = {
  now: Date;
  records: NormalizedEvidenceRecord[];
  validatedSynthesis?: ValidatedSynthesis;
  threshold?: number;
  criticalContradictions?: QualityGateContradiction[];
};

export type CorpusQualityGateResult = {
  publishable: boolean;
  reasons: QualityGateReason[];
  compositeScore: number;
  threshold: number;
  criticalContradictions: number;
};

const DEFAULT_THRESHOLD = 0.7;
const MAX_RECENCY_DAYS = 365 * 5;

const SOURCE_CLASS_WEIGHT: Record<NormalizedEvidenceRecord['sourceType'], number> = {
  guideline: 1,
  review: 0.8,
  expertise: 0.6,
};

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function computeSourceClassScore(records: NormalizedEvidenceRecord[]): number {
  if (records.length === 0) {
    return 0;
  }

  const sum = records.reduce((acc, record) => acc + SOURCE_CLASS_WEIGHT[record.sourceType], 0);
  return sum / records.length;
}

function computeRecencyScore(now: Date, records: NormalizedEvidenceRecord[]): number {
  if (records.length === 0) {
    return 0;
  }

  const nowMs = now.getTime();
  const sum = records.reduce((acc, record) => {
    const publishedAt = new Date(`${record.publishedAt}T00:00:00.000Z`).getTime();
    const ageDays = Math.max(0, Math.floor((nowMs - publishedAt) / 86_400_000));
    const score = clamp01(1 - ageDays / MAX_RECENCY_DAYS);
    return acc + score;
  }, 0);
  return sum / records.length;
}

function computeCompletenessScore(records: NormalizedEvidenceRecord[]): number {
  if (records.length === 0) {
    return 0;
  }

  const total = records.reduce((acc, record) => {
    let present = 0;
    if (record.id.trim().length > 0) present += 1;
    if (record.title.trim().length > 0) present += 1;
    if (record.summaryEn.trim().length > 0) present += 1;
    if (record.tags.length > 0) present += 1;
    if (record.provenanceIds.length > 0) present += 1;
    return acc + present / 5;
  }, 0);

  return total / records.length;
}

function hasMissingProvenance(records: NormalizedEvidenceRecord[], validatedSynthesis: ValidatedSynthesis | undefined): boolean {
  if (!validatedSynthesis) {
    return false;
  }

  const validRecordIds = new Set(records.map((record) => record.id));
  return validatedSynthesis.principles.some(
    (principle) =>
      principle.provenanceRecordIds.length === 0 ||
      principle.provenanceRecordIds.some((provenanceId) => !validRecordIds.has(provenanceId)),
  );
}

function hasInsufficientCoverage(records: NormalizedEvidenceRecord[], validatedSynthesis: ValidatedSynthesis | undefined): boolean {
  if (!validatedSynthesis) {
    return false;
  }

  if (records.length === 0) {
    return false;
  }

  if (validatedSynthesis.coverage.recordCount < records.length) {
    return true;
  }

  if (validatedSynthesis.coverage.batchCount < 1) {
    return true;
  }

  return validatedSynthesis.principles.length < 1;
}

function hasInsufficientTopicDiversity(records: NormalizedEvidenceRecord[], validatedSynthesis: ValidatedSynthesis | undefined): boolean {
  if (!validatedSynthesis || records.length < 2) {
    return false;
  }

  return new Set(validatedSynthesis.coverage.coveredTags).size < 2;
}

function hasInsufficientSourceDiversity(records: NormalizedEvidenceRecord[], validatedSynthesis: ValidatedSynthesis | undefined): boolean {
  if (!validatedSynthesis || records.length < 3) {
    return false;
  }

  const sourceTypeCount = new Set(records.map((record) => record.sourceType)).size;
  const sourceDomainCount = new Set(validatedSynthesis.coverage.sourceDomains).size;
  return sourceTypeCount < 2 || sourceDomainCount < 2;
}

function countCriticalContradictions(
  inputCritical: QualityGateContradiction[] | undefined,
  validatedSynthesis: ValidatedSynthesis | undefined,
): number {
  const explicit = (inputCritical ?? []).filter((item) => item.severity === 'critical').length;
  const synthesis = (validatedSynthesis?.contradictions ?? []).filter((item) => item.severity === 'critical').length;
  return explicit + synthesis;
}

function hasUnresolvedContradiction(validatedSynthesis: ValidatedSynthesis | undefined): boolean {
  if (!validatedSynthesis) {
    return false;
  }

  return validatedSynthesis.contradictions.some(
    (item) => item.severity === 'critical' || item.resolution === 'pending',
  );
}

export function evaluateCorpusQualityGate(input: EvaluateCorpusQualityGateInput): CorpusQualityGateResult {
  const threshold = input.threshold ?? DEFAULT_THRESHOLD;
  const sourceClassScore = computeSourceClassScore(input.records);
  const recencyScore = computeRecencyScore(input.now, input.records);
  const completenessScore = computeCompletenessScore(input.records);

  const compositeScore = round3(sourceClassScore * 0.45 + recencyScore * 0.35 + completenessScore * 0.2);
  const criticalContradictions = countCriticalContradictions(input.criticalContradictions, input.validatedSynthesis);

  const reasons: QualityGateReason[] = [];
  if (compositeScore < threshold) {
    reasons.push('score_below_threshold');
  }
  if (hasInsufficientCoverage(input.records, input.validatedSynthesis)) {
    reasons.push('insufficient_coverage');
  }
  if (hasInsufficientTopicDiversity(input.records, input.validatedSynthesis)) {
    reasons.push('insufficient_topic_diversity');
  }
  if (hasInsufficientSourceDiversity(input.records, input.validatedSynthesis)) {
    reasons.push('insufficient_source_diversity');
  }
  if (hasMissingProvenance(input.records, input.validatedSynthesis)) {
    reasons.push('insufficient_provenance');
  }
  if (criticalContradictions > 0) {
    reasons.push('critical_contradiction');
  }
  if (hasUnresolvedContradiction(input.validatedSynthesis)) {
    reasons.push('unresolved_contradiction');
  }

  return {
    publishable: reasons.length === 0,
    reasons: [...new Set(reasons)],
    compositeScore,
    threshold,
    criticalContradictions,
  };
}
