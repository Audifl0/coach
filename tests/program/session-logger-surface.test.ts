import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCompleteSessionPayload,
  buildCompleteSessionRequest,
  buildDurationCorrectionRequest,
  buildSaveSetRequest,
  buildSessionLoggerHydration,
  buildSkipRequest,
  buildNoteRequest,
  buildRevertSkipRequest,
  getSessionLoggerRequestErrorMessage,
  reduceLoggerStateAfterCompletion,
  reduceLoggerStateAfterSetSaved,
} from '../../src/app/(private)/dashboard/_components/session-logger';

test('session logger request builders keep endpoint URLs and payload semantics stable', async () => {
  const saveSet = buildSaveSetRequest({
    sessionId: 'session_1',
    exerciseId: 'exercise_1',
    payload: {
      setIndex: 1,
      weight: 22.5,
      reps: 8,
      rpe: 8,
    },
  });
  assert.equal(saveSet.url, '/api/program/sessions/session_1/exercises/exercise_1/sets');
  assert.equal(saveSet.init.method, 'POST');
  assert.equal(saveSet.init.cache, 'no-store');
  assert.equal(saveSet.init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(String(saveSet.init.body)), { setIndex: 1, weight: 22.5, reps: 8, rpe: 8 });

  const skip = buildSkipRequest({
    sessionId: 'session_1',
    exerciseId: 'exercise_1',
    payload: { reasonCode: 'pain', reasonText: 'knee discomfort' },
  });
  assert.equal(skip.url, '/api/program/sessions/session_1/exercises/exercise_1/skip');
  assert.equal(skip.init.method, 'POST');
  assert.deepEqual(JSON.parse(String(skip.init.body)), { reasonCode: 'pain', reasonText: 'knee discomfort' });

  const revert = buildRevertSkipRequest({
    sessionId: 'session_1',
    exerciseId: 'exercise_1',
  });
  assert.equal(revert.url, '/api/program/sessions/session_1/exercises/exercise_1/skip');
  assert.equal(revert.init.method, 'DELETE');

  const note = buildNoteRequest({
    sessionId: 'session_1',
    payload: { note: 'tempo controle' },
  });
  assert.equal(note.url, '/api/program/sessions/session_1/note');
  assert.equal(note.init.method, 'PATCH');
  assert.deepEqual(JSON.parse(String(note.init.body)), { note: 'tempo controle' });

  const completePayload = buildCompleteSessionPayload({ fatigue: 3, readiness: 4, comment: 'solid session' });
  const complete = buildCompleteSessionRequest({
    sessionId: 'session_1',
    payload: completePayload,
  });
  assert.equal(complete.url, '/api/program/sessions/session_1/complete');
  assert.equal(complete.init.method, 'POST');
  assert.deepEqual(JSON.parse(String(complete.init.body)), { fatigue: 3, readiness: 4, comment: 'solid session' });

  const duration = buildDurationCorrectionRequest({
    sessionId: 'session_1',
    payload: { effectiveDurationSec: 4200 },
  });
  assert.equal(duration.url, '/api/program/sessions/session_1/duration');
  assert.equal(duration.init.method, 'PATCH');
  assert.deepEqual(JSON.parse(String(duration.init.body)), { effectiveDurationSec: 4200 });
});

test('session logger timer starts on first saved set and completion enables duration correction', () => {
  const nowMs = Date.parse('2026-03-04T08:00:00.000Z');
  const afterFirstSet = reduceLoggerStateAfterSetSaved(
    { timerStartedAtMs: null, timerCompletedAtMs: null },
    { nowMs },
  );
  assert.equal(afterFirstSet.timerStartedAtMs, nowMs);
  assert.equal(afterFirstSet.timerCompletedAtMs, null);

  const afterSecondSet = reduceLoggerStateAfterSetSaved(afterFirstSet, { nowMs: nowMs + 30_000 });
  assert.equal(afterSecondSet.timerStartedAtMs, nowMs);
  assert.equal(afterSecondSet.timerCompletedAtMs, null);

  const completed = reduceLoggerStateAfterCompletion(afterSecondSet, { nowMs: nowMs + 3_600_000 });
  assert.equal(completed.timerStartedAtMs, nowMs);
  assert.equal(completed.timerCompletedAtMs, nowMs + 3_600_000);

  const hydration = buildSessionLoggerHydration({
    id: 'session_1',
    scheduledDate: '2026-03-04',
    dayIndex: 0,
    focusLabel: 'Lower Body',
    state: 'completed',
    startedAt: '2026-03-04T08:00:00.000Z',
    completedAt: '2026-03-04T09:00:00.000Z',
    effectiveDurationSec: 3600,
    durationCorrectedAt: null,
    note: null,
    postSessionFatigue: 3,
    postSessionReadiness: 4,
    postSessionComment: null,
    exercises: [],
  });
  assert.equal(hydration.isCompleted, true);
  assert.equal(hydration.loggerState.timerStartedAtMs, nowMs);
  assert.equal(hydration.loggerState.timerCompletedAtMs, nowMs + 3_600_000);
});

test('session logger failed request classes keep the same user-visible error messages', () => {
  assert.equal(getSessionLoggerRequestErrorMessage('save_set'), 'Impossible de sauvegarder la serie.');
  assert.equal(getSessionLoggerRequestErrorMessage('skip_exercise'), 'Impossible de marquer cet exercice comme saute.');
  assert.equal(getSessionLoggerRequestErrorMessage('revert_skip'), 'Impossible d annuler le skip.');
  assert.equal(getSessionLoggerRequestErrorMessage('save_note'), 'Impossible de sauvegarder la note.');
  assert.equal(getSessionLoggerRequestErrorMessage('complete_session'), 'Impossible de terminer la seance.');
  assert.equal(getSessionLoggerRequestErrorMessage('correct_duration'), 'Impossible de corriger la duree.');
});

test('session logger internal state and client helper modules are available for decomposition', async () => {
  const stateModule = await import('../../src/app/(private)/dashboard/_components/session-logger-state');
  const clientModule = await import('../../src/app/(private)/dashboard/_components/session-logger-client');

  assert.equal(typeof stateModule.buildSessionLoggerHydration, 'function');
  assert.equal(typeof stateModule.reduceLoggerStateAfterSetSaved, 'function');
  assert.equal(typeof clientModule.buildSaveSetRequest, 'function');
  assert.equal(typeof clientModule.getSessionLoggerRequestErrorMessage, 'function');
});
