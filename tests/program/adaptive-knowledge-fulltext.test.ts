import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchPmcFullText } from '../../scripts/adaptive-knowledge/connectors/pmc';
import { checkUnpaywallAccess } from '../../scripts/adaptive-knowledge/connectors/unpaywall';
import { acquireFullText } from '../../scripts/adaptive-knowledge/fulltext-acquisition';
import type { NormalizedEvidenceRecord } from '../../scripts/adaptive-knowledge/contracts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTextResponse(body: string): Response {
  return {
    ok: true,
    status: 200,
    text: async () => body,
  } as unknown as Response;
}

function makeErrorResponse(status: number): Response {
  return {
    ok: false,
    status,
    text: async () => '',
  } as unknown as Response;
}

function makeJsonResponse(payload: unknown): { ok: boolean; status: number; json(): Promise<unknown> } {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    },
  };
}

function makeJsonErrorResponse(status: number): { ok: boolean; status: number; json(): Promise<unknown> } {
  return {
    ok: false,
    status,
    async json() {
      return {};
    },
  };
}

/** Minimal NormalizedEvidenceRecord fixture for acquisition tests. */
function makeRecord(overrides: Partial<NormalizedEvidenceRecord> = {}): NormalizedEvidenceRecord {
  return {
    id: 'test-record-1',
    canonicalId: 'title:some-test-title',
    sourceType: 'review',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/12345678',
    sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
    publishedAt: '2025-01-01',
    title: 'Some test title',
    summaryEn: 'This is the abstract text of the paper with several words in it.',
    tags: ['hypertrophy'],
    provenanceIds: ['test-record-1'],
    documentary: {
      status: 'abstract-ready',
      acquisition: { sourceKind: 'abstract', rejectionReason: null },
    },
    ...overrides,
  };
}

// PMC article XML fixture with all expected section types
const VALID_PMC_XML = `<?xml version="1.0"?>
<pmc-articleset>
  <article>
    <front>
      <article-meta>
        <article-id pub-id-type="pmc">12345678</article-id>
      </article-meta>
    </front>
    <body>
      <abstract>
        <p>Background: Resistance training increases muscle hypertrophy.</p>
        <p>Objective: To examine dose-response.</p>
      </abstract>
      <sec sec-type="methods">
        <title>Methods</title>
        <p>Participants performed 3 sets of 10 repetitions three times per week for 12 weeks.</p>
      </sec>
      <sec sec-type="results">
        <title>Results</title>
        <p>Significant increases in muscle cross-sectional area were observed (p less than 0.05).</p>
      </sec>
      <sec sec-type="discussion">
        <title>Discussion</title>
        <p>These findings confirm the importance of progressive overload for hypertrophy.</p>
      </sec>
      <sec sec-type="conclusions">
        <title>Conclusions</title>
        <p>Higher training volumes produce greater hypertrophic adaptations.</p>
      </sec>
    </body>
  </article>
</pmc-articleset>`;

// PMC XML with title-based section matching (no sec-type attribute)
const PMC_XML_TITLE_BASED = `<?xml version="1.0"?>
<pmc-articleset>
  <article>
    <body>
      <sec>
        <title>Methods</title>
        <p>Eight trained men performed resistance exercise twice weekly.</p>
      </sec>
      <sec>
        <title>Results</title>
        <p>Hypertrophy increased by 12 percent compared to controls.</p>
      </sec>
      <sec>
        <title>Discussion</title>
        <p>The results suggest that frequency matters for hypertrophy.</p>
      </sec>
    </body>
  </article>
</pmc-articleset>`;

// ---------------------------------------------------------------------------
// 1. PMC connector extracts sections from valid XML response
// ---------------------------------------------------------------------------

test('PMC connector extracts sections from valid XML response', async () => {
  const result = await fetchPmcFullText({
    pmcId: 'PMC12345678',
    fetchImpl: async () => makeTextResponse(VALID_PMC_XML),
  });

  assert.equal(result.found, true, 'should be found');
  assert.equal(result.pmcId, 'PMC12345678');
  assert.equal(typeof result.fullText, 'string');
  assert.ok(result.wordCount > 0, 'wordCount should be > 0');

  // Methods section
  assert.ok(result.sections.methods !== null, 'methods section should be extracted');
  assert.ok(
    result.sections.methods!.toLowerCase().includes('repetitions') ||
    result.sections.methods!.toLowerCase().includes('participants'),
    `methods text should contain expected content, got: ${result.sections.methods}`,
  );

  // Results section
  assert.ok(result.sections.results !== null, 'results section should be extracted');
  assert.ok(
    result.sections.results!.toLowerCase().includes('muscle') ||
    result.sections.results!.toLowerCase().includes('significant'),
    `results text should contain expected content, got: ${result.sections.results}`,
  );

  // Discussion section
  assert.ok(result.sections.discussion !== null, 'discussion section should be extracted');

  // Conclusion section
  assert.ok(result.sections.conclusion !== null, 'conclusion section should be extracted');
});

// ---------------------------------------------------------------------------
// 2. PMC connector extracts sections via title-based matching
// ---------------------------------------------------------------------------

test('PMC connector extracts sections by title when sec-type attribute is absent', async () => {
  const result = await fetchPmcFullText({
    pmcId: 'PMC99999',
    fetchImpl: async () => makeTextResponse(PMC_XML_TITLE_BASED),
  });

  assert.equal(result.found, true, 'should be found via title-based matching');
  assert.ok(result.sections.methods !== null, 'methods should be found by title');
  assert.ok(result.sections.results !== null, 'results should be found by title');
  assert.ok(result.sections.discussion !== null, 'discussion should be found by title');
  assert.ok(result.wordCount > 0);
});

// ---------------------------------------------------------------------------
// 3. PMC connector returns found:false for empty response
// ---------------------------------------------------------------------------

test('PMC connector returns found:false for empty response', async () => {
  const result = await fetchPmcFullText({
    pmcId: 'PMC000',
    fetchImpl: async () => makeTextResponse(''),
  });

  assert.equal(result.found, false);
  assert.equal(result.wordCount, 0);
  assert.equal(result.fullText, '');
  assert.equal(result.sections.abstract, null);
  assert.equal(result.sections.methods, null);
  assert.equal(result.sections.results, null);
  assert.equal(result.sections.discussion, null);
  assert.equal(result.sections.conclusion, null);
});

// ---------------------------------------------------------------------------
// 4. PMC connector returns found:false for 404 response
// ---------------------------------------------------------------------------

test('PMC connector returns found:false for 404 response', async () => {
  const result = await fetchPmcFullText({
    pmcId: 'PMC999999',
    fetchImpl: async () => makeErrorResponse(404),
  });

  assert.equal(result.found, false);
  assert.equal(result.wordCount, 0);
  assert.equal(result.fullText, '');
});

// ---------------------------------------------------------------------------
// 5. Unpaywall connector returns OA location for open-access DOI
// ---------------------------------------------------------------------------

test('Unpaywall connector returns OA location for open-access DOI', async () => {
  const mockResponse = {
    is_oa: true,
    best_oa_location: {
      url_for_landing_page: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7654321/',
      url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7654321/',
    },
    oa_locations: [
      {
        url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7654321/',
        url_for_landing_page: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7654321/',
      },
    ],
  };

  const result = await checkUnpaywallAccess({
    doi: '10.1234/test',
    email: 'test@localhost',
    fetchImpl: async () => makeJsonResponse(mockResponse),
  });

  assert.equal(result.doi, '10.1234/test');
  assert.equal(result.isOa, true);
  assert.equal(result.oaUrl, 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7654321/');
  assert.equal(result.pmcId, 'PMC7654321', `expected PMC7654321, got ${result.pmcId}`);
});

// ---------------------------------------------------------------------------
// 6. Unpaywall connector returns isOa:false for non-OA DOI (is_oa: false)
// ---------------------------------------------------------------------------

test('Unpaywall connector returns isOa:false for closed-access DOI', async () => {
  const result = await checkUnpaywallAccess({
    doi: '10.1234/closed',
    email: 'test@localhost',
    fetchImpl: async () => makeJsonResponse({ is_oa: false }),
  });

  assert.equal(result.isOa, false);
  assert.equal(result.oaUrl, null);
  assert.equal(result.pmcId, null);
});

// ---------------------------------------------------------------------------
// 7. Unpaywall connector returns isOa:false for 404 response
// ---------------------------------------------------------------------------

test('Unpaywall connector returns isOa:false for 404 response', async () => {
  const result = await checkUnpaywallAccess({
    doi: '10.9999/nonexistent',
    email: 'test@localhost',
    fetchImpl: async () => makeJsonErrorResponse(404),
  });

  assert.equal(result.isOa, false);
  assert.equal(result.oaUrl, null);
  assert.equal(result.pmcId, null);
});

// ---------------------------------------------------------------------------
// 8. fulltext acquisition tries PMC first, then Unpaywall, then degrades to abstract-only
// ---------------------------------------------------------------------------

test('fulltext acquisition degrades to abstract-only when both PMC and Unpaywall fail', async () => {
  const record = makeRecord({
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/12345678',
    summaryEn: 'This abstract has exactly eight words here.',
  });

  const result = await acquireFullText({
    record,
    pmcFetch: async () => ({
      pmcId: 'PMC12345678',
      found: false,
      sections: { abstract: null, methods: null, results: null, discussion: null, conclusion: null },
      fullText: '',
      wordCount: 0,
    }),
    unpaywallCheck: async () => ({
      doi: '10.0000/test',
      isOa: false,
      oaUrl: null,
      pmcId: null,
    }),
  });

  assert.equal(result.source, 'abstract-only', `Expected abstract-only, got: ${result.source}`);
  assert.equal(result.recordId, record.id);
  assert.ok(result.wordCount > 0, 'wordCount should reflect abstract word count');
});

// ---------------------------------------------------------------------------
// 9. fulltext acquisition uses PMC when PMID is extractable from record URL
// ---------------------------------------------------------------------------

test('fulltext acquisition uses PMC when PMID is extractable from PubMed URL', async () => {
  const record = makeRecord({
    id: 'pubmed-record-99',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/99887766',
    summaryEn: 'Short abstract.',
  });

  let capturedPmcId: string | undefined;

  const result = await acquireFullText({
    record,
    pmcFetch: async ({ pmcId }) => {
      capturedPmcId = pmcId;
      return {
        pmcId,
        found: true,
        sections: {
          abstract: 'Abstract text here.',
          methods: 'Methods: participants performed exercises.',
          results: 'Results: muscle mass increased.',
          discussion: 'Discussion: these findings support progressive overload.',
          conclusion: 'Conclusion: higher volume is better.',
        },
        fullText: 'Abstract text here. Methods: participants performed exercises. Results: muscle mass increased.',
        wordCount: 15,
      };
    },
    unpaywallCheck: async () => {
      throw new Error('should not call Unpaywall when PMC succeeds');
    },
  });

  assert.equal(result.source, 'pmc', `Expected pmc, got: ${result.source}`);
  assert.equal(result.recordId, record.id);
  assert.equal(capturedPmcId, 'PMC99887766', `Expected PMC99887766, got: ${capturedPmcId}`);
  assert.ok(result.wordCount > 0);
  assert.ok(result.sections !== undefined, 'sections should be populated');
  assert.ok(result.sections?.methods !== null, 'methods should be non-null');
});

// ---------------------------------------------------------------------------
// 10. fulltext acquisition uses Unpaywall PMC path when direct PMC fails
// ---------------------------------------------------------------------------

test('fulltext acquisition falls back to Unpaywall PMC path when direct PMC returns not-found', async () => {
  // Record has both a PubMed URL (for PMID extraction) and a DOI (for Unpaywall fallback)
  const record = makeRecord({
    id: '10.1234/testpaper',
    sourceUrl: 'https://doi.org/10.1234/testpaper',
    sourceDomain: 'doi.org',
    summaryEn: 'Abstract text for fallback test.',
    documentary: {
      status: 'abstract-ready',
      acquisition: { sourceKind: 'abstract', rejectionReason: null },
    },
  });

  let pmcCallCount = 0;

  const result = await acquireFullText({
    record,
    pmcFetch: async ({ pmcId }) => {
      pmcCallCount += 1;
      if (pmcCallCount === 1) {
        // First call (via Unpaywall PMC ID from second attempt) — but since no PMID in URL,
        // this is the Unpaywall-sourced PMC call and it succeeds.
        return {
          pmcId,
          found: true,
          sections: {
            abstract: 'Full abstract from PMC.',
            methods: 'Methods section.',
            results: 'Results section.',
            discussion: null,
            conclusion: null,
          },
          fullText: 'Full abstract from PMC. Methods section. Results section.',
          wordCount: 10,
        };
      }
      return {
        pmcId,
        found: false,
        sections: { abstract: null, methods: null, results: null, discussion: null, conclusion: null },
        fullText: '',
        wordCount: 0,
      };
    },
    unpaywallCheck: async () => ({
      doi: '10.1234/testpaper',
      isOa: true,
      oaUrl: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5544332/',
      pmcId: 'PMC5544332',
    }),
  });

  assert.equal(result.source, 'pmc', `Expected pmc source via Unpaywall, got: ${result.source}`);
  assert.equal(result.wordCount, 10);
});

// ---------------------------------------------------------------------------
// 11. fulltext acquisition returns unpaywall source when OA URL is found but no PMC ID
// ---------------------------------------------------------------------------

test('fulltext acquisition returns unpaywall source when OA URL found but no PMC ID', async () => {
  const record = makeRecord({
    id: 'doi-record-1',
    sourceUrl: 'https://doi.org/10.1016/j.test.2024.001',
    sourceDomain: 'doi.org',
    summaryEn: 'Abstract with some words to count here.',
  });

  const result = await acquireFullText({
    record,
    pmcFetch: async () => {
      throw new Error('should not attempt PMC for non-pubmed URL without PMID');
    },
    unpaywallCheck: async () => ({
      doi: '10.1016/j.test.2024.001',
      isOa: true,
      oaUrl: 'https://repository.example.com/paper.pdf',
      pmcId: null,
    }),
  });

  assert.equal(result.source, 'unpaywall', `Expected unpaywall, got: ${result.source}`);
  assert.ok(result.wordCount > 0);
});
