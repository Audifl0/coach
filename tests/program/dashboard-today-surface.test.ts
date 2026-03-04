import assert from 'node:assert/strict';
import test from 'node:test';

import { createProgramSessionDetailGetHandler } from '../../src/app/api/program/sessions/[sessionId]/route';
import { createProgramTodayGetHandler } from '../../src/app/api/program/today/route';
import { selectTodayWorkoutProjection } from '../../src/lib/program/select-today-session';

function createSessionSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session_1',
    scheduledDate: '2026-03-04',
    dayIndex: 0,
    focusLabel: 'Lower Body',
    state: 'planned',
    exercises: [
      {
        id: 'exercise_1',
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
      },
    ],
    ...overrides,
  };
}

test('GET /api/program/today returns todaySession when one is planned for current date', async () => {
  const get = createProgramTodayGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getTodayOrNextSessionCandidates: async () => ({
      todaySession: createSessionSummary(),
      nextSession: createSessionSummary({ id: 'session_2', scheduledDate: '2026-03-06' }),
    }),
  });

  const response = await get();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.primaryAction, 'start_workout');
  assert.equal(body.todaySession?.id, 'session_1');
  assert.equal(body.nextSession, null);
});

test('GET /api/program/today falls back to nextSession when no workout exists today', async () => {
  const get = createProgramTodayGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getTodayOrNextSessionCandidates: async () => ({
      todaySession: null,
      nextSession: createSessionSummary({ id: 'session_2', scheduledDate: '2026-03-06' }),
    }),
  });

  const response = await get();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.todaySession, null);
  assert.equal(body.nextSession?.id, 'session_2');
  assert.equal(body.primaryAction, 'start_workout');
});

test('program today and session-detail routes return 401 without valid session', async () => {
  const getToday = createProgramTodayGetHandler({
    resolveSession: async () => null,
    getTodayOrNextSessionCandidates: async () => ({
      todaySession: null,
      nextSession: null,
    }),
  });

  const getDetail = createProgramSessionDetailGetHandler({
    resolveSession: async () => null,
    getSessionDetail: async () => null,
  });

  const todayResponse = await getToday();
  const detailResponse = await getDetail(new Request('http://localhost/api/program/sessions/session_1'), {
    params: Promise.resolve({ sessionId: 'session_1' }),
  });

  assert.equal(todayResponse.status, 401);
  assert.equal(detailResponse.status, 401);
});

test('session-detail route returns only account-owned exercises with prescription fields', async () => {
  const getDetail = createProgramSessionDetailGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getSessionDetail: async () => ({
      id: 'session_1',
      scheduledDate: '2026-03-04',
      dayIndex: 0,
      focusLabel: 'Lower Body',
      state: 'planned',
      exercises: [
        {
          id: 'exercise_1',
          userId: 'user_1',
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
        },
        {
          id: 'exercise_2',
          userId: 'other_user',
          exerciseKey: 'deadlift',
          displayName: 'Deadlift',
          movementPattern: 'hinge',
          sets: 3,
          targetReps: 5,
          targetLoad: '100kg',
          restMinSec: 120,
          restMaxSec: 180,
          isSubstituted: false,
          originalExerciseKey: null,
        },
      ],
    }),
  });

  const response = await getDetail(new Request('http://localhost/api/program/sessions/session_1'), {
    params: Promise.resolve({ sessionId: 'session_1' }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.session.id, 'session_1');
  assert.equal(body.session.exercises.length, 1);
  assert.equal(body.session.exercises[0]?.sets, 4);
  assert.equal(body.session.exercises[0]?.targetReps, 8);
  assert.equal(body.session.exercises[0]?.targetLoad, '24kg');
  assert.equal(body.session.exercises[0]?.restMinSec, 90);
  assert.equal(body.session.exercises[0]?.restMaxSec, 120);
});

test('selection helper prioritizes today and carries start_workout primary action', () => {
  const projection = selectTodayWorkoutProjection({
    todaySession: createSessionSummary(),
    nextSession: createSessionSummary({ id: 'session_2' }),
  });

  assert.equal(projection.todaySession?.id, 'session_1');
  assert.equal(projection.nextSession, null);
  assert.equal(projection.primaryAction, 'start_workout');
});
