import assert from 'node:assert/strict';
import test from 'node:test';

import { createProgramDal, type PlannedExerciseRecord, type PlannedSessionRecord, type ProgramPlanRecord } from '../../src/server/dal/program';

function createExercise(overrides: Partial<PlannedExerciseRecord> = {}): PlannedExerciseRecord {
  return {
    id: 'exercise_1',
    userId: 'user_1',
    plannedSessionId: 'session_1',
    orderIndex: 0,
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
    createdAt: new Date('2026-03-04T08:00:00.000Z'),
    updatedAt: new Date('2026-03-04T08:00:00.000Z'),
    ...overrides,
  };
}

function createSession(overrides: Partial<PlannedSessionRecord> = {}): PlannedSessionRecord {
  return {
    id: 'session_1',
    userId: 'user_1',
    programPlanId: 'plan_1',
    scheduledDate: new Date('2026-03-04T08:00:00.000Z'),
    dayIndex: 0,
    focusLabel: 'Lower Body',
    state: 'planned',
    createdAt: new Date('2026-03-04T08:00:00.000Z'),
    updatedAt: new Date('2026-03-04T08:00:00.000Z'),
    exercises: [createExercise()],
    ...overrides,
  };
}

function createPlan(overrides: Partial<ProgramPlanRecord & { sessions: PlannedSessionRecord[] }> = {}) {
  return {
    id: 'plan_1',
    userId: 'user_1',
    status: 'active',
    startDate: new Date('2026-03-04T00:00:00.000Z'),
    endDate: new Date('2026-03-10T00:00:00.000Z'),
    createdAt: new Date('2026-03-04T08:00:00.000Z'),
    updatedAt: new Date('2026-03-04T08:00:00.000Z'),
    sessions: [createSession()],
    ...overrides,
  };
}

test('replaceActivePlan archives existing active plan and creates account-scoped replacement', async () => {
  const calls: Array<{ kind: string; args: unknown }> = [];
  const createdPlan = createPlan();

  const db = {
    async $transaction<T>(callback: (tx: never) => Promise<T>): Promise<T> {
      return callback(this as never);
    },
    programPlan: {
      async updateMany(args: unknown) {
        calls.push({ kind: 'updateMany', args });
        return { count: 1 };
      },
      async create(args: unknown) {
        calls.push({ kind: 'create', args });
        return createdPlan;
      },
    },
    plannedSession: {
      async findFirst() {
        return null;
      },
    },
    plannedExercise: {
      async findUnique() {
        return null;
      },
      async update() {
        throw new Error('not used in this test');
      },
    },
  };

  const dal = createProgramDal(db as never, { userId: 'user_1' });

  const result = await dal.replaceActivePlan({
    startDate: new Date('2026-03-04T00:00:00.000Z'),
    endDate: new Date('2026-03-10T00:00:00.000Z'),
    sessions: [
      {
        scheduledDate: new Date('2026-03-04T08:00:00.000Z'),
        dayIndex: 0,
        focusLabel: 'Lower Body',
        exercises: [
          {
            orderIndex: 0,
            exerciseKey: 'goblet_squat',
            displayName: 'Goblet Squat',
            movementPattern: 'squat',
            sets: 4,
            targetReps: 8,
            targetLoad: '24kg',
            restMinSec: 90,
            restMaxSec: 120,
          },
        ],
      },
    ],
  });

  assert.equal(result.id, 'plan_1');
  assert.equal(calls.length, 2);

  const updateManyWhere = (calls[0].args as { where: { userId: string; status: string } }).where;
  assert.equal(updateManyWhere.userId, 'user_1');
  assert.equal(updateManyWhere.status, 'active');

  const createData = (calls[1].args as { data: { userId: string; sessions: { create: Array<{ userId: string }> } } }).data;
  assert.equal(createData.userId, 'user_1');
  assert.equal(createData.sessions.create[0]?.userId, 'user_1');
});

test('getTodayOrNextSessionCandidates returns today first and falls back to next planned session', async () => {
  const todaySession = createSession();
  const nextSession = createSession({ id: 'session_2', scheduledDate: new Date('2026-03-06T08:00:00.000Z') });

  let shouldReturnToday = true;
  const db = {
    async $transaction<T>(callback: (tx: never) => Promise<T>): Promise<T> {
      return callback(this as never);
    },
    programPlan: {
      async updateMany() {
        return { count: 0 };
      },
      async create() {
        return createPlan();
      },
    },
    plannedSession: {
      async findFirst(args: { where: { scheduledDate: { gte?: Date; gt?: Date } } }) {
        const isTodayQuery = Boolean(args.where.scheduledDate.gte);

        if (isTodayQuery && shouldReturnToday) {
          return todaySession;
        }

        if (!isTodayQuery) {
          return nextSession;
        }

        return null;
      },
    },
    plannedExercise: {
      async findUnique() {
        return null;
      },
      async update() {
        throw new Error('not used in this test');
      },
    },
  };

  const dal = createProgramDal(db as never, { userId: 'user_1' });

  const withToday = await dal.getTodayOrNextSessionCandidates(new Date('2026-03-04T09:00:00.000Z'));
  assert.equal(withToday.todaySession?.id, 'session_1');
  assert.equal(withToday.nextSession, null);

  shouldReturnToday = false;
  const noToday = await dal.getTodayOrNextSessionCandidates(new Date('2026-03-07T09:00:00.000Z'));
  assert.equal(noToday.todaySession, null);
  assert.equal(noToday.nextSession?.id, 'session_2');
});

test('ownership checks enforce account boundary and substitution updates single row', async () => {
  const originalExercise = createExercise();
  let persisted = originalExercise;

  const db = {
    async $transaction<T>(callback: (tx: never) => Promise<T>): Promise<T> {
      return callback(this as never);
    },
    programPlan: {
      async updateMany() {
        return { count: 0 };
      },
      async create() {
        return createPlan();
      },
    },
    plannedSession: {
      async findFirst() {
        return null;
      },
    },
    plannedExercise: {
      async findUnique() {
        return {
          ...persisted,
          plannedSession: {
            id: 'session_1',
            userId: persisted.userId,
            scheduledDate: new Date('2026-03-04T08:00:00.000Z'),
          },
        };
      },
      async update(args: {
        data: {
          exerciseKey: string;
          displayName: string;
          movementPattern: 'squat';
          isSubstituted: boolean;
          originalExerciseKey: string;
        };
      }) {
        persisted = {
          ...persisted,
          ...args.data,
          updatedAt: new Date('2026-03-04T10:00:00.000Z'),
        };

        return persisted;
      },
    },
  };

  const dal = createProgramDal(db as never, { userId: 'user_1' });
  const ownership = await dal.getPlannedExerciseOwnership('exercise_1');

  assert.equal(ownership?.scheduledDate, '2026-03-04');
  assert.equal(ownership?.exerciseKey, 'goblet_squat');

  const updated = await dal.applyPlannedExerciseSubstitution('exercise_1', {
    replacementExerciseKey: 'leg_press',
    replacementDisplayName: 'Leg Press',
    replacementMovementPattern: 'squat',
  });

  assert.equal(updated.exerciseKey, 'leg_press');
  assert.equal(updated.isSubstituted, true);
  assert.equal(updated.originalExerciseKey, 'goblet_squat');

  const mismatchedOwnerDal = createProgramDal(
    {
      ...db,
      plannedExercise: {
        ...db.plannedExercise,
        async findUnique() {
          return {
            ...persisted,
            userId: 'other_user',
            plannedSession: {
              id: 'session_1',
              userId: 'other_user',
              scheduledDate: new Date('2026-03-04T08:00:00.000Z'),
            },
          };
        },
      },
    } as never,
    { userId: 'user_1' },
  );

  await assert.rejects(
    () => mismatchedOwnerDal.getPlannedExerciseOwnership('exercise_1'),
    /mismatched account context/i,
  );
});
