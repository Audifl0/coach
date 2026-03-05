import {
  normalizeConnectorRecords,
  resolveConnectorConfig,
  runWithRetry,
  type ConnectorFetchInput,
  type ConnectorFetchResult,
} from './shared';

type OpenAlexApiResponse = {
  results?: Array<{
    id: string;
    sourceType: 'guideline' | 'review' | 'expertise';
    title: string;
    url: string;
    publishedAt: string;
    summary: string;
    tags?: string[];
  }>;
};

const OPENALEX_ENDPOINT = 'https://api.openalex.org/works';

function buildOpenAlexUrl(query: string): string {
  const params = new URLSearchParams({
    search: query,
    per_page: '20',
  });
  return `${OPENALEX_ENDPOINT}?${params.toString()}`;
}

export async function fetchOpenAlexEvidenceBatch(input: ConnectorFetchInput): Promise<ConnectorFetchResult> {
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
    const response = await fetchImpl(buildOpenAlexUrl(input.query));
    if (!response.ok) {
      throw new Error(`OpenAlex request failed with status ${response.status}`);
    }
    const payload = (await response.json()) as OpenAlexApiResponse;
    return payload.results ?? [];
  }, config.maxRetries);

  if (!result.ok) {
    return {
      source: 'openalex',
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

  const normalized = normalizeConnectorRecords('openalex', result.value, config, input.now ?? new Date());
  return {
    source: 'openalex',
    skipped: false,
    records: normalized.records,
    recordsFetched: normalized.records.length,
    recordsSkipped: normalized.skipped,
    telemetry: {
      attempts: result.attempts,
    },
  };
}
