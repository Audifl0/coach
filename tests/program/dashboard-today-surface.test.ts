import assert from 'node:assert/strict';
import test from 'node:test';

import { createProgramSessionDetailGetHandler } from '../../src/app/api/program/sessions/[sessionId]/route';
import { createProgramTodayGetHandler } from '../../src/app/api/program/today/route';
import { selectTodayWorkoutProjection } from '../../src/lib/program/select-today-session';
import { pickDashboardSession } from '../../src/app/(private)/dashboard/page';
import { getPrimaryActionLabel, resolveDisplayedSession } from '../../src/app/(private)/dashboard/_components/today-workout-card';
import {
  buildCompleteSessionPayload,
  buildSkipPayload,
  createInitialLoggerState,
  formatElapsedSeconds,
  reduceLoggerStateAfterCompletion,
  reduceLoggerStateAfterSetSaved,
  upsertLoggedSet,
} from '../../src/app/(private)/dashboard/_components/session-logger';

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

test('dashboard session picker prefers today when both today and next are available', () => {
  const picked = pickDashboardSession({
    todaySession: createSessionSummary(),
    nextSession: createSessionSummary({ id: 'session_2' }),
    primaryAction: 'start_workout',
  });

  assert.equal(picked.mode, 'today');
  assert.equal(picked.topSession?.id, 'session_1');
});

test('dashboard session picker falls back to next session when today is missing', () => {
  const picked = pickDashboardSession({
    todaySession: null,
    nextSession: createSessionSummary({ id: 'session_2' }),
    primaryAction: 'start_workout',
  });

  assert.equal(picked.mode, 'next');
  assert.equal(picked.topSession?.id, 'session_2');
  assert.equal(getPrimaryActionLabel('start_workout'), 'Commencer seance');
});

test('today workout card helper resolves displayed session deterministically', () => {
  const today = resolveDisplayedSession({
    todaySession: createSessionSummary(),
    nextSession: createSessionSummary({ id: 'session_2' }),
  });
  assert.equal(today.mode, 'today');
  assert.equal(today.session?.id, 'session_1');

  const next = resolveDisplayedSession({
    todaySession: null,
    nextSession: createSessionSummary({ id: 'session_2' }),
  });
  assert.equal(next.mode, 'next');
  assert.equal(next.session?.id, 'session_2');
});

test('session logger set autosave helpers preserve immediate payload and edit continuity', () => {
  const saved = upsertLoggedSet(
    [
      { setIndex: 1, weight: 20, reps: 10, rpe: 7 },
    ],
    { setIndex: 1, weight: 22.5, reps: 8, rpe: 8 },
  );

  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0], { setIndex: 1, weight: 22.5, reps: 8, rpe: 8 });
});

test('session logger skip payload requires reason and supports revert semantics', () => {
  assert.throws(() => buildSkipPayload('', 'left knee'), /reason/i);
  assert.deepEqual(buildSkipPayload('pain', 'left knee'), { reasonCode: 'pain', reasonText: 'left knee' });
});

test('session logger timer starts on first set and stays visible until explicit completion', () => {
  const idle = createInitialLoggerState();
  const started = reduceLoggerStateAfterSetSaved(idle, { nowMs: 120_000 });
  assert.equal(started.timerStartedAtMs, 120_000);
  assert.equal(started.timerCompletedAtMs, null);
  assert.equal(formatElapsedSeconds(started, 123_000), '00:03');

  const completed = reduceLoggerStateAfterCompletion(started, { nowMs: 129_000 });
  assert.equal(completed.timerCompletedAtMs, 129_000);
  assert.equal(formatElapsedSeconds(completed, 150_000), '00:09');
});

test('session logger completion payload requires fatigue/readiness and allows optional comment', () => {
  assert.throws(() => buildCompleteSessionPayload({ fatigue: null, readiness: 4, comment: 'ok' }), /fatigue/i);
  assert.throws(() => buildCompleteSessionPayload({ fatigue: 3, readiness: null, comment: 'ok' }), /readiness/i);
  assert.deepEqual(buildCompleteSessionPayload({ fatigue: 3, readiness: 4, comment: '' }), {
    fatigue: 3,
    readiness: 4,
  });
  assert.deepEqual(buildCompleteSessionPayload({ fatigue: 2, readiness: 5, comment: 'solid' }), {
    fatigue: 2,
    readiness: 5,
    comment: 'solid',
  });
});
