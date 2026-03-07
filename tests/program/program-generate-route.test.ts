import assert from 'node:assert/strict';
import test from 'node:test';

import { createProgramGeneratePostHandler } from '../../src/app/api/program/generate/route-handlers';
import { createProgramGenerationService, ProgramGenerationError } from '../../src/server/services/program-generation';

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

function createCompleteProfile() {
  return {
    goal: 'hypertrophy',
    weeklySessionTarget: 4,
    sessionDuration: '45_to_75m',
    equipmentCategories: ['dumbbells', 'bench'],
    limitationsDeclared: false,
    limitations: [],
  };
}

function createUniqueConflictError() {
  return {
    code: 'P2002',
    meta: {
      target: ['ProgramPlan_one_active_per_user_idx'],
    },
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

test('program generation service translates active plan uniqueness conflicts into a 409 error', async () => {
  const service = createProgramGenerationService({
    getProfile: async () => createCompleteProfile(),
    replaceActivePlan: async () => {
      throw createUniqueConflictError();
    },
  });

  await assert.rejects(
    () => service.generate('user_1', { regenerate: true, anchorDate: '2026-03-04' }),
    (error: unknown) => {
      assert.ok(error instanceof ProgramGenerationError);
      assert.equal(error.status, 409);
      assert.equal(error.message, 'An active program already exists. Please retry generation.');
      return true;
    },
  );
});

test('program generate route returns 409 when active plan persistence loses a duplicate-submit race', async () => {
  const service = createProgramGenerationService({
    getProfile: async () => createCompleteProfile(),
    replaceActivePlan: async () => {
      throw createUniqueConflictError();
    },
  });

  const post = createProgramGeneratePostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    generatePlan: (userId, input) => service.generate(userId, input),
  });

  const response = await post(
    new Request('http://localhost/api/program/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ regenerate: true, anchorDate: '2026-03-04' }),
    }),
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: 'An active program already exists. Please retry generation.',
  });
});
