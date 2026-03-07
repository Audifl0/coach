import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createProgramSessionCompletePostHandler,
} from '../../src/app/api/program/sessions/[sessionId]/complete/route';
import { createProgramHistoryGetHandler } from '../../src/app/api/program/history/route';
import {
  createProgramSessionDurationPatchHandler,
} from '../../src/app/api/program/sessions/[sessionId]/duration/route';
import {
  createProgramSessionExerciseSetsPatchHandler,
  createProgramSessionExerciseSetsPostHandler,
} from '../../src/app/api/program/sessions/[sessionId]/exercises/[plannedExerciseId]/sets/route';
import {
  createProgramSessionExerciseSkipDeleteHandler,
  createProgramSessionExerciseSkipPostHandler,
} from '../../src/app/api/program/sessions/[sessionId]/exercises/[plannedExerciseId]/skip/route';
import {
  createProgramSessionNotePatchHandler,
} from '../../src/app/api/program/sessions/[sessionId]/note/route';
import { createProgramSessionDetailGetHandler } from '../../src/app/api/program/sessions/[sessionId]/route';

function mutationRouteContext() {
  return {
    params: Promise.resolve({
      sessionId: 'session_1',
      plannedExerciseId: 'exercise_1',
    }),
  };
}

test('unauthenticated requests return 401 for all session logging mutation routes', async () => {
  const postSet = createProgramSessionExerciseSetsPostHandler({
    resolveSession: async () => null,
    getExerciseOwnership: async () => null,
    logSet: async () => {
      throw new Error('not expected');
    },
  });
  const patchSet = createProgramSessionExerciseSetsPatchHandler({
    resolveSession: async () => null,
    getExerciseOwnership: async () => null,
    logSet: async () => {
      throw new Error('not expected');
    },
  });
  const postSkip = createProgramSessionExerciseSkipPostHandler({
    resolveSession: async () => null,
    getExerciseOwnership: async () => null,
    skipExercise: async () => {
      throw new Error('not expected');
    },
    revertSkippedExercise: async () => {
      throw new Error('not expected');
    },
  });
  const deleteSkip = createProgramSessionExerciseSkipDeleteHandler({
    resolveSession: async () => null,
    getExerciseOwnership: async () => null,
    skipExercise: async () => {
      throw new Error('not expected');
    },
    revertSkippedExercise: async () => {
      throw new Error('not expected');
    },
  });
  const patchNote = createProgramSessionNotePatchHandler({
    resolveSession: async () => null,
    updateSessionNote: async () => {
      throw new Error('not expected');
    },
  });
  const postComplete = createProgramSessionCompletePostHandler({
    resolveSession: async () => null,
    completeSession: async () => {
      throw new Error('not expected');
    },
  });
  const patchDuration = createProgramSessionDurationPatchHandler({
    resolveSession: async () => null,
    correctDuration: async () => {
      throw new Error('not expected');
    },
  });

  const setPostResponse = await postSet(
    new Request('http://localhost/api/program/sessions/session_1/exercises/exercise_1/sets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ setIndex: 1, weight: 20, reps: 8 }),
    }),
    mutationRouteContext(),
  );
  assert.equal(setPostResponse.status, 401);

  const setPatchResponse = await patchSet(
    new Request('http://localhost/api/program/sessions/session_1/exercises/exercise_1/sets', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ setIndex: 1, weight: 22.5, reps: 8 }),
    }),
    mutationRouteContext(),
  );
  assert.equal(setPatchResponse.status, 401);

  const skipPostResponse = await postSkip(
    new Request('http://localhost/api/program/sessions/session_1/exercises/exercise_1/skip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reasonCode: 'pain', reasonText: 'knee discomfort' }),
    }),
    mutationRouteContext(),
  );
  assert.equal(skipPostResponse.status, 401);

  const skipDeleteResponse = await deleteSkip(
    new Request('http://localhost/api/program/sessions/session_1/exercises/exercise_1/skip', {
      method: 'DELETE',
    }),
    mutationRouteContext(),
  );
  assert.equal(skipDeleteResponse.status, 401);

  const notePatchResponse = await patchNote(
    new Request('http://localhost/api/program/sessions/session_1/note', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'Focus on tempo' }),
    }),
    { params: Promise.resolve({ sessionId: 'session_1' }) },
  );
  assert.equal(notePatchResponse.status, 401);

  const completePostResponse = await postComplete(
    new Request('http://localhost/api/program/sessions/session_1/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fatigue: 3, readiness: 4, comment: 'solid' }),
    }),
    { params: Promise.resolve({ sessionId: 'session_1' }) },
  );
  assert.equal(completePostResponse.status, 401);

  const durationPatchResponse = await patchDuration(
    new Request('http://localhost/api/program/sessions/session_1/duration', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ effectiveDurationSec: 4200 }),
    }),
    { params: Promise.resolve({ sessionId: 'session_1' }) },
  );
  assert.equal(durationPatchResponse.status, 401);
});

test('malformed payloads return 400 for all session logging mutation routes', async () => {
  const postSet = createProgramSessionExerciseSetsPostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getExerciseOwnership: async () => ({ plannedSessionId: 'session_1' }),
    logSet: async () => {
      throw new Error('not expected');
    },
  });
  const postSkip = createProgramSessionExerciseSkipPostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getExerciseOwnership: async () => ({ plannedSessionId: 'session_1' }),
    skipExercise: async () => {
      throw new Error('not expected');
    },
    revertSkippedExercise: async () => {
      throw new Error('not expected');
    },
  });
  const patchNote = createProgramSessionNotePatchHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    updateSessionNote: async () => {
      throw new Error('not expected');
    },
  });
  const postComplete = createProgramSessionCompletePostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    completeSession: async () => {
      throw new Error('not expected');
    },
  });
  const patchDuration = createProgramSessionDurationPatchHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    correctDuration: async () => {
      throw new Error('not expected');
    },
  });

  const setResponse = await postSet(
    new Request('http://localhost/api/program/sessions/session_1/exercises/exercise_1/sets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ setIndex: 0, weight: -10, reps: 0 }),
    }),
    mutationRouteContext(),
  );
  assert.equal(setResponse.status, 400);

  const skipResponse = await postSkip(
    new Request('http://localhost/api/program/sessions/session_1/exercises/exercise_1/skip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reasonCode: '' }),
    }),
    mutationRouteContext(),
  );
  assert.equal(skipResponse.status, 400);

  const noteResponse = await patchNote(
    new Request('http://localhost/api/program/sessions/session_1/note', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'x'.repeat(281) }),
    }),
    { params: Promise.resolve({ sessionId: 'session_1' }) },
  );
  assert.equal(noteResponse.status, 400);

  const completeResponse = await postComplete(
    new Request('http://localhost/api/program/sessions/session_1/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fatigue: 6, readiness: 0 }),
    }),
    { params: Promise.resolve({ sessionId: 'session_1' }) },
  );
  assert.equal(completeResponse.status, 400);

  const durationResponse = await patchDuration(
    new Request('http://localhost/api/program/sessions/session_1/duration', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ effectiveDurationSec: 0 }),
    }),
    { params: Promise.resolve({ sessionId: 'session_1' }) },
  );
  assert.equal(durationResponse.status, 400);
});

test('account mismatch is masked as not-found behavior for logging mutation routes', async () => {
  const postSet = createProgramSessionExerciseSetsPostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getExerciseOwnership: async () => ({ plannedSessionId: 'session_2' }),
    logSet: async () => {
      throw new Error('Mismatched account context');
    },
  });

  const setResponse = await postSet(
    new Request('http://localhost/api/program/sessions/session_1/exercises/exercise_1/sets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ setIndex: 1, weight: 20, reps: 8 }),
    }),
    mutationRouteContext(),
  );

  assert.equal(setResponse.status, 404);
  const setBody = await setResponse.json();
  assert.equal(setBody.error, 'Planned exercise not found');

  const skipPost = createProgramSessionExerciseSkipPostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getExerciseOwnership: async () => {
      throw new Error('Mismatched account context');
    },
    skipExercise: async () => {
      throw new Error('not expected');
    },
    revertSkippedExercise: async () => {
      throw new Error('not expected');
    },
  });

  const skipResponse = await skipPost(
    new Request('http://localhost/api/program/sessions/session_1/exercises/exercise_1/skip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reasonCode: 'pain' }),
    }),
    mutationRouteContext(),
  );
  assert.equal(skipResponse.status, 404);

  const patchNote = createProgramSessionNotePatchHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    updateSessionNote: async () => {
      throw new Error('Planned session not found');
    },
  });
  const noteResponse = await patchNote(
    new Request('http://localhost/api/program/sessions/session_1/note', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'ok' }),
    }),
    { params: Promise.resolve({ sessionId: 'session_1' }) },
  );
  assert.equal(noteResponse.status, 404);
});

test('happy path mutation routes persist set autosave, skip/revert, note, completion and duration correction', async () => {
  const calls: Array<{ kind: string; payload: Record<string, unknown> }> = [];

  const postSet = createProgramSessionExerciseSetsPostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getExerciseOwnership: async () => ({ plannedSessionId: 'session_1' }),
    logSet: async (payload) => {
      calls.push({ kind: 'set-post', payload });
      return { ...payload, rpe: payload.rpe ?? null };
    },
  });

  const patchSet = createProgramSessionExerciseSetsPatchHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getExerciseOwnership: async () => ({ plannedSessionId: 'session_1' }),
    logSet: async (payload) => {
      calls.push({ kind: 'set-patch', payload });
      return { ...payload, rpe: payload.rpe ?? null };
    },
  });

  const postSkip = createProgramSessionExerciseSkipPostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getExerciseOwnership: async () => ({ plannedSessionId: 'session_1' }),
    skipExercise: async (payload) => {
      calls.push({ kind: 'skip-post', payload });
    },
    revertSkippedExercise: async () => {
      throw new Error('not expected');
    },
  });

  const deleteSkip = createProgramSessionExerciseSkipDeleteHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getExerciseOwnership: async () => ({ plannedSessionId: 'session_1' }),
    skipExercise: async () => {
      throw new Error('not expected');
    },
    revertSkippedExercise: async (payload) => {
      calls.push({ kind: 'skip-delete', payload });
    },
  });

  const patchNote = createProgramSessionNotePatchHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    updateSessionNote: async (payload) => {
      calls.push({ kind: 'note-patch', payload });
    },
  });

  const postComplete = createProgramSessionCompletePostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    completeSession: async (payload) => {
      calls.push({ kind: 'complete-post', payload });
    },
  });

  const patchDuration = createProgramSessionDurationPatchHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    correctDuration: async (payload) => {
      calls.push({ kind: 'duration-patch', payload });
    },
  });

  const postSetResponse = await postSet(
    new Request('http://localhost/api/program/sessions/session_1/exercises/exercise_1/sets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ setIndex: 1, weight: 20, reps: 10, rpe: 7 }),
    }),
    mutationRouteContext(),
  );
  assert.equal(postSetResponse.status, 201);
  const postSetBody = await postSetResponse.json();
  assert.equal(postSetBody.set.setIndex, 1);

  const patchSetResponse = await patchSet(
    new Request('http://localhost/api/program/sessions/session_1/exercises/exercise_1/sets', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ setIndex: 1, weight: 22.5, reps: 8, rpe: 8 }),
    }),
    mutationRouteContext(),
  );
  assert.equal(patchSetResponse.status, 200);

  const postSkipResponse = await postSkip(
    new Request('http://localhost/api/program/sessions/session_1/exercises/exercise_1/skip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reasonCode: 'pain', reasonText: 'left knee' }),
    }),
    mutationRouteContext(),
  );
  assert.equal(postSkipResponse.status, 200);

  const deleteSkipResponse = await deleteSkip(
    new Request('http://localhost/api/program/sessions/session_1/exercises/exercise_1/skip', {
      method: 'DELETE',
    }),
    mutationRouteContext(),
  );
  assert.equal(deleteSkipResponse.status, 200);

  const noteResponse = await patchNote(
    new Request('http://localhost/api/program/sessions/session_1/note', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'Tempo clean today' }),
    }),
    { params: Promise.resolve({ sessionId: 'session_1' }) },
  );
  assert.equal(noteResponse.status, 200);

  const completeResponse = await postComplete(
    new Request('http://localhost/api/program/sessions/session_1/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fatigue: 3, readiness: 4, comment: 'solid session' }),
    }),
    { params: Promise.resolve({ sessionId: 'session_1' }) },
  );
  assert.equal(completeResponse.status, 200);

  const durationResponse = await patchDuration(
    new Request('http://localhost/api/program/sessions/session_1/duration', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ effectiveDurationSec: 3900 }),
    }),
    { params: Promise.resolve({ sessionId: 'session_1' }) },
  );
  assert.equal(durationResponse.status, 200);

  assert.deepEqual(
    calls.map((entry) => entry.kind),
    ['set-post', 'set-patch', 'skip-post', 'skip-delete', 'note-patch', 'complete-post', 'duration-patch'],
  );
});

test('GET /api/program/history validates period filters and rejects malformed custom range', async () => {
  const getHistory = createProgramHistoryGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getHistoryList: async () => [],
    now: () => new Date('2026-03-04T12:00:00.000Z'),
  });

  const missingCustomBounds = await getHistory(new Request('http://localhost/api/program/history?period=custom'));
  assert.equal(missingCustomBounds.status, 400);

  const invalidBounds = await getHistory(
    new Request('http://localhost/api/program/history?period=custom&from=2026-03-05&to=2026-03-01'),
  );
  assert.equal(invalidBounds.status, 400);

  const invalidPresetWithBounds = await getHistory(
    new Request('http://localhost/api/program/history?period=7d&from=2026-03-01&to=2026-03-04'),
  );
  assert.equal(invalidPresetWithBounds.status, 400);
});

test('GET /api/program/history returns period-filtered account-scoped summary rows', async () => {
  const historyCalls: Array<{ from: Date; to: Date; userId: string }> = [];
  const getHistory = createProgramHistoryGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getHistoryList: async ({ from, to }, userId) => {
      historyCalls.push({ from, to, userId: userId ?? '' });
      return [
        {
          id: 'session_1',
          date: '2026-03-03',
          duration: 3600,
          exerciseCount: 3,
          totalLoad: 1100,
        },
      ];
    },
    now: () => new Date('2026-03-04T12:00:00.000Z'),
  });

  const response = await getHistory(new Request('http://localhost/api/program/history?period=7d'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.sessions.length, 1);
  assert.equal(body.sessions[0]?.date, '2026-03-03');
  assert.equal(body.sessions[0]?.duration, 3600);
  assert.equal(body.sessions[0]?.exerciseCount, 3);
  assert.equal(body.sessions[0]?.totalLoad, 1100);
  assert.equal(historyCalls.length, 1);
  assert.equal(historyCalls[0]?.userId, 'user_1');
});

test('GET /api/program/sessions/:sessionId includes grouped logged sets, skip metadata, and feedback fields', async () => {
  const getDetail = createProgramSessionDetailGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getSessionDetail: async () => ({
      id: 'session_1',
      scheduledDate: '2026-03-04',
      dayIndex: 0,
      focusLabel: 'Lower Body',
      state: 'completed',
      startedAt: '2026-03-04T08:00:00.000Z',
      completedAt: '2026-03-04T09:05:00.000Z',
      effectiveDurationSec: 3900,
      durationCorrectedAt: '2026-03-04T09:10:00.000Z',
      note: 'Felt strong',
      postSessionFatigue: 3,
      postSessionReadiness: 4,
      postSessionComment: 'Solid progression',
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
          isSkipped: false,
          skipReasonCode: null,
          skipReasonText: null,
          loggedSets: [
            { setIndex: 2, weight: 22.5, reps: 8, rpe: 8 },
            { setIndex: 1, weight: 20, reps: 10, rpe: null },
          ],
        },
      ],
    }),
  });

  const response = await getDetail(new Request('http://localhost/api/program/sessions/session_1'), {
    params: Promise.resolve({ sessionId: 'session_1' }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.session.startedAt, '2026-03-04T08:00:00.000Z');
  assert.equal(body.session.completedAt, '2026-03-04T09:05:00.000Z');
  assert.equal(body.session.effectiveDurationSec, 3900);
  assert.equal(body.session.postSessionFatigue, 3);
  assert.equal(body.session.exercises.length, 1);
  assert.equal(body.session.exercises[0]?.isSkipped, false);
  assert.equal(body.session.exercises[0]?.loggedSets.length, 2);
  assert.equal(body.session.exercises[0]?.loggedSets[0]?.setIndex, 1);
  assert.equal(body.session.exercises[0]?.loggedSets[1]?.setIndex, 2);
});

test('GET /api/program/history and session detail block unauthorized or non-owned access', async () => {
  const unauthorizedHistory = createProgramHistoryGetHandler({
    resolveSession: async () => null,
    getHistoryList: async () => [],
    now: () => new Date('2026-03-04T12:00:00.000Z'),
  });

  const unauthorizedHistoryResponse = await unauthorizedHistory(
    new Request('http://localhost/api/program/history?period=7d'),
  );
  assert.equal(unauthorizedHistoryResponse.status, 401);

  const hiddenSessionDetail = createProgramSessionDetailGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getSessionDetail: async () => null,
  });

  const missingDetailResponse = await hiddenSessionDetail(new Request('http://localhost/api/program/sessions/session_404'), {
    params: Promise.resolve({ sessionId: 'session_404' }),
  });
  assert.equal(missingDetailResponse.status, 404);
});

test('session detail route delegates response shaping to buildSessionDetailProjection', async () => {
  const source = await readFile('src/app/api/program/sessions/[sessionId]/route.ts', 'utf8');
  assert.match(source, /buildSessionDetailProjection/);
});
