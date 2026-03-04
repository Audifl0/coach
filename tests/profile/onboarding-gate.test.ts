import assert from 'node:assert/strict';
import test from 'node:test';

import { isProfileComplete } from '../../src/lib/profile/completeness';

test('profile completeness handles explicit none limitation state', () => {
  const complete = isProfileComplete({
    userId: 'user_1',
    goal: 'strength',
    weeklySessionTarget: 4,
    sessionDuration: '45_to_75m',
    equipmentCategories: ['dumbbells'],
    limitationsDeclared: false,
    limitations: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  assert.equal(complete, true);
});

test('profile completeness fails when required first-pass fields are missing', () => {
  const incomplete = isProfileComplete({
    userId: 'user_1',
    goal: 'strength',
    weeklySessionTarget: 0,
    sessionDuration: '45_to_75m',
    equipmentCategories: ['dumbbells'],
    limitationsDeclared: false,
    limitations: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  assert.equal(incomplete, false);
});

test('profile completeness fails for ambiguous limitation state', () => {
  const ambiguous = isProfileComplete({
    userId: 'user_1',
    goal: 'strength',
    weeklySessionTarget: 4,
    sessionDuration: '45_to_75m',
    equipmentCategories: ['dumbbells'],
    limitationsDeclared: false,
    limitations: [{ zone: 'knee', severity: 'mild', temporality: 'temporary' }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  assert.equal(ambiguous, false);
});
