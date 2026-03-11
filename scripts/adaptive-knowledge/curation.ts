import type { CorpusPrinciple, NormalizedEvidenceRecord, ValidatedSynthesis } from './contracts';

export type CuratedKnowledgeBible = {
  principles: Array<{
    id: string;
    title: string;
    description: string;
    guardrail: string;
    tags: string[];
    provenanceRecordIds: string[];
  }>;
  sources: Array<{
    id: string;
    title: string;
    summary: string;
    sourceClass: NormalizedEvidenceRecord['sourceType'];
    tags: string[];
    provenanceIds: string[];
  }>;
};

function collectTags(records: NormalizedEvidenceRecord[], ids: readonly string[]): string[] {
  const tagSet = new Set<string>();
  for (const record of records) {
    if (!ids.includes(record.id)) {
      continue;
    }
    for (const tag of record.tags) {
      tagSet.add(tag);
    }
  }
  return [...tagSet].sort().slice(0, 6);
}

export function curateAdaptiveKnowledgeBible(input: {
  records: NormalizedEvidenceRecord[];
  principles: CorpusPrinciple[];
  validatedSynthesis?: ValidatedSynthesis;
}): CuratedKnowledgeBible {
  const principles = input.validatedSynthesis?.principles ?? input.principles;
  const retainedRecordIds = new Set(
    principles.flatMap((principle) => principle.provenanceRecordIds).filter((value) => value.length > 0),
  );

  return {
    principles: principles.map((principle) => ({
      id: principle.id,
      title: principle.title,
      description: principle.guidanceFr,
      guardrail: principle.guardrail,
      tags: collectTags(input.records, principle.provenanceRecordIds),
      provenanceRecordIds: [...principle.provenanceRecordIds].sort(),
    })),
    sources: input.records
      .filter((record) => retainedRecordIds.size === 0 || retainedRecordIds.has(record.id))
      .map((record) => ({
      id: record.id,
      title: record.title,
      summary: record.summaryEn,
      sourceClass: record.sourceType,
      tags: [...record.tags].sort(),
      provenanceIds: [...record.provenanceIds].sort(),
      })),
  };
}
