import { parseStudyCard, type StudyCard } from './contracts';
import type { NormalizedEvidenceRecord } from './connectors/shared';
import type { CorpusRemoteSynthesisClient } from './remote-synthesis';

export type StudyCardExtractionPayload = {
  recordId: string;
  title: string;
  summaryEn: string;
  sourceUrl: string;
  topicKeys: string[];
  extractionSource: 'full-text' | 'abstract';
  fullText?: string;
  sections?: Record<string, string | null>;
};

const DEFAULT_BATCH_SIZE = 3;

function chunkRecords(records: NormalizedEvidenceRecord[], batchSize: number): NormalizedEvidenceRecord[][] {
  const batches: NormalizedEvidenceRecord[][] = [];
  for (let index = 0; index < records.length; index += batchSize) {
    batches.push(records.slice(index, index + batchSize));
  }
  return batches;
}

function buildPayloadByRecordId(input: {
  records: NormalizedEvidenceRecord[];
  fullTextMap: Map<string, { fullText?: string; sections?: Record<string, string | null> }>;
}): Map<string, StudyCardExtractionPayload> {
  return new Map(
    input.records.map((record) => {
      const fullText = input.fullTextMap.get(record.id);
      const extractionSource = fullText?.fullText ? 'full-text' : 'abstract';
      return [
        record.id,
        {
          recordId: record.id,
          title: record.title,
          summaryEn: record.summaryEn,
          sourceUrl: record.sourceUrl,
          topicKeys: record.tags,
          extractionSource,
          ...(fullText?.fullText ? { fullText: fullText.fullText } : {}),
          ...(fullText?.sections ? { sections: fullText.sections } : {}),
        },
      ] as const;
    }),
  );
}

export async function extractStudyCards(input: {
  records: NormalizedEvidenceRecord[];
  fullTextMap: Map<string, { fullText?: string; sections?: Record<string, string | null> }>;
  client: CorpusRemoteSynthesisClient;
  runId: string;
}): Promise<StudyCard[]> {
  const payloadByRecordId = buildPayloadByRecordId({
    records: input.records,
    fullTextMap: input.fullTextMap,
  });
  const validatedCards: StudyCard[] = [];

  for (const batch of chunkRecords(input.records, DEFAULT_BATCH_SIZE)) {
    const returnedCards = await input.client.extractStudyCards({
      runId: input.runId,
      records: batch,
      payloadByRecordId,
    });

    for (const card of returnedCards) {
      const parsed = parseStudyCard(card);
      validatedCards.push(parsed);
    }
  }

  return validatedCards;
}
