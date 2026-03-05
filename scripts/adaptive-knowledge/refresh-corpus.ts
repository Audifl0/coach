import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type CorpusEntry = {
  id: string;
  title: string;
  url: string;
  date: string;
  source_type: 'guideline' | 'review' | 'expertise';
  evidence_level: string;
  freshness_days: number;
  tags: string[];
  summary: string;
  principle_ids: string[];
};

type Principle = {
  id: string;
  title: string;
  description: string;
  priority: number;
  guardrail: 'SAFE-01' | 'SAFE-02' | 'SAFE-03';
  tags: string[];
};

type CorpusIndex = {
  version: string;
  generated_at: string;
  entries: CorpusEntry[];
};

type PrincipleIndex = {
  version: string;
  generated_at: string;
  principles: Principle[];
};

const CURATED_ENTRIES: CorpusEntry[] = [
  {
    id: 'guideline-acsm-progressive-overload-2024',
    title: 'ACSM Resistance Training Progression Framework',
    url: 'https://www.acsm.org/docs/default-source/files-for-resource-library/resistance-training-progression.pdf',
    date: '2024-01-15',
    source_type: 'guideline',
    evidence_level: 'consensus_guideline',
    freshness_days: 780,
    tags: ['progression', 'load', 'readiness'],
    summary: 'Recommends conservative step-wise overload and prioritization of technique when readiness declines.',
    principle_ids: ['principle-safe-progressive-overload', 'principle-readiness-first'],
  },
  {
    id: 'review-fatigue-autoregulation-2023',
    title: 'Autoregulation and Fatigue Management in Resistance Training',
    url: 'https://pubmed.ncbi.nlm.nih.gov/37265095/',
    date: '2023-08-10',
    source_type: 'review',
    evidence_level: 'systematic_review',
    freshness_days: 940,
    tags: ['fatigue', 'rpe', 'autoregulation'],
    summary: 'Supports hold or deload decisions when fatigue markers rise and session quality degrades.',
    principle_ids: ['principle-readiness-first', 'principle-fatigue-guardrail'],
  },
  {
    id: 'expertise-jts-substitution-2022',
    title: 'Practical Substitution Heuristics for Pain-Limited Training',
    url: 'https://www.jtsstrength.com/substitution-heuristics-pain-limited-training/',
    date: '2022-11-02',
    source_type: 'expertise',
    evidence_level: 'expert_consensus',
    freshness_days: 1221,
    tags: ['substitution', 'pain', 'limitations'],
    summary: 'Advises targeted substitutions when pain persists while maintaining movement intent and training adherence.',
    principle_ids: ['principle-limitation-aware-substitution', 'principle-fatigue-guardrail'],
  },
];

const CURATED_PRINCIPLES: Principle[] = [
  {
    id: 'principle-safe-progressive-overload',
    title: 'Safe Progressive Overload',
    description:
      'Progression should remain conservative and bounded when recent execution quality or recovery confidence is uncertain.',
    priority: 1,
    guardrail: 'SAFE-01',
    tags: ['progression', 'load', 'safety'],
  },
  {
    id: 'principle-readiness-first',
    title: 'Readiness Before Intensity',
    description: 'When readiness and fatigue indicators diverge, preserve adherence and reduce risk with hold or deload actions.',
    priority: 2,
    guardrail: 'SAFE-03',
    tags: ['readiness', 'fatigue', 'deload'],
  },
  {
    id: 'principle-limitation-aware-substitution',
    title: 'Limitation-Aware Substitution',
    description: 'Substitution should keep session intent while avoiding limitation-conflicting movement patterns.',
    priority: 3,
    guardrail: 'SAFE-02',
    tags: ['limitations', 'pain', 'substitution'],
  },
  {
    id: 'principle-fatigue-guardrail',
    title: 'Fatigue Guardrail',
    description: 'Escalating fatigue signals require explicit caution messaging and a prudent forecast for the next session.',
    priority: 4,
    guardrail: 'SAFE-03',
    tags: ['fatigue', 'forecast', 'prudence'],
  },
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function validateCorpusEntries(entries: CorpusEntry[]): string[] {
  const errors: string[] = [];
  const seenUrls = new Set<string>();

  for (const entry of entries) {
    const prefix = `entry:${entry.id}`;
    if (!isNonEmptyString(entry.url)) {
      errors.push(`${prefix}: missing required field "url"`);
    }
    if (!isNonEmptyString(entry.date)) {
      errors.push(`${prefix}: missing required field "date"`);
    }
    if (!isNonEmptyString(entry.source_type)) {
      errors.push(`${prefix}: missing required field "source_type"`);
    }
    if (!isNonEmptyString(entry.evidence_level)) {
      errors.push(`${prefix}: missing required field "evidence_level"`);
    }
    if (!Array.isArray(entry.tags) || entry.tags.length === 0) {
      errors.push(`${prefix}: tags must contain at least one token`);
    }

    const normalizedUrl = normalizeToken(entry.url);
    if (seenUrls.has(normalizedUrl)) {
      errors.push(`${prefix}: duplicate detected for url "${entry.url}"`);
    } else {
      seenUrls.add(normalizedUrl);
    }
  }

  return errors;
}

function detectContradictions(principles: Principle[]): string[] {
  const warnings: string[] = [];

  const hasReadinessFirst = principles.some((item) => item.id === 'principle-readiness-first');
  const hasAggressiveProgression = principles.some((item) => /aggressive|maximal/i.test(item.description));
  if (hasReadinessFirst && hasAggressiveProgression) {
    warnings.push('Potential contradiction: readiness-first principle conflicts with aggressive progression language.');
  }

  const conflictingGuardrails = principles.filter((item) => item.guardrail === 'SAFE-01' && /substitution/i.test(item.title));
  if (conflictingGuardrails.length > 0) {
    warnings.push('Potential contradiction: substitution principle mapped to SAFE-01 instead of SAFE-02.');
  }

  return warnings;
}

async function loadJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

async function runCheck(indexPath: string, principlesPath: string): Promise<void> {
  const index = await loadJsonFile<CorpusIndex>(indexPath);
  const principles = await loadJsonFile<PrincipleIndex>(principlesPath);
  const errors = validateCorpusEntries(index.entries);
  const warnings = detectContradictions(principles.principles);

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`[ERROR] ${error}`);
    }
    process.exit(1);
  }

  for (const warning of warnings) {
    console.warn(`[WARN] ${warning}`);
  }

  console.log(
    `[OK] Corpus metadata check passed (${index.entries.length} entries, ${principles.principles.length} principles).`,
  );
}

async function runRefresh(indexPath: string, principlesPath: string): Promise<void> {
  const now = new Date().toISOString();
  const indexPayload: CorpusIndex = {
    version: now.slice(0, 10),
    generated_at: now,
    entries: CURATED_ENTRIES,
  };
  const principlesPayload: PrincipleIndex = {
    version: now.slice(0, 10),
    generated_at: now,
    principles: CURATED_PRINCIPLES,
  };

  const errors = validateCorpusEntries(indexPayload.entries);
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`[ERROR] ${error}`);
    }
    process.exit(1);
  }

  const warnings = detectContradictions(principlesPayload.principles);
  for (const warning of warnings) {
    console.warn(`[WARN] ${warning}`);
  }

  await mkdir(path.dirname(indexPath), { recursive: true });
  await writeFile(indexPath, JSON.stringify(indexPayload, null, 2) + '\n', 'utf8');
  await writeFile(principlesPath, JSON.stringify(principlesPayload, null, 2) + '\n', 'utf8');

  console.log(`[OK] Refreshed adaptive corpus artifacts:
- ${path.relative(process.cwd(), indexPath)}
- ${path.relative(process.cwd(), principlesPath)}`);
}

async function main() {
  const root = process.cwd();
  const indexPath = path.join(root, '.planning/knowledge/adaptive-coaching/index.json');
  const principlesPath = path.join(root, '.planning/knowledge/adaptive-coaching/principles.json');
  const isCheck = process.argv.includes('--check');

  if (isCheck) {
    await runCheck(indexPath, principlesPath);
    return;
  }

  await runRefresh(indexPath, principlesPath);
}

main().catch((error) => {
  console.error('[ERROR] refresh-corpus failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
