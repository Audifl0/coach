import { fetchPmcFullText, type PmcFullTextResult } from './connectors/pmc';
import { checkUnpaywallAccess } from './connectors/unpaywall';
import type { NormalizedEvidenceRecord } from './contracts';

export type FullTextAcquisitionResult = {
  recordId: string;
  source: 'pmc' | 'unpaywall' | 'abstract-only';
  sections?: PmcFullTextResult['sections'];
  fullText?: string;
  wordCount: number;
};

/**
 * Extract a PMID from a PubMed URL like
 *   https://pubmed.ncbi.nlm.nih.gov/12345678
 *   https://pubmed.ncbi.nlm.nih.gov/12345678/
 */
function extractPmidFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith('pubmed.ncbi.nlm.nih.gov')) {
      const segments = parsed.pathname.split('/').filter(Boolean);
      const candidate = segments[0];
      if (candidate && /^\d+$/.test(candidate)) {
        return candidate;
      }
    }
  } catch {
    // ignore malformed URLs
  }
  return null;
}

/**
 * Extract a DOI from a record's sourceUrl or id.
 * Recognises bare DOIs (10.xxxx/…) and doi.org URLs.
 */
function extractDoiFromRecord(record: NormalizedEvidenceRecord): string | null {
  const candidates = [record.sourceUrl, record.id];
  for (const candidate of candidates) {
    // doi.org URL
    const doiOrgMatch = candidate.match(/doi\.org\/(10\.\d{4,9}\/.+)/i);
    if (doiOrgMatch?.[1]) {
      return decodeURIComponent(doiOrgMatch[1]);
    }
    // Bare DOI
    const bareMatch = candidate.match(/(10\.\d{4,9}\/[-._;()/:a-z0-9]+)/i);
    if (bareMatch?.[1]) {
      return bareMatch[1];
    }
  }
  return null;
}

function abstractOnlyResult(record: NormalizedEvidenceRecord): FullTextAcquisitionResult {
  const wordCount = record.summaryEn.split(/\s+/).filter((w) => w.length > 0).length;
  return {
    recordId: record.id,
    source: 'abstract-only',
    wordCount,
  };
}

export async function acquireFullText(input: {
  record: NormalizedEvidenceRecord;
  pmcFetch?: typeof fetchPmcFullText;
  unpaywallCheck?: typeof checkUnpaywallAccess;
}): Promise<FullTextAcquisitionResult> {
  const { record } = input;
  const pmcFetchFn = input.pmcFetch ?? fetchPmcFullText;
  const unpaywallCheckFn = input.unpaywallCheck ?? checkUnpaywallAccess;

  // --- Attempt 1: direct PMC via PMID extracted from PubMed URL ---
  const pmid = extractPmidFromUrl(record.sourceUrl);
  if (pmid) {
    const pmcId = `PMC${pmid}`;
    try {
      const pmcResult = await pmcFetchFn({ pmcId });
      if (pmcResult.found && pmcResult.wordCount > 0) {
        return {
          recordId: record.id,
          source: 'pmc',
          sections: pmcResult.sections,
          fullText: pmcResult.fullText,
          wordCount: pmcResult.wordCount,
        };
      }
    } catch {
      // PMC attempt failed — fall through
    }
  }

  // --- Attempt 2: Unpaywall DOI lookup ---
  const doi = extractDoiFromRecord(record);
  if (doi) {
    try {
      const oaResult = await unpaywallCheckFn({ doi });
      if (oaResult.isOa) {
        // If Unpaywall gave us a PMC ID, try to fetch the full text
        if (oaResult.pmcId) {
          try {
            const pmcResult = await pmcFetchFn({ pmcId: oaResult.pmcId });
            if (pmcResult.found && pmcResult.wordCount > 0) {
              return {
                recordId: record.id,
                source: 'pmc',
                sections: pmcResult.sections,
                fullText: pmcResult.fullText,
                wordCount: pmcResult.wordCount,
              };
            }
          } catch {
            // PMC fetch after Unpaywall failed — fall through to OA URL
          }
        }

        // Unpaywall confirms OA but we couldn't get full text from PMC
        if (oaResult.oaUrl) {
          const wordCount = record.summaryEn.split(/\s+/).filter((w) => w.length > 0).length;
          return {
            recordId: record.id,
            source: 'unpaywall',
            wordCount,
          };
        }
      }
    } catch {
      // Unpaywall lookup failed — fall through
    }
  }

  // --- Fallback: abstract-only ---
  return abstractOnlyResult(record);
}
