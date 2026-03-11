import { readFileSync } from 'node:fs';
import path from 'node:path';

import { loadActiveAdaptiveEvidenceCorpus } from '@/lib/adaptive-coaching/evidence-corpus';

export type CoachKnowledgePrinciple = {
  id: string;
  title: string;
  description: string;
  guardrail: string | null;
  tags: string[];
};

export type CoachKnowledgeSource = {
  id: string;
  title: string;
  summary: string;
  sourceClass: 'guideline' | 'review' | 'expertise';
  tags: string[];
};

export type CoachKnowledgeBible = {
  snapshotId: string | null;
  principles: CoachKnowledgePrinciple[];
  sources: CoachKnowledgeSource[];
};

type LoadCoachKnowledgeBibleInput = {
  knowledgeRootDir?: string;
  queryTags?: string[];
  principleLimit?: number;
  sourceLimit?: number;
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}

function normalizePrinciple(record: unknown): CoachKnowledgePrinciple | null {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const row = record as Record<string, unknown>;
  if (!isNonEmptyString(row.id) || !isNonEmptyString(row.title)) {
    return null;
  }

  const description = [
    typeof row.description === 'string' ? row.description : null,
    typeof row.summaryFr === 'string' ? row.summaryFr : null,
    typeof row.guidanceFr === 'string' ? row.guidanceFr : null,
  ].find(isNonEmptyString);

  if (!description) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    description,
    guardrail: typeof row.guardrail === 'string' ? row.guardrail : null,
    tags: toStringList(row.tags).slice(0, 6),
  };
}

function readPublishedKnowledgeBible(knowledgeRootDir: string): CoachKnowledgeBible | null {
  try {
    const activePointer = JSON.parse(readFileSync(path.join(knowledgeRootDir, 'active.json'), 'utf8')) as {
      snapshotId?: string;
      snapshotDir?: string;
    };
    if (!activePointer.snapshotId || !activePointer.snapshotDir) {
      return null;
    }
    const published = JSON.parse(
      readFileSync(path.join(activePointer.snapshotDir, 'knowledge-bible.json'), 'utf8'),
    ) as {
      principles?: unknown[];
      sources?: unknown[];
    };

    const principles = (published.principles ?? [])
      .map(normalizePrinciple)
      .filter((item): item is CoachKnowledgePrinciple => item !== null);
    const sources = Array.isArray(published.sources)
      ? published.sources
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }
          const row = item as Record<string, unknown>;
          if (!isNonEmptyString(row.id) || !isNonEmptyString(row.title) || !isNonEmptyString(row.summary)) {
            return null;
          }
          const sourceClass =
            row.sourceClass === 'guideline' || row.sourceClass === 'review' || row.sourceClass === 'expertise'
              ? row.sourceClass
              : null;
          if (!sourceClass) {
            return null;
          }
          return {
            id: row.id,
            title: row.title,
            summary: row.summary,
            sourceClass,
            tags: toStringList(row.tags),
          } satisfies CoachKnowledgeSource;
        })
        .filter((item): item is CoachKnowledgeSource => item !== null)
      : [];

    return {
      snapshotId: activePointer.snapshotId,
      principles,
      sources,
    };
  } catch {
    return null;
  }
}

function scoreByQueryTags(tags: string[], query: Set<string>): number {
  if (query.size === 0) {
    return 0;
  }

  return tags.map(normalizeToken).filter((tag) => query.has(tag)).length;
}

function comparePrinciples(
  left: { principle: CoachKnowledgePrinciple; score: number },
  right: { principle: CoachKnowledgePrinciple; score: number },
): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  return left.principle.id.localeCompare(right.principle.id);
}

function compareSources(
  left: { source: CoachKnowledgeSource; score: number },
  right: { source: CoachKnowledgeSource; score: number },
): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  const priority = { guideline: 3, review: 2, expertise: 1 };
  if (left.source.sourceClass !== right.source.sourceClass) {
    return priority[right.source.sourceClass] - priority[left.source.sourceClass];
  }

  return left.source.id.localeCompare(right.source.id);
}

export function loadCoachKnowledgeBible(input: LoadCoachKnowledgeBibleInput = {}): CoachKnowledgeBible {
  const knowledgeRootDir =
    input.knowledgeRootDir ?? path.join(process.cwd(), '.planning', 'knowledge', 'adaptive-coaching');
  const published = readPublishedKnowledgeBible(knowledgeRootDir);
  if (published) {
    const query = new Set((input.queryTags ?? []).map(normalizeToken).filter(Boolean));
    const principleLimit = Math.max(1, Math.min(input.principleLimit ?? 4, 8));
    const sourceLimit = Math.max(1, Math.min(input.sourceLimit ?? 4, 8));

    return {
      snapshotId: published.snapshotId,
      principles: published.principles
        .map((principle) => ({
          principle,
          score: scoreByQueryTags(principle.tags, query) + (principle.guardrail ? 1 : 0),
        }))
        .sort(comparePrinciples)
        .slice(0, principleLimit)
        .map((item) => item.principle),
      sources: published.sources
        .map((source) => ({
          source,
          score: scoreByQueryTags(source.tags, query),
        }))
        .sort(compareSources)
        .slice(0, sourceLimit)
        .map((item) => item.source),
    };
  }

  const principleLimit = Math.max(1, Math.min(input.principleLimit ?? 4, 8));
  const sourceLimit = Math.max(1, Math.min(input.sourceLimit ?? 4, 8));
  const query = new Set((input.queryTags ?? []).map(normalizeToken).filter(Boolean));
  const corpus = loadActiveAdaptiveEvidenceCorpus({ knowledgeRootDir });

  const principles = (Array.isArray(corpus.principles) ? corpus.principles : [])
    .map(normalizePrinciple)
    .filter((item): item is CoachKnowledgePrinciple => item !== null)
    .map((principle) => ({
      principle,
      score: scoreByQueryTags(principle.tags, query) + (principle.guardrail ? 1 : 0),
    }))
    .sort(comparePrinciples)
    .slice(0, principleLimit)
    .map((item) => item.principle);

  const sources = corpus.entries
    .map((entry) => ({
      source: {
        id: entry.id,
        title: entry.title,
        summary: entry.summary,
        sourceClass: entry.sourceClass,
        tags: entry.tags,
      } satisfies CoachKnowledgeSource,
      score: scoreByQueryTags(entry.tags, query),
    }))
    .sort(compareSources)
    .slice(0, sourceLimit)
    .map((item) => item.source);

  return {
    snapshotId: corpus.snapshotId,
    principles,
    sources,
  };
}

export function renderCoachKnowledgeBibleForPrompt(input: {
  bible: CoachKnowledgeBible;
  heading?: string;
}): string {
  const heading = input.heading ?? 'Knowledge bible';
  const lines = [`${heading}: snapshot=${input.bible.snapshotId ?? 'none'}`];

  if (input.bible.principles.length === 0) {
    lines.push('- principles: none');
  } else {
    lines.push('- principles:');
    for (const principle of input.bible.principles) {
      const tags = principle.tags.length > 0 ? ` tags=${principle.tags.join(',')}` : '';
      const guardrail = principle.guardrail ? ` guardrail=${principle.guardrail}` : '';
      lines.push(`  - ${principle.id}: ${principle.title}${guardrail}${tags} :: ${principle.description}`);
    }
  }

  if (input.bible.sources.length === 0) {
    lines.push('- sources: none');
  } else {
    lines.push('- sources:');
    for (const source of input.bible.sources) {
      lines.push(`  - ${source.id} [${source.sourceClass}] tags=${source.tags.join(',')} :: ${source.summary}`);
    }
  }

  return lines.join('\n');
}
