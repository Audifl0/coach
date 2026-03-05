import {
  normalizeConnectorRecords,
  resolveConnectorConfig,
  runWithRetry,
  type ConnectorFetchInput,
  type ConnectorFetchResult,
} from './shared';

type CrossrefApiResponse = {
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

const CROSSREF_ENDPOINT = 'https://api.crossref.org/works';

function buildCrossrefUrl(query: string): string {
  const params = new URLSearchParams({
    query,
    rows: '20',
    sort: 'published',
    order: 'desc',
  });
  return `${CROSSREF_ENDPOINT}?${params.toString()}`;
}

export async function fetchCrossrefEvidenceBatch(input: ConnectorFetchInput): Promise<ConnectorFetchResult> {
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
    const response = await fetchImpl(buildCrossrefUrl(input.query));
    if (!response.ok) {
      throw new Error(`Crossref request failed with status ${response.status}`);
    }
    const payload = (await response.json()) as CrossrefApiResponse;
    return payload.results ?? [];
  }, config.maxRetries);

  if (!result.ok) {
    return {
      source: 'crossref',
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

  const normalized = normalizeConnectorRecords('crossref', result.value, config, input.now ?? new Date());
  return {
    source: 'crossref',
    skipped: false,
    records: normalized.records,
    recordsFetched: normalized.records.length,
    recordsSkipped: normalized.skipped,
    telemetry: {
      attempts: result.attempts,
    },
  };
}
