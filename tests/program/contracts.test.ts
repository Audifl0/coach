import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseExerciseSkipInput,
  parseHistoryQueryInput,
  parseLoggedSetInput,
  parseProgramGenerateInput,
  parseProgramTodayResponse,
  parseSessionCompleteInput,
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

test('logged set payload enforces positive weight, integer reps >= 1, and bounded optional rpe', () => {
  const parsed = parseLoggedSetInput({
    setIndex: 1,
    weight: 72.5,
    reps: 8,
    rpe: 8.5,
  });

  assert.equal(parsed.weight, 72.5);
  assert.equal(parsed.reps, 8);
  assert.equal(parsed.rpe, 8.5);

  assert.throws(() =>
    parseLoggedSetInput({
      setIndex: 1,
      weight: 0,
      reps: 8,
    }),
  );
  assert.throws(() =>
    parseLoggedSetInput({
      setIndex: 1,
      weight: 50,
      reps: 2.5,
    }),
  );
  assert.throws(() =>
    parseLoggedSetInput({
      setIndex: 1,
      weight: 50,
      reps: 2,
      rpe: 11,
    }),
  );
});

test('skip payload requires reasonCode and supports optional trimmed reasonText', () => {
  const parsed = parseExerciseSkipInput({
    reasonCode: 'pain',
    reasonText: '  right knee discomfort  ',
  });

  assert.equal(parsed.reasonCode, 'pain');
  assert.equal(parsed.reasonText, 'right knee discomfort');

  assert.throws(() => parseExerciseSkipInput({ reasonText: 'no reason code' }));
});

test('session completion payload enforces fatigue/readiness scales from 1 to 5', () => {
  const parsed = parseSessionCompleteInput({
    fatigue: 4,
    readiness: 3,
    comment: 'Tough but good session.',
  });

  assert.equal(parsed.fatigue, 4);
  assert.equal(parsed.readiness, 3);

  assert.throws(() => parseSessionCompleteInput({ fatigue: 0, readiness: 3 }));
  assert.throws(() => parseSessionCompleteInput({ fatigue: 3, readiness: 6 }));
});

test('history query accepts preset periods and validates custom range requirements', () => {
  assert.equal(parseHistoryQueryInput({ period: '7d' }).period, '7d');
  assert.equal(parseHistoryQueryInput({ period: '30d' }).period, '30d');
  assert.equal(parseHistoryQueryInput({ period: '90d' }).period, '90d');

  const custom = parseHistoryQueryInput({
    period: 'custom',
    from: '2026-03-01',
    to: '2026-03-04',
  });
  assert.equal(custom.from, '2026-03-01');
  assert.equal(custom.to, '2026-03-04');

  assert.throws(() =>
    parseHistoryQueryInput({
      period: 'custom',
      from: '2026-03-04',
      to: '2026-03-01',
    }),
  );
  assert.throws(() => parseHistoryQueryInput({ period: 'custom', from: '2026-03-01' }));
  assert.throws(() => parseHistoryQueryInput({ period: '7d', from: '2026-03-01', to: '2026-03-03' }));
});
