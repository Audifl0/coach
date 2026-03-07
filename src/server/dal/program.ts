import type { SessionContext } from '@/lib/auth/contracts';
import type { MovementPattern, SessionState } from '@/lib/program/types';

import { assertAccountOwnership, buildAccountScopedWhere, requireAccountScope } from './account-scope';

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

type ProgramDalClient = {
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

type ProgramDalClientTx = Omit<ProgramDalClient, '$transaction'>;

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

type LockedSessionRecord = {
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

  return {
    async replaceActivePlan(input: ReplaceActivePlanInput): Promise<ProgramPlanRecord & { sessions: PlannedSessionRecord[] }> {
      return db.$transaction(async (tx) => {
        await tx.programPlan.updateMany({
          where: {
            userId: scope.userId,
            status: 'active',
          },
          data: {
            status: 'archived',
          },
        });

        return tx.programPlan.create({
          data: {
            userId: scope.userId,
            status: 'active',
            startDate: input.startDate,
            endDate: input.endDate,
            sessions: {
              create: input.sessions.map((sessionItem) => ({
                userId: scope.userId,
                scheduledDate: sessionItem.scheduledDate,
                dayIndex: sessionItem.dayIndex,
                focusLabel: sessionItem.focusLabel,
                state: sessionItem.state ?? 'planned',
                exercises: {
                  create: sessionItem.exercises.map((exercise) => ({
                    userId: scope.userId,
                    orderIndex: exercise.orderIndex,
                    exerciseKey: exercise.exerciseKey,
                    displayName: exercise.displayName,
                    movementPattern: exercise.movementPattern,
                    sets: exercise.sets,
                    targetReps: exercise.targetReps,
                    targetLoad: exercise.targetLoad,
                    restMinSec: exercise.restMinSec,
                    restMaxSec: exercise.restMaxSec,
                  })),
                },
              })),
            },
          },
          include: {
            sessions: {
              include: {
                exercises: true,
              },
            },
          },
        });
      });
    },

    async getTodayOrNextSessionCandidates(now = new Date()): Promise<{
      todaySession: PlannedSessionRecord | null;
      nextSession: PlannedSessionRecord | null;
    }> {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      const todaySession = await db.plannedSession.findFirst({
        where: {
          ...buildAccountScopedWhere(scope),
          scheduledDate: {
            gte: startOfDay,
            lt: endOfDay,
          },
          programPlan: {
            status: 'active',
          },
        },
        include: {
          exercises: {
            orderBy: {
              orderIndex: 'asc',
            },
          },
        },
      });

      if (todaySession) {
        return {
          todaySession,
          nextSession: null,
        };
      }

      const nextSession = await db.plannedSession.findFirst({
        where: {
          ...buildAccountScopedWhere(scope),
          scheduledDate: {
            gt: endOfDay,
          },
          programPlan: {
            status: 'active',
          },
        },
        orderBy: {
          scheduledDate: 'asc',
        },
        include: {
          exercises: {
            orderBy: {
              orderIndex: 'asc',
            },
          },
        },
      });

      return {
        todaySession: null,
        nextSession,
      };
    },

    async getSessionById(sessionId: string): Promise<PlannedSessionRecord | null> {
      return db.plannedSession.findFirst({
        where: {
          ...buildAccountScopedWhere(scope, { id: sessionId }),
          scheduledDate: {},
          programPlan: {
            status: 'active',
          },
        },
        include: {
          exercises: {
            orderBy: {
              orderIndex: 'asc',
            },
          },
        },
      });
    },

    async getPlannedExerciseOwnership(plannedExerciseId: string): Promise<{
      plannedExerciseId: string;
      userId: string;
      plannedSessionId: string;
      scheduledDate: string;
      exerciseKey: string;
      isSubstituted: boolean;
      originalExerciseKey: string | null;
    } | null> {
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
            },
          },
        },
      });

      if (!plannedExercise) {
        return null;
      }

      assertAccountOwnership(scope, plannedExercise.userId);
      assertAccountOwnership(scope, plannedExercise.plannedSession.userId);

      return {
        plannedExerciseId: plannedExercise.id,
        userId: plannedExercise.userId,
        plannedSessionId: plannedExercise.plannedSessionId,
        scheduledDate: toIsoDate(plannedExercise.plannedSession.scheduledDate),
        exerciseKey: plannedExercise.exerciseKey,
        isSubstituted: plannedExercise.isSubstituted,
        originalExerciseKey: plannedExercise.originalExerciseKey,
      };
    },

    async applyPlannedExerciseSubstitution(
      plannedExerciseId: string,
      substitution: {
        replacementExerciseKey: string;
        replacementDisplayName: string;
        replacementMovementPattern: MovementPattern;
      },
    ): Promise<PlannedExerciseRecord> {
      const ownership = await this.getPlannedExerciseOwnership(plannedExerciseId);

      if (!ownership) {
        throw new Error('Planned exercise not found');
      }

      return db.plannedExercise.update({
        where: {
          id: plannedExerciseId,
        },
        data: {
          exerciseKey: substitution.replacementExerciseKey,
          displayName: substitution.replacementDisplayName,
          movementPattern: substitution.replacementMovementPattern,
          isSubstituted: true,
          originalExerciseKey: ownership.originalExerciseKey ?? ownership.exerciseKey,
        },
      });
    },

    async upsertLoggedSet(input: {
      plannedExerciseId: string;
      setIndex: number;
      weight: number;
      reps: number;
      rpe?: number | null;
    }): Promise<LoggedSetRecord> {
      if (!db.loggedSet) {
        throw new Error('Program DAL client missing loggedSet methods');
      }

      const plannedExercise = await getOwnedExerciseWithSession(input.plannedExerciseId);

      if (!plannedExercise) {
        throw new Error('Planned exercise not found');
      }

      if (plannedExercise.plannedSession.completedAt) {
        throw new Error('Cannot edit logged sets for a completed session');
      }

      return db.$transaction(async (tx) => {
        if (!tx.loggedSet) {
          throw new Error('Program DAL client missing loggedSet methods');
        }

        const lockedSession = await lockOwnedSessionForMutation(
          tx,
          plannedExercise.plannedSessionId,
          'Planned session not found',
          plannedExercise.plannedSession,
        );

        if (lockedSession.completedAt) {
          throw new Error('Cannot edit logged sets for a completed session');
        }

        return tx.loggedSet.upsert({
          where: {
            plannedExerciseId_setIndex: {
              plannedExerciseId: input.plannedExerciseId,
              setIndex: input.setIndex,
            },
          },
          create: {
            plannedSessionId: plannedExercise.plannedSessionId,
            plannedExerciseId: input.plannedExerciseId,
            userId: scope.userId,
            setIndex: input.setIndex,
            weight: input.weight,
            reps: input.reps,
            rpe: input.rpe ?? null,
          },
          update: {
            weight: input.weight,
            reps: input.reps,
            rpe: input.rpe ?? null,
          },
        });
      });
    },

    async markExerciseSkipped(input: {
      plannedExerciseId: string;
      reasonCode: string;
      reasonText?: string | null;
      now?: Date;
    }): Promise<PlannedExerciseRecord> {
      const reasonCode = input.reasonCode.trim();

      if (!reasonCode) {
        throw new Error('Skip reason code is required');
      }

      const plannedExercise = await getOwnedExerciseWithSession(input.plannedExerciseId);

      if (!plannedExercise) {
        throw new Error('Planned exercise not found');
      }

      if (plannedExercise.plannedSession.completedAt) {
        throw new Error('Cannot skip exercises after session completion');
      }

      const reasonText = input.reasonText?.trim();
      return db.$transaction(async (tx) => {
        const lockedSession = await lockOwnedSessionForMutation(
          tx,
          plannedExercise.plannedSessionId,
          'Planned session not found',
          plannedExercise.plannedSession,
        );

        if (lockedSession.completedAt) {
          throw new Error('Cannot skip exercises after session completion');
        }

        return tx.plannedExercise.update({
          where: {
            id: input.plannedExerciseId,
          },
          data: {
            isSkipped: true,
            skipReasonCode: reasonCode,
            skipReasonText: reasonText ? reasonText : null,
            skippedAt: input.now ?? new Date(),
          },
        });
      });
    },

    async revertExerciseSkipped(plannedExerciseId: string): Promise<PlannedExerciseRecord> {
      const plannedExercise = await getOwnedExerciseWithSession(plannedExerciseId);

      if (!plannedExercise) {
        throw new Error('Planned exercise not found');
      }

      if (plannedExercise.plannedSession.completedAt) {
        throw new Error('Cannot revert exercise skip for a completed session');
      }

      return db.$transaction(async (tx) => {
        const lockedSession = await lockOwnedSessionForMutation(
          tx,
          plannedExercise.plannedSessionId,
          'Planned session not found',
          plannedExercise.plannedSession,
        );

        if (lockedSession.completedAt) {
          throw new Error('Cannot revert exercise skip for a completed session');
        }

        return tx.plannedExercise.update({
          where: {
            id: plannedExerciseId,
          },
          data: {
            isSkipped: false,
            skipReasonCode: null,
            skipReasonText: null,
            skippedAt: null,
          },
        });
      });
    },

    async updateSessionNote(input: {
      plannedSessionId: string;
      note: string | null;
    }): Promise<PlannedSessionRecord> {
      const plannedSession = await getOwnedSession(input.plannedSessionId);

      if (!plannedSession) {
        throw new Error('Planned session not found');
      }

      if (plannedSession.completedAt) {
        throw new Error('Cannot edit session note after completion');
      }

      if (!db.plannedSession.update) {
        throw new Error('Program DAL client missing plannedSession.update');
      }

      return db.$transaction(async (tx) => {
        const lockedSession = await lockOwnedSessionForMutation(
          tx,
          input.plannedSessionId,
          'Planned session not found',
        );

        if (lockedSession.completedAt) {
          throw new Error('Cannot edit session note after completion');
        }

        if (!tx.plannedSession.update) {
          throw new Error('Program DAL client missing plannedSession.update');
        }

        return tx.plannedSession.update({
          where: {
            id: input.plannedSessionId,
          },
          data: {
            note: input.note,
          },
        });
      });
    },

    async completeSession(input: {
      plannedSessionId: string;
      fatigue: number;
      readiness: number;
      comment?: string | null;
      completedAt: Date;
      effectiveDurationSec: number;
    }): Promise<PlannedSessionRecord> {
      const plannedSession = await getOwnedSession(input.plannedSessionId);

      if (!plannedSession) {
        throw new Error('Planned session not found');
      }

      if (plannedSession.completedAt) {
        throw new Error('Session already completed');
      }

      if (!db.plannedSession.update) {
        throw new Error('Program DAL client missing plannedSession.update');
      }

      return db.$transaction(async (tx) => {
        const lockedSession = await lockOwnedSessionForMutation(
          tx,
          input.plannedSessionId,
          'Planned session not found',
        );

        if (lockedSession.completedAt) {
          throw new Error('Session already completed');
        }

        const comment = input.comment?.trim() ? input.comment.trim() : null;
        if (tx.plannedSession.updateMany) {
          const result = await tx.plannedSession.updateMany({
            where: {
              id: input.plannedSessionId,
              userId: scope.userId,
              completedAt: null,
            },
            data: {
              completedAt: input.completedAt,
              effectiveDurationSec: input.effectiveDurationSec,
              postSessionFatigue: input.fatigue,
              postSessionReadiness: input.readiness,
              postSessionComment: comment,
            },
          });

          if (result.count === 0) {
            throw new Error('Session already completed');
          }

          const updated = await getOwnedSession(input.plannedSessionId);
          if (!updated) {
            throw new Error('Planned session not found');
          }

          return updated;
        }

        if (!tx.plannedSession.update) {
          throw new Error('Program DAL client missing plannedSession.update');
        }

        return tx.plannedSession.update({
          where: {
            id: input.plannedSessionId,
          },
          data: {
            completedAt: input.completedAt,
            effectiveDurationSec: input.effectiveDurationSec,
            postSessionFatigue: input.fatigue,
            postSessionReadiness: input.readiness,
            postSessionComment: comment,
          },
        });
      });
    },

    async markSessionStarted(plannedSessionId: string, startedAt: Date): Promise<PlannedSessionRecord> {
      const plannedSession = await getOwnedSession(plannedSessionId);

      if (!plannedSession) {
        throw new Error('Planned session not found');
      }

      if (plannedSession.startedAt) {
        return plannedSession;
      }

      if (plannedSession.completedAt) {
        throw new Error('Cannot start a completed session');
      }

      if (!db.plannedSession.update) {
        throw new Error('Program DAL client missing plannedSession.update');
      }

      if (db.plannedSession.updateMany) {
        const result = await db.plannedSession.updateMany({
          where: {
            id: plannedSessionId,
            userId: scope.userId,
            completedAt: null,
            startedAt: null,
          },
          data: {
            startedAt,
          },
        });

        if (result.count === 0) {
          const nextSession = await getOwnedSession(plannedSessionId);
          if (!nextSession) {
            throw new Error('Planned session not found');
          }

          if (nextSession.completedAt) {
            throw new Error('Cannot start a completed session');
          }

          return nextSession;
        }

        const nextSession = await getOwnedSession(plannedSessionId);
        if (!nextSession) {
          throw new Error('Planned session not found');
        }

        return nextSession;
      }

      return db.plannedSession.update({
        where: {
          id: plannedSessionId,
        },
        data: {
          startedAt,
        },
      });
    },

    async correctSessionDuration(input: {
      plannedSessionId: string;
      effectiveDurationSec: number;
      durationCorrectedAt: Date;
    }): Promise<PlannedSessionRecord> {
      const plannedSession = await getOwnedSession(input.plannedSessionId);

      if (!plannedSession) {
        throw new Error('Planned session not found');
      }

      if (!plannedSession.completedAt) {
        throw new Error('Cannot correct duration for an incomplete session');
      }

      if (!db.plannedSession.update) {
        throw new Error('Program DAL client missing plannedSession.update');
      }

      return db.plannedSession.update({
        where: {
          id: input.plannedSessionId,
        },
        data: {
          effectiveDurationSec: input.effectiveDurationSec,
          durationCorrectedAt: input.durationCorrectedAt,
        },
      });
    },

    async getTrendSummary(input: {
      period: TrendPeriod;
      now?: Date;
    }): Promise<{
      period: TrendPeriod;
      generatedAt: string;
      metrics: {
        volume: { kpi: number; unit: 'kg'; points: Array<{ date: string; value: number }> };
        intensity: { kpi: number; unit: 'kg'; points: Array<{ date: string; value: number }> };
        adherence: { kpi: number; unit: 'ratio'; points: Array<{ date: string; value: number }> };
      };
    }> {
      if (!db.plannedSession.findMany) {
        throw new Error('Program DAL client missing plannedSession.findMany');
      }

      const now = input.now ?? new Date();
      const range = resolveTrendRange(input.period, now);
      const sessions = await db.plannedSession.findMany({
        where: {
          userId: scope.userId,
          scheduledDate: {
            gte: range.from,
            lte: range.to,
          },
        },
        orderBy: {
          completedAt: 'asc',
        },
        include: {
          exercises: {
            select: {
              id: true,
              orderIndex: true,
            },
          },
          loggedSets: {
            select: {
              plannedExerciseId: true,
              weight: true,
              reps: true,
            },
          },
        },
      });

      const byDate = new Map<
        string,
        { volume: number; planned: number; completed: number; intensitySum: number; intensityCount: number }
      >();
      for (const date of range.dates) {
        byDate.set(date, { volume: 0, planned: 0, completed: 0, intensitySum: 0, intensityCount: 0 });
      }

      let totalIntensitySum = 0;
      let totalIntensityCount = 0;
      let totalCompleted = 0;
      let totalPlanned = 0;

      for (const session of sessions) {
        const date = toIsoDate(session.scheduledDate);
        const bucket = byDate.get(date);
        if (!bucket) {
          continue;
        }

        bucket.planned += 1;
        totalPlanned += 1;
        if (session.completedAt) {
          bucket.completed += 1;
          totalCompleted += 1;
        }

        const sets = session.loggedSets ?? [];
        const sessionVolume = sets.reduce((sum, item) => sum + item.weight * item.reps, 0);
        bucket.volume += sessionVolume;

        const keyExercise = [...session.exercises]
          .sort((left, right) => (left.orderIndex ?? Number.MAX_SAFE_INTEGER) - (right.orderIndex ?? Number.MAX_SAFE_INTEGER))[0];
        if (keyExercise) {
          const keySets = sets.filter((setItem) => setItem.plannedExerciseId === keyExercise.id);
          if (keySets.length > 0) {
            for (const keySet of keySets) {
              bucket.intensitySum += keySet.weight;
              bucket.intensityCount += 1;
              totalIntensitySum += keySet.weight;
              totalIntensityCount += 1;
            }
          }
        }
      }

      const volumePoints = range.dates.map((date) => ({
        date,
        value: byDate.get(date)?.volume ?? 0,
      }));
      const intensityPoints = range.dates.map((date) => {
        const bucket = byDate.get(date);
        return {
          date,
          value: bucket && bucket.intensityCount > 0 ? bucket.intensitySum / bucket.intensityCount : 0,
        };
      });
      const adherencePoints = range.dates.map((date) => {
        const bucket = byDate.get(date);
        return {
          date,
          value: bucket && bucket.planned > 0 ? bucket.completed / bucket.planned : 0,
        };
      });

      return {
        period: input.period,
        generatedAt: (input.now ?? new Date()).toISOString(),
        metrics: {
          volume: {
            kpi: volumePoints.reduce((sum, point) => sum + point.value, 0),
            unit: 'kg',
            points: volumePoints,
          },
          intensity: {
            kpi: totalIntensityCount > 0 ? totalIntensitySum / totalIntensityCount : 0,
            unit: 'kg',
            points: intensityPoints,
          },
          adherence: {
            kpi: totalPlanned > 0 ? totalCompleted / totalPlanned : 0,
            unit: 'ratio',
            points: adherencePoints,
          },
        },
      };
    },

    async getExerciseTrendSeries(input: {
      period: TrendPeriod;
      exerciseKey: string;
      now?: Date;
    }): Promise<{
      period: TrendPeriod;
      exercise: { key: string; displayName: string; movementPattern: MovementPattern };
      points: Array<{ date: string; reps: number; load: number }>;
    } | null> {
      if (!db.plannedSession.findMany) {
        throw new Error('Program DAL client missing plannedSession.findMany');
      }

      const range = resolveTrendRange(input.period, input.now ?? new Date());
      const sessions = await db.plannedSession.findMany({
        where: {
          userId: scope.userId,
          scheduledDate: {
            gte: range.from,
            lte: range.to,
          },
        },
        orderBy: {
          completedAt: 'asc',
        },
        include: {
          exercises: {
            select: {
              id: true,
              orderIndex: true,
              exerciseKey: true,
              displayName: true,
              movementPattern: true,
            },
          },
          loggedSets: {
            select: {
              plannedExerciseId: true,
              weight: true,
              reps: true,
            },
          },
        },
      });

      const byDate = new Map<string, { reps: number; loadSum: number; loadCount: number }>();
      let exerciseIdentity: { key: string; displayName: string; movementPattern: MovementPattern } | null = null;

      for (const session of sessions) {
        const matchingExercises = session.exercises.filter((item) => item.exerciseKey === input.exerciseKey);
        if (matchingExercises.length === 0) {
          continue;
        }

        const target = [...matchingExercises].sort(
          (left, right) => (left.orderIndex ?? Number.MAX_SAFE_INTEGER) - (right.orderIndex ?? Number.MAX_SAFE_INTEGER),
        )[0];
        if (!target || !target.displayName || !target.movementPattern) {
          continue;
        }

        exerciseIdentity = {
          key: input.exerciseKey,
          displayName: target.displayName,
          movementPattern: target.movementPattern,
        };

        const sets = (session.loggedSets ?? []).filter((item) => item.plannedExerciseId === target.id);
        if (sets.length === 0) {
          continue;
        }

        const date = toIsoDate(session.scheduledDate);
        const existing = byDate.get(date) ?? { reps: 0, loadSum: 0, loadCount: 0 };
        for (const setItem of sets) {
          existing.reps += setItem.reps;
          existing.loadSum += setItem.weight;
          existing.loadCount += 1;
        }
        byDate.set(date, existing);
      }

      if (!exerciseIdentity || byDate.size === 0) {
        return null;
      }

      const points = [...byDate.entries()]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([date, value]) => ({
          date,
          reps: value.reps,
          load: value.loadCount > 0 ? value.loadSum / value.loadCount : 0,
        }));

      return {
        period: input.period,
        exercise: exerciseIdentity,
        points,
      };
    },

    async getHistoryList(input: { from: Date; to: Date }): Promise<
      Array<{
        id: string;
        date: string;
        duration: number;
        exerciseCount: number;
        totalLoad: number;
      }>
    > {
      if (!db.plannedSession.findMany) {
        throw new Error('Program DAL client missing plannedSession.findMany');
      }

      const sessions = await db.plannedSession.findMany({
        where: {
          userId: scope.userId,
          completedAt: {
            gte: input.from,
            lte: input.to,
          },
        },
        orderBy: {
          completedAt: 'desc',
        },
        include: {
          exercises: {
            select: {
              id: true,
            },
          },
          loggedSets: {
            select: {
              plannedExerciseId: true,
              weight: true,
              reps: true,
            },
          },
        },
      });

      return sessions.map((sessionRow) => {
        const totalLoad = (sessionRow.loggedSets ?? []).reduce((acc, setRow) => acc + setRow.weight * setRow.reps, 0);
        return {
          id: sessionRow.id,
          date: toIsoDate(sessionRow.scheduledDate),
          duration: sessionRow.effectiveDurationSec ?? 0,
          exerciseCount: sessionRow.exercises.length,
          totalLoad,
        };
      });
    },

    async getHistorySessionDetail(sessionId: string): Promise<{
      id: string;
      date: string;
      duration: number;
      exerciseCount: number;
      totalLoad: number;
      focusLabel: string;
      exercises: Array<{
        id: string;
        exerciseKey: string;
        displayName: string;
        movementPattern: MovementPattern;
        isSkipped: boolean;
        skipReasonCode: string | null;
        skipReasonText: string | null;
        loggedSets: Array<{
          setIndex: number;
          weight: number;
          reps: number;
          rpe: number | null;
        }>;
      }>;
    } | null> {
      const session = await getOwnedSession(sessionId);

      if (!session || !session.completedAt) {
        return null;
      }

      if (!db.plannedExercise.findMany) {
        throw new Error('Program DAL client missing plannedExercise.findMany');
      }

      const exercises = await db.plannedExercise.findMany({
        where: {
          userId: scope.userId,
          plannedSessionId: sessionId,
        },
        orderBy: {
          orderIndex: 'asc',
        },
        include: {
          loggedSets: {
            orderBy: {
              setIndex: 'asc',
            },
          },
        },
      });

      const detailExercises = exercises.map((exercise) => ({
        id: exercise.id,
        exerciseKey: exercise.exerciseKey,
        displayName: exercise.displayName,
        movementPattern: exercise.movementPattern,
        isSkipped: Boolean(exercise.isSkipped),
        skipReasonCode: exercise.skipReasonCode ?? null,
        skipReasonText: exercise.skipReasonText ?? null,
        loggedSets: (exercise.loggedSets ?? []).map((setItem) => ({
          setIndex: setItem.setIndex,
          weight: setItem.weight,
          reps: setItem.reps,
          rpe: setItem.rpe ?? null,
        })),
      }));

      const totalLoad = detailExercises
        .flatMap((exercise) => exercise.loggedSets)
        .reduce((acc, setRow) => acc + setRow.weight * setRow.reps, 0);

      return {
        id: session.id,
        date: toIsoDate(session.scheduledDate),
        duration: session.effectiveDurationSec ?? 0,
        exerciseCount: detailExercises.length,
        totalLoad,
        focusLabel: session.focusLabel,
        exercises: detailExercises,
      };
    },

    async getSessionLifecycle(plannedSessionId: string): Promise<{
      plannedSessionId: string;
      startedAt: Date | null;
      completedAt: Date | null;
      effectiveDurationSec: number | null;
    } | null> {
      const session = await getOwnedSession(plannedSessionId);

      if (!session) {
        return null;
      }

      return {
        plannedSessionId: session.id,
        startedAt: session.startedAt ?? null,
        completedAt: session.completedAt ?? null,
        effectiveDurationSec: session.effectiveDurationSec ?? null,
      };
    },
  };
}
