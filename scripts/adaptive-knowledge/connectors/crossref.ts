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
  message?: {
    items?: Array<{
      DOI?: string;
      title?: string[];
      abstract?: string;
      created?: {
        'date-parts'?: number[][] | undefined;
      };
    }>;
  };
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
    if (Array.isArray(payload.results)) {
      return payload.results;
    }
    return (payload.message?.items ?? []).map((item, index) => {
      const publishedParts = item.created?.['date-parts']?.[0] ?? [];
      const publishedAt = [
        publishedParts[0] ?? (input.now ?? new Date()).getUTCFullYear(),
        String(publishedParts[1] ?? 1).padStart(2, '0'),
        String(publishedParts[2] ?? 1).padStart(2, '0'),
      ].join('-');

      return {
        id: item.DOI ?? `crossref-${index}`,
        sourceType: 'review' as const,
        title: item.title?.[0] ?? `Crossref record ${index + 1}`,
        url: `https://doi.org/${item.DOI ?? `crossref-${index}`}`,
        publishedAt,
        summary: item.abstract ?? `Crossref result for ${input.query}`,
        tags: ['hypertrophy'],
      };
    });
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

  const normalized = normalizeConnectorRecords('crossref', result.value, config, input.now ?? new Date(), input.cursorState, {
    query: input.query,
    topicKey: input.collectionJob?.topicKey,
    targetPopulation: input.collectionJob?.targetPopulation ?? null,
  });
  return {
    source: 'crossref',
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
