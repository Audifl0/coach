import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import {
  buildAdaptiveKnowledgeDiscoveryResearchFronts,
  buildResearchFront,
  loadResearchFronts,
  markResearchFrontActive,
  markResearchFrontArchived,
  markResearchFrontBlocked,
  markResearchFrontCooldown,
  markResearchFrontDeferred,
  markResearchFrontExhausted,
  upsertResearchFronts,
} from '../../scripts/adaptive-knowledge/registry/research-fronts';

async function loadJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}

test('research fronts persist cursor progress and cooldown metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'adaptive-research-fronts-'));
  const front = buildResearchFront({
    id: 'front-1',
    source: 'pubmed',
    queryFamily: 'progression-load',
    topicKey: 'progression',
    query: 'load progression resistance training',
  });

  await upsertResearchFronts(root, [front]);
  await markResearchFrontCooldown(root, {
    id: 'front-1',
    reason: 'duplicate-heavy',
    until: '2026-03-30T00:00:00.000Z',
    pageCursor: { page: 3, nextCursor: 'cursor-3' },
    evidence: { pagesVisited: 3, reformulationsTried: 1, sourcesVisited: 1 },
  });

  const fronts = await loadResearchFronts(root);
  assert.equal(fronts.length, 1);
  assert.equal(fronts[0]?.status, 'cooldown');
  assert.equal(fronts[0]?.statusReason, 'duplicate-heavy');
  assert.equal(fronts[0]?.cooldownReason, 'duplicate-heavy');
  assert.equal(fronts[0]?.cooldownUntil, '2026-03-30T00:00:00.000Z');
  assert.deepEqual(fronts[0]?.pageCursor, { page: 3, nextCursor: 'cursor-3' });
  assert.deepEqual(fronts[0]?.evidence, { pagesVisited: 3, reformulationsTried: 1, sourcesVisited: 1 });
});

test('research fronts load in deterministic order and preserve explicit status reasons across lifecycle transitions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'adaptive-research-fronts-order-'));

  await upsertResearchFronts(root, [
    buildResearchFront({
      id: 'front-z',
      source: 'crossref',
      queryFamily: 'fatigue-management',
      topicKey: 'fatigue-readiness',
      query: 'fatigue management resistance training recovery monitoring',
    }),
    buildResearchFront({
      id: 'front-a',
      source: 'pubmed',
      queryFamily: 'progression-load',
      topicKey: 'progression',
      query: 'resistance training load progression hypertrophy strength',
    }),
  ]);

  await markResearchFrontBlocked(root, { id: 'front-z', reason: 'source-temporarily-cold' });
  await markResearchFrontDeferred(root, { id: 'front-a', reason: 'waiting-for-downstream-capacity' });
  await markResearchFrontActive(root, {
    id: 'front-a',
    reason: 'manual-requeue',
    pageCursor: { page: 1, nextCursor: 'resume-1' },
    evidence: { pagesVisited: 1, reformulationsTried: 0, sourcesVisited: 1 },
  });
  await markResearchFrontArchived(root, {
    id: 'front-z',
    reason: 'captured-in-synthesis',
    pageCursor: { page: 4, nextCursor: null },
    evidence: { pagesVisited: 4, reformulationsTried: 1, sourcesVisited: 1 },
  });

  const fronts = await loadResearchFronts(root);
  assert.deepEqual(
    fronts.map((front) => front.id),
    ['front-a', 'front-z'],
  );
  assert.equal(fronts[0]?.status, 'active');
  assert.equal(fronts[0]?.statusReason, 'manual-requeue');
  assert.deepEqual(fronts[0]?.pageCursor, { page: 1, nextCursor: 'resume-1' });
  assert.equal(fronts[1]?.status, 'archived');
  assert.equal(fronts[1]?.statusReason, 'captured-in-synthesis');
  assert.deepEqual(fronts[1]?.pageCursor, { page: 4, nextCursor: null });
  assert.deepEqual(fronts[1]?.evidence, { pagesVisited: 4, reformulationsTried: 1, sourcesVisited: 1 });
});

test('discovery research fronts are seeded durably and duplicate fronts are not regenerated', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'adaptive-research-fronts-seed-'));

  const seeded = buildAdaptiveKnowledgeDiscoveryResearchFronts({
    sources: ['pubmed', 'crossref'],
    maxFronts: 4,
  });

  assert.equal(seeded.length, 4);
  assert.equal(new Set(seeded.map((front) => front.id)).size, seeded.length);
  assert.ok(seeded.every((front) => front.status === 'active'));
  assert.ok(seeded.every((front) => front.sourceTier.length > 0));

  await upsertResearchFronts(root, seeded);
  const repeated = buildAdaptiveKnowledgeDiscoveryResearchFronts({
    sources: ['pubmed', 'crossref'],
    maxFronts: 4,
    existingFronts: await loadResearchFronts(root),
  });

  assert.equal(repeated.length, 0);

  const persisted = await loadResearchFronts(root);
  assert.equal(persisted.length, 4);
  assert.ok(persisted.every((front) => front.sourceMetadata?.status === 'active'));

  const onDisk = (await loadJson(path.join(root, 'registry', 'research-fronts.json'))) as {
    items: Array<{ sourceTier?: string; sourceMetadata?: { tier?: string } }>;
  };
  assert.equal(onDisk.items.length, 4);
  assert.ok(onDisk.items.every((front) => front.sourceTier || front.sourceMetadata?.tier));
});

test('corrupt research front registry contents are not treated as empty', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'adaptive-research-fronts-corrupt-'));
  const registryDir = path.join(root, 'registry');
  const registryPath = path.join(registryDir, 'research-fronts.json');

  await mkdir(registryDir, { recursive: true });
  await writeFile(registryPath, '{"items":[', 'utf8');

  await assert.rejects(() => loadResearchFronts(root), SyntaxError);
});
