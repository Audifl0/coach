import assert from 'node:assert/strict';
import test from 'node:test';

import { getActiveSourceCatalog, getDoctrineEligibleSourceTiers } from '../../scripts/adaptive-knowledge/source-catalog';

test('source catalog exposes academic and professional tiers separately', () => {
  const catalog = getActiveSourceCatalog();

  assert.ok(catalog.some((source) => source.tier === 'academic-primary'));
  assert.ok(catalog.some((source) => source.tier === 'professional-secondary'));
});

test('source catalog admissibility excludes suspended sources from active catalog', () => {
  const catalog = getActiveSourceCatalog();

  assert.ok(catalog.length > 0);
  assert.ok(catalog.every((source) => source.status === 'active'));
});

test('doctrine eligibility excludes lower-trust source tiers', () => {
  assert.deepEqual(getDoctrineEligibleSourceTiers(), ['academic-primary', 'academic-secondary']);
});

test('source catalog returns isolated entries so mutations do not leak across calls', () => {
  const firstCatalog = getActiveSourceCatalog();
  const secondCatalog = getActiveSourceCatalog();

  firstCatalog[0].tier = 'professional-secondary';
  firstCatalog[0].capabilities.push('fulltext');

  assert.equal(secondCatalog[0].tier, 'academic-primary');
  assert.deepEqual(secondCatalog[0].capabilities, ['metadata', 'abstract']);
});
