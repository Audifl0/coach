import {
  parseAdaptiveKnowledgeRankingTelemetry,
  parseCorpusPrinciple,
  parseEvidenceScientificRanking,
  parseValidatedSynthesis,
  type AdaptiveKnowledgeRankingTelemetry,
  type CorpusPrinciple,
  type EvidenceScientificRanking,
  type NormalizedEvidenceRecord,
  type SourceSynthesisBatch,
  type SynthesisRunMetadata,
  type ValidatedSynthesis,
} from './contracts';
import type { CorpusRemoteSynthesisClient } from './remote-synthesis';

type PrincipleBlueprint = {
  id: string;
  title: string;
  summaryFr: string;
  guidanceFr: string;
  evidenceLevel: string;
  guardrail: 'SAFE-01' | 'SAFE-02' | 'SAFE-03';
};

const BLUEPRINTS_BY_SOURCE_TYPE: Record<NormalizedEvidenceRecord['sourceType'], PrincipleBlueprint> = {
  guideline: {
    id: 'principle-safe-progression',
    title: 'Progression Securisee',
    summaryFr: 'La progression reste graduelle et conditionnee par la qualite technique et la recuperation.',
    guidanceFr: 'Augmenter la charge par paliers, uniquement si execution et recuperation restent stables.',
    evidenceLevel: 'guideline',
    guardrail: 'SAFE-01',
  },
  review: {
    id: 'principle-readiness-fatigue',
    title: 'Readiness et Fatigue',
    summaryFr: 'Les ajustements de seance doivent prioriser la readiness et limiter les derivees de fatigue.',
    guidanceFr: 'Maintenir ou reduire l intensite quand les signaux de fatigue persistent sur plusieurs seances.',
    evidenceLevel: 'review',
    guardrail: 'SAFE-03',
  },
  expertise: {
    id: 'principle-limitation-aware-substitution',
    title: 'Substitution selon limitations',
    summaryFr: 'Les substitutions doivent conserver l intention du mouvement sans surcharger une zone sensible.',
    guidanceFr: 'Choisir une variante biomecaniquement proche qui respecte les limitations et la douleur du moment.',
    evidenceLevel: 'expertise',
    guardrail: 'SAFE-02',
  },
};

export function synthesizeCorpusPrinciples(records: NormalizedEvidenceRecord[]): CorpusPrinciple[] {
  const groups = new Map<NormalizedEvidenceRecord['sourceType'], NormalizedEvidenceRecord[]>();

  for (const record of records) {
    const existing = groups.get(record.sourceType);
    if (existing) {
      existing.push(record);
      continue;
    }
    groups.set(record.sourceType, [record]);
  }

  const principles: CorpusPrinciple[] = [];
  for (const [sourceType, sourceRecords] of groups.entries()) {
    const blueprint = BLUEPRINTS_BY_SOURCE_TYPE[sourceType];
    const provenanceRecordIds = [...new Set(sourceRecords.map((record) => record.id))].sort();
    if (provenanceRecordIds.length === 0) {
      continue;
    }

    principles.push(
      parseCorpusPrinciple({
        id: blueprint.id,
        title: blueprint.title,
        summaryFr: blueprint.summaryFr,
        guidanceFr: blueprint.guidanceFr,
        provenanceRecordIds,
        evidenceLevel: blueprint.evidenceLevel,
        guardrail: blueprint.guardrail,
      }),
    );
  }

  return principles.sort((left, right) => left.id.localeCompare(right.id));
}

export type CorpusSynthesisOutput = {
  principles: CorpusPrinciple[];
  validatedSynthesis: ValidatedSynthesis;
};

export type RankedEvidenceSelection = {
  scoredRecords: NormalizedEvidenceRecord[];
  selectedRecords: NormalizedEvidenceRecord[];
  rejectedRecords: NormalizedEvidenceRecord[];
  telemetry: AdaptiveKnowledgeRankingTelemetry;
};

type SynthesisLot = {
  lotId: string;
  records: NormalizedEvidenceRecord[];
};

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function buildCoverageTags(records: readonly NormalizedEvidenceRecord[]): string[] {
  return uniqueSorted(records.flatMap((record) => record.tags));
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function computeRecencyScore(now: Date, publishedAt: string): number {
  const nowMs = now.getTime();
  const publishedMs = new Date(`${publishedAt}T00:00:00.000Z`).getTime();
  const ageDays = Math.max(0, Math.floor((nowMs - publishedMs) / 86_400_000));
  return round3(clamp01(1 - ageDays / (365 * 5)));
}

function computeSourceTypeScore(sourceType: NormalizedEvidenceRecord['sourceType']): number {
  switch (sourceType) {
    case 'guideline':
      return 1;
    case 'review':
      return 0.82;
    case 'expertise':
      return 0.6;
  }
}

function computeRichnessScore(record: NormalizedEvidenceRecord): number {
  let present = 0;
  if (record.title.trim().length > 0) present += 1;
  if (record.summaryEn.trim().length >= 40) present += 1;
  if (record.tags.length >= 2) present += 1;
  if (record.provenanceIds.length >= 1) present += 1;
  return round3(present / 4);
}

function computeTagCoverageScore(record: NormalizedEvidenceRecord): number {
  return round3(clamp01(Math.min(record.tags.length, 4) / 4));
}

export function rankEvidenceRecords(records: NormalizedEvidenceRecord[], now: Date = new Date()): RankedEvidenceSelection {
  const scoredRecords = records
    .map((record) => {
      const sourceTypeScore = computeSourceTypeScore(record.sourceType);
      const recencyScore = computeRecencyScore(now, record.publishedAt);
      const richnessScore = computeRichnessScore(record);
      const tagCoverageScore = computeTagCoverageScore(record);
      const compositeScore = round3(
        sourceTypeScore * 0.34 + recencyScore * 0.26 + richnessScore * 0.24 + tagCoverageScore * 0.16,
      );

      const reasons: EvidenceScientificRanking['reasons'] = [];
      if (sourceTypeScore >= 0.8) {
        reasons.push({ code: 'high_evidence_type', direction: 'boost', detail: `sourceType=${record.sourceType}` });
      }
      if (richnessScore < 0.5) {
        reasons.push({ code: 'sparse_metadata', direction: 'penalty', detail: 'summary/tags/provenance too light' });
      }
      if (tagCoverageScore >= 0.75) {
        reasons.push({ code: 'broad_tag_coverage', direction: 'boost', detail: `tags=${record.tags.length}` });
      }
      if (recencyScore < 0.45) {
        reasons.push({ code: 'stale_publication', direction: 'penalty', detail: `publishedAt=${record.publishedAt}` });
      }
      const selected = compositeScore >= 0.58;
      if (!selected) {
        reasons.push({ code: 'score_below_selection_threshold', direction: 'reject', detail: `score=${compositeScore}` });
      }

      return {
        ...record,
        ranking: parseEvidenceScientificRanking({
          compositeScore,
          sourceTypeScore,
          recencyScore,
          richnessScore,
          tagCoverageScore,
          selected,
          reasons,
        }),
      };
    })
    .sort((left, right) => {
      const scoreDelta = (right.ranking?.compositeScore ?? 0) - (left.ranking?.compositeScore ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      const dateDelta = right.publishedAt.localeCompare(left.publishedAt);
      if (dateDelta !== 0) return dateDelta;
      return left.id.localeCompare(right.id);
    });

  const selectedRecords = scoredRecords.filter((record) => record.ranking?.selected).slice(0, 8);
  const selectedRecordIds = new Set(selectedRecords.map((record) => record.id));
  const rejectedRecords = scoredRecords.filter((record) => !selectedRecordIds.has(record.id));

  const telemetry = parseAdaptiveKnowledgeRankingTelemetry({
    evaluatedRecordCount: scoredRecords.length,
    selectedRecordCount: selectedRecords.length,
    rejectedRecordCount: rejectedRecords.length,
    topRecordIds: selectedRecords.slice(0, 5).map((record) => record.id),
    rejectionCodes: uniqueSorted(
      rejectedRecords.flatMap((record) =>
        (record.ranking?.reasons ?? []).filter((reason) => reason.direction === 'reject').map((reason) => reason.code),
      ),
    ),
  });

  return {
    scoredRecords,
    selectedRecords,
    rejectedRecords,
    telemetry,
  };
}

export function buildValidatedSynthesisFromPrinciples(input: {
  records: NormalizedEvidenceRecord[];
  principles: CorpusPrinciple[];
  modelRun?: Partial<SynthesisRunMetadata>;
  rejectedClaims?: Array<{ recordId: string; code: string; reason: string }>;
  contradictions?: Array<{
    code: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    recordIds: string[];
    resolution: 'pending' | 'retained' | 'rejected';
  }>;
}): ValidatedSynthesis {
  return parseValidatedSynthesis({
    principles: input.principles,
    studyExtractions: [],
    rejectedClaims: input.rejectedClaims ?? [],
    coverage: {
      recordCount: input.records.length,
      batchCount: input.records.length > 0 ? 1 : 0,
      retainedClaimCount: input.principles.length,
      sourceDomains:
        uniqueSorted(input.records.map((record) => record.sourceDomain)).length > 0
          ? uniqueSorted(input.records.map((record) => record.sourceDomain))
          : ['unavailable'],
      coveredTags: buildCoverageTags(input.records),
    },
    contradictions: input.contradictions ?? [],
    modelRun: {
      provider: input.modelRun?.provider ?? 'deterministic',
      model: input.modelRun?.model ?? 'deterministic-blueprint',
      promptVersion: input.modelRun?.promptVersion ?? 'deterministic-v1',
      requestId: input.modelRun?.requestId ?? null,
      requestIds: input.modelRun?.requestIds ?? [],
      totalLatencyMs: input.modelRun?.totalLatencyMs ?? input.modelRun?.latencyMs ?? 0,
    },
  });
}

export function createSynthesisLots(records: NormalizedEvidenceRecord[]): SynthesisLot[] {
  const groups = new Map<NormalizedEvidenceRecord['sourceType'], NormalizedEvidenceRecord[]>();

  for (const record of records) {
    const existing = groups.get(record.sourceType);
    if (existing) {
      existing.push(record);
      continue;
    }
    groups.set(record.sourceType, [record]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourceType, sourceRecords]) => ({
      lotId: `lot-${sourceType}`,
      records: [...sourceRecords].sort((left, right) => left.id.localeCompare(right.id)),
    }));
}

export async function synthesizeCorpusWithRemoteModel(input: {
  records: NormalizedEvidenceRecord[];
  client: CorpusRemoteSynthesisClient;
  runId: string;
}): Promise<CorpusSynthesisOutput> {
  const lots = createSynthesisLots(input.records);
  const batchSyntheses: SourceSynthesisBatch[] = [];

  for (const lot of lots) {
    batchSyntheses.push(
      await input.client.synthesizeLot({
        lotId: lot.lotId,
        records: lot.records,
      }),
    );
  }

  const validated = await input.client.consolidate({
    runId: input.runId,
    records: input.records,
    batches: batchSyntheses,
  });

  return {
    principles: validated.principles
      .map((principle) => parseCorpusPrinciple(principle))
      .sort((left, right) => left.id.localeCompare(right.id)),
    validatedSynthesis: validated,
  };
}
