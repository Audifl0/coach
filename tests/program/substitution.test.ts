import assert from 'node:assert/strict';
import test from 'node:test';

import { getSubstitutionCandidates } from '../../src/lib/program/substitution';

test('returns at most top 3 substitution candidates', () => {
  const candidates = getSubstitutionCandidates({
    plannedExerciseKey: 'goblet_squat',
    equipmentCategories: ['bodyweight', 'dumbbells', 'bench', 'machines'],
    limitations: [],
  });

  assert.equal(candidates.length, 3);
});

test('excludes candidates blocked by declared limitations', () => {
  const candidates = getSubstitutionCandidates({
    plannedExerciseKey: 'goblet_squat',
    equipmentCategories: ['bodyweight', 'dumbbells', 'bench', 'machines'],
    limitations: [{ zone: 'knee', severity: 'severe', temporality: 'temporary' }],
  });

  assert.equal(candidates.length, 0);
});

test('excludes candidates requiring unavailable equipment', () => {
  const candidates = getSubstitutionCandidates({
    plannedExerciseKey: 'goblet_squat',
    equipmentCategories: ['dumbbells'],
    limitations: [],
  });

  assert.deepEqual(candidates.map((entry) => entry.exerciseKey), []);
});

test('excludes candidates with incompatible movement pattern metadata', () => {
  const candidates = getSubstitutionCandidates({
    plannedExerciseKey: 'dumbbell_bench_press',
    equipmentCategories: ['machines'],
    limitations: [],
    overrideCandidateKeys: ['seated_cable_row', 'machine_chest_press'],
  });

  assert.deepEqual(candidates.map((entry) => entry.exerciseKey), ['machine_chest_press']);
});
