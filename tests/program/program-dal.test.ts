import assert from 'node:assert/strict';
import test from 'node:test';

import { createProgramDal, type PlannedExerciseRecord, type PlannedSessionRecord, type ProgramPlanRecord } from '../../src/server/dal/program';

async function loadSessionLoggingServiceFactory(): Promise<
  (deps: { programDal: Record<string, unknown>; now?: () => Date }) => Record<string, unknown>
> {
  const loaded = await import('../../src/server/services/session-logging');
  return loaded.createSessionLoggingService as unknown as (deps: {
    programDal: Record<string, unknown>;
    now?: () => Date;
  }) => Record<string, unknown>;
}

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

test('upsertLoggedSet updates existing rows for matching plannedExerciseId and setIndex', async () => {
  const persistedByKey = new Map<string, { id: string; plannedExerciseId: string; setIndex: number; weight: number; reps: number; rpe: number | null }>();
  persistedByKey.set('exercise_1:1', {
    id: 'set_1',
    plannedExerciseId: 'exercise_1',
    setIndex: 1,
    weight: 20,
    reps: 10,
    rpe: null,
  });

  let createCount = 0;
  let updateCount = 0;

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
      async update() {
        throw new Error('not used in this test');
      },
      async findMany() {
        return [];
      },
    },
    plannedExercise: {
      async findUnique() {
        return {
          ...createExercise(),
          plannedSession: {
            id: 'session_1',
            userId: 'user_1',
            scheduledDate: new Date('2026-03-04T08:00:00.000Z'),
            completedAt: null,
          },
        };
      },
      async update() {
        throw new Error('not used in this test');
      },
      async findMany() {
        return [];
      },
    },
    loggedSet: {
      async upsert(args: {
        where: { plannedExerciseId_setIndex: { plannedExerciseId: string; setIndex: number } };
        create: { plannedExerciseId: string; setIndex: number; weight: number; reps: number; rpe: number | null };
        update: { weight: number; reps: number; rpe: number | null };
      }) {
        const key = `${args.where.plannedExerciseId_setIndex.plannedExerciseId}:${args.where.plannedExerciseId_setIndex.setIndex}`;
        const existing = persistedByKey.get(key);
        if (existing) {
          updateCount += 1;
          const next = { ...existing, ...args.update };
          persistedByKey.set(key, next);
          return next;
        }

        createCount += 1;
        const created = {
          id: `set_${createCount + updateCount + 1}`,
          ...args.create,
        };
        persistedByKey.set(key, created);
        return created;
      },
    },
  };

  const dal = createProgramDal(db as never, { userId: 'user_1' }) as unknown as {
    upsertLoggedSet(args: {
      plannedExerciseId: string;
      setIndex: number;
      weight: number;
      reps: number;
      rpe: number | null;
    }): Promise<{ id: string; setIndex: number; weight: number; reps: number; rpe: number | null }>;
  };

  const updated = await dal.upsertLoggedSet({
    plannedExerciseId: 'exercise_1',
    setIndex: 1,
    weight: 24,
    reps: 8,
    rpe: 8,
  });

  assert.equal(updated.id, 'set_1');
  assert.equal(updated.weight, 24);
  assert.equal(updated.reps, 8);
  assert.equal(updated.rpe, 8);
  assert.equal(createCount, 0);
  assert.equal(updateCount, 1);
  assert.equal(persistedByKey.size, 1);
});

test('upsertLoggedSet rejects when a concurrent completion wins before the guarded write', async () => {
  let upsertCount = 0;

  const db = {
    async $transaction<T>(callback: (tx: never) => Promise<T>): Promise<T> {
      return callback(this as never);
    },
    async $queryRawUnsafe() {
      return [
        {
          id: 'session_1',
          startedAt: new Date('2026-03-04T08:00:00.000Z'),
          completedAt: new Date('2026-03-04T09:00:00.000Z'),
        },
      ];
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
      async findUnique() {
        return createSession({
          id: 'session_1',
          userId: 'user_1',
          completedAt: null as never,
        } as never);
      },
      async findMany() {
        return [];
      },
    },
    plannedExercise: {
      async findUnique() {
        return {
          ...createExercise(),
          plannedSession: {
            id: 'session_1',
            userId: 'user_1',
            scheduledDate: new Date('2026-03-04T08:00:00.000Z'),
            startedAt: new Date('2026-03-04T08:00:00.000Z'),
            completedAt: null,
          },
        };
      },
      async update() {
        throw new Error('not used in this test');
      },
      async findMany() {
        return [];
      },
    },
    loggedSet: {
      async upsert() {
        upsertCount += 1;
        return {
          id: 'set_1',
          plannedExerciseId: 'exercise_1',
          setIndex: 1,
          weight: 20,
          reps: 8,
          rpe: null,
        };
      },
    },
  };

  const dal = createProgramDal(db as never, { userId: 'user_1' }) as unknown as {
    upsertLoggedSet(args: {
      plannedExerciseId: string;
      setIndex: number;
      weight: number;
      reps: number;
      rpe: number | null;
    }): Promise<void>;
  };

  await assert.rejects(
    () =>
      dal.upsertLoggedSet({
        plannedExerciseId: 'exercise_1',
        setIndex: 1,
        weight: 20,
        reps: 8,
        rpe: 7,
      }),
    /completed/i,
  );
  assert.equal(upsertCount, 0);
});

test('skip requires reason code and revert is blocked after session completion', async () => {
  let skipUpdateCount = 0;
  let completed = false;
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
      async update() {
        throw new Error('not used in this test');
      },
      async findMany() {
        return [];
      },
    },
    plannedExercise: {
      async findUnique() {
        return {
          ...createExercise(),
          plannedSession: {
            id: 'session_1',
            userId: 'user_1',
            scheduledDate: new Date('2026-03-04T08:00:00.000Z'),
            completedAt: completed ? new Date('2026-03-04T10:00:00.000Z') : null,
          },
        };
      },
      async update() {
        skipUpdateCount += 1;
        return createExercise();
      },
      async findMany() {
        return [];
      },
    },
    loggedSet: {
      async upsert() {
        throw new Error('not used in this test');
      },
    },
  };

  const dal = createProgramDal(db as never, { userId: 'user_1' }) as unknown as {
    markExerciseSkipped(args: { plannedExerciseId: string; reasonCode: string; reasonText?: string }): Promise<void>;
    revertExerciseSkipped(plannedExerciseId: string): Promise<void>;
  };

  await assert.rejects(
    () =>
      dal.markExerciseSkipped({
        plannedExerciseId: 'exercise_1',
        reasonCode: '',
      }),
    /reason code/i,
  );
  assert.equal(skipUpdateCount, 0);

  await dal.markExerciseSkipped({
    plannedExerciseId: 'exercise_1',
    reasonCode: 'pain',
    reasonText: 'knee discomfort',
  });
  assert.equal(skipUpdateCount, 1);

  completed = true;
  await assert.rejects(() => dal.revertExerciseSkipped('exercise_1'), /completed/i);
});

test('markExerciseSkipped rejects when a concurrent completion wins before the guarded update', async () => {
  let skipUpdateCount = 0;

  const db = {
    async $transaction<T>(callback: (tx: never) => Promise<T>): Promise<T> {
      return callback(this as never);
    },
    async $queryRawUnsafe() {
      return [
        {
          id: 'session_1',
          startedAt: new Date('2026-03-04T08:00:00.000Z'),
          completedAt: new Date('2026-03-04T09:00:00.000Z'),
        },
      ];
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
      async findUnique() {
        return createSession({
          id: 'session_1',
          userId: 'user_1',
          completedAt: null as never,
        } as never);
      },
      async findMany() {
        return [];
      },
    },
    plannedExercise: {
      async findUnique() {
        return {
          ...createExercise(),
          plannedSession: {
            id: 'session_1',
            userId: 'user_1',
            scheduledDate: new Date('2026-03-04T08:00:00.000Z'),
            startedAt: new Date('2026-03-04T08:00:00.000Z'),
            completedAt: null,
          },
        };
      },
      async update() {
        skipUpdateCount += 1;
        return createExercise();
      },
      async findMany() {
        return [];
      },
    },
    loggedSet: {
      async upsert() {
        throw new Error('not used in this test');
      },
    },
  };

  const dal = createProgramDal(db as never, { userId: 'user_1' }) as unknown as {
    markExerciseSkipped(args: { plannedExerciseId: string; reasonCode: string; reasonText?: string }): Promise<void>;
  };

  await assert.rejects(
    () =>
      dal.markExerciseSkipped({
        plannedExerciseId: 'exercise_1',
        reasonCode: 'pain',
        reasonText: 'knee discomfort',
      }),
    /completed/i,
  );
  assert.equal(skipUpdateCount, 0);
});

test('completeSession persists feedback once and rejects post-completion set edits', async () => {
  let completedAt: Date | null = null;
  let completeUpdateCount = 0;

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
      async findUnique() {
        return createSession({
          id: 'session_1',
          userId: 'user_1',
          completedAt: completedAt as never,
        } as never);
      },
      async update() {
        completeUpdateCount += 1;
        completedAt = completedAt ?? new Date('2026-03-04T10:10:00.000Z');
        return createSession({
          completedAt: completedAt ?? undefined,
        } as never);
      },
      async findMany() {
        return [];
      },
    },
    plannedExercise: {
      async findUnique() {
        return {
          ...createExercise(),
          plannedSession: {
            id: 'session_1',
            userId: 'user_1',
            scheduledDate: new Date('2026-03-04T08:00:00.000Z'),
            completedAt,
          },
        };
      },
      async update() {
        return createExercise();
      },
      async findMany() {
        return [];
      },
    },
    loggedSet: {
      async upsert() {
        return {
          id: 'set_1',
          plannedExerciseId: 'exercise_1',
          setIndex: 1,
          weight: 20,
          reps: 8,
          rpe: null,
        };
      },
    },
  };

  const dal = createProgramDal(db as never, { userId: 'user_1' }) as unknown as {
    completeSession(args: {
      plannedSessionId: string;
      fatigue: number;
      readiness: number;
      comment?: string;
      completedAt: Date;
      effectiveDurationSec: number;
    }): Promise<void>;
    upsertLoggedSet(args: {
      plannedExerciseId: string;
      setIndex: number;
      weight: number;
      reps: number;
      rpe: number | null;
    }): Promise<void>;
  };

  await dal.completeSession({
    plannedSessionId: 'session_1',
    fatigue: 3,
    readiness: 4,
    comment: 'solid',
    completedAt: new Date('2026-03-04T10:10:00.000Z'),
    effectiveDurationSec: 3900,
  });

  await assert.rejects(
    () =>
      dal.completeSession({
        plannedSessionId: 'session_1',
        fatigue: 3,
        readiness: 4,
        completedAt: new Date('2026-03-04T10:11:00.000Z'),
        effectiveDurationSec: 3910,
      }),
    /already completed/i,
  );
  assert.equal(completeUpdateCount, 1);

  await assert.rejects(
    () =>
      dal.upsertLoggedSet({
        plannedExerciseId: 'exercise_1',
        setIndex: 1,
        weight: 22,
        reps: 8,
        rpe: 8,
      }),
    /completed/i,
  );
});

test('updateSessionNote rejects when a concurrent completion wins before the guarded update', async () => {
  let noteUpdateCount = 0;

  const db = {
    async $transaction<T>(callback: (tx: never) => Promise<T>): Promise<T> {
      return callback(this as never);
    },
    async $queryRawUnsafe() {
      return [
        {
          id: 'session_1',
          startedAt: new Date('2026-03-04T08:00:00.000Z'),
          completedAt: new Date('2026-03-04T09:00:00.000Z'),
        },
      ];
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
      async findUnique() {
        return createSession({
          id: 'session_1',
          userId: 'user_1',
          completedAt: null as never,
        } as never);
      },
      async update() {
        noteUpdateCount += 1;
        return createSession();
      },
      async findMany() {
        return [];
      },
    },
    plannedExercise: {
      async findUnique() {
        return null;
      },
      async update() {
        throw new Error('not used in this test');
      },
      async findMany() {
        return [];
      },
    },
    loggedSet: {
      async upsert() {
        throw new Error('not used in this test');
      },
    },
  };

  const dal = createProgramDal(db as never, { userId: 'user_1' }) as unknown as {
    updateSessionNote(args: { plannedSessionId: string; note: string | null }): Promise<void>;
  };

  await assert.rejects(
    () =>
      dal.updateSessionNote({
        plannedSessionId: 'session_1',
        note: 'Tempo clean today',
      }),
    /completed/i,
  );
  assert.equal(noteUpdateCount, 0);
});

test('completeSession rejects when a concurrent completion already won the single-writer update', async () => {
  let updateCalls = 0;
  let guardedUpdateCalls = 0;

  const db = {
    async $transaction<T>(callback: (tx: never) => Promise<T>): Promise<T> {
      return callback(this as never);
    },
    async $queryRawUnsafe() {
      return [
        {
          id: 'session_1',
          startedAt: new Date('2026-03-04T08:00:00.000Z'),
          completedAt: null,
        },
      ];
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
      async findUnique() {
        return createSession({
          id: 'session_1',
          userId: 'user_1',
          completedAt: null as never,
        } as never);
      },
      async updateMany() {
        guardedUpdateCalls += 1;
        return { count: 0 };
      },
      async update() {
        updateCalls += 1;
        return createSession({
          completedAt: new Date('2026-03-04T10:10:00.000Z') as never,
        } as never);
      },
      async findMany() {
        return [];
      },
    },
    plannedExercise: {
      async findUnique() {
        return null;
      },
      async update() {
        throw new Error('not used in this test');
      },
      async findMany() {
        return [];
      },
    },
    loggedSet: {
      async upsert() {
        throw new Error('not used in this test');
      },
    },
  };

  const dal = createProgramDal(db as never, { userId: 'user_1' }) as unknown as {
    completeSession(args: {
      plannedSessionId: string;
      fatigue: number;
      readiness: number;
      comment?: string;
      completedAt: Date;
      effectiveDurationSec: number;
    }): Promise<void>;
  };

  await assert.rejects(
    () =>
      dal.completeSession({
        plannedSessionId: 'session_1',
        fatigue: 3,
        readiness: 4,
        comment: 'solid',
        completedAt: new Date('2026-03-04T10:10:00.000Z'),
        effectiveDurationSec: 3900,
      }),
    /already completed/i,
  );
  assert.equal(guardedUpdateCalls, 1);
  assert.equal(updateCalls, 0);
});

test('history list/detail are account-scoped and include aggregated load with grouped sets', async () => {
  const historyWhereClauses: Array<{ userId: string; completedAt: { gte: Date; lte: Date } }> = [];
  let detailExerciseWhereUserId = '';
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
      async findUnique() {
        return createSession({
          id: 'session_1',
          userId: 'user_1',
          completedAt: new Date('2026-03-04T09:00:00.000Z') as never,
          effectiveDurationSec: 3600 as never,
        } as never);
      },
      async update() {
        throw new Error('not used in this test');
      },
      async findMany(args: { where: { userId: string; completedAt: { gte: Date; lte: Date } } }) {
        historyWhereClauses.push(args.where);
        return [
          {
            id: 'session_1',
            userId: 'user_1',
            scheduledDate: new Date('2026-03-04T08:00:00.000Z'),
            completedAt: new Date('2026-03-04T09:00:00.000Z'),
            effectiveDurationSec: 3600,
            exercises: [{ id: 'exercise_1' }, { id: 'exercise_2' }],
            loggedSets: [
              { plannedExerciseId: 'exercise_1', weight: 20, reps: 10 },
              { plannedExerciseId: 'exercise_1', weight: 22.5, reps: 8 },
              { plannedExerciseId: 'exercise_2', weight: 60, reps: 6 },
            ],
          },
        ];
      },
    },
    plannedExercise: {
      async findUnique() {
        return null;
      },
      async update() {
        return createExercise();
      },
      async findMany(args: { where: { userId: string; plannedSessionId: string } }) {
        detailExerciseWhereUserId = args.where.userId;
        return [
          {
            ...createExercise({
              id: 'exercise_1',
              exerciseKey: 'goblet_squat',
              displayName: 'Goblet Squat',
              movementPattern: 'squat',
              isSkipped: false as never,
              skipReasonCode: null as never,
              skipReasonText: null as never,
            }),
            loggedSets: [
              { setIndex: 1, weight: 20, reps: 10, rpe: null },
              { setIndex: 2, weight: 22.5, reps: 8, rpe: 8 },
            ],
          },
        ];
      },
    },
    loggedSet: {
      async upsert() {
        throw new Error('not used in this test');
      },
    },
  };

  const dal = createProgramDal(db as never, { userId: 'user_1' }) as unknown as {
    getHistoryList(args: { from: Date; to: Date }): Promise<Array<{ id: string; exerciseCount: number; totalLoad: number }>>;
    getHistorySessionDetail(sessionId: string): Promise<{
      id: string;
      exercises: Array<{
        id: string;
        loggedSets: Array<{ setIndex: number; weight: number; reps: number; rpe: number | null }>;
      }>;
    } | null>;
  };

  const list = await dal.getHistoryList({
    from: new Date('2026-03-01T00:00:00.000Z'),
    to: new Date('2026-03-04T23:59:59.000Z'),
  });
  assert.equal(historyWhereClauses[0]?.userId, 'user_1');
  assert.equal(list.length, 1);
  assert.equal(list[0]?.exerciseCount, 2);
  assert.equal(list[0]?.totalLoad, 740);

  const detail = await dal.getHistorySessionDetail('session_1');
  assert.equal(detailExerciseWhereUserId, 'user_1');
  assert.equal(detail?.exercises.length, 1);
  assert.equal(detail?.exercises[0]?.loggedSets.length, 2);
});

test('service starts timer on first logged set and preserves original startedAt for later edits', async () => {
  const createSessionLoggingService = await loadSessionLoggingServiceFactory();
  let startedAtIso: string | null = null;
  let markStartedCalls = 0;
  const nowValues = [new Date('2026-03-04T08:00:00.000Z'), new Date('2026-03-04T08:06:00.000Z')];

  const service = createSessionLoggingService({
    now: () => nowValues.shift() ?? new Date('2026-03-04T08:06:00.000Z'),
    programDal: {
      async getPlannedExerciseOwnership() {
        return {
          plannedExerciseId: 'exercise_1',
          plannedSessionId: 'session_1',
        };
      },
      async getSessionLifecycle() {
        return {
          plannedSessionId: 'session_1',
          startedAt: startedAtIso ? new Date(startedAtIso) : null,
          completedAt: null,
        };
      },
      async markSessionStarted(_: string, at: Date) {
        markStartedCalls += 1;
        startedAtIso = startedAtIso ?? at.toISOString();
        return { startedAt: startedAtIso };
      },
      async upsertLoggedSet() {
        return { id: 'set_1' };
      },
    },
  }) as unknown as {
    logSet(args: { plannedExerciseId: string; setIndex: number; weight: number; reps: number; rpe?: number }): Promise<void>;
  };

  await service.logSet({
    plannedExerciseId: 'exercise_1',
    setIndex: 1,
    weight: 20,
    reps: 10,
    rpe: 7,
  });
  await service.logSet({
    plannedExerciseId: 'exercise_1',
    setIndex: 1,
    weight: 22.5,
    reps: 8,
    rpe: 8,
  });

  assert.equal(startedAtIso, '2026-03-04T08:00:00.000Z');
  assert.equal(markStartedCalls, 1);
});

test('service completion computes effectiveDurationSec from startedAt to completion time', async () => {
  const createSessionLoggingService = await loadSessionLoggingServiceFactory();
  let completePayload:
    | {
        effectiveDurationSec: number;
        plannedSessionId: string;
      }
    | undefined;

  const service = createSessionLoggingService({
    now: () => new Date('2026-03-04T09:10:00.000Z'),
    programDal: {
      async getSessionLifecycle() {
        return {
          plannedSessionId: 'session_1',
          startedAt: new Date('2026-03-04T08:00:00.000Z'),
          completedAt: null,
        };
      },
      async completeSession(payload: { plannedSessionId: string; effectiveDurationSec: number }) {
        completePayload = payload;
      },
    },
  }) as unknown as {
    completeSession(args: { plannedSessionId: string; fatigue: number; readiness: number; comment?: string }): Promise<void>;
  };

  await service.completeSession({
    plannedSessionId: 'session_1',
    fatigue: 3,
    readiness: 4,
    comment: 'good',
  });

  assert.equal(completePayload?.plannedSessionId, 'session_1');
  assert.equal(completePayload?.effectiveDurationSec, 4200);
});

test('service accepts duration correction within 24h and rejects afterward', async () => {
  const createSessionLoggingService = await loadSessionLoggingServiceFactory();
  let correctionCalls = 0;

  const serviceWithinWindow = createSessionLoggingService({
    now: () => new Date('2026-03-05T09:00:00.000Z'),
    programDal: {
      async getSessionLifecycle() {
        return {
          plannedSessionId: 'session_1',
          startedAt: new Date('2026-03-04T08:00:00.000Z'),
          completedAt: new Date('2026-03-04T10:00:00.000Z'),
        };
      },
      async correctSessionDuration() {
        correctionCalls += 1;
      },
    },
  }) as unknown as {
    correctDuration(args: { plannedSessionId: string; effectiveDurationSec: number }): Promise<void>;
  };

  await serviceWithinWindow.correctDuration({
    plannedSessionId: 'session_1',
    effectiveDurationSec: 4800,
  });
  assert.equal(correctionCalls, 1);

  const serviceAfterWindow = createSessionLoggingService({
    now: () => new Date('2026-03-05T10:00:01.000Z'),
    programDal: {
      async getSessionLifecycle() {
        return {
          plannedSessionId: 'session_1',
          startedAt: new Date('2026-03-04T08:00:00.000Z'),
          completedAt: new Date('2026-03-04T10:00:00.000Z'),
        };
      },
      async correctSessionDuration() {
        correctionCalls += 1;
      },
    },
  }) as unknown as {
    correctDuration(args: { plannedSessionId: string; effectiveDurationSec: number }): Promise<void>;
  };

  await assert.rejects(
    () =>
      serviceAfterWindow.correctDuration({
        plannedSessionId: 'session_1',
        effectiveDurationSec: 4700,
      }),
    /24.?hour/i,
  );
  assert.equal(correctionCalls, 1);
});

test('service blocks set skip and note mutations after completion but allows valid duration correction', async () => {
  const createSessionLoggingService = await loadSessionLoggingServiceFactory();
  let correctionCalls = 0;

  const service = createSessionLoggingService({
    now: () => new Date('2026-03-04T12:00:00.000Z'),
    programDal: {
      async getPlannedExerciseOwnership() {
        return {
          plannedExerciseId: 'exercise_1',
          plannedSessionId: 'session_1',
        };
      },
      async getSessionLifecycle() {
        return {
          plannedSessionId: 'session_1',
          startedAt: new Date('2026-03-04T08:00:00.000Z'),
          completedAt: new Date('2026-03-04T11:00:00.000Z'),
        };
      },
      async upsertLoggedSet() {
        throw new Error('should not be called');
      },
      async markExerciseSkipped() {
        throw new Error('should not be called');
      },
      async revertExerciseSkipped() {
        throw new Error('should not be called');
      },
      async updateSessionNote() {
        throw new Error('should not be called');
      },
      async correctSessionDuration() {
        correctionCalls += 1;
      },
    },
  }) as unknown as {
    logSet(args: { plannedExerciseId: string; setIndex: number; weight: number; reps: number; rpe?: number }): Promise<void>;
    skipExercise(args: { plannedExerciseId: string; reasonCode: string; reasonText?: string }): Promise<void>;
    revertSkippedExercise(plannedExerciseId: string): Promise<void>;
    updateSessionNote(args: { plannedSessionId: string; note: string | null }): Promise<void>;
    correctDuration(args: { plannedSessionId: string; effectiveDurationSec: number }): Promise<void>;
  };

  await assert.rejects(
    () =>
      service.logSet({
        plannedExerciseId: 'exercise_1',
        setIndex: 1,
        weight: 20,
        reps: 10,
      }),
    /completed/i,
  );
  await assert.rejects(
    () =>
      service.skipExercise({
        plannedExerciseId: 'exercise_1',
        reasonCode: 'pain',
      }),
    /completed/i,
  );
  await assert.rejects(() => service.revertSkippedExercise('exercise_1'), /completed/i);
  await assert.rejects(
    () =>
      service.updateSessionNote({
        plannedSessionId: 'session_1',
        note: 'note',
      }),
    /completed/i,
  );

  await service.correctDuration({
    plannedSessionId: 'session_1',
    effectiveDurationSec: 3600,
  });
  assert.equal(correctionCalls, 1);
});
