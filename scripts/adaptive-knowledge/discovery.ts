import type { ConnectorSource } from './connectors/shared';

const DEFAULT_DISCOVERY_TOPICS = [
  'resistance training progression',
  'hypertrophy volume landmarks',
  'fatigue management resistance training',
  'exercise substitution limitations pain',
  'strength programming weekly split',
  'load autoregulation recovery monitoring',
] as const;

export type AdaptiveKnowledgeDiscoveryQuery = {
  source: ConnectorSource;
  query: string;
};

export function buildAdaptiveKnowledgeDiscoveryPlan(input?: {
  sources?: readonly ConnectorSource[];
  topicSeeds?: readonly string[];
  maxQueries?: number;
}): AdaptiveKnowledgeDiscoveryQuery[] {
  const sources = input?.sources?.length ? [...input.sources] : (['pubmed', 'crossref', 'openalex'] as ConnectorSource[]);
  const topicSeeds = input?.topicSeeds?.length ? [...input.topicSeeds] : [...DEFAULT_DISCOVERY_TOPICS];
  const maxQueries = Math.max(1, input?.maxQueries ?? topicSeeds.length);

  return topicSeeds.slice(0, maxQueries).map((topic, index) => ({
    source: sources[index % sources.length]!,
    query: topic,
  }));
}
