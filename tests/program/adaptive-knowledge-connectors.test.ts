import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchCrossrefEvidenceBatch } from '../../scripts/adaptive-knowledge/connectors/crossref';
import { fetchOpenAlexEvidenceBatch } from '../../scripts/adaptive-knowledge/connectors/openalex';
import { fetchPubmedEvidenceBatch } from '../../scripts/adaptive-knowledge/connectors/pubmed';

type MockResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

function buildJsonResponse(payload: unknown): MockResponse {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    },
  };
}

test('records from non-whitelisted domains are rejected before normalization', async () => {
  const result = await fetchPubmedEvidenceBatch({
    query: 'progressive overload',
    allowedDomains: ['pubmed.ncbi.nlm.nih.gov'],
    now: new Date('2026-03-05T00:00:00.000Z'),
    fetchImpl: async () =>
      buildJsonResponse({
        results: [
          {
            id: 'pm-1',
            title: 'Guideline A',
            url: 'https://evil.example.org/paper',
            publishedAt: '2025-01-10',
            sourceType: 'guideline',
            summary: 'x',
          },
        ],
      }),
  });

  assert.equal(result.skipped, false);
  assert.equal(result.records.length, 0);
  assert.equal(result.recordsFetched, 0);
  assert.equal(result.recordsSkipped, 1);
});

test('connector freshness window excludes records older than 5-year default', async () => {
  const result = await fetchOpenAlexEvidenceBatch({
    query: 'resistance training',
    allowedDomains: ['openalex.org'],
    now: new Date('2026-03-05T00:00:00.000Z'),
    fetchImpl: async () =>
      buildJsonResponse({
        results: [
          {
            id: 'oa-fresh',
            title: 'Fresh review',
            url: 'https://openalex.org/W1',
            publishedAt: '2025-11-02',
            sourceType: 'review',
            summary: 'fresh',
          },
          {
            id: 'oa-stale',
            title: 'Old review',
            url: 'https://openalex.org/W2',
            publishedAt: '2017-01-01',
            sourceType: 'review',
            summary: 'stale',
          },
        ],
      }),
  });

  assert.equal(result.skipped, false);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]?.id, 'oa-fresh');
  assert.equal(result.recordsFetched, 1);
  assert.equal(result.recordsSkipped, 1);
});

test('retry exhaustion returns source-level skip outcome instead of throwing', async () => {
  const result = await fetchCrossrefEvidenceBatch({
    query: 'hypertrophy review',
    retryCount: 2,
    allowedDomains: ['doi.org'],
    now: new Date('2026-03-05T00:00:00.000Z'),
    fetchImpl: async () => {
      throw new Error('crossref unavailable');
    },
  });

  assert.equal(result.skipped, true);
  assert.equal(result.records.length, 0);
  assert.equal(result.recordsFetched, 0);
  assert.equal(result.recordsSkipped, 0);
  assert.equal(result.telemetry.attempts, 3);
  assert.match(result.error?.message ?? '', /crossref unavailable/i);
});

test('crossref connector parses representative native response items', async () => {
  const result = await fetchCrossrefEvidenceBatch({
    query: 'hypertrophy review',
    allowedDomains: ['doi.org'],
    now: new Date('2026-03-05T00:00:00.000Z'),
    fetchImpl: async () =>
      buildJsonResponse({
        message: {
          items: [
            {
              DOI: '10.1000/test',
              title: ['Crossref native title'],
              abstract: 'crossref abstract',
              created: { 'date-parts': [[2025, 11, 2]] },
            },
          ],
        },
      }),
  });

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]?.id, '10.1000/test');
  assert.equal(result.telemetry.nextCursor, '10.1000/test');
});

test('cursor state excludes already seen records before final normalization', async () => {
  const result = await fetchPubmedEvidenceBatch({
    query: 'progressive overload',
    allowedDomains: ['pubmed.ncbi.nlm.nih.gov'],
    now: new Date('2026-03-05T00:00:00.000Z'),
    cursorState: {
      seenRecordIds: ['pm-1'],
    },
    fetchImpl: async () =>
      buildJsonResponse({
        results: [
          {
            id: 'pm-1',
            title: 'Guideline A',
            url: 'https://pubmed.ncbi.nlm.nih.gov/pm-1',
            publishedAt: '2025-01-10',
            sourceType: 'guideline',
            summary: 'x',
          },
        ],
      }),
  });

  assert.equal(result.records.length, 0);
  assert.equal(result.recordsSkipped, 1);
});
