import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseDocumentRegistryRecord,
  parseDocumentRegistryState,
  parseDurableWorkQueueItem,
  parseStudyDossierRegistryRecord,
  parseStudyDossierRegistryState,
} from '../../scripts/adaptive-knowledge/contracts';

test('document registry contract accepts stable document states', () => {
  const record = parseDocumentRegistryRecord({
    documentId: 'pubmed-123',
    canonicalId: 'doi:10.1000/example',
    recordId: 'pubmed-123',
    title: 'Hypertrophy dose response',
    sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/123',
    status: 'extractible',
    topicKeys: ['hypertrophy-dose'],
    createdAt: '2026-03-22T00:00:00.000Z',
    updatedAt: '2026-03-22T00:05:00.000Z',
  });

  assert.equal(record.status, 'extractible');

  const state = parseDocumentRegistryState({
    version: 'v1',
    generatedAt: '2026-03-22T00:05:00.000Z',
    items: [
      record,
      {
        ...record,
        documentId: 'pubmed-124',
        recordId: 'pubmed-124',
        sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/124',
        status: 'linked',
      },
    ],
  });

  assert.equal(state.items.length, 2);
});

test('study dossier registry contract accepts versioned dossiers', () => {
  const dossier = parseStudyDossierRegistryRecord({
    studyId: 'pubmed-123',
    recordId: 'pubmed-123',
    title: 'Hypertrophy dose response',
    status: 'validated-structure',
    topicKeys: ['hypertrophy-dose'],
    studyCard: {
      recordId: 'pubmed-123',
      title: 'Hypertrophy dose response',
      authors: 'Doe et al.',
      year: 2024,
      journal: 'Journal of Strength Research',
      doi: null,
      studyType: 'rct',
      population: {
        description: 'trained adults',
        size: 24,
        trainingLevel: 'intermediate',
      },
      protocol: {
        duration: '8 weeks',
        intervention: 'higher volume training',
        comparison: 'lower volume training',
      },
      results: {
        primary: 'Higher volume improved hypertrophy.',
        secondary: ['Strength gains were similar.'],
      },
      practicalTakeaways: ['Use additional weekly sets when recovery is stable.'],
      limitations: ['Small sample.'],
      safetySignals: ['No serious adverse events.'],
      evidenceLevel: 'moderate',
      topicKeys: ['hypertrophy-dose'],
      extractionSource: 'abstract',
      langueFr: {
        titreFr: 'Dose reponse hypertrophie',
        resumeFr: 'Resume',
        conclusionFr: 'Conclusion',
      },
    },
    createdAt: '2026-03-22T00:00:00.000Z',
    updatedAt: '2026-03-22T00:05:00.000Z',
  });

  const state = parseStudyDossierRegistryState({
    version: 'v1',
    generatedAt: '2026-03-22T00:05:00.000Z',
    items: [dossier],
  });

  assert.equal(state.items[0]?.status, 'validated-structure');
});

test('queue contract accepts durable work items with timestamps and reasons', () => {
  const queueItem = parseDurableWorkQueueItem({
    id: 'work-1',
    queueName: 'study-extraction',
    logicalKey: 'study-extraction:pubmed-123',
    status: 'blocked',
    payload: {
      recordId: 'pubmed-123',
    },
    createdAt: '2026-03-22T00:00:00.000Z',
    updatedAt: '2026-03-22T00:06:00.000Z',
    claimedBy: 'worker-1',
    claimedAt: '2026-03-22T00:05:00.000Z',
    blockedReason: 'full text unavailable',
    failureReason: 'transient upstream issue',
  });

  assert.equal(queueItem.status, 'blocked');
  assert.equal(queueItem.blockedReason, 'full text unavailable');
});
