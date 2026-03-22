import { runWithRetry } from './shared';

export type UnpaywallResult = {
  doi: string;
  isOa: boolean;
  oaUrl: string | null;
  pmcId: string | null;
};

type UnpaywallApiResponse = {
  is_oa?: boolean;
  best_oa_location?: {
    url_for_landing_page?: string | null;
    url?: string | null;
  } | null;
  oa_locations?: Array<{
    url?: string | null;
    url_for_landing_page?: string | null;
  }> | null;
};

const UNPAYWALL_BASE = 'https://api.unpaywall.org/v2';

function buildUnpaywallUrl(doi: string, email: string): string {
  return `${UNPAYWALL_BASE}/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`;
}

function extractPmcIdFromLocations(locations: UnpaywallApiResponse['oa_locations']): string | null {
  if (!Array.isArray(locations)) return null;
  for (const loc of locations) {
    for (const urlField of [loc.url, loc.url_for_landing_page]) {
      if (typeof urlField === 'string' && urlField.includes('ncbi.nlm.nih.gov/pmc/')) {
        // URL forms:
        //   https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12345/
        //   https://europepmc.org/articles/pmc12345  (handled separately)
        const pmcMatch = urlField.match(/\/pmc\/articles\/(PMC\d+)/i);
        if (pmcMatch?.[1]) {
          return pmcMatch[1].toUpperCase();
        }
        // Fallback: extract any PMC\d+ token in the URL
        const rawMatch = urlField.match(/(PMC\d+)/i);
        if (rawMatch?.[1]) {
          return rawMatch[1].toUpperCase();
        }
      }
    }
  }
  return null;
}

export async function checkUnpaywallAccess(input: {
  doi: string;
  email?: string;
  fetchImpl?: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
}): Promise<UnpaywallResult> {
  const email =
    input.email ??
    process.env['UNPAYWALL_EMAIL'] ??
    'coach-corpus@localhost';

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

  const url = buildUnpaywallUrl(input.doi, email);

  const notFound: UnpaywallResult = {
    doi: input.doi,
    isOa: false,
    oaUrl: null,
    pmcId: null,
  };

  const result = await runWithRetry(async () => {
    const response = await fetchImpl(url);
    if (response.status === 404) {
      // DOI not in Unpaywall — not a retriable error
      return null;
    }
    if (!response.ok) {
      throw new Error(`Unpaywall request failed with status ${response.status}`);
    }
    return (await response.json()) as UnpaywallApiResponse;
  }, 2);

  if (!result.ok || result.value === null) {
    return notFound;
  }

  const payload = result.value;
  const isOa = payload.is_oa === true;

  if (!isOa) {
    return notFound;
  }

  const oaUrl =
    payload.best_oa_location?.url_for_landing_page ??
    payload.best_oa_location?.url ??
    null;

  const pmcId = extractPmcIdFromLocations(payload.oa_locations);

  return {
    doi: input.doi,
    isOa: true,
    oaUrl,
    pmcId,
  };
}
