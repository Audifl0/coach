import type { NormalizedEvidenceRecord, ValidatedSynthesis } from './contracts';

export type QualityGateReason =
  | 'no_library_progress'
  | 'backfill_incomplete'
  | 'library_growth_detected'
  | 'score_below_threshold'
  | 'critical_contradiction'
  | 'insufficient_provenance'
  | 'insufficient_coverage'
  | 'insufficient_topic_diversity'
  | 'insufficient_source_diversity'
  | 'unresolved_contradiction'
  | 'unsafe_runtime_projection'
  | 'non_canonical_projection';

export type CorpusQualityGateStatus = 'publishable' | 'progressing' | 'blocked';

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
  projection?: {
    libraryRecordCount: number;
    projectionRecordCount: number;
    backlogRecordCount: number;
    projectionSafe: boolean;
    canonicalRecordsOnly: boolean;
  };
};

export type CorpusQualityGateResult = {
  publishable: boolean;
  status: CorpusQualityGateStatus;
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

  // Coverage requires at least 1 record synthesized and at least 1 principle produced.
  // The synthesis may operate on a ranked subset of all discovered records — comparing
  // coverage.recordCount to total records would always fail when ranking selects a subset.
  if (validatedSynthesis.coverage.recordCount < 1) {
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

  // Check coveredTags from synthesis first; fall back to record-level tags
  // when the remote model returns an empty coveredTags array.
  const synthesisTags = new Set(validatedSynthesis.coverage.coveredTags);
  if (synthesisTags.size >= 2) return false;

  const recordTags = new Set(records.flatMap((r) => r.tags));
  if (recordTags.size >= 2) return false;

  // Last resort: multiple distinct guardrails across principles counts as diverse
  const guardrails = new Set(validatedSynthesis.principles.map((p) => p.guardrail));
  return guardrails.size < 2;
}

function hasInsufficientSourceDiversity(records: NormalizedEvidenceRecord[], validatedSynthesis: ValidatedSynthesis | undefined): boolean {
  if (!validatedSynthesis || records.length < 3) {
    return false;
  }

  // Check diversity in the actual synthesized coverage, not the full record set.
  // With ranking/selection, the synthesized subset may not span all source types/domains.
  const sourceDomainCount = new Set(validatedSynthesis.coverage.sourceDomains.filter((d) => d !== 'unavailable')).size;
  return sourceDomainCount < 1;
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
  const projection = input.projection ?? {
    libraryRecordCount: input.records.length,
    projectionRecordCount: input.records.length,
    backlogRecordCount: 0,
    projectionSafe: true,
    canonicalRecordsOnly: true,
  };

  const compositeScore = round3(sourceClassScore * 0.45 + recencyScore * 0.35 + completenessScore * 0.2);
  const criticalContradictions = countCriticalContradictions(input.criticalContradictions, input.validatedSynthesis);

  const reasons: QualityGateReason[] = [];
  if (projection.libraryRecordCount === 0) {
    reasons.push('no_library_progress');
  }
  if (!projection.projectionSafe) {
    reasons.push('unsafe_runtime_projection');
  }
  if (!projection.canonicalRecordsOnly) {
    reasons.push('non_canonical_projection');
  }
  if (compositeScore < threshold && projection.projectionRecordCount > 0) {
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

  const uniqueReasons = [...new Set(reasons)];
  const blockingReasons = new Set<QualityGateReason>(
    uniqueReasons.filter((reason) => reason !== 'library_growth_detected' && reason !== 'backfill_incomplete'),
  );

  let status: CorpusQualityGateStatus = 'publishable';
  if (blockingReasons.size > 0) {
    status = 'blocked';
  } else if (projection.backlogRecordCount > 0) {
    status = 'progressing';
    uniqueReasons.push('library_growth_detected', 'backfill_incomplete');
  }

  return {
    publishable: status === 'publishable' || status === 'progressing',
    status,
    reasons: [...new Set(uniqueReasons)],
    compositeScore,
    threshold,
    criticalContradictions,
  };
}
