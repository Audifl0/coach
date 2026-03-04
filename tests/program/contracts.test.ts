import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseProgramGenerateInput,
  parseProgramTodayResponse,
  programPlannedExerciseSchema,
} from '../../src/lib/program/contracts';
import { exerciseCatalogByKey } from '../../src/lib/program/catalog';
import { equipmentTagValues, movementPatternValues, sessionStateValues } from '../../src/lib/program/types';

test('program types lock core enum values used by contracts and catalog', () => {
  assert.ok(movementPatternValues.includes('squat'));
  assert.ok(equipmentTagValues.includes('dumbbells'));
  assert.ok(sessionStateValues.includes('planned'));
  assert.equal(exerciseCatalogByKey.has('goblet_squat'), true);
});

test('parseProgramGenerateInput parses optional command payload', () => {
  const parsed = parseProgramGenerateInput({ regenerate: true, anchorDate: '2026-03-04' });

  assert.equal(parsed.regenerate, true);
  assert.equal(parsed.anchorDate, '2026-03-04');
});

test('program exercise contract enforces fixed reps/load/rest shape', () => {
  const valid = programPlannedExerciseSchema.safeParse({
    id: 'pe_1',
    exerciseKey: 'goblet_squat',
    displayName: 'Goblet Squat',
    movementPattern: 'squat',
    sets: 4,
    targetReps: 8,
    targetLoad: '24kg',
    restMinSec: 90,
    restMaxSec: 120,
    isSubstituted: false,
    originalExerciseKey: null,
  });

  assert.equal(valid.success, true);

  const invalid = programPlannedExerciseSchema.safeParse({
    id: 'pe_1',
    exerciseKey: 'goblet_squat',
    displayName: 'Goblet Squat',
    movementPattern: 'squat',
    sets: 4,
    targetReps: 0,
    targetLoad: '',
    restMinSec: -1,
    restMaxSec: 120,
    isSubstituted: false,
    originalExerciseKey: null,
  });

  assert.equal(invalid.success, false);
});

test('parseProgramTodayResponse validates today/next session response contracts', () => {
  const parsed = parseProgramTodayResponse({
    todaySession: null,
    nextSession: {
      id: 'session_1',
      scheduledDate: '2026-03-05',
      dayIndex: 1,
      focusLabel: 'Upper Body',
      state: 'planned',
      exercises: [],
    },
    primaryAction: 'start_workout',
  });

  assert.equal(parsed.primaryAction, 'start_workout');
  assert.equal(parsed.todaySession, null);
  assert.equal(parsed.nextSession?.state, 'planned');
});
