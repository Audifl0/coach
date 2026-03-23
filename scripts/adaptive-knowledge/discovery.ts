import {
  parseAdaptiveKnowledgeCollectionJob,
  type AdaptiveKnowledgeCollectionJob,
  type AdaptiveKnowledgeDiscoveryQuery,
  type AdaptiveKnowledgeResearchFront,
} from './contracts';
import type { ConnectorSource } from './connectors/shared';
import { buildAdaptiveKnowledgeDiscoveryResearchFronts } from './registry/research-fronts';

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
      {
        key: 'deload-protocols',
        label: 'Protocoles de deload',
        queryFamily: 'progression-deload',
        query: 'deload protocol resistance training recovery supercompensation',
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
      {
        key: 'dose-response-sets',
        label: 'Dose-reponse series',
        queryFamily: 'hypertrophy-dose-response-sets',
        query: 'dose response weekly sets muscle hypertrophy',
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
      {
        key: 'recovery-monitoring',
        label: 'Monitoring de recuperation',
        queryFamily: 'fatigue-recovery-monitoring',
        query: 'recovery monitoring biomarkers resistance training readiness',
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
      {
        key: 'load-modification',
        label: 'Modification de charge',
        queryFamily: 'limitations-load-modification',
        query: 'load modification pain resistance training rehabilitation',
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
      {
        key: 'female-athletes',
        label: 'Athlete feminine',
        queryFamily: 'population-female-athletes',
        query: 'female resistance training hypertrophy strength differences',
        targetPopulation: 'female athletes',
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
      {
        key: 'isolation-vs-compound',
        label: 'Isolation vs compound',
        queryFamily: 'exercise-selection-isolation-compound',
        query: 'isolation compound exercise comparison hypertrophy',
      },
    ],
  },
  {
    key: 'periodization',
    label: 'Periodisation',
    priority: 7,
    subtopics: [
      {
        key: 'linear-periodization',
        label: 'Periodisation lineaire',
        queryFamily: 'periodization-linear',
        query: 'linear periodization resistance training strength',
      },
      {
        key: 'undulating-periodization',
        label: 'Periodisation ondulatoire',
        queryFamily: 'periodization-undulating',
        query: 'daily undulating periodization hypertrophy strength',
      },
      {
        key: 'block-periodization',
        label: 'Periodisation par blocs',
        queryFamily: 'periodization-block',
        query: 'block periodization resistance training programming',
      },
    ],
  },
  {
    key: 'rest-intervals',
    label: 'Intervalles de repos',
    priority: 8,
    subtopics: [
      {
        key: 'hypertrophy-rest',
        label: 'Repos pour hypertrophie',
        queryFamily: 'rest-intervals-hypertrophy',
        query: 'rest interval duration hypertrophy muscle growth',
      },
      {
        key: 'strength-rest',
        label: 'Repos pour la force',
        queryFamily: 'rest-intervals-strength',
        query: 'inter-set rest period strength performance recovery',
      },
      {
        key: 'endurance-rest',
        label: 'Repos pour endurance',
        queryFamily: 'rest-intervals-endurance',
        query: 'short rest intervals muscular endurance resistance training',
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
              targetPopulation: undefined,
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

export function buildAdaptiveKnowledgeBootstrapCollectionJobs(input?: {
  sources?: readonly ConnectorSource[];
  topicSeeds?: readonly string[];
  maxJobs?: number;
  existingJobs?: readonly AdaptiveKnowledgeCollectionJob[];
}): AdaptiveKnowledgeCollectionJob[] {
  const maxJobs = Math.max(1, input?.maxJobs ?? 1);
  const existingJobs = (input?.existingJobs ?? []).map((job) => parseAdaptiveKnowledgeCollectionJob(job));
  const activeJobs = existingJobs.filter((job) => job.status !== 'completed' && job.status !== 'exhausted');
  if (activeJobs.length > 0) {
    return activeJobs
      .slice()
      .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
      .slice(0, maxJobs);
  }
  const existingIds = new Set(existingJobs.map((job) => job.id));
  const generatedJobs = buildAdaptiveKnowledgeDiscoveryPlan({
    sources: input?.sources,
    topicSeeds: input?.topicSeeds,
    maxQueries: maxJobs + existingJobs.length,
  })
    .map((query) =>
      parseAdaptiveKnowledgeCollectionJob({
        id: `${query.source}:${query.queryFamily}`,
        source: query.source,
        query: query.query,
        queryFamily: query.queryFamily,
        topicKey: query.topicKey,
        topicLabel: query.topicLabel,
        subtopicKey: query.subtopicKey,
        subtopicLabel: query.subtopicLabel,
        priority: query.priority,
        status: 'pending',
        targetPopulation: query.targetPopulation ?? null,
        cursor: null,
        pagesFetched: 0,
        recordsFetched: 0,
        canonicalRecords: 0,
        lastError: null,
      }),
    )
    .filter((job) => !existingIds.has(job.id));

  return generatedJobs
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
    .slice(0, maxJobs);
}

export { buildAdaptiveKnowledgeDiscoveryResearchFronts };

export function buildAdaptiveKnowledgeBootstrapResearchFronts(input?: {
  sources?: readonly ConnectorSource[];
  topicSeeds?: readonly string[];
  maxFronts?: number;
  existingFronts?: readonly AdaptiveKnowledgeResearchFront[];
}): AdaptiveKnowledgeResearchFront[] {
  return buildAdaptiveKnowledgeDiscoveryResearchFronts({
    sources: input?.sources,
    topicSeeds: input?.topicSeeds,
    maxFronts: input?.maxFronts,
    existingFronts: input?.existingFronts,
  });
}
