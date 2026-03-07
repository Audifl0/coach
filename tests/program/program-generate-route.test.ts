import assert from 'node:assert/strict';
import test from 'node:test';

import { createProgramGeneratePostHandler } from '../../src/app/api/program/generate/route-handlers';

type PersistCall = {
  userId: string;
  input: {
    regenerate?: boolean;
    anchorDate?: string;
  };
};

function createSessionSummary() {
  return {
    startDate: '2026-03-04',
    endDate: '2026-03-10',
    sessions: [
      {
        id: 'session_1',
        scheduledDate: '2026-03-04',
        dayIndex: 0,
        focusLabel: 'Lower + Push',
        state: 'planned',
        exercises: [
          {
            id: 'ex_1',
            exerciseKey: 'goblet_squat',
            displayName: 'Goblet Squat',
            movementPattern: 'squat',
            sets: 3,
            targetReps: 10,
            targetLoad: 'moderate',
            restMinSec: 60,
            restMaxSec: 90,
            isSubstituted: false,
            originalExerciseKey: null,
          },
        ],
      },
    ],
  };
}

test('program generate route rejects unauthenticated requests', async () => {
  const post = createProgramGeneratePostHandler({
    resolveSession: async () => null,
    generatePlan: async () => {
      throw new Error('should not execute');
    },
  });

  const response = await post(
    new Request('http://localhost/api/program/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ regenerate: true }),
    }),
  );

  assert.equal(response.status, 401);
});

test('program generate route validates payload and returns 400 for invalid input', async () => {
  const post = createProgramGeneratePostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    generatePlan: async () => createSessionSummary(),
  });

  const response = await post(
    new Request('http://localhost/api/program/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ anchorDate: 'not-a-date' }),
    }),
  );

  assert.equal(response.status, 400);
});

test('program generate route persists generated rows for authenticated account only', async () => {
  const calls: PersistCall[] = [];
  const post = createProgramGeneratePostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    generatePlan: async (userId, input) => {
      calls.push({ userId, input });
      return createSessionSummary();
    },
  });

  const response = await post(
    new Request('http://localhost/api/program/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        regenerate: true,
        anchorDate: '2026-03-04',
        userId: 'user_2',
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.userId, 'user_1');
  assert.deepEqual(calls[0]?.input, { regenerate: true, anchorDate: '2026-03-04' });
});

test('program generate route returns generated session summary payload', async () => {
  const expected = createSessionSummary();
  const post = createProgramGeneratePostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    generatePlan: async () => expected,
  });

  const response = await post(
    new Request('http://localhost/api/program/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ regenerate: false, anchorDate: '2026-03-04' }),
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    plan: {
      startDate: expected.startDate,
      endDate: expected.endDate,
    },
    sessions: expected.sessions,
  });
});
