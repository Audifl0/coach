import { readFileSync } from 'node:fs';
import path from 'node:path';

export class PublishedDoctrineArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishedDoctrineArtifactError';
  }
}

export type PublishedDoctrinePrinciple = {
  id: string;
  statement: string;
  conditions: string[];
  limits: string[];
  confidenceLevel: string;
  provenance: string[];
};

export type PublishedDoctrine = {
  snapshotId: string | null;
  principles: PublishedDoctrinePrinciple[];
};

type LoadPublishedDoctrineInput = {
  knowledgeRootDir?: string;
};

type SnapshotPointer = {
  snapshotId?: string;
  snapshotDir?: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}

function normalizePublishedDoctrinePrinciple(record: unknown): PublishedDoctrinePrinciple | null {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const row = record as Record<string, unknown>;
  const id = typeof row.principleId === 'string' ? row.principleId : typeof row.id === 'string' ? row.id : null;
  const statement =
    typeof row.statementFr === 'string'
      ? row.statementFr
      : typeof row.statement === 'string'
        ? row.statement
        : null;
  const confidenceLevel =
    typeof row.confidenceLevel === 'string'
      ? row.confidenceLevel
      : typeof row.confidence === 'string'
        ? row.confidence
        : null;

  if (!isNonEmptyString(id) || !isNonEmptyString(statement) || !isNonEmptyString(confidenceLevel)) {
    return null;
  }

  const provenance = [
    ...toStringList(row.questionIds),
    ...toStringList(row.studyIds),
    ...toStringList(row.provenance),
  ];

  return {
    id,
    statement,
    conditions: toStringList(row.conditionsFr ?? row.conditions),
    limits: toStringList(row.limitsFr ?? row.limits),
    confidenceLevel,
    provenance: Array.from(new Set(provenance)).slice(0, 6),
  };
}

export function loadPublishedDoctrine(input: LoadPublishedDoctrineInput = {}): PublishedDoctrine {
  const knowledgeRootDir =
    input.knowledgeRootDir ?? path.join(process.cwd(), '.planning', 'knowledge', 'adaptive-coaching');

  try {
    const activePointer = JSON.parse(readFileSync(path.join(knowledgeRootDir, 'active.json'), 'utf8')) as SnapshotPointer;
    if (!activePointer.snapshotDir) {
      return { snapshotId: null, principles: [] };
    }

    const artifactPath = path.join(activePointer.snapshotDir, 'knowledge-bible.json');
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as {
      publishedDoctrine?: {
        principles?: unknown[];
      };
    };

    const principles = (artifact.publishedDoctrine?.principles ?? [])
      .map(normalizePublishedDoctrinePrinciple)
      .filter((item): item is PublishedDoctrinePrinciple => item !== null);

    return {
      snapshotId: activePointer.snapshotId ?? null,
      principles,
    };
  } catch (error) {
    const errno = (error as NodeJS.ErrnoException).code;
    if (errno === 'ENOENT') {
      return {
        snapshotId: null,
        principles: [],
      };
    }

    throw new PublishedDoctrineArtifactError(
      `Failed to load published doctrine artifact: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function renderPublishedDoctrineForPrompt(input: {
  doctrine: PublishedDoctrine;
  heading?: string;
}): string {
  const heading = input.heading ?? 'Published doctrine';
  const lines = [`${heading}: snapshot=${input.doctrine.snapshotId ?? 'none'}`];

  if (input.doctrine.principles.length === 0) {
    lines.push('- principles: none');
    return lines.join('\n');
  }

  lines.push('- principles:');
  for (const principle of input.doctrine.principles) {
    lines.push(`  - ${principle.id}: ${principle.statement}`);
    if (principle.conditions.length > 0) {
      lines.push(`    Conditions: ${principle.conditions.join('; ')}`);
    }
    if (principle.limits.length > 0) {
      lines.push(`    Limits: ${principle.limits.join('; ')}`);
    }
    lines.push(`    Confidence: ${principle.confidenceLevel}`);
    if (principle.provenance.length > 0) {
      lines.push(`    Provenance: ${principle.provenance.join('; ')}`);
    }
  }

  return lines.join('\n');
}
