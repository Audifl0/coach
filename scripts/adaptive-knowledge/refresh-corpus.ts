import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  parseCorpusPrinciple,
  parseCorpusRunReport,
  parseCorpusSnapshotManifest,
  parseNormalizedEvidenceRecord,
  type CorpusPrinciple,
  type NormalizedEvidenceRecord,
} from './contracts';
import { parseAdaptiveKnowledgePipelineConfig } from './config';

type LegacyCorpusEntry = {
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

type LegacyPrinciple = {
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
  entries: LegacyCorpusEntry[];
};

type PrincipleIndex = {
  version: string;
  generated_at: string;
  principles: LegacyPrinciple[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function extractDomain(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

function ageInDays(dateIso: string, now: Date): number {
  const publishedAt = Date.parse(dateIso);
  return Math.max(0, Math.floor((now.getTime() - publishedAt) / DAY_MS));
}

function withinFreshnessWindow(record: NormalizedEvidenceRecord, now: Date, windowDays: number): boolean {
  const age = ageInDays(record.publishedAt, now);
  return Number.isFinite(age) && age >= 0 && age <= windowDays;
}

function mapLegacyEntryToNormalized(entry: LegacyCorpusEntry): NormalizedEvidenceRecord {
  return parseNormalizedEvidenceRecord({
    id: entry.id,
    sourceType: entry.source_type,
    sourceUrl: entry.url,
    sourceDomain: extractDomain(entry.url),
    publishedAt: entry.date,
    title: entry.title,
    summaryEn: entry.summary,
    tags: entry.tags,
    provenanceIds: entry.principle_ids,
  });
}

function mapNormalizedToLegacy(entry: NormalizedEvidenceRecord, now: Date): LegacyCorpusEntry {
  return {
    id: entry.id,
    title: entry.title,
    url: entry.sourceUrl,
    date: entry.publishedAt,
    source_type: entry.sourceType,
    evidence_level: 'curated_consensus',
    freshness_days: ageInDays(entry.publishedAt, now),
    tags: [...entry.tags],
    summary: entry.summaryEn,
    principle_ids: [...entry.provenanceIds],
  };
}

function mapLegacyPrincipleToContract(principle: LegacyPrinciple, fallbackSourceId: string): CorpusPrinciple {
  return parseCorpusPrinciple({
    id: principle.id,
    title: principle.title,
    summaryFr: principle.description,
    guidanceFr: principle.description,
    provenanceRecordIds: [fallbackSourceId],
    evidenceLevel: 'curated_consensus',
    guardrail: principle.guardrail,
  });
}

function mapContractPrincipleToLegacy(principle: CorpusPrinciple): LegacyPrinciple {
  return {
    id: principle.id,
    title: principle.title,
    description: principle.summaryFr,
    priority: 1,
    guardrail: principle.guardrail,
    tags: [],
  };
}

const CURATED_RECORDS: NormalizedEvidenceRecord[] = [
  parseNormalizedEvidenceRecord({
    id: 'guideline-acsm-progressive-overload-2024',
    sourceType: 'guideline',
    sourceUrl: 'https://www.acsm.org/docs/default-source/files-for-resource-library/resistance-training-progression.pdf',
    sourceDomain: 'acsm.org',
    publishedAt: '2024-01-15',
    title: 'ACSM Resistance Training Progression Framework',
    summaryEn: 'Recommends conservative step-wise overload and readiness-based progression for safety.',
    tags: ['progression', 'load', 'readiness'],
    provenanceIds: ['principle-safe-progressive-overload', 'principle-readiness-first'],
  }),
  parseNormalizedEvidenceRecord({
    id: 'review-fatigue-autoregulation-2023',
    sourceType: 'review',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/37265095/',
    sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
    publishedAt: '2023-08-10',
    title: 'Autoregulation and Fatigue Management in Resistance Training',
    summaryEn: 'Supports hold or deload decisions when fatigue rises and session quality degrades.',
    tags: ['fatigue', 'rpe', 'autoregulation'],
    provenanceIds: ['principle-readiness-first', 'principle-fatigue-guardrail'],
  }),
  parseNormalizedEvidenceRecord({
    id: 'expertise-jts-substitution-2022',
    sourceType: 'expertise',
    sourceUrl: 'https://www.jtsstrength.com/substitution-heuristics-pain-limited-training/',
    sourceDomain: 'jtsstrength.com',
    publishedAt: '2022-11-02',
    title: 'Practical Substitution Heuristics for Pain-Limited Training',
    summaryEn: 'Advises targeted substitutions when pain persists while preserving movement intent.',
    tags: ['substitution', 'pain', 'limitations'],
    provenanceIds: ['principle-limitation-aware-substitution', 'principle-fatigue-guardrail'],
  }),
];

const CURATED_PRINCIPLES: CorpusPrinciple[] = [
  parseCorpusPrinciple({
    id: 'principle-safe-progressive-overload',
    title: 'Safe Progressive Overload',
    summaryFr: 'Progression conservative priorisant la qualite d execution.',
    guidanceFr: 'Augmenter la charge uniquement si recuperation et technique restent stables.',
    provenanceRecordIds: ['guideline-acsm-progressive-overload-2024'],
    evidenceLevel: 'guideline',
    guardrail: 'SAFE-01',
  }),
  parseCorpusPrinciple({
    id: 'principle-readiness-first',
    title: 'Readiness Before Intensity',
    summaryFr: 'La readiness prime sur l intensite quand la fatigue augmente.',
    guidanceFr: 'Basculer vers hold ou deload quand les indicateurs de recuperation se degradent.',
    provenanceRecordIds: [
      'guideline-acsm-progressive-overload-2024',
      'review-fatigue-autoregulation-2023',
    ],
    evidenceLevel: 'review',
    guardrail: 'SAFE-03',
  }),
  parseCorpusPrinciple({
    id: 'principle-limitation-aware-substitution',
    title: 'Limitation-Aware Substitution',
    summaryFr: 'Substituer les mouvements incompatibles avec la limitation du moment.',
    guidanceFr: 'Conserver l intention de seance sans exposer la zone sensible.',
    provenanceRecordIds: ['expertise-jts-substitution-2022'],
    evidenceLevel: 'expertise',
    guardrail: 'SAFE-02',
  }),
  parseCorpusPrinciple({
    id: 'principle-fatigue-guardrail',
    title: 'Fatigue Guardrail',
    summaryFr: 'La fatigue elevee impose une prevision prudente pour la seance suivante.',
    guidanceFr: 'Conserver une marge de securite explicite en cas de signaux de fatigue persistants.',
    provenanceRecordIds: ['review-fatigue-autoregulation-2023'],
    evidenceLevel: 'review',
    guardrail: 'SAFE-03',
  }),
];

async function loadJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

async function runCheck(indexPath: string, principlesPath: string): Promise<void> {
  const config = parseAdaptiveKnowledgePipelineConfig(process.env);
  const now = new Date();
  const index = await loadJsonFile<CorpusIndex>(indexPath);
  const principles = await loadJsonFile<PrincipleIndex>(principlesPath);

  const parsedRecords = index.entries.map(mapLegacyEntryToNormalized).filter((record) => {
    return (
      config.allowedDomains.includes(record.sourceDomain) &&
      withinFreshnessWindow(record, now, config.freshnessWindowDays)
    );
  });

  const fallbackRecordId = parsedRecords[0]?.id ?? 'guideline-acsm-progressive-overload-2024';
  principles.principles.map((principle) => mapLegacyPrincipleToContract(principle, fallbackRecordId));

  const runId = `check-${index.generated_at.slice(0, 10)}`;
  parseCorpusSnapshotManifest({
    snapshotId: index.version,
    schemaVersion: 'v1',
    generatedAt: index.generated_at,
    evidenceRecordCount: parsedRecords.length,
    principleCount: principles.principles.length,
    sourceDomains: [...new Set(parsedRecords.map((record) => record.sourceDomain))],
    artifacts: {
      indexPath: path.relative(process.cwd(), indexPath),
      principlesPath: path.relative(process.cwd(), principlesPath),
      reportPath: '.planning/knowledge/adaptive-coaching/run-report.json',
    },
  });
  parseCorpusRunReport({
    runId,
    mode: 'check',
    startedAt: new Date(now.getTime() - 1000).toISOString(),
    completedAt: now.toISOString(),
    snapshotId: index.version,
    stageReports: [
      { stage: 'discover', status: 'succeeded' },
      { stage: 'ingest', status: 'succeeded' },
      { stage: 'synthesize', status: 'succeeded' },
      { stage: 'validate', status: 'succeeded' },
      { stage: 'publish', status: 'skipped' },
    ],
  });

  console.log(
    `[OK] Corpus metadata check passed (${parsedRecords.length} accepted entries, ${principles.principles.length} principles).`,
  );
}

async function runRefresh(indexPath: string, principlesPath: string): Promise<void> {
  const config = parseAdaptiveKnowledgePipelineConfig(process.env);
  const now = new Date();
  const filteredRecords = CURATED_RECORDS.filter((record) => {
    return (
      config.allowedDomains.includes(record.sourceDomain) &&
      withinFreshnessWindow(record, now, config.freshnessWindowDays)
    );
  });

  const indexPayload: CorpusIndex = {
    version: now.toISOString().slice(0, 10),
    generated_at: now.toISOString(),
    entries: filteredRecords.map((entry) => mapNormalizedToLegacy(entry, now)),
  };

  const principlesPayload: PrincipleIndex = {
    version: indexPayload.version,
    generated_at: now.toISOString(),
    principles: CURATED_PRINCIPLES.map(mapContractPrincipleToLegacy),
  };

  parseCorpusSnapshotManifest({
    snapshotId: indexPayload.version,
    schemaVersion: 'v1',
    generatedAt: indexPayload.generated_at,
    evidenceRecordCount: indexPayload.entries.length,
    principleCount: principlesPayload.principles.length,
    sourceDomains: [...new Set(filteredRecords.map((record) => record.sourceDomain))],
    artifacts: {
      indexPath: path.relative(process.cwd(), indexPath),
      principlesPath: path.relative(process.cwd(), principlesPath),
      reportPath: '.planning/knowledge/adaptive-coaching/run-report.json',
    },
  });
  parseCorpusRunReport({
    runId: `refresh-${indexPayload.version}`,
    mode: 'refresh',
    startedAt: new Date(now.getTime() - 1000).toISOString(),
    completedAt: now.toISOString(),
    snapshotId: indexPayload.version,
    stageReports: [
      { stage: 'discover', status: 'succeeded' },
      { stage: 'ingest', status: 'succeeded' },
      { stage: 'synthesize', status: 'succeeded' },
      { stage: 'validate', status: 'succeeded' },
      { stage: 'publish', status: 'succeeded' },
    ],
  });

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
