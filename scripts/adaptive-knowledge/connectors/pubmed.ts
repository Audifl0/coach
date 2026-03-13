import {
  normalizeConnectorRecords,
  resolveConnectorConfig,
  runWithRetry,
  type ConnectorFetchInput,
  type ConnectorFetchResult,
} from './shared';

type PubmedApiResponse = {
  results?: Array<{
    id: string;
    sourceType: 'guideline' | 'review' | 'expertise';
    title: string;
    url: string;
    publishedAt: string;
    summary: string;
    tags?: string[];
  }>;
  esearchresult?: {
    idlist?: string[];
  };
};

const PUBMED_ENDPOINT = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';

function buildPubmedUrl(query: string): string {
  const params = new URLSearchParams({
    db: 'pubmed',
    retmode: 'json',
    term: query,
  });
  return `${PUBMED_ENDPOINT}?${params.toString()}`;
}

export async function fetchPubmedEvidenceBatch(input: ConnectorFetchInput): Promise<ConnectorFetchResult> {
  const config = resolveConnectorConfig(input);
  const fetchImpl =
    input.fetchImpl ??
    (async (url: string) => {
      const response = await fetch(url);
      return {
        ok: response.ok,
        status: response.status,
        async json() {
          return response.json();
        },
      };
    });

  const result = await runWithRetry(async () => {
    const response = await fetchImpl(buildPubmedUrl(input.query));
    if (!response.ok) {
      throw new Error(`PubMed request failed with status ${response.status}`);
    }
    const payload = (await response.json()) as PubmedApiResponse;
    if (Array.isArray(payload.results)) {
      return payload.results;
    }
    return (payload.esearchresult?.idlist ?? []).map((id) => ({
      id,
      sourceType: 'review' as const,
      title: `PubMed record ${id}`,
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}`,
      publishedAt: (input.now ?? new Date()).toISOString().slice(0, 10),
      summary: `PubMed result for ${input.query}`,
      tags: ['progression'],
    }));
  }, config.maxRetries);

  if (!result.ok) {
    return {
      source: 'pubmed',
      skipped: true,
      records: [],
      recordsFetched: 0,
      recordsSkipped: 0,
      telemetry: {
        attempts: result.attempts,
      },
      error: {
        message: result.error,
        attempts: result.attempts,
      },
    };
  }

  const normalized = normalizeConnectorRecords('pubmed', result.value, config, input.now ?? new Date(), input.cursorState, {
    query: input.query,
    topicKey: input.collectionJob?.topicKey,
    targetPopulation: input.collectionJob?.targetPopulation ?? null,
  });
  return {
    source: 'pubmed',
    skipped: false,
    records: normalized.records,
    recordsFetched: normalized.records.length,
    recordsSkipped: normalized.skipped,
    telemetry: {
      attempts: result.attempts,
      rawResults: result.value.length,
      nextCursor: result.value.at(-1)?.id,
      skipReasons: normalized.skipReasons,
    },
  };
}
