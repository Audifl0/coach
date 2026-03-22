import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadCoachKnowledgeBible, renderCoachKnowledgeBibleForPrompt } from '../../src/lib/coach/knowledge-bible';
import { loadPublishedDoctrine, renderPublishedDoctrineForPrompt } from '../../src/lib/coach/published-doctrine';

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

test('runtime doctrine loader reads published doctrine principles only', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'coach-bible-published-'));
  const snapshotDir = path.join(rootDir, 'snapshots', 'run-active', 'validated');
  await mkdir(snapshotDir, { recursive: true });

  await writeJson(path.join(snapshotDir, 'knowledge-bible.json'), {
    publishedDoctrine: {
      principles: [
        {
          principleId: 'p_doctrine',
          statementFr: 'Conserver une surcharge progressive prudente.',
          conditionsFr: ['Fatigue persistante', 'Technique stable'],
          limitsFr: ['Ne pas accélérer sous douleur aiguë'],
          confidenceLevel: 'moderate',
          questionIds: ['q_progression'],
          studyIds: ['study_safe_1', 'study_safe_2'],
          revisionStatus: 'published',
        },
      ],
    },
    questionSynthesisDossiers: [
      {
        questionId: 'q_progression',
        synthesis: 'Raw dossier content that must not enter runtime doctrine.',
        unresolvedContradictions: ['questionable signal'],
      },
    ],
    studyCards: [
      {
        recordId: 'study_safe_1',
        langueFr: {
          titreFr: 'Study dossier',
          resumeFr: 'Raw study dossier content that must not enter runtime doctrine.',
        },
      },
    ],
  });
  await writeJson(path.join(rootDir, 'active.json'), {
    snapshotId: 'run-active',
    snapshotDir,
    promotedAt: '2026-03-05T00:00:00.000Z',
  });

  const doctrine = loadPublishedDoctrine({
    knowledgeRootDir: rootDir,
  });

  assert.equal(doctrine.snapshotId, 'run-active');
  assert.equal(doctrine.principles.length, 1);
  assert.deepEqual(doctrine.principles[0], {
    id: 'p_doctrine',
    statement: 'Conserver une surcharge progressive prudente.',
    conditions: ['Fatigue persistante', 'Technique stable'],
    limits: ['Ne pas accélérer sous douleur aiguë'],
    confidenceLevel: 'moderate',
    provenance: ['q_progression', 'study_safe_1', 'study_safe_2'],
  });
});

test('runtime doctrine loader excludes unresolved question dossiers and raw study dossiers', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'coach-bible-boundary-'));
  const snapshotDir = path.join(rootDir, 'snapshots', 'run-active', 'validated');
  await mkdir(snapshotDir, { recursive: true });

  await writeJson(path.join(snapshotDir, 'knowledge-bible.json'), {
    publishedDoctrine: {
      principles: [
        {
          principleId: 'p_boundary',
          statementFr: 'Utiliser des montées de charge prudentes.',
          conditionsFr: ['Récupération acceptable'],
          limitsFr: ['Réévaluer si douleur'],
          confidenceLevel: 'low',
          questionIds: ['q_boundary'],
          studyIds: ['study_boundary_1'],
          revisionStatus: 'published',
        },
      ],
    },
    questionSynthesisDossiers: [
      {
        questionId: 'q_boundary',
        synthesis: 'UNRESOLVED DOSSIER SHOULD NOT APPEAR',
      },
    ],
    studyCards: [
      {
        recordId: 'study_boundary_1',
        langueFr: {
          titreFr: 'Raw study title',
          resumeFr: 'RAW STUDY DOSSIER SHOULD NOT APPEAR',
        },
      },
    ],
  });
  await writeJson(path.join(rootDir, 'active.json'), {
    snapshotId: 'run-active',
    snapshotDir,
    promotedAt: '2026-03-05T00:00:00.000Z',
  });

  const prompt = renderPublishedDoctrineForPrompt({
    doctrine: loadPublishedDoctrine({ knowledgeRootDir: rootDir }),
  });

  assert.match(prompt, /p_boundary/);
  assert.match(prompt, /Confidence: low/);
  assert.match(prompt, /Conditions: Récupération acceptable/);
  assert.match(prompt, /Limits: Réévaluer si douleur/);
  assert.doesNotMatch(prompt, /UNRESOLVED DOSSIER SHOULD NOT APPEAR/);
  assert.doesNotMatch(prompt, /RAW STUDY DOSSIER SHOULD NOT APPEAR/);
  assert.doesNotMatch(prompt, /Raw study title/);
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
