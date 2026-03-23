import type { AdaptiveKnowledgeSourceCatalogEntry } from './contracts';

const SOURCE_CATALOG: readonly AdaptiveKnowledgeSourceCatalogEntry[] = [
  {
    source: 'pubmed',
    tier: 'academic-primary',
    capabilities: ['metadata', 'abstract'],
    status: 'active',
  },
  {
    source: 'crossref',
    tier: 'academic-secondary',
    capabilities: ['metadata'],
    status: 'active',
  },
  {
    source: 'openalex',
    tier: 'professional-secondary',
    capabilities: ['metadata', 'abstract', 'fulltext'],
    status: 'active',
  },
] as const;

const DOCTRINE_ELIGIBLE_SOURCE_TIERS = ['academic-primary', 'academic-secondary'] as const;

function cloneSourceCatalogEntry(source: AdaptiveKnowledgeSourceCatalogEntry): AdaptiveKnowledgeSourceCatalogEntry {
  return {
    ...source,
    capabilities: [...source.capabilities],
  };
}

export function getActiveSourceCatalog(): AdaptiveKnowledgeSourceCatalogEntry[] {
  return SOURCE_CATALOG.filter((source) => source.status === 'active').map(cloneSourceCatalogEntry);
}

export function getDoctrineEligibleSourceTiers(): Array<(typeof DOCTRINE_ELIGIBLE_SOURCE_TIERS)[number]> {
  return [...DOCTRINE_ELIGIBLE_SOURCE_TIERS];
}
