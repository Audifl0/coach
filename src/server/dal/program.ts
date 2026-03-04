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
  createdAt: Date;
  updatedAt: Date;
  exercises: PlannedExerciseRecord[];
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
        programPlan?: { status: 'active' | 'archived' };
      };
      orderBy?: { scheduledDate: 'asc' | 'desc' };
      include: { exercises: { orderBy: { orderIndex: 'asc' | 'desc' } } };
    }): Promise<PlannedSessionRecord | null>;
  };
  plannedExercise: {
    findUnique(args: {
      where: { id: string };
      include: { plannedSession: { select: { id: true; userId: true; scheduledDate: true } } };
    }): Promise<(PlannedExerciseRecord & { plannedSession: { id: string; userId: string; scheduledDate: Date } }) | null>;
    update(args: {
      where: { id: string; userId: string };
      data: {
        exerciseKey: string;
        displayName: string;
        movementPattern: MovementPattern;
        isSubstituted: boolean;
        originalExerciseKey: string;
      };
    }): Promise<PlannedExerciseRecord>;
  };
};

type ProgramDalClientTx = Omit<ProgramDalClient, '$transaction'>;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function createProgramDal(db: ProgramDalClient, session: SessionContext | null | undefined) {
  const scope = requireAccountScope(session);

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
  };
}
