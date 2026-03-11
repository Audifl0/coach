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

test('coach knowledge bible prompt renderer includes principles and sources', () => {
  const prompt = renderCoachKnowledgeBibleForPrompt({
    bible: {
      snapshotId: 'snap_1',
      principles: [
        {
          id: 'p1',
          title: 'Readiness first',
          description: 'Prioritize readiness before intensity.',
          guardrail: 'SAFE-03',
          tags: ['readiness', 'fatigue'],
        },
      ],
      sources: [
        {
          id: 's1',
          title: 'Fatigue review',
          summary: 'Fatigue trends justify conservative progression.',
          sourceClass: 'review',
          tags: ['fatigue'],
        },
      ],
    },
  });

  assert.match(prompt, /snapshot=snap_1/);
  assert.match(prompt, /p1: Readiness first/);
  assert.match(prompt, /s1 \[review\]/);
});
