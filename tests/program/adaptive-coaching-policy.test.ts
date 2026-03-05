import assert from 'node:assert/strict';
import test from 'node:test';

import { applyAdaptiveSafetyPolicy } from '../../src/lib/adaptive-coaching/policy';

test('clamps progress proposals above conservative load/rep bounds', () => {
  const result = applyAdaptiveSafetyPolicy({
    recommendation: {
      actionType: 'progress',
      deltaLoadPct: 0.25,
      deltaRep: 6,
      movementTags: ['horizontal_push'],
      equipmentTags: ['dumbbells'],
    },
    athleteContext: {
      limitations: [],
      painFlags: [],
    },
  });

  assert.equal(result.normalizedRecommendation.deltaLoadPct, 0.05);
  assert.equal(result.normalizedRecommendation.deltaRep, 2);
});

test('clamps excessive negative regression for conservative deload floor', () => {
  const result = applyAdaptiveSafetyPolicy({
    recommendation: {
      actionType: 'deload',
      deltaLoadPct: -0.3,
      deltaRep: -8,
      movementTags: ['hinge'],
      equipmentTags: ['barbell'],
    },
    athleteContext: {
      limitations: [],
      painFlags: [],
    },
  });

  assert.equal(result.normalizedRecommendation.deltaLoadPct, -0.05);
  assert.equal(result.normalizedRecommendation.deltaRep, -2);
});

test('retains substitution action while bounding progression parameters', () => {
  const result = applyAdaptiveSafetyPolicy({
    recommendation: {
      actionType: 'substitution',
      substitutionExerciseKey: 'goblet_squat',
      deltaLoadPct: 0.12,
      deltaRep: 5,
      movementTags: ['squat'],
      equipmentTags: ['dumbbells'],
    },
    athleteContext: {
      limitations: [],
      painFlags: [],
    },
  });

  assert.equal(result.normalizedRecommendation.actionType, 'substitution');
  assert.equal(result.normalizedRecommendation.substitutionExerciseKey, 'goblet_squat');
  assert.equal(result.normalizedRecommendation.deltaLoadPct, 0.05);
  assert.equal(result.normalizedRecommendation.deltaRep, 2);
});
