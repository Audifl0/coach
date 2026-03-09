import type { MovementPattern } from '@/lib/program/types';

import { assertAccountOwnership, buildAccountScopedWhere } from '../account-scope';
import type {
  PlannedExerciseRecord,
  PlannedSessionRecord,
  ProgramDalClient,
  ProgramPlanRecord,
  ReplaceActivePlanInput,
} from '../program';

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

export function createPlanLifecycleDal(input: {
  db: ProgramDalClient;
  scope: { userId: string };
}) {
  const { db, scope } = input;

  async function getPlannedExerciseOwnership(plannedExerciseId: string): Promise<{
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
  }

  return {
    async replaceActivePlan(inputPlan: ReplaceActivePlanInput): Promise<ProgramPlanRecord & { sessions: PlannedSessionRecord[] }> {
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
            startDate: inputPlan.startDate,
            endDate: inputPlan.endDate,
            sessions: {
              create: inputPlan.sessions.map((sessionItem) => ({
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
      const startOfDay = startOfUtcDay(now);
      const startOfNextDay = new Date(startOfDay);
      startOfNextDay.setUTCDate(startOfNextDay.getUTCDate() + 1);

      const todaySession = await db.plannedSession.findFirst({
        where: {
          ...buildAccountScopedWhere(scope),
          scheduledDate: {
            gte: startOfDay,
            lt: startOfNextDay,
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
            gte: startOfNextDay,
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
      const include = {
        exercises: {
          orderBy: {
            orderIndex: 'asc' as const,
          },
        },
      };

      const activeSession = await db.plannedSession.findFirst({
        where: {
          ...buildAccountScopedWhere(scope, { id: sessionId }),
          scheduledDate: {},
          programPlan: {
            status: 'active',
          },
        },
        include,
      });

      if (activeSession) {
        return activeSession;
      }

      return db.plannedSession.findFirst({
        where: {
          ...buildAccountScopedWhere(scope, { id: sessionId }),
          scheduledDate: {},
          completedAt: {
            gte: new Date(0),
          },
          programPlan: {
            status: 'archived',
          },
        },
        include,
      });
    },

    getPlannedExerciseOwnership,

    async applyPlannedExerciseSubstitution(
      plannedExerciseId: string,
      substitution: {
        replacementExerciseKey: string;
        replacementDisplayName: string;
        replacementMovementPattern: MovementPattern;
      },
    ): Promise<PlannedExerciseRecord> {
      const ownership = await getPlannedExerciseOwnership(plannedExerciseId);

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
  };
}
