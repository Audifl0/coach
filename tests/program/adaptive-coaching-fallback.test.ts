import assert from 'node:assert/strict';
import test from 'node:test';

import type { AdaptiveRecommendation } from '../../src/lib/adaptive-coaching/policy';
import { resolveAdaptiveRecommendationPolicy } from '../../src/server/services/adaptive-coaching-policy';

function buildRecommendation(overrides: Partial<AdaptiveRecommendation> = {}): AdaptiveRecommendation {
  return {
    actionType: 'progress',
    deltaLoadPct: 0.03,
    deltaRep: 1,
    substitutionExerciseKey: null,
    movementTags: ['horizontal_push'],
    equipmentTags: ['dumbbells'],
    ...overrides,
  };
}

test('invalid or low-confidence recommendation triggers fallback path', () => {
  const result = resolveAdaptiveRecommendationPolicy({
    candidateRecommendation: buildRecommendation({
      actionType: 'progress',
      deltaLoadPct: 0.04,
      deltaRep: 1,
    }),
    modelConfidence: 0.2,
    contextQuality: 0.9,
    lastAppliedRecommendation: null,
  });

  assert.equal(result.usedFallback, true);
  assert.equal(result.recommendation.actionType, 'hold');
  assert.equal(result.prudenceForecast, true);
  assert.equal(result.fallbackReasonCode, 'conservative_hold');
});

test('fallback reuses last recommendation only when it already passes SAFE-01 bounds', () => {
  const conservativeLastApplied = buildRecommendation({
    actionType: 'progress',
    deltaLoadPct: 0.03,
    deltaRep: 1,
  });

  const result = resolveAdaptiveRecommendationPolicy({
    candidateRecommendation: buildRecommendation({
      actionType: 'progress',
      deltaLoadPct: 0.05,
      deltaRep: 2,
    }),
    modelConfidence: 0.1,
    contextQuality: 0.6,
    lastAppliedRecommendation: conservativeLastApplied,
  });

  assert.equal(result.usedFallback, true);
  assert.equal(result.recommendation.actionType, 'progress');
  assert.equal(result.recommendation.deltaLoadPct, 0.03);
  assert.equal(result.fallbackReasonCode, 'reuse_last_conservative');
});

test('missing or unsafe reuse candidate falls back to conservative hold with prudence flag', () => {
  const unsafeLastApplied = buildRecommendation({
    actionType: 'progress',
    deltaLoadPct: 0.2,
    deltaRep: 5,
  });

  const result = resolveAdaptiveRecommendationPolicy({
    candidateRecommendation: null,
    modelConfidence: null,
    contextQuality: 0.3,
    lastAppliedRecommendation: unsafeLastApplied,
  });

  assert.equal(result.usedFallback, true);
  assert.equal(result.recommendation.actionType, 'hold');
  assert.equal(result.recommendation.deltaLoadPct, 0);
  assert.equal(result.recommendation.deltaRep, 0);
  assert.equal(result.fallbackReasonCode, 'conservative_hold');
  assert.equal(result.prudenceForecast, true);
});
