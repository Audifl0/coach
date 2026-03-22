import { runWithRetry } from './shared';

export type PmcFullTextResult = {
  pmcId: string;
  found: boolean;
  sections: {
    abstract: string | null;
    methods: string | null;
    results: string | null;
    discussion: string | null;
    conclusion: string | null;
  };
  fullText: string;
  wordCount: number;
};

const PMC_EFETCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';

function buildPmcFetchUrl(pmcId: string): string {
  const params = new URLSearchParams({
    db: 'pmc',
    id: pmcId,
    rettype: 'full',
    retmode: 'xml',
  });
  return `${PMC_EFETCH}?${params.toString()}`;
}

function stripTags(xml: string): string {
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extract a section from PMC full-text XML.
 *
 * PMC XML uses two conventions:
 *   1. <sec sec-type="methods">…</sec>
 *   2. <sec><title>Methods</title>…</sec>
 *
 * We try both. Returns the first match, or null if not found.
 */
function extractSection(xml: string, sectionType: string, titleVariants: string[]): string | null {
  // Try sec-type attribute first
  const attrRegex = new RegExp(
    `<sec[^>]*sec-type=["']${sectionType}["'][^>]*>([\\s\\S]*?)</sec>`,
    'i',
  );
  const attrMatch = xml.match(attrRegex);
  if (attrMatch?.[1]) {
    const text = stripTags(attrMatch[1]);
    if (text.length > 0) return text;
  }

  // Try title-based matching
  for (const titleVariant of titleVariants) {
    const titleRegex = new RegExp(
      `<sec[^>]*>\\s*<title[^>]*>\\s*${titleVariant}\\s*</title>([\\s\\S]*?)</sec>`,
      'i',
    );
    const titleMatch = xml.match(titleRegex);
    if (titleMatch?.[1]) {
      const text = stripTags(titleMatch[1]);
      if (text.length > 0) return text;
    }
  }

  return null;
}

function extractAbstractSection(xml: string): string | null {
  // Try <abstract> element (not inside <sec>)
  const abstractMatch = xml.match(/<abstract[^>]*>([\s\S]*?)<\/abstract>/i);
  if (abstractMatch?.[1]) {
    const text = stripTags(abstractMatch[1]);
    if (text.length > 0) return text;
  }

  // Also try as a sec with type="abstract"
  return extractSection(xml, 'abstract', ['Abstract', 'ABSTRACT']);
}

function parsePmcXml(pmcId: string, xml: string): PmcFullTextResult {
  // Detect empty or error responses
  const trimmed = xml.trim();
  if (
    trimmed.length === 0 ||
    trimmed.includes('<error>') ||
    (!trimmed.includes('<article') && !trimmed.includes('<PubmedArticleSet') && !trimmed.includes('<body'))
  ) {
    return {
      pmcId,
      found: false,
      sections: {
        abstract: null,
        methods: null,
        results: null,
        discussion: null,
        conclusion: null,
      },
      fullText: '',
      wordCount: 0,
    };
  }

  const abstract = extractAbstractSection(xml);
  const methods = extractSection(xml, 'methods', ['Methods', 'METHODS', 'Materials and Methods', 'Methods and Materials']);
  const results = extractSection(xml, 'results', ['Results', 'RESULTS']);
  const discussion = extractSection(xml, 'discussion', ['Discussion', 'DISCUSSION']);
  const conclusion = extractSection(xml, 'conclusions', ['Conclusion', 'Conclusions', 'CONCLUSIONS', 'CONCLUSION']);

  const parts = [abstract, methods, results, discussion, conclusion].filter((part): part is string => part !== null);
  const fullText = parts.join(' ');
  const wordCount = fullText.length === 0 ? 0 : fullText.split(/\s+/).filter((w) => w.length > 0).length;

  // If we found at least something recognizable in the XML but no sections,
  // try to extract the full body text as a fallback.
  if (wordCount === 0) {
    const bodyMatch = xml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch?.[1]) {
      const bodyText = stripTags(bodyMatch[1]);
      const bodyWordCount = bodyText.split(/\s+/).filter((w) => w.length > 0).length;
      return {
        pmcId,
        found: bodyWordCount > 0,
        sections: { abstract: null, methods: null, results: null, discussion: null, conclusion: null },
        fullText: bodyText,
        wordCount: bodyWordCount,
      };
    }
    // XML was valid but no extractable sections — treat as not-found
    return {
      pmcId,
      found: false,
      sections: { abstract: null, methods: null, results: null, discussion: null, conclusion: null },
      fullText: '',
      wordCount: 0,
    };
  }

  return {
    pmcId,
    found: true,
    sections: { abstract, methods, results, discussion, conclusion },
    fullText,
    wordCount,
  };
}

export async function fetchPmcFullText(input: {
  pmcId: string;
  fetchImpl?: (url: string) => Promise<Response>;
}): Promise<PmcFullTextResult> {
  const fetchImpl =
    input.fetchImpl ??
    ((url: string) => fetch(url));

  const url = buildPmcFetchUrl(input.pmcId);

  const result = await runWithRetry(async () => {
    const response = await fetchImpl(url);
    if (!response.ok) {
      if (response.status === 404) {
        // Not found — return sentinel rather than retry
        return '';
      }
      throw new Error(`PMC efetch failed with status ${response.status}`);
    }
    return response.text();
  }, 2);

  if (!result.ok) {
    return {
      pmcId: input.pmcId,
      found: false,
      sections: { abstract: null, methods: null, results: null, discussion: null, conclusion: null },
      fullText: '',
      wordCount: 0,
    };
  }

  return parsePmcXml(input.pmcId, result.value);
}
