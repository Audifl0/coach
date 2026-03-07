import assert from 'node:assert/strict';
import test from 'node:test';

import { getSubstitutionCandidates } from '../../src/lib/program/substitution';
import type { MovementPattern } from '../../src/lib/program/types';
import {
  createSubstitutionCandidatesGetHandler,
} from '../../src/app/api/program/exercises/[plannedExerciseId]/substitutions/route';
import {
  createPlannedExerciseSubstitutePostHandler,
} from '../../src/app/api/program/exercises/[plannedExerciseId]/substitute/route';

test('returns at most top 3 substitution candidates', () => {
  const candidates = getSubstitutionCandidates({
    plannedExerciseKey: 'goblet_squat',
    equipmentCategories: ['bodyweight', 'dumbbells', 'bench', 'machines'],
    limitations: [],
  });

  assert.equal(candidates.length, 3);
});

test('excludes candidates blocked by declared limitations', () => {
  const candidates = getSubstitutionCandidates({
    plannedExerciseKey: 'goblet_squat',
    equipmentCategories: ['bodyweight', 'dumbbells', 'bench', 'machines'],
    limitations: [{ zone: 'knee', severity: 'severe', temporality: 'temporary' }],
  });

  assert.equal(candidates.length, 0);
});

test('excludes candidates requiring unavailable equipment', () => {
  const candidates = getSubstitutionCandidates({
    plannedExerciseKey: 'goblet_squat',
    equipmentCategories: ['dumbbells'],
    limitations: [],
  });

  assert.deepEqual(candidates.map((entry) => entry.exerciseKey), []);
});

test('excludes candidates with incompatible movement pattern metadata', () => {
  const candidates = getSubstitutionCandidates({
    plannedExerciseKey: 'dumbbell_bench_press',
    equipmentCategories: ['machines'],
    limitations: [],
    overrideCandidateKeys: ['seated_cable_row', 'machine_chest_press'],
  });

  assert.deepEqual(candidates.map((entry) => entry.exerciseKey), ['machine_chest_press']);
});

test('substitution candidate route rejects unauthorized requests', async () => {
  const get = createSubstitutionCandidatesGetHandler({
    resolveSession: async () => null,
    getProfile: async () => null,
    getPlannedExerciseOwnership: async () => null,
  });

  const response = await get(
    new Request('http://localhost/api/program/exercises/ex_1/substitutions'),
    { params: { plannedExerciseId: 'ex_1' } },
  );
  assert.equal(response.status, 401);
});

test('substitution candidate route returns strict-safe top 3 for account-owned planned exercise only', async () => {
  const get = createSubstitutionCandidatesGetHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getProfile: async () => ({
      equipmentCategories: ['bodyweight', 'dumbbells', 'bench', 'machines'],
      limitations: [],
    }),
    getPlannedExerciseOwnership: async (plannedExerciseId) => {
      if (plannedExerciseId === 'owned_exercise') {
        return {
          plannedExerciseId,
          exerciseKey: 'goblet_squat',
          scheduledDate: '2026-03-04',
        };
      }

      return null;
    },
  });

  const ownedResponse = await get(
    new Request('http://localhost/api/program/exercises/owned_exercise/substitutions'),
    { params: { plannedExerciseId: 'owned_exercise' } },
  );
  assert.equal(ownedResponse.status, 200);
  const ownedBody = (await ownedResponse.json()) as { candidates: Array<{ exerciseKey: string }> };
  assert.equal(ownedBody.candidates.length, 3);

  const foreignResponse = await get(
    new Request('http://localhost/api/program/exercises/foreign_exercise/substitutions'),
    { params: { plannedExerciseId: 'foreign_exercise' } },
  );
  assert.equal(foreignResponse.status, 404);
});

test('substitute route rejects invalid replacement keys with 400', async () => {
  const post = createPlannedExerciseSubstitutePostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getProfile: async () => ({
      equipmentCategories: ['dumbbells', 'machines', 'bodyweight', 'bench'],
      limitations: [],
    }),
    getPlannedExerciseOwnership: async () => ({
      plannedExerciseId: 'owned_exercise',
      exerciseKey: 'goblet_squat',
      scheduledDate: '2026-03-04',
    }),
    updatePlannedExercise: async () => {
      throw new Error('should not be called');
    },
    now: () => new Date('2026-03-04T09:00:00.000Z'),
  });

  const response = await post(
    new Request('http://localhost/api/program/exercises/owned_exercise/substitute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ replacementExerciseKey: '' }),
    }),
    { params: { plannedExerciseId: 'owned_exercise' } },
  );

  assert.equal(response.status, 400);
});

test('substitute route rejects non-today plannedExerciseId with 400', async () => {
  const post = createPlannedExerciseSubstitutePostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getProfile: async () => ({
      equipmentCategories: ['dumbbells', 'machines', 'bodyweight', 'bench'],
      limitations: [],
    }),
    getPlannedExerciseOwnership: async () => ({
      plannedExerciseId: 'future_exercise',
      exerciseKey: 'goblet_squat',
      scheduledDate: '2026-03-05',
    }),
    updatePlannedExercise: async () => {
      throw new Error('should not be called');
    },
    now: () => new Date('2026-03-04T09:00:00.000Z'),
  });

  const response = await post(
    new Request('http://localhost/api/program/exercises/future_exercise/substitute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ replacementExerciseKey: 'leg_press' }),
    }),
    { params: { plannedExerciseId: 'future_exercise' } },
  );

  assert.equal(response.status, 400);
});

test('substitute route updates only targeted planned exercise row for today', async () => {
  type PlannedExerciseRow = {
    id: string;
    exerciseKey: string;
    displayName: string;
    movementPattern: MovementPattern;
    isSubstituted: boolean;
    originalExerciseKey: string | null;
  };

  const rows = new Map<string, PlannedExerciseRow>([
    [
      'target_row',
      {
        id: 'target_row',
        exerciseKey: 'goblet_squat',
        displayName: 'Goblet Squat',
        movementPattern: 'squat',
        isSubstituted: false,
        originalExerciseKey: null,
      },
    ],
    [
      'sibling_row',
      {
        id: 'sibling_row',
        exerciseKey: 'split_squat',
        displayName: 'Split Squat',
        movementPattern: 'squat',
        isSubstituted: false,
        originalExerciseKey: null,
      },
    ],
  ]);

  const post = createPlannedExerciseSubstitutePostHandler({
    resolveSession: async () => ({ userId: 'user_1' }),
    getProfile: async () => ({
      equipmentCategories: ['dumbbells', 'machines', 'bodyweight', 'bench'],
      limitations: [],
    }),
    getPlannedExerciseOwnership: async (plannedExerciseId) => {
      if (plannedExerciseId === 'target_row') {
        return {
          plannedExerciseId,
          exerciseKey: 'goblet_squat',
          scheduledDate: '2026-03-04',
        };
      }

      return null;
    },
    updatePlannedExercise: async ({ plannedExerciseId, replacementExerciseKey, replacementDisplayName, replacementMovementPattern }) => {
      const current = rows.get(plannedExerciseId);
      if (!current) {
        throw new Error('Row not found');
      }

      const updated = {
        ...current,
        exerciseKey: replacementExerciseKey,
        displayName: replacementDisplayName,
        movementPattern: replacementMovementPattern,
        isSubstituted: true,
        originalExerciseKey: current.originalExerciseKey ?? current.exerciseKey,
      } satisfies PlannedExerciseRow;
      rows.set(plannedExerciseId, updated);

      return {
        id: updated.id,
        userId: 'user_1',
        plannedSessionId: 'session_today',
        orderIndex: 0,
        exerciseKey: updated.exerciseKey,
        displayName: updated.displayName,
        movementPattern: updated.movementPattern,
        sets: 4,
        targetReps: 8,
        targetLoad: '24kg',
        restMinSec: 90,
        restMaxSec: 120,
        isSubstituted: updated.isSubstituted,
        originalExerciseKey: updated.originalExerciseKey,
        createdAt: new Date('2026-03-04T08:00:00.000Z'),
        updatedAt: new Date('2026-03-04T09:00:00.000Z'),
      };
    },
    now: () => new Date('2026-03-04T09:00:00.000Z'),
  });

  const response = await post(
    new Request('http://localhost/api/program/exercises/target_row/substitute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ replacementExerciseKey: 'leg_press' }),
    }),
    { params: { plannedExerciseId: 'target_row' } },
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as { plannedExercise: { id: string; exerciseKey: string } };
  assert.equal(body.plannedExercise.id, 'target_row');
  assert.equal(body.plannedExercise.exerciseKey, 'leg_press');

  assert.equal(rows.get('target_row')?.exerciseKey, 'leg_press');
  assert.equal(rows.get('sibling_row')?.exerciseKey, 'split_squat');
  assert.equal(rows.get('sibling_row')?.isSubstituted, false);
});
