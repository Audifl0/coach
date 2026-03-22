import { readFileSync } from 'node:fs';
import path from 'node:path';

import { loadActiveAdaptiveEvidenceCorpus } from '@/lib/adaptive-coaching/evidence-corpus';

export type CoachKnowledgePrinciple = {
  id: string;
  title: string;
  description: string;
  conditions?: string[];
  evidenceLevel?: string;
  sourceCardIds?: string[];
  guardrail: string | null;
  tags: string[];
};

export type CoachKnowledgeSource = {
  id: string;
  title: string;
  summary: string;
  practicalTakeaways?: string[];
  year?: number;
  journal?: string;
  doi?: string;
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
    typeof row.statement === 'string' ? row.statement : null,
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
    conditions: toStringList(row.conditions),
    evidenceLevel: typeof row.evidenceLevel === 'string' ? row.evidenceLevel : undefined,
    sourceCardIds: toStringList(row.sourceCardIds),
    guardrail: typeof row.guardrail === 'string' ? row.guardrail : null,
    tags: toStringList(row.tags).slice(0, 6),
  };
}

function normalizeSource(record: unknown): CoachKnowledgeSource | null {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const row = record as Record<string, unknown>;
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
    practicalTakeaways: toStringList(row.practicalTakeaways),
    year: typeof row.year === 'number' ? row.year : undefined,
    journal: typeof row.journal === 'string' ? row.journal : undefined,
    doi: typeof row.doi === 'string' ? row.doi : undefined,
    sourceClass,
    tags: toStringList(row.tags),
  };
}

function normalizeThematicSynthesisPrinciples(value: unknown): CoachKnowledgePrinciple[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const row = item as Record<string, unknown>;
    const principles = Array.isArray(row.principlesFr) ? row.principlesFr : [];

    return principles
      .map((principle) => {
        if (!principle || typeof principle !== 'object') {
          return null;
        }

        const principleRow = principle as Record<string, unknown>;
        const normalized = normalizePrinciple({
          ...principleRow,
          description: principleRow.statement,
          tags: toStringList(principleRow.sourceCardIds),
        });

        return normalized;
      })
      .filter((principle): principle is CoachKnowledgePrinciple => principle !== null);
  });
}

function normalizeStudyCardSource(record: unknown): CoachKnowledgeSource | null {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const row = record as Record<string, unknown>;
  if (!isNonEmptyString(row.recordId)) {
    return null;
  }

  const french = row.langueFr && typeof row.langueFr === 'object'
    ? row.langueFr as Record<string, unknown>
    : null;
  const title = [
    french && typeof french.titreFr === 'string' ? french.titreFr : null,
    typeof row.title === 'string' ? row.title : null,
    row.recordId,
  ].find(isNonEmptyString);
  const summary = [
    french && typeof french.resumeFr === 'string' ? french.resumeFr : null,
    typeof row.summary === 'string' ? row.summary : null,
  ].find(isNonEmptyString);

  if (!title || !summary) {
    return null;
  }

  return {
    id: row.recordId,
    title,
    summary,
    practicalTakeaways: toStringList(row.practicalTakeaways),
    year: typeof row.year === 'number' ? row.year : undefined,
    journal: typeof row.journal === 'string' ? row.journal : undefined,
    doi: typeof row.doi === 'string' ? row.doi : undefined,
    sourceClass: 'review',
    tags: [],
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
      thematicSyntheses?: unknown[];
      studyCards?: unknown[];
    };

    const principles = [
      ...(published.principles ?? []).map(normalizePrinciple),
      ...normalizeThematicSynthesisPrinciples(published.thematicSyntheses),
    ].filter((item): item is CoachKnowledgePrinciple => item !== null);
    const sources = [
      ...((published.sources ?? []).map(normalizeSource)),
      ...((published.studyCards ?? []).map(normalizeStudyCardSource)),
    ].filter((item): item is CoachKnowledgeSource => item !== null);

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
          score:
            scoreByQueryTags(principle.tags, query) +
            ((principle.sourceCardIds?.length ?? 0) > 0 ? 1 : 0) +
            (principle.guardrail ? 1 : 0),
        }))
        .sort(comparePrinciples)
        .slice(0, principleLimit)
        .map((item) => item.principle),
      sources: published.sources
        .map((source) => ({
          source,
          score: scoreByQueryTags(source.tags, query) + ((source.practicalTakeaways?.length ?? 0) > 0 ? 1 : 0),
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
      if ((principle.conditions?.length ?? 0) > 0) {
        lines.push(`    Conditions: ${principle.conditions?.join('; ')}`);
      }
    }
  }

  if (input.bible.sources.length === 0) {
    lines.push('- sources: none');
  } else {
    lines.push('- sources:');
    for (const source of input.bible.sources) {
      lines.push(`  - ${source.id} [${source.sourceClass}] tags=${source.tags.join(',')} :: ${source.summary}`);
      if ((source.practicalTakeaways?.length ?? 0) > 0) {
        lines.push(`    Takeaways: ${source.practicalTakeaways?.join('; ')}`);
      }
    }
  }

  return lines.join('\n');
}
