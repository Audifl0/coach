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

test('flags limitation conflict when recommendation targets constrained movement', () => {
  const result = applyAdaptiveSafetyPolicy({
    recommendation: {
      actionType: 'progress',
      deltaLoadPct: 0.03,
      deltaRep: 1,
      movementTags: ['knee'],
      equipmentTags: ['dumbbells'],
    },
    athleteContext: {
      limitations: [{ zone: 'knee', severity: 'moderate' }],
      painFlags: [],
    },
  });

  assert.equal(result.warnings.limitationConflict, true);
  assert.deepEqual(result.warnings.reasonCodes, ['limitation_conflict']);
  assert.deepEqual(result.warnings.conflictZones, ['knee']);
  assert.equal(result.normalizedRecommendation.actionType, 'progress');
});

test('returns warning metadata while keeping conflict recommendation actionable', () => {
  const result = applyAdaptiveSafetyPolicy({
    recommendation: {
      actionType: 'substitution',
      substitutionExerciseKey: 'leg_press',
      deltaLoadPct: 0.01,
      deltaRep: 0,
      movementTags: ['lower_back'],
      equipmentTags: ['machines'],
    },
    athleteContext: {
      limitations: [{ zone: 'lower_back', severity: 'severe' }],
      painFlags: ['knee'],
    },
  });

  assert.equal(result.warnings.limitationConflict, true);
  assert.deepEqual(result.warnings.reasonCodes, ['limitation_conflict']);
  assert.deepEqual(result.warnings.conflictZones, ['lower_back']);
  assert.equal(result.normalizedRecommendation.actionType, 'substitution');
  assert.equal(result.normalizedRecommendation.substitutionExerciseKey, 'leg_press');
});

test('emits empty warning envelope when no limitation or pain conflict is found', () => {
  const result = applyAdaptiveSafetyPolicy({
    recommendation: {
      actionType: 'hold',
      deltaLoadPct: 0,
      deltaRep: 0,
      movementTags: ['horizontal_push'],
      equipmentTags: ['dumbbells'],
    },
    athleteContext: {
      limitations: [{ zone: 'knee', severity: 'mild' }],
      painFlags: ['ankle'],
    },
  });

  assert.equal(result.warnings.limitationConflict, false);
  assert.deepEqual(result.warnings.reasonCodes, []);
  assert.deepEqual(result.warnings.conflictZones, []);
});
