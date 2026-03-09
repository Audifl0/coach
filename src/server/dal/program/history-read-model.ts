import type { MovementPattern } from '@/lib/program/types';

import type { PlannedSessionRecord, ProgramDalClient } from '../program';

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function createHistoryReadModelDal(input: {
  db: ProgramDalClient;
  scope: { userId: string };
  getOwnedSession: (plannedSessionId: string) => Promise<PlannedSessionRecord | null>;
}) {
  const { db, scope, getOwnedSession } = input;

  return {
    async getHistoryList(inputList: { from: Date; to: Date }): Promise<
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
            gte: inputList.from,
            lte: inputList.to,
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
