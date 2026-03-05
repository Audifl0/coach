import { parseCorpusPrinciple, type CorpusPrinciple, type NormalizedEvidenceRecord } from './contracts';

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
