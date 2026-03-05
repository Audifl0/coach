import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadActiveAdaptiveEvidenceCorpus } from '../../src/lib/adaptive-coaching/evidence-corpus';
import { retrieveAdaptiveEvidence } from '../../src/lib/adaptive-coaching/evidence';

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

test('evidence retrieval uses entries from active snapshot pointer when available', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-evidence-loader-'));
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
        title: 'Snapshot guideline',
        summaryEn: 'Snapshot summary',
        tags: ['fatigue', 'readiness'],
        provenanceIds: ['guideline-1'],
      },
    ],
  });
  await writeJson(path.join(snapshotDir, 'principles.json'), {
    principles: [
      {
        id: 'p1',
        title: 'Readiness first',
        summaryFr: 'summary',
        guidanceFr: 'guidance',
        provenanceRecordIds: ['guideline-1'],
        evidenceLevel: 'high',
        guardrail: 'SAFE-03',
      },
    ],
  });
  await writeJson(path.join(rootDir, 'active.json'), {
    snapshotId: 'run-active',
    snapshotDir,
    promotedAt: '2026-03-05T00:00:00.000Z',
  });

  const corpus = loadActiveAdaptiveEvidenceCorpus({ knowledgeRootDir: rootDir });
  assert.equal(corpus.snapshotId, 'run-active');

  const evidence = retrieveAdaptiveEvidence({
    queryTags: ['fatigue'],
    topK: 1,
    knowledgeRootDir: rootDir,
  });

  assert.equal(evidence.length, 1);
  assert.equal(evidence[0]?.title, 'Snapshot guideline');
  assert.equal(evidence[0]?.sourceClass, 'guideline');
});

test('invalid active pointer fails closed to last valid snapshot and never reads candidate directories', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-evidence-loader-'));
  const candidateDir = path.join(rootDir, 'snapshots', 'run-candidate', 'candidate');
  const validDir = path.join(rootDir, 'snapshots', 'run-valid', 'validated');
  await mkdir(candidateDir, { recursive: true });
  await mkdir(validDir, { recursive: true });

  await writeJson(path.join(candidateDir, 'sources.json'), {
    records: [
      {
        id: 'candidate-1',
        sourceType: 'review',
        sourceUrl: 'https://doi.org/10.1000/candidate',
        sourceDomain: 'doi.org',
        publishedAt: '2026-01-01',
        title: 'CANDIDATE RECORD',
        summaryEn: 'candidate',
        tags: ['fatigue'],
        provenanceIds: ['candidate-1'],
      },
    ],
  });
  await writeJson(path.join(candidateDir, 'principles.json'), { principles: [] });

  await writeJson(path.join(validDir, 'sources.json'), {
    records: [
      {
        id: 'valid-1',
        sourceType: 'guideline',
        sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/2/',
        sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
        publishedAt: '2026-01-01',
        title: 'VALIDATED RECORD',
        summaryEn: 'validated',
        tags: ['fatigue'],
        provenanceIds: ['valid-1'],
      },
    ],
  });
  await writeJson(path.join(validDir, 'principles.json'), { principles: [] });

  await writeJson(path.join(rootDir, 'active.json'), {
    snapshotId: 'run-candidate',
    snapshotDir: candidateDir,
    promotedAt: '2026-03-05T00:00:00.000Z',
  });
  await writeJson(path.join(rootDir, 'rollback.json'), {
    snapshotId: 'run-valid',
    snapshotDir: validDir,
    promotedAt: '2026-03-04T00:00:00.000Z',
  });

  const corpus = loadActiveAdaptiveEvidenceCorpus({ knowledgeRootDir: rootDir });
  assert.equal(corpus.snapshotId, 'run-valid');

  const evidence = retrieveAdaptiveEvidence({
    queryTags: ['fatigue'],
    topK: 1,
    knowledgeRootDir: rootDir,
  });
  assert.equal(evidence[0]?.title, 'VALIDATED RECORD');
  assert.equal(evidence[0]?.title === 'CANDIDATE RECORD', false);
});

test('cron install helper configures one weekly refresh job', async () => {
  const script = await readFile('infra/scripts/install-adaptive-corpus-cron.sh', 'utf8');
  assert.equal(script.includes('corepack pnpm tsx scripts/adaptive-knowledge/refresh-corpus.ts'), true);
  assert.equal(/@weekly|[0-9*,-/]+\s+[0-9*,-/]+\s+\*\s+\*\s+[0-7,/-]+/.test(script), true);
});
