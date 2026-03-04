import assert from 'node:assert/strict';
import test from 'node:test';

import {
  profileGoalValues,
  profileInputSchema,
  profilePatchSchema,
  sessionDurationValues,
} from '../../src/lib/profile/contracts';

test('profile contracts lock goal and duration value sets', () => {
  assert.deepEqual(profileGoalValues, ['hypertrophy', 'strength', 'recomposition']);
  assert.deepEqual(sessionDurationValues, ['lt_45m', '45_to_75m', 'gt_75m']);
});

test('profile contracts reject invalid goal value', () => {
  const result = profileInputSchema.safeParse({
    goal: 'fat_loss',
    weeklySessionTarget: 4,
    sessionDuration: '45_to_75m',
    equipmentCategories: ['dumbbells'],
    limitationsDeclared: false,
    limitations: [],
  });

  assert.equal(result.success, false);
});

test('profile contracts reject missing first-pass required fields', () => {
  const result = profileInputSchema.safeParse({
    goal: 'strength',
  });

  assert.equal(result.success, false);
});

test('profile contracts accept structured limitations payloads', () => {
  const result = profileInputSchema.safeParse({
    goal: 'recomposition',
    weeklySessionTarget: 3,
    sessionDuration: 'lt_45m',
    equipmentCategories: ['bodyweight', 'bands'],
    limitationsDeclared: true,
    limitations: [
      {
        zone: 'knee',
        severity: 'moderate',
        temporality: 'chronic',
      },
    ],
  });

  assert.equal(result.success, true);
});

test('profile patch schema supports partial updates', () => {
  const result = profilePatchSchema.safeParse({
    equipmentCategories: ['machines'],
  });

  assert.equal(result.success, true);
});
