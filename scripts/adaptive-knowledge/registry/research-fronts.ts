import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  parseAdaptiveKnowledgeResearchFront,
  type AdaptiveKnowledgeResearchFront,
} from '../contracts';
import { getActiveSourceCatalog } from '../source-catalog';
import { buildAdaptiveKnowledgeDiscoveryPlan } from '../discovery';
import type { ConnectorSource } from '../connectors/shared';

const REGISTRY_DIR = 'registry';
const RESEARCH_FRONTS_FILE = 'research-fronts.json';
const RESEARCH_FRONTS_VERSION = 'v1';

type ResearchFrontState = {
  version: string;
  generatedAt: string;
  items: AdaptiveKnowledgeResearchFront[];
};

type BuildResearchFrontInput = {
  id: string;
  source: ConnectorSource;
  queryFamily: string;
  topicKey: string;
  query: string;
  topicLabel?: string | null;
  subtopicKey?: string | null;
  subtopicLabel?: string | null;
  priority?: number;
  targetPopulation?: string | null;
};

type ResearchFrontMutation = {
  id: string;
  reason: string;
  until?: string;
  pageCursor?: AdaptiveKnowledgeResearchFront['pageCursor'];
  evidence?: AdaptiveKnowledgeResearchFront['evidence'];
};

function resolveResearchFrontRegistryPath(outputRootDir: string): string {
  return path.join(outputRootDir, REGISTRY_DIR, RESEARCH_FRONTS_FILE);
}

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

async function writeJsonAtomically(targetPath: string, payload: unknown): Promise<void> {
  const tmpPath = `${targetPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  await rename(tmpPath, targetPath);
}

function sortFronts(fronts: readonly AdaptiveKnowledgeResearchFront[]): AdaptiveKnowledgeResearchFront[] {
  return [...fronts].sort((left, right) => left.id.localeCompare(right.id));
}

function createEmptyState(now?: Date): ResearchFrontState {
  return {
    version: RESEARCH_FRONTS_VERSION,
    generatedAt: nowIso(now),
    items: [],
  };
}

function getSourceMetadata(source: ConnectorSource) {
  return getActiveSourceCatalog().find((entry) => entry.source === source) ?? null;
}

export function buildResearchFront(input: BuildResearchFrontInput): AdaptiveKnowledgeResearchFront {
  const sourceMetadata = getSourceMetadata(input.source);
  return parseAdaptiveKnowledgeResearchFront({
    id: input.id,
    source: input.source,
    queryFamily: input.queryFamily,
    status: 'active',
    topicKey: input.topicKey,
    query: input.query,
    pageCursor: { page: 0, nextCursor: null },
    attempts: 0,
    evidence: { pagesVisited: 0, reformulationsTried: 0, sourcesVisited: 1 },
    statusReason: 'seeded',
    cooldownReason: null,
    cooldownUntil: null,
    sourceTier: sourceMetadata?.tier ?? 'academic-secondary',
    sourceMetadata,
    topicLabel: input.topicLabel ?? null,
    subtopicKey: input.subtopicKey ?? null,
    subtopicLabel: input.subtopicLabel ?? null,
    priority: input.priority ?? 1,
    targetPopulation: input.targetPopulation ?? null,
  });
}

export async function loadResearchFronts(outputRootDir: string): Promise<AdaptiveKnowledgeResearchFront[]> {
  const registryPath = resolveResearchFrontRegistryPath(outputRootDir);
  try {
    const raw = await readFile(registryPath, 'utf8');
    const parsed = JSON.parse(raw) as { items?: unknown[] };
    return sortFronts((parsed.items ?? []).map((item) => parseAdaptiveKnowledgeResearchFront(item)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function upsertResearchFronts(
  outputRootDir: string,
  fronts: readonly AdaptiveKnowledgeResearchFront[],
  now?: Date,
): Promise<AdaptiveKnowledgeResearchFront[]> {
  const registryPath = resolveResearchFrontRegistryPath(outputRootDir);
  await mkdir(path.dirname(registryPath), { recursive: true });

  const existing = await loadResearchFronts(outputRootDir);
  const nextById = new Map(existing.map((front) => [front.id, front]));

  for (const front of fronts) {
    const parsed = parseAdaptiveKnowledgeResearchFront(front);
    nextById.set(parsed.id, parsed);
  }

  const state: ResearchFrontState = {
    version: RESEARCH_FRONTS_VERSION,
    generatedAt: nowIso(now),
    items: sortFronts([...nextById.values()]),
  };

  await writeJsonAtomically(registryPath, state);
  return state.items;
}

async function transitionResearchFront(
  outputRootDir: string,
  status: AdaptiveKnowledgeResearchFront['status'],
  mutation: ResearchFrontMutation,
  now?: Date,
): Promise<AdaptiveKnowledgeResearchFront> {
  const fronts = await loadResearchFronts(outputRootDir);
  const current = fronts.find((front) => front.id === mutation.id);
  if (!current) {
    throw new Error(`Research front not found: ${mutation.id}`);
  }

  const next = parseAdaptiveKnowledgeResearchFront({
    ...current,
    status,
    statusReason: mutation.reason,
    cooldownReason: status === 'cooldown' ? mutation.reason : null,
    cooldownUntil: status === 'cooldown' ? mutation.until ?? null : null,
    pageCursor: mutation.pageCursor ?? current.pageCursor,
    evidence: mutation.evidence ?? current.evidence,
  });

  await upsertResearchFronts(
    outputRootDir,
    fronts.map((front) => (front.id === mutation.id ? next : front)),
    now,
  );

  return next;
}

export async function markResearchFrontActive(outputRootDir: string, mutation: ResearchFrontMutation, now?: Date) {
  return transitionResearchFront(outputRootDir, 'active', mutation, now);
}

export async function markResearchFrontCooldown(outputRootDir: string, mutation: ResearchFrontMutation, now?: Date) {
  return transitionResearchFront(outputRootDir, 'cooldown', mutation, now);
}

export async function markResearchFrontDeferred(outputRootDir: string, mutation: ResearchFrontMutation, now?: Date) {
  return transitionResearchFront(outputRootDir, 'deferred', mutation, now);
}

export async function markResearchFrontBlocked(outputRootDir: string, mutation: ResearchFrontMutation, now?: Date) {
  return transitionResearchFront(outputRootDir, 'blocked', mutation, now);
}

export async function markResearchFrontExhausted(outputRootDir: string, mutation: ResearchFrontMutation, now?: Date) {
  return transitionResearchFront(outputRootDir, 'exhausted', mutation, now);
}

export async function markResearchFrontArchived(outputRootDir: string, mutation: ResearchFrontMutation, now?: Date) {
  return transitionResearchFront(outputRootDir, 'archived', mutation, now);
}

export function buildAdaptiveKnowledgeDiscoveryResearchFronts(input?: {
  sources?: readonly ConnectorSource[];
  topicSeeds?: readonly string[];
  maxFronts?: number;
  existingFronts?: readonly AdaptiveKnowledgeResearchFront[];
}): AdaptiveKnowledgeResearchFront[] {
  const existingIds = new Set((input?.existingFronts ?? []).map((front) => front.id));

  return buildAdaptiveKnowledgeDiscoveryPlan({
    sources: input?.sources,
    topicSeeds: input?.topicSeeds,
    maxQueries: input?.maxFronts,
  })
    .map((query) =>
      buildResearchFront({
        id: `front:${query.source}:${query.queryFamily}`,
        source: query.source,
        queryFamily: query.queryFamily,
        topicKey: query.topicKey,
        query: query.query,
        topicLabel: query.topicLabel,
        subtopicKey: query.subtopicKey,
        subtopicLabel: query.subtopicLabel,
        priority: query.priority,
        targetPopulation: query.targetPopulation ?? null,
      }),
    )
    .filter((front) => !existingIds.has(front.id));
}

export async function ensureDiscoveryResearchFronts(
  outputRootDir: string,
  input?: {
    sources?: readonly ConnectorSource[];
    topicSeeds?: readonly string[];
    maxFronts?: number;
  },
): Promise<AdaptiveKnowledgeResearchFront[]> {
  const existing = await loadResearchFronts(outputRootDir);
  const seeded = buildAdaptiveKnowledgeDiscoveryResearchFronts({
    ...input,
    existingFronts: existing,
  });
  if (seeded.length === 0) {
    return existing;
  }
  return upsertResearchFronts(outputRootDir, [...existing, ...seeded]);
}
