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
    return (payload.results ?? []).map((item, index) => {
      if ('summary' in item) {
        return item;
      }

      const native = item as unknown as {
        id?: string;
        display_name?: string;
        publication_date?: string;
        primary_location?: { landing_page_url?: string | null };
      };
      return {
        id: native.id ?? `openalex-${index}`,
        sourceType: 'review' as const,
        title: native.display_name ?? `OpenAlex record ${index + 1}`,
        url: native.primary_location?.landing_page_url ?? native.id ?? `https://openalex.org/W${index + 1}`,
        publishedAt: native.publication_date ?? (input.now ?? new Date()).toISOString().slice(0, 10),
        summary: `OpenAlex result for ${input.query}`,
        tags: ['fatigue'],
      };
    });
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

  const normalized = normalizeConnectorRecords('openalex', result.value, config, input.now ?? new Date(), input.cursorState);
  return {
    source: 'openalex',
    skipped: false,
    records: normalized.records,
    recordsFetched: normalized.records.length,
    recordsSkipped: normalized.skipped,
    telemetry: {
      attempts: result.attempts,
      nextCursor: result.value.at(-1)?.id,
    },
  };
}
