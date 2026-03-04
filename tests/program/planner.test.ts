import assert from 'node:assert/strict';
import test from 'node:test';

import { getExerciseCatalogEntry } from '../../src/lib/program/catalog';
import { buildWeeklyProgramPlan } from '../../src/lib/program/planner';
import type { ProfileInput } from '../../src/lib/profile/contracts';

function createProfile(overrides: Partial<ProfileInput> = {}): ProfileInput {
  return {
    goal: 'hypertrophy',
    weeklySessionTarget: 3,
    sessionDuration: '45_to_75m',
    equipmentCategories: ['dumbbells', 'bench', 'machines'],
    limitationsDeclared: false,
    limitations: [],
    ...overrides,
  };
}

test('buildWeeklyProgramPlan creates exactly weeklySessionTarget sessions in a 7-day window', () => {
  const profile = createProfile({ weeklySessionTarget: 4 });
  const plan = buildWeeklyProgramPlan({
    profile,
    anchorDate: '2026-03-04',
  });

  assert.equal(plan.sessions.length, 4);
  assert.equal(plan.startDate, '2026-03-04');
  assert.equal(plan.endDate, '2026-03-10');
  for (const session of plan.sessions) {
    assert.match(session.scheduledDate, /^2026-03-(0[4-9]|10)$/);
    assert.ok(session.dayIndex >= 0 && session.dayIndex <= 6);
  }
});

test('buildWeeklyProgramPlan excludes exercises that violate equipment and limitation constraints', () => {
  const profile = createProfile({
    equipmentCategories: ['bodyweight'],
    limitationsDeclared: true,
    limitations: [{ zone: 'knee_acute', severity: 'moderate', temporality: 'temporary' }],
  });

  const plan = buildWeeklyProgramPlan({
    profile,
    anchorDate: '2026-03-04',
  });

  for (const session of plan.sessions) {
    for (const exercise of session.exercises) {
      const catalog = getExerciseCatalogEntry(exercise.exerciseKey);
      assert.ok(catalog, `missing catalog entry for ${exercise.exerciseKey}`);
      assert.ok(catalog.equipmentTags.every((tag) => profile.equipmentCategories.includes(tag)));
      assert.ok(!catalog.blockedLimitations.includes('knee_acute'));
    }
  }
});

test('buildWeeklyProgramPlan keeps core exercise keys stable on regeneration unless constraints force change', () => {
  const profile = createProfile();

  const first = buildWeeklyProgramPlan({
    profile,
    anchorDate: '2026-03-04',
  });

  const regenerated = buildWeeklyProgramPlan({
    profile,
    anchorDate: '2026-03-04',
    previousPlan: first,
  });

  const firstKeys = first.sessions.map((session) => session.exercises[0]?.exerciseKey ?? '');
  const regeneratedKeys = regenerated.sessions.map((session) => session.exercises[0]?.exerciseKey ?? '');
  assert.deepEqual(regeneratedKeys, firstKeys);

  const constrainedProfile = createProfile({
    equipmentCategories: ['machines'],
  });
  const constrainedRegen = buildWeeklyProgramPlan({
    profile: constrainedProfile,
    anchorDate: '2026-03-04',
    previousPlan: first,
  });
  const constrainedKeys = constrainedRegen.sessions.map((session) => session.exercises[0]?.exerciseKey ?? '');

  assert.notDeepEqual(constrainedKeys, firstKeys);
});

test('buildWeeklyProgramPlan returns prescriptions with target reps/load and rest ranges', () => {
  const profile = createProfile();
  const plan = buildWeeklyProgramPlan({
    profile,
    anchorDate: '2026-03-04',
  });

  assert.ok(plan.sessions.length > 0);
  for (const session of plan.sessions) {
    assert.ok(session.exercises.length > 0);
    for (const exercise of session.exercises) {
      assert.ok(exercise.targetReps >= 1);
      assert.match(exercise.targetLoad, /\S+/);
      assert.ok(exercise.restMinSec >= 0);
      assert.ok(exercise.restMaxSec >= exercise.restMinSec);
    }
  }
});
