import type { AdaptiveKnowledgeDiscoveryQuery } from './contracts';
import type { ConnectorSource } from './connectors/shared';

type DiscoverySubtopic = {
  key: string;
  label: string;
  queryFamily: string;
  query: string;
  targetPopulation?: string;
};

type DiscoveryTopic = {
  key: string;
  label: string;
  priority: number;
  subtopics: readonly DiscoverySubtopic[];
};

const DEFAULT_DISCOVERY_TOPICS: readonly DiscoveryTopic[] = [
  {
    key: 'progression',
    label: 'Progression et surcharge progressive',
    priority: 1,
    subtopics: [
      {
        key: 'load-progression',
        label: 'Progression de charge',
        queryFamily: 'progression-load',
        query: 'resistance training load progression hypertrophy strength',
      },
      {
        key: 'weekly-split',
        label: 'Organisation hebdomadaire',
        queryFamily: 'progression-split',
        query: 'strength programming weekly split resistance training',
      },
    ],
  },
  {
    key: 'hypertrophy-dose',
    label: 'Dose d entrainement hypertrophie',
    priority: 2,
    subtopics: [
      {
        key: 'volume-landmarks',
        label: 'Volume landmarks',
        queryFamily: 'hypertrophy-volume',
        query: 'hypertrophy volume landmarks resistance training',
      },
      {
        key: 'frequency-dose',
        label: 'Frequence et dose',
        queryFamily: 'hypertrophy-frequency',
        query: 'muscle hypertrophy training frequency volume dose response',
      },
    ],
  },
  {
    key: 'fatigue-readiness',
    label: 'Fatigue et readiness',
    priority: 3,
    subtopics: [
      {
        key: 'fatigue-management',
        label: 'Gestion de fatigue',
        queryFamily: 'fatigue-management',
        query: 'fatigue management resistance training recovery monitoring',
      },
      {
        key: 'autoregulation',
        label: 'Autoregulation',
        queryFamily: 'readiness-autoregulation',
        query: 'load autoregulation readiness monitoring resistance training',
      },
    ],
  },
  {
    key: 'limitations-pain',
    label: 'Limitations et douleur',
    priority: 4,
    subtopics: [
      {
        key: 'exercise-substitution',
        label: 'Substitution d exercices',
        queryFamily: 'limitations-substitution',
        query: 'exercise substitution resistance training pain limitations',
      },
      {
        key: 'pain-aware-training',
        label: 'Entrainement avec douleur',
        queryFamily: 'limitations-pain-aware',
        query: 'resistance training pain modification exercise selection',
      },
    ],
  },
  {
    key: 'population-context',
    label: 'Populations et contexte',
    priority: 5,
    subtopics: [
      {
        key: 'novice-lifters',
        label: 'Pratiquants novices',
        queryFamily: 'population-novice',
        query: 'novice resistance training progression hypertrophy',
        targetPopulation: 'novice lifters',
      },
      {
        key: 'time-constrained',
        label: 'Contrainte de temps',
        queryFamily: 'population-time-constrained',
        query: 'time efficient resistance training frequency split',
        targetPopulation: 'time constrained athletes',
      },
    ],
  },
  {
    key: 'exercise-selection',
    label: 'Selection d exercices',
    priority: 6,
    subtopics: [
      {
        key: 'movement-selection',
        label: 'Choix de mouvements',
        queryFamily: 'exercise-selection-primary',
        query: 'exercise selection resistance training hypertrophy strength',
      },
      {
        key: 'variation-specificity',
        label: 'Variantes et specificite',
        queryFamily: 'exercise-selection-variation',
        query: 'exercise variation specificity resistance training',
      },
    ],
  },
] as const;

export function buildAdaptiveKnowledgeDiscoveryPlan(input?: {
  sources?: readonly ConnectorSource[];
  topicSeeds?: readonly string[];
  maxQueries?: number;
}): AdaptiveKnowledgeDiscoveryQuery[] {
  const sources = input?.sources?.length ? [...input.sources] : (['pubmed', 'crossref', 'openalex'] as ConnectorSource[]);
  const seededTopics =
    input?.topicSeeds?.length
      ? input.topicSeeds.map((seed, index) => ({
          key: `seed-${index + 1}`,
          label: seed,
          priority: index + 1,
          subtopics: [
            {
              key: `seed-${index + 1}`,
              label: seed,
              queryFamily: 'seed',
              query: seed,
            },
          ],
        }))
      : [...DEFAULT_DISCOVERY_TOPICS];
  const maxQueries = Math.max(1, input?.maxQueries ?? seededTopics.length);
  const candidates = seededTopics
    .slice()
    .sort((left, right) => left.priority - right.priority || left.key.localeCompare(right.key))
    .flatMap((topic) =>
      topic.subtopics.map((subtopic) => ({
        topicKey: topic.key,
        topicLabel: topic.label,
        subtopicKey: subtopic.key,
        subtopicLabel: subtopic.label,
        queryFamily: subtopic.queryFamily,
        query: subtopic.query,
        priority: topic.priority,
        targetPopulation: subtopic.targetPopulation ?? null,
      })),
    );

  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      const dedupeKey = `${candidate.queryFamily}:${candidate.query.toLowerCase()}`;
      if (seen.has(dedupeKey)) {
        return false;
      }
      seen.add(dedupeKey);
      return true;
    })
    .slice(0, maxQueries)
    .map((candidate, index) => ({
      source: sources[index % sources.length]!,
      query: candidate.query,
      topicKey: candidate.topicKey,
      topicLabel: candidate.topicLabel,
      subtopicKey: candidate.subtopicKey,
      subtopicLabel: candidate.subtopicLabel,
      queryFamily: candidate.queryFamily,
      priority: candidate.priority,
      targetPopulation: candidate.targetPopulation,
    }));
}
