import { acquireFullText } from '../fulltext-acquisition';
import { parseAdaptiveKnowledgeWorkItem, type AdaptiveKnowledgeWorkItem, type DocumentRegistryRecord, type NormalizedEvidenceRecord, type StudyCard } from '../contracts';
import { upsertDocumentRegistryRecords } from '../registry/doc-library';
import { buildStudyDossierFromStudyCard, upsertStudyDossiers } from '../registry/study-dossiers';
import { extractStudyCards } from '../study-card-extraction';
import type { CorpusRemoteSynthesisClient } from '../remote-synthesis';

export type ExecuteDocumentWorkItemContext = {
  outputRootDir: string;
  now: Date;
  document: DocumentRegistryRecord;
  recordsByDocumentId: Map<string, NormalizedEvidenceRecord>;
  remoteSynthesisClient: Pick<CorpusRemoteSynthesisClient, 'extractStudyCards'>;
};

export type ExecuteDocumentWorkItemResult = {
  status: 'completed' | 'blocked';
  reason?: string;
  delta: {
    documentsAcquired: number;
    documentsExtracted: number;
    studyCards: number;
  };
  document: DocumentRegistryRecord;
  studyCards: StudyCard[];
};

function withStatus(document: DocumentRegistryRecord, status: DocumentRegistryRecord['status'], now: Date): DocumentRegistryRecord {
  return {
    ...document,
    status,
    updatedAt: now.toISOString(),
  };
}

export async function executeDocumentWorkItem(
  item: AdaptiveKnowledgeWorkItem,
  context: ExecuteDocumentWorkItemContext,
): Promise<ExecuteDocumentWorkItemResult> {
  const parsedItem = parseAdaptiveKnowledgeWorkItem(item);
  const record = context.recordsByDocumentId.get(context.document.documentId);

  if (!record) {
    return {
      status: 'blocked',
      reason: 'missing-record',
      delta: {
        documentsAcquired: 0,
        documentsExtracted: 0,
        studyCards: 0,
      },
      document: context.document,
      studyCards: [],
    };
  }

  if (parsedItem.kind === 'acquire-fulltext') {
    const acquisition = await acquireFullText({ record });
    const nextStatus: DocumentRegistryRecord['status'] = acquisition.source === 'abstract-only' ? 'extractible' : 'full-text-ready';
    const nextDocument = withStatus(context.document, nextStatus, context.now);
    await upsertDocumentRegistryRecords(context.outputRootDir, [nextDocument], context.now);

    return {
      status: 'completed',
      delta: {
        documentsAcquired: acquisition.source === 'abstract-only' ? 0 : 1,
        documentsExtracted: 0,
        studyCards: 0,
      },
      document: nextDocument,
      studyCards: [],
    };
  }

  if (parsedItem.kind !== 'extract-study-card') {
    return {
      status: 'blocked',
      reason: 'unsupported-document-work-item',
      delta: {
        documentsAcquired: 0,
        documentsExtracted: 0,
        studyCards: 0,
      },
      document: context.document,
      studyCards: [],
    };
  }

  const studyCards = await extractStudyCards({
    records: [record],
    fullTextMap: new Map(),
    client: context.remoteSynthesisClient as CorpusRemoteSynthesisClient,
    runId: `document-executor:${parsedItem.id}`,
  });

  const nextDocument = withStatus(context.document, studyCards.length > 0 ? 'extracted' : context.document.status, context.now);
  await upsertDocumentRegistryRecords(context.outputRootDir, [nextDocument], context.now);

  if (studyCards.length > 0) {
    await upsertStudyDossiers(
      context.outputRootDir,
      studyCards.map((card) => buildStudyDossierFromStudyCard(card, context.now)),
      context.now,
    );
  }

  return {
    status: 'completed',
    delta: {
      documentsAcquired: 0,
      documentsExtracted: studyCards.length > 0 ? 1 : 0,
      studyCards: studyCards.length,
    },
    document: nextDocument,
    studyCards,
  };
}
