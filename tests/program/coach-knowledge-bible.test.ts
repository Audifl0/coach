import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadCoachKnowledgeBible, renderCoachKnowledgeBibleForPrompt } from '../../src/lib/coach/knowledge-bible';

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

test('coach knowledge bible loads validated entries and normalizes principle variants', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'coach-bible-'));
  const snapshotDir = path.join(rootDir, 'snapshots', 'run-active', 'validated');
  await mkdir(snapshotDir, { recursive: true });

  await writeJson(path.join(snapshotDir, 'sources.json'), {
    records: [
      {
        id: 'guideline-1',
        sourceType: 'guideline',
        sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/1/',
        sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
        publishedAt: '2026-01-01',
        title: 'Fatigue guideline',
        summaryEn: 'Use conservative overload when fatigue rises.',
        tags: ['fatigue', 'progression'],
        provenanceIds: ['guideline-1'],
      },
    ],
  });
  await writeJson(path.join(snapshotDir, 'principles.json'), {
    principles: [
      {
        id: 'p_safe',
        title: 'Safe progression',
        summaryFr: 'Conserver une progression prudente.',
        guidanceFr: 'Limiter les hausses de charge si la fatigue monte.',
        provenanceRecordIds: ['guideline-1'],
        evidenceLevel: 'guideline',
        guardrail: 'SAFE-01',
      },
    ],
  });
  await writeJson(path.join(rootDir, 'active.json'), {
    snapshotId: 'run-active',
    snapshotDir,
    promotedAt: '2026-03-05T00:00:00.000Z',
  });

  const bible = loadCoachKnowledgeBible({
    knowledgeRootDir: rootDir,
    queryTags: ['fatigue'],
  });

  assert.equal(bible.snapshotId, 'run-active');
  assert.equal(bible.principles.length, 1);
  assert.equal(bible.principles[0]?.id, 'p_safe');
  assert.match(bible.principles[0]?.description ?? '', /progression prudente/i);
  assert.equal(bible.sources.length, 1);
  assert.equal(bible.sources[0]?.id, 'guideline-1');
});

test('coach knowledge bible prefers published knowledge-bible artifact when available', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'coach-bible-'));
  const snapshotDir = path.join(rootDir, 'snapshots', 'run-active', 'validated');
  await mkdir(snapshotDir, { recursive: true });

  await writeJson(path.join(snapshotDir, 'knowledge-bible.json'), {
    principles: [
      {
        id: 'p_curated',
        title: 'Curated progression',
        description: 'Use curated evidence to keep overload conservative.',
        guardrail: 'SAFE-03',
        tags: ['progression', 'fatigue'],
      },
    ],
    sources: [
      {
        id: 's_curated',
        title: 'Curated source',
        summary: 'Curated knowledge summary.',
        sourceClass: 'review',
        tags: ['progression'],
      },
    ],
  });
  await writeJson(path.join(rootDir, 'active.json'), {
    snapshotId: 'run-active',
    snapshotDir,
    promotedAt: '2026-03-05T00:00:00.000Z',
  });

  const bible = loadCoachKnowledgeBible({
    knowledgeRootDir: rootDir,
    queryTags: ['progression'],
  });

  assert.equal(bible.snapshotId, 'run-active');
  assert.equal(bible.principles[0]?.id, 'p_curated');
  assert.equal(bible.sources[0]?.id, 's_curated');
});

test('loadCoachKnowledgeBible loads enriched thematic principles and study card sources', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'coach-bible-enriched-'));
  const snapshotDir = path.join(rootDir, 'snapshots', 'run-enriched', 'validated');
  await mkdir(snapshotDir, { recursive: true });

  await writeJson(path.join(snapshotDir, 'knowledge-bible.json'), {
    principles: [
      {
        id: 'p_legacy',
        title: 'Legacy principle',
        description: 'Legacy snapshot data still exists.',
        guardrail: 'SAFE-01',
        tags: ['legacy'],
      },
    ],
    sources: [
      {
        id: 's_legacy',
        title: 'Legacy source',
        summary: 'Legacy source summary.',
        sourceClass: 'review',
        tags: ['legacy'],
      },
    ],
    thematicSyntheses: [
      {
        id: 'theme_progression',
        principlesFr: [
          {
            id: 'p_theme_1',
            title: 'Progression gouvernée par la récupération',
            statement: 'La progression doit rester subordonnée aux signaux de récupération.',
            conditions: ['Fatigue persistante', 'Sommeil dégradé'],
            evidenceLevel: 'moderate',
            sourceCardIds: ['study_2024_1'],
            guardrail: 'SAFE-03',
          },
        ],
      },
    ],
    studyCards: [
      {
        recordId: 'study_2024_1',
        langueFr: {
          titreFr: 'Revue de la fatigue',
          resumeFr: 'Les marqueurs de fatigue justifient une progression prudente.',
        },
        practicalTakeaways: ['Réduire la charge si la fatigue s’accumule', 'Confirmer la reprise avant de progresser'],
        year: 2024,
        journal: 'Sports Medicine',
        doi: '10.1000/fatigue.2024.1',
      },
    ],
  });
  await writeJson(path.join(rootDir, 'active.json'), {
    snapshotId: 'run-enriched',
    snapshotDir,
    promotedAt: '2026-03-05T00:00:00.000Z',
  });

  const bible = loadCoachKnowledgeBible({
    knowledgeRootDir: rootDir,
    queryTags: ['fatigue'],
    principleLimit: 6,
    sourceLimit: 8,
  });

  assert.equal(bible.snapshotId, 'run-enriched');
  assert.equal(bible.principles.some((principle) => principle.id === 'p_theme_1'), true);
  const enrichedPrinciple = bible.principles.find((principle) => principle.id === 'p_theme_1');
  assert.equal(enrichedPrinciple?.description, 'La progression doit rester subordonnée aux signaux de récupération.');
  assert.deepEqual(enrichedPrinciple?.conditions, ['Fatigue persistante', 'Sommeil dégradé']);
  assert.equal(enrichedPrinciple?.evidenceLevel, 'moderate');
  assert.deepEqual(enrichedPrinciple?.sourceCardIds, ['study_2024_1']);
  assert.equal(enrichedPrinciple?.guardrail, 'SAFE-03');

  assert.equal(bible.sources.some((source) => source.id === 'study_2024_1'), true);
  const enrichedSource = bible.sources.find((source) => source.id === 'study_2024_1');
  assert.equal(enrichedSource?.title, 'Revue de la fatigue');
  assert.match(enrichedSource?.summary ?? '', /progression prudente/i);
  assert.deepEqual(enrichedSource?.practicalTakeaways, [
    'Réduire la charge si la fatigue s’accumule',
    'Confirmer la reprise avant de progresser',
  ]);
  assert.equal(enrichedSource?.year, 2024);
  assert.equal(enrichedSource?.journal, 'Sports Medicine');
  assert.equal(enrichedSource?.doi, '10.1000/fatigue.2024.1');
});

test('renderCoachKnowledgeBibleForPrompt includes conditions and practical takeaways when present', () => {
  const prompt = renderCoachKnowledgeBibleForPrompt({
    bible: {
      snapshotId: 'snap_enriched',
      principles: [
        {
          id: 'p1',
          title: 'Readiness first',
          description: 'Prioritize readiness before intensity.',
          conditions: ['High soreness', 'Poor sleep'],
          evidenceLevel: 'moderate',
          sourceCardIds: ['s1'],
          guardrail: 'SAFE-03',
          tags: ['readiness', 'fatigue'],
        },
      ],
      sources: [
        {
          id: 's1',
          title: 'Fatigue review',
          summary: 'Fatigue trends justify conservative progression.',
          practicalTakeaways: ['Trim load when fatigue persists', 'Rebuild after recovery'],
          sourceClass: 'review',
          tags: ['fatigue'],
          year: 2024,
          journal: 'Sports Medicine',
          doi: '10.1000/fatigue',
        },
      ],
    },
  });

  assert.match(prompt, /snapshot=snap_enriched/);
  assert.match(prompt, /p1: Readiness first/);
  assert.match(prompt, /Conditions: High soreness; Poor sleep/);
  assert.match(prompt, /s1 \[review\]/);
  assert.match(prompt, /Takeaways: Trim load when fatigue persists; Rebuild after recovery/);
});

test('legacy knowledge-bible snapshots still load and render without enriched fields', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'coach-bible-legacy-'));
  const snapshotDir = path.join(rootDir, 'snapshots', 'run-legacy', 'validated');
  await mkdir(snapshotDir, { recursive: true });

  await writeJson(path.join(snapshotDir, 'knowledge-bible.json'), {
    principles: [
      {
        id: 'p_legacy',
        title: 'Legacy progression',
        description: 'Keep progression conservative.',
        guardrail: 'SAFE-02',
        tags: ['progression'],
      },
    ],
    sources: [
      {
        id: 's_legacy',
        title: 'Legacy source',
        summary: 'Legacy summary only.',
        sourceClass: 'guideline',
        tags: ['progression'],
      },
    ],
  });
  await writeJson(path.join(rootDir, 'active.json'), {
    snapshotId: 'run-legacy',
    snapshotDir,
    promotedAt: '2026-03-05T00:00:00.000Z',
  });

  const bible = loadCoachKnowledgeBible({
    knowledgeRootDir: rootDir,
    queryTags: ['progression'],
  });

  assert.equal(bible.snapshotId, 'run-legacy');
  assert.equal(bible.principles[0]?.id, 'p_legacy');
  assert.equal(Array.isArray(bible.principles[0]?.conditions) ? bible.principles[0]?.conditions.length : 0, 0);
  assert.equal(bible.sources[0]?.id, 's_legacy');
  assert.equal(Array.isArray(bible.sources[0]?.practicalTakeaways) ? bible.sources[0]?.practicalTakeaways.length : 0, 0);

  const prompt = renderCoachKnowledgeBibleForPrompt({ bible });
  assert.match(prompt, /p_legacy: Legacy progression/);
  assert.doesNotMatch(prompt, /Conditions:/);
  assert.match(prompt, /s_legacy \[guideline\]/);
  assert.doesNotMatch(prompt, /Takeaways:/);
});
