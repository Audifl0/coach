import {
  parseCorpusPrinciple,
  parseValidatedSynthesis,
  type CorpusPrinciple,
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
