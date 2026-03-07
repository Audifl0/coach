import assert from 'node:assert/strict';
import test from 'node:test';

import { createProgramDal, type PlannedExerciseRecord, type PlannedSessionRecord, type ProgramPlanRecord } from '../../src/server/dal/program';
import {
  buildHistoryQueryString,
  buildHistoryViewState,
  mapSessionDetailToGroupedSets,
} from '../../src/app/(private)/dashboard/_components/session-history-card';

function createExercise(overrides: Partial<PlannedExerciseRecord> = {}): PlannedExerciseRecord {
  return {
    id: 'exercise_1',
    userId: 'user_1',
    plannedSessionId: 'session_archived',
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
    createdAt: new Date('2026-03-03T08:00:00.000Z'),
    updatedAt: new Date('2026-03-03T08:00:00.000Z'),
    ...overrides,
  };
}

function createSession(overrides: Partial<PlannedSessionRecord> = {}): PlannedSessionRecord {
  return {
    id: 'session_archived',
    userId: 'user_1',
    programPlanId: 'plan_archived',
    scheduledDate: new Date('2026-03-03T08:00:00.000Z'),
    dayIndex: 0,
    focusLabel: 'Lower Body',
    state: 'completed',
    startedAt: new Date('2026-03-03T08:00:00.000Z'),
    completedAt: new Date('2026-03-03T09:00:00.000Z'),
    createdAt: new Date('2026-03-03T08:00:00.000Z'),
    updatedAt: new Date('2026-03-03T09:00:00.000Z'),
    exercises: [createExercise()],
    ...overrides,
  };
}

function createPlan(overrides: Partial<ProgramPlanRecord & { sessions: PlannedSessionRecord[] }> = {}) {
  return {
    id: 'plan_archived',
    userId: 'user_1',
    status: 'archived',
    startDate: new Date('2026-02-24T00:00:00.000Z'),
    endDate: new Date('2026-03-02T00:00:00.000Z'),
    createdAt: new Date('2026-02-24T08:00:00.000Z'),
    updatedAt: new Date('2026-03-03T09:00:00.000Z'),
    sessions: [createSession()],
    ...overrides,
  };
}

test('history query generation supports 7d/30d/90d and custom ranges deterministically', () => {
  assert.equal(buildHistoryQueryString({ period: '7d' }), 'period=7d');
  assert.equal(buildHistoryQueryString({ period: '30d' }), 'period=30d');
  assert.equal(buildHistoryQueryString({ period: '90d' }), 'period=90d');
  assert.equal(
    buildHistoryQueryString({
      period: 'custom',
      from: '2026-02-01',
      to: '2026-02-14',
    }),
    'period=custom&from=2026-02-01&to=2026-02-14',
  );
});

test('history rows expose date duration exercise count and total load summary labels', () => {
  const view = buildHistoryViewState({
    sessions: [
      {
        id: 'session_1',
        date: '2026-03-03',
        duration: 3900,
        exerciseCount: 4,
        totalLoad: 1450,
      },
    ],
  });

  assert.equal(view.rows.length, 1);
  assert.equal(view.rows[0]?.dateLabel, '2026-03-03');
  assert.equal(view.rows[0]?.durationLabel, '65 min');
  assert.equal(view.rows[0]?.exerciseCountLabel, '4 exercices');
  assert.equal(view.rows[0]?.totalLoadLabel, '1450 kg');
});

test('history detail drilldown groups logged sets by exercise in ascending set order', () => {
  const grouped = mapSessionDetailToGroupedSets({
    session: {
      id: 'session_1',
      exercises: [
        {
          id: 'exercise_1',
          displayName: 'Goblet Squat',
          loggedSets: [
            { setIndex: 2, weight: 22.5, reps: 8, rpe: 8 },
            { setIndex: 1, weight: 20, reps: 10, rpe: null },
          ],
        },
      ],
    },
  });

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0]?.displayName, 'Goblet Squat');
  assert.equal(grouped[0]?.sets[0]?.setIndex, 1);
  assert.equal(grouped[0]?.sets[1]?.setIndex, 2);
});

test('history view state keeps empty and error states explicit', () => {
  const empty = buildHistoryViewState({ sessions: [] });
  assert.equal(empty.state, 'empty');
  assert.equal(empty.rows.length, 0);

  const error = buildHistoryViewState({ sessions: null, errorMessage: 'Unable to load program history' });
  assert.equal(error.state, 'error');
  assert.equal(error.errorMessage, 'Unable to load program history');
});

test('history drilldown DAL returns archived completed sessions that already appear in history rows', async () => {
  const archivedSession = createSession();
  const historyPlan = createPlan();

  const db = {
    async $transaction<T>(callback: (tx: never) => Promise<T>): Promise<T> {
      return callback(this as never);
    },
    programPlan: {
      async updateMany() {
        return { count: 0 };
      },
      async create() {
        return historyPlan;
      },
    },
    plannedSession: {
      async findFirst(args: {
        where: {
          userId: string;
          id?: string;
          scheduledDate: Record<string, never>;
          completedAt?: { gte?: Date; lte?: Date } | null;
          programPlan?: { status: 'active' | 'archived' };
        };
      }) {
        if (args.where.programPlan?.status === 'active') {
          return null;
        }

        if (args.where.programPlan?.status === 'archived' && args.where.completedAt?.gte) {
          return archivedSession;
        }

        return null;
      },
      async findMany() {
        return [
          {
            ...archivedSession,
            exercises: [{ id: 'exercise_1' }],
            loggedSets: [{ plannedExerciseId: 'exercise_1', weight: 20, reps: 10 }],
          },
        ];
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

  const historyRows = await dal.getHistoryList({
    from: new Date('2026-03-01T00:00:00.000Z'),
    to: new Date('2026-03-07T23:59:59.999Z'),
  });
  const detail = await dal.getSessionById('session_archived');

  assert.equal(historyRows[0]?.id, 'session_archived');
  assert.equal(detail?.id, historyRows[0]?.id);
  assert.equal(detail?.completedAt?.toISOString(), '2026-03-03T09:00:00.000Z');
});
