import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchCrossrefEvidenceBatch } from '../../scripts/adaptive-knowledge/connectors/crossref';
import { fetchOpenAlexEvidenceBatch } from '../../scripts/adaptive-knowledge/connectors/openalex';
import { fetchPubmedEvidenceBatch } from '../../scripts/adaptive-knowledge/connectors/pubmed';
import { buildAdaptiveKnowledgeDiscoveryPlan } from '../../scripts/adaptive-knowledge/discovery';

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

test('freshness metadata no longer excludes old-but-relevant connector records', async () => {
  const result = await fetchOpenAlexEvidenceBatch({
    query: 'resistance training',
    allowedDomains: ['openalex.org'],
    now: new Date('2026-03-05T00:00:00.000Z'),
    fetchImpl: async () =>
      buildJsonResponse({
        results: [
          {
            id: 'oa-fresh',
            title: 'Resistance training review for hypertrophy',
            url: 'https://openalex.org/W1',
            publishedAt: '2025-11-02',
            sourceType: 'review',
            summary: 'Resistance training and hypertrophy outcomes.',
          },
          {
            id: 'oa-stale',
            title: 'Resistance training review from 2017',
            url: 'https://openalex.org/W2',
            publishedAt: '2017-01-01',
            sourceType: 'review',
            summary: 'Older resistance training review.',
          },
        ],
      }),
  });

  assert.equal(result.skipped, false);
  assert.equal(result.records.length, 2);
  assert.deepEqual(result.records.map((record) => record.id), ['oa-fresh', 'oa-stale']);
  assert.equal(result.recordsFetched, 2);
  assert.equal(result.recordsSkipped, 0);
  assert.equal(result.telemetry.skipReasons.stalePublication, 1);
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
              title: ['Resistance training hypertrophy review'],
              abstract: 'Review of resistance training and hypertrophy outcomes.',
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

test('crossref connector rejects semantically off-topic native items even when domains are allowed', async () => {
  const result = await fetchCrossrefEvidenceBatch({
    query: 'resistance training pain modification exercise selection',
    allowedDomains: ['doi.org'],
    now: new Date('2026-03-05T00:00:00.000Z'),
    fetchImpl: async () =>
      buildJsonResponse({
        message: {
          items: [
            {
              DOI: '10.1000/fine-dining',
              title: ['Systematic literature review of determinants of restaurant preference in hospitality'],
              abstract: 'A hospitality review about dining behavior and customer revisit intention.',
              created: { 'date-parts': [[2025, 11, 2]] },
            },
          ],
        },
      }),
  });

  assert.equal(result.records.length, 0);
  assert.equal(result.recordsSkipped, 1);
  assert.equal(result.telemetry.skipReasons?.offTopic, 1);
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

test('discovery plan with expanded topics covers at least 8 distinct topic keys', () => {
  const plan = buildAdaptiveKnowledgeDiscoveryPlan({ maxQueries: 30 });
  const uniqueTopicKeys = new Set(plan.map((query) => query.topicKey));
  assert.equal(uniqueTopicKeys.size >= 8, true, `Expected at least 8 topic keys, got ${uniqueTopicKeys.size}: ${[...uniqueTopicKeys].join(', ')}`);
});

test('connectors respect pagination page parameter and report hasMore', async () => {
  const capturedUrls: string[] = [];

  const result = await fetchPubmedEvidenceBatch({
    query: 'progressive overload',
    allowedDomains: ['pubmed.ncbi.nlm.nih.gov'],
    now: new Date('2026-03-05T00:00:00.000Z'),
    pagination: { page: 2 },
    fetchImpl: async (url) => {
      capturedUrls.push(url);
      return buildJsonResponse({
        esearchresult: { idlist: [] },
      });
    },
  });

  assert.equal(capturedUrls.length >= 1, true);
  const searchUrl = capturedUrls[0]!;
  assert.equal(searchUrl.includes('retstart=40'), true, `Expected retstart=40 in URL, got: ${searchUrl}`);
  assert.equal(result.telemetry.hasMore, false);
});
