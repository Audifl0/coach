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
      where: { id: string; userId: string };
    }): Promise<PlannedSessionRecord | null>;
    findMany?(args: {
      where: {
        userId: string;
        completedAt: { gte: Date; lte: Date };
      };
      orderBy?: { completedAt: 'asc' | 'desc' };
      include?: {
        exercises?: { select?: { id: boolean } };
        loggedSets?: { select?: { plannedExerciseId: boolean; weight: boolean; reps: boolean } };
      };
    }): Promise<
      Array<
        PlannedSessionRecord & {
          loggedSets?: Array<{ plannedExerciseId: string; weight: number; reps: number }>;
        }
      >
    >;
    update?(args: {
      where: { id: string; userId: string };
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
  };
  plannedExercise: {
    findUnique(args: {
      where: { id: string };
      include: { plannedSession: { select: { id: true; userId: true; scheduledDate: true } } };
    }): Promise<(PlannedExerciseRecord & { plannedSession: { id: string; userId: string; scheduledDate: Date } }) | null>;
    update(args: {
      where: { id: string; userId: string };
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
        userId: scope.userId,
      },
    });

    if (!plannedSession) {
      return null;
    }

    assertAccountOwnership(scope, plannedSession.userId);
    return plannedSession;
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
          userId: scope.userId,
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

      return db.loggedSet.upsert({
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
      return db.plannedExercise.update({
        where: {
          id: input.plannedExerciseId,
          userId: scope.userId,
        },
        data: {
          isSkipped: true,
          skipReasonCode: reasonCode,
          skipReasonText: reasonText ? reasonText : null,
          skippedAt: input.now ?? new Date(),
        },
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

      return db.plannedExercise.update({
        where: {
          id: plannedExerciseId,
          userId: scope.userId,
        },
        data: {
          isSkipped: false,
          skipReasonCode: null,
          skipReasonText: null,
          skippedAt: null,
        },
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

      return db.plannedSession.update({
        where: {
          id: input.plannedSessionId,
          userId: scope.userId,
        },
        data: {
          note: input.note,
        },
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

      return db.plannedSession.update({
        where: {
          id: input.plannedSessionId,
          userId: scope.userId,
        },
        data: {
          completedAt: input.completedAt,
          effectiveDurationSec: input.effectiveDurationSec,
          postSessionFatigue: input.fatigue,
          postSessionReadiness: input.readiness,
          postSessionComment: input.comment?.trim() ? input.comment.trim() : null,
        },
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

      return db.plannedSession.update({
        where: {
          id: plannedSessionId,
          userId: scope.userId,
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
          userId: scope.userId,
        },
        data: {
          effectiveDurationSec: input.effectiveDurationSec,
          durationCorrectedAt: input.durationCorrectedAt,
        },
      });
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
  };
}
