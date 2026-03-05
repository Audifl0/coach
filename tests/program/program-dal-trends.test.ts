import assert from 'node:assert/strict';
import test from 'node:test';

import { createProgramDal, type PlannedExerciseRecord, type PlannedSessionRecord } from '../../src/server/dal/program';

function createExercise(overrides: Partial<PlannedExerciseRecord> = {}): PlannedExerciseRecord {
  return {
    id: 'exercise_1',
    userId: 'user_1',
    plannedSessionId: 'session_1',
    orderIndex: 0,
    exerciseKey: 'barbell_back_squat',
    displayName: 'Barbell Back Squat',
    movementPattern: 'squat',
    sets: 4,
    targetReps: 6,
    targetLoad: '80kg',
    restMinSec: 120,
    restMaxSec: 180,
    isSubstituted: false,
    originalExerciseKey: null,
    createdAt: new Date('2026-03-01T08:00:00.000Z'),
    updatedAt: new Date('2026-03-01T08:00:00.000Z'),
    ...overrides,
  };
}

function createSession(overrides: Partial<PlannedSessionRecord> = {}): PlannedSessionRecord {
  return {
    id: 'session_1',
    userId: 'user_1',
    programPlanId: 'plan_1',
    scheduledDate: new Date('2026-03-01T08:00:00.000Z'),
    dayIndex: 0,
    focusLabel: 'Lower Body',
    state: 'completed',
    completedAt: new Date('2026-03-01T09:00:00.000Z'),
    createdAt: new Date('2026-03-01T08:00:00.000Z'),
    updatedAt: new Date('2026-03-01T09:00:00.000Z'),
    exercises: [createExercise()],
    ...overrides,
  };
}

test('trend summary returns deterministic 7d buckets and zero-fills missing days', async () => {
  const db = {
    async $transaction<T>(callback: (tx: never) => Promise<T>): Promise<T> {
      return callback(this as never);
    },
    programPlan: {
      async updateMany() {
        return { count: 0 };
      },
      async create() {
        throw new Error('not used');
      },
    },
    plannedExercise: {
      async findUnique() {
        return null;
      },
      async update() {
        throw new Error('not used');
      },
    },
    plannedSession: {
      async findFirst() {
        return null;
      },
      async findMany() {
        return [
          {
            ...createSession({
              id: 'session_1',
              scheduledDate: new Date('2026-03-03T08:00:00.000Z'),
              completedAt: new Date('2026-03-03T09:00:00.000Z'),
              exercises: [createExercise({ id: 'exercise_1', orderIndex: 0, plannedSessionId: 'session_1' })],
            }),
            loggedSets: [{ plannedExerciseId: 'exercise_1', weight: 80, reps: 6 }],
          },
          {
            ...createSession({
              id: 'session_2',
              scheduledDate: new Date('2026-03-05T08:00:00.000Z'),
              completedAt: new Date('2026-03-05T09:00:00.000Z'),
              exercises: [createExercise({ id: 'exercise_2', orderIndex: 0, plannedSessionId: 'session_2' })],
            }),
            loggedSets: [{ plannedExerciseId: 'exercise_2', weight: 90, reps: 5 }],
          },
          {
            ...createSession({
              id: 'session_3',
              state: 'planned',
              scheduledDate: new Date('2026-03-06T08:00:00.000Z'),
              completedAt: null,
              exercises: [createExercise({ id: 'exercise_3', orderIndex: 0, plannedSessionId: 'session_3' })],
            }),
            loggedSets: [],
          },
        ];
      },
    },
  };

  const dal = createProgramDal(db as never, { userId: 'user_1' }) as unknown as {
    getTrendSummary(args: { period: '7d' | '30d' | '90d'; now?: Date }): Promise<{
      period: '7d' | '30d' | '90d';
      metrics: {
        volume: { kpi: number; points: Array<{ date: string; value: number }> };
        intensity: { kpi: number; points: Array<{ date: string; value: number }> };
        adherence: { kpi: number; points: Array<{ date: string; value: number }> };
      };
    }>;
  };

  const summary = await dal.getTrendSummary({
    period: '7d',
    now: new Date('2026-03-07T12:00:00.000Z'),
  });

  assert.equal(summary.period, '7d');
  assert.equal(summary.metrics.volume.points.length, 7);
  assert.equal(summary.metrics.volume.points[0]?.date, '2026-03-01');
  assert.equal(summary.metrics.volume.points[2]?.value, 480);
  assert.equal(summary.metrics.volume.points[1]?.value, 0);
  assert.equal(summary.metrics.adherence.points[5]?.value, 0);
});

test('intensity uses deterministic key-exercise subset and excludes sessions outside selected horizon', async () => {
  const db = {
    async $transaction<T>(callback: (tx: never) => Promise<T>): Promise<T> {
      return callback(this as never);
    },
    programPlan: {
      async updateMany() {
        return { count: 0 };
      },
      async create() {
        throw new Error('not used');
      },
    },
    plannedExercise: {
      async findUnique() {
        return null;
      },
      async update() {
        throw new Error('not used');
      },
    },
    plannedSession: {
      async findFirst() {
        return null;
      },
      async findMany() {
        return [
          {
            ...createSession({
              id: 'session_a',
              scheduledDate: new Date('2026-03-06T08:00:00.000Z'),
              completedAt: new Date('2026-03-06T09:00:00.000Z'),
              exercises: [
                createExercise({ id: 'key_a', orderIndex: 0, plannedSessionId: 'session_a' }),
                createExercise({ id: 'acc_a', orderIndex: 1, plannedSessionId: 'session_a', exerciseKey: 'leg_extension' }),
              ],
            }),
            loggedSets: [
              { plannedExerciseId: 'key_a', weight: 100, reps: 5 },
              { plannedExerciseId: 'key_a', weight: 110, reps: 5 },
              { plannedExerciseId: 'acc_a', weight: 30, reps: 12 },
            ],
          },
          {
            ...createSession({
              id: 'session_b',
              scheduledDate: new Date('2026-03-07T08:00:00.000Z'),
              completedAt: new Date('2026-03-07T09:00:00.000Z'),
              exercises: [createExercise({ id: 'key_b', orderIndex: 0, plannedSessionId: 'session_b' })],
            }),
            loggedSets: [{ plannedExerciseId: 'key_b', weight: 120, reps: 4 }],
          },
          {
            ...createSession({
              id: 'session_old',
              scheduledDate: new Date('2026-02-20T08:00:00.000Z'),
              completedAt: new Date('2026-02-20T09:00:00.000Z'),
              exercises: [createExercise({ id: 'key_old', orderIndex: 0, plannedSessionId: 'session_old' })],
            }),
            loggedSets: [{ plannedExerciseId: 'key_old', weight: 200, reps: 4 }],
          },
        ];
      },
    },
  };

  const dal = createProgramDal(db as never, { userId: 'user_1' }) as unknown as {
    getTrendSummary(args: { period: '7d' | '30d' | '90d'; now?: Date }): Promise<{
      metrics: {
        intensity: { kpi: number };
      };
    }>;
  };

  const summary = await dal.getTrendSummary({
    period: '7d',
    now: new Date('2026-03-07T12:00:00.000Z'),
  });
  assert.equal(summary.metrics.intensity.kpi, 110);
});

test('exercise drilldown returns ordered reps/load points for one exercise key with account-scoped filtering', async () => {
  let seenUserId = '';
  const db = {
    async $transaction<T>(callback: (tx: never) => Promise<T>): Promise<T> {
      return callback(this as never);
    },
    programPlan: {
      async updateMany() {
        return { count: 0 };
      },
      async create() {
        throw new Error('not used');
      },
    },
    plannedExercise: {
      async findUnique() {
        return null;
      },
      async update() {
        throw new Error('not used');
      },
    },
    plannedSession: {
      async findFirst() {
        return null;
      },
      async findMany(args: { where: { userId: string } }) {
        seenUserId = args.where.userId;
        return [
          {
            ...createSession({
              id: 'session_1',
              scheduledDate: new Date('2026-03-01T08:00:00.000Z'),
              completedAt: new Date('2026-03-01T09:00:00.000Z'),
              exercises: [
                createExercise({ id: 's1_target', plannedSessionId: 'session_1', exerciseKey: 'barbell_back_squat' }),
                createExercise({ id: 's1_other', plannedSessionId: 'session_1', exerciseKey: 'leg_extension', orderIndex: 1 }),
              ],
            }),
            loggedSets: [
              { plannedExerciseId: 's1_target', weight: 80, reps: 6 },
              { plannedExerciseId: 's1_target', weight: 82.5, reps: 5 },
              { plannedExerciseId: 's1_other', weight: 20, reps: 12 },
            ],
          },
          {
            ...createSession({
              id: 'session_2',
              scheduledDate: new Date('2026-03-03T08:00:00.000Z'),
              completedAt: new Date('2026-03-03T09:00:00.000Z'),
              exercises: [createExercise({ id: 's2_target', plannedSessionId: 'session_2', exerciseKey: 'barbell_back_squat' })],
            }),
            loggedSets: [{ plannedExerciseId: 's2_target', weight: 85, reps: 5 }],
          },
        ];
      },
    },
  };

  const dal = createProgramDal(db as never, { userId: 'user_1' }) as unknown as {
    getExerciseTrendSeries(args: {
      period: '7d' | '30d' | '90d';
      exerciseKey: string;
      now?: Date;
    }): Promise<{
      exercise: { key: string; displayName: string };
      points: Array<{ date: string; reps: number; load: number }>;
    } | null>;
  };

  const series = await dal.getExerciseTrendSeries({
    period: '30d',
    exerciseKey: 'barbell_back_squat',
    now: new Date('2026-03-07T12:00:00.000Z'),
  });

  assert.equal(seenUserId, 'user_1');
  assert.equal(series?.exercise.key, 'barbell_back_squat');
  assert.equal(series?.points.length, 2);
  assert.equal(series?.points[0]?.date, '2026-03-01');
  assert.equal(series?.points[0]?.reps, 11);
  assert.equal(series?.points[0]?.load, 81.25);
  assert.equal(series?.points[1]?.date, '2026-03-03');
});
