import type { SessionContext } from '@/lib/auth/contracts';
import type { MovementPattern, SessionState } from '@/lib/program/types';

import { assertAccountOwnership, buildAccountScopedWhere, requireAccountScope } from './account-scope';
import { createHistoryReadModelDal } from './program/history-read-model';
import { createPlanLifecycleDal } from './program/plan-lifecycle';
import { createSessionLoggingDal } from './program/session-logging';
import { createTrendsReadModelDal } from './program/trends-read-model';

export type PlannedExerciseRecord = {
  id: string;
  userId: string;
  plannedSessionId: string;
  orderIndex: number;
  exerciseKey: string;
  displayName: string;
  movementPattern: MovementPattern;
  sets: number;
  targetReps: number;
  targetLoad: string;
  restMinSec: number;
  restMaxSec: number;
  isSubstituted: boolean;
  originalExerciseKey: string | null;
  isSkipped?: boolean;
  skipReasonCode?: string | null;
  skipReasonText?: string | null;
  skippedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PlannedSessionRecord = {
  id: string;
  userId: string;
  programPlanId: string;
  scheduledDate: Date;
  dayIndex: number;
  focusLabel: string;
  state: SessionState;
  startedAt?: Date | null;
  completedAt?: Date | null;
  effectiveDurationSec?: number | null;
  durationCorrectedAt?: Date | null;
  note?: string | null;
  postSessionFatigue?: number | null;
  postSessionReadiness?: number | null;
  postSessionComment?: string | null;
  createdAt: Date;
  updatedAt: Date;
  exercises: PlannedExerciseRecord[];
};

export type LoggedSetRecord = {
  id: string;
  plannedSessionId: string;
  plannedExerciseId: string;
  userId: string;
  setIndex: number;
  weight: number;
  reps: number;
  rpe: number | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type ProgramPlanRecord = {
  id: string;
  userId: string;
  status: 'active' | 'archived';
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
};

type ReplacePlanExerciseInput = {
  orderIndex: number;
  exerciseKey: string;
  displayName: string;
  movementPattern: MovementPattern;
  sets: number;
  targetReps: number;
  targetLoad: string;
  restMinSec: number;
  restMaxSec: number;
};

type ReplacePlanSessionInput = {
  scheduledDate: Date;
  dayIndex: number;
  focusLabel: string;
  state?: SessionState;
  exercises: ReplacePlanExerciseInput[];
};

export type ReplaceActivePlanInput = {
  startDate: Date;
  endDate: Date;
  sessions: ReplacePlanSessionInput[];
};

export type ProgramDalClient = {
  $transaction<T>(callback: (tx: ProgramDalClientTx) => Promise<T>): Promise<T>;
  $queryRawUnsafe?<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  programPlan: {
    updateMany(args: {
      where: { userId: string; status: 'active' | 'archived' };
      data: { status: 'active' | 'archived' };
    }): Promise<{ count: number }>;
    create(args: {
      data: {
        userId: string;
        status: 'active' | 'archived';
        startDate: Date;
        endDate: Date;
        sessions: {
          create: Array<{
            userId: string;
            scheduledDate: Date;
            dayIndex: number;
            focusLabel: string;
            state: SessionState;
            exercises: {
              create: Array<{
                userId: string;
                orderIndex: number;
                exerciseKey: string;
                displayName: string;
                movementPattern: MovementPattern;
                sets: number;
                targetReps: number;
                targetLoad: string;
                restMinSec: number;
                restMaxSec: number;
              }>;
            };
          }>;
        };
      };
      include: { sessions: { include: { exercises: true } } };
    }): Promise<ProgramPlanRecord & { sessions: PlannedSessionRecord[] }>;
  };
  plannedSession: {
    findFirst(args: {
      where: {
        userId: string;
        id?: string;
        scheduledDate: { gte?: Date; lt?: Date; gt?: Date };
        completedAt?: { gte?: Date; lte?: Date } | null;
        programPlan?: { status: 'active' | 'archived' };
      };
      orderBy?: { scheduledDate: 'asc' | 'desc' };
      include: { exercises: { orderBy: { orderIndex: 'asc' | 'desc' } } };
    }): Promise<PlannedSessionRecord | null>;
    findUnique?(args: {
      where: { id: string };
    }): Promise<PlannedSessionRecord | null>;
    findMany?(args: {
      where: {
        userId: string;
        completedAt?: { gte: Date; lte: Date };
        scheduledDate?: { gte?: Date; lte?: Date; gt?: Date; lt?: Date };
      };
      orderBy?: { completedAt: 'asc' | 'desc' };
      include?: {
        exercises?: {
          select?: {
            id: boolean;
            orderIndex?: boolean;
            exerciseKey?: boolean;
            displayName?: boolean;
            movementPattern?: boolean;
          };
        };
        loggedSets?: { select?: { plannedExerciseId: boolean; weight: boolean; reps: boolean } };
      };
    }): Promise<
      Array<
        PlannedSessionRecord & {
          exercises: Array<{
            id: string;
            orderIndex?: number;
            exerciseKey?: string;
            displayName?: string;
            movementPattern?: MovementPattern;
          }>;
          loggedSets?: Array<{ plannedExerciseId: string; weight: number; reps: number }>;
        }
      >
    >;
    update?(args: {
      where: { id: string };
      data: {
        startedAt?: Date;
        completedAt?: Date;
        effectiveDurationSec?: number;
        durationCorrectedAt?: Date;
        note?: string | null;
        postSessionFatigue?: number;
        postSessionReadiness?: number;
        postSessionComment?: string | null;
      };
    }): Promise<PlannedSessionRecord>;
    updateMany?(args: {
      where: { id: string; userId: string; completedAt?: null; startedAt?: null };
      data: {
        startedAt?: Date;
        completedAt?: Date;
        effectiveDurationSec?: number;
        durationCorrectedAt?: Date;
        note?: string | null;
        postSessionFatigue?: number;
        postSessionReadiness?: number;
        postSessionComment?: string | null;
      };
    }): Promise<{ count: number }>;
  };
  plannedExercise: {
    findUnique(args: {
      where: { id: string };
      include: { plannedSession: { select: { id: true; userId: true; scheduledDate: true; completedAt?: true; startedAt?: true } } };
    }): Promise<
      (PlannedExerciseRecord & {
        plannedSession: { id: string; userId: string; scheduledDate: Date; completedAt?: Date | null; startedAt?: Date | null };
      }) | null
    >;
    update(args: {
      where: { id: string };
      data: {
        exerciseKey?: string;
        displayName?: string;
        movementPattern?: MovementPattern;
        isSubstituted?: boolean;
        originalExerciseKey?: string;
        isSkipped?: boolean;
        skipReasonCode?: string | null;
        skipReasonText?: string | null;
        skippedAt?: Date | null;
      };
    }): Promise<PlannedExerciseRecord>;
    findMany?(args: {
      where: { userId: string; plannedSessionId: string };
      include?: {
        loggedSets?: { orderBy?: { setIndex: 'asc' | 'desc' } };
      };
      orderBy?: { orderIndex: 'asc' | 'desc' };
    }): Promise<Array<PlannedExerciseRecord & { loggedSets?: LoggedSetRecord[] }>>;
  };
  loggedSet?: {
    upsert(args: {
      where: { plannedExerciseId_setIndex: { plannedExerciseId: string; setIndex: number } };
      create: {
        plannedSessionId: string;
        plannedExerciseId: string;
        userId: string;
        setIndex: number;
        weight: number;
        reps: number;
        rpe: number | null;
      };
      update: { weight: number; reps: number; rpe: number | null };
    }): Promise<LoggedSetRecord>;
  };
};

export function createProgramDbClient(db: unknown): ProgramDalClient {
  return db as ProgramDalClient;
}

export type ProgramDalClientTx = Omit<ProgramDalClient, '$transaction'>;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type TrendPeriod = '7d' | '30d' | '90d';

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function resolveTrendRange(period: TrendPeriod, now: Date): { from: Date; to: Date; dates: string[] } {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const to = endOfUtcDay(now);
  const from = startOfUtcDay(now);
  from.setUTCDate(from.getUTCDate() - (days - 1));

  const dates: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    dates.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { from, to, dates };
}

export type LockedSessionRecord = {
  id: string;
  startedAt: Date | null;
  completedAt: Date | null;
};

export function createProgramDal(db: ProgramDalClient, session: SessionContext | null | undefined) {
  const scope = requireAccountScope(session);

  async function getOwnedExerciseWithSession(plannedExerciseId: string) {
    const plannedExercise = await db.plannedExercise.findUnique({
      where: {
        id: plannedExerciseId,
      },
      include: {
        plannedSession: {
          select: {
            id: true,
            userId: true,
            scheduledDate: true,
            completedAt: true,
            startedAt: true,
          },
        },
      },
    });

    if (!plannedExercise) {
      return null;
    }

    assertAccountOwnership(scope, plannedExercise.userId);
    assertAccountOwnership(scope, plannedExercise.plannedSession.userId);
    return plannedExercise;
  }

  async function getOwnedSession(plannedSessionId: string) {
    if (!db.plannedSession.findUnique) {
      throw new Error('Program DAL client missing plannedSession.findUnique');
    }

    const plannedSession = await db.plannedSession.findUnique({
      where: {
        id: plannedSessionId,
      },
    });

    if (!plannedSession) {
      return null;
    }

    assertAccountOwnership(scope, plannedSession.userId);
    return plannedSession;
  }

  async function lockOwnedSessionForMutation(
    tx: ProgramDalClientTx,
    plannedSessionId: string,
    notFoundMessage: string,
    fallback?: { startedAt?: Date | null; completedAt?: Date | null },
  ): Promise<LockedSessionRecord> {
    if (tx.$queryRawUnsafe) {
      const rows = await tx.$queryRawUnsafe<Array<LockedSessionRecord>>(
        'SELECT "id", "startedAt", "completedAt" FROM "PlannedSession" WHERE "id" = $1 AND "userId" = $2 FOR UPDATE',
        plannedSessionId,
        scope.userId,
      );
      const locked = rows[0];
      if (!locked) {
        throw new Error(notFoundMessage);
      }

      return locked;
    }

    if (!tx.plannedSession.findUnique) {
      if (fallback) {
        return {
          id: plannedSessionId,
          startedAt: fallback.startedAt ?? null,
          completedAt: fallback.completedAt ?? null,
        };
      }

      throw new Error('Program DAL client missing plannedSession.findUnique');
    }

    const plannedSession = await tx.plannedSession.findUnique({
      where: {
        id: plannedSessionId,
      },
    });

    if (!plannedSession) {
      throw new Error(notFoundMessage);
    }

    assertAccountOwnership(scope, plannedSession.userId);
    return {
      id: plannedSession.id,
      startedAt: plannedSession.startedAt ?? null,
      completedAt: plannedSession.completedAt ?? null,
    };
  }

  const planLifecycleDal = createPlanLifecycleDal({ db, scope });
  const sessionLoggingDal = createSessionLoggingDal({
    db,
    scope,
    getOwnedExerciseWithSession,
    getOwnedSession,
    lockOwnedSessionForMutation,
  });
  const trendsReadModelDal = createTrendsReadModelDal({ db, scope });
  const historyReadModelDal = createHistoryReadModelDal({ db, scope, getOwnedSession });

  return {
    ...planLifecycleDal,
    ...sessionLoggingDal,
    ...trendsReadModelDal,
    ...historyReadModelDal,
  };
}
