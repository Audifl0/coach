import type {
  LockedSessionRecord,
  LoggedSetRecord,
  PlannedExerciseRecord,
  PlannedSessionRecord,
  ProgramDalClient,
  ProgramDalClientTx,
} from '../program';

export function createSessionLoggingDal(input: {
  db: ProgramDalClient;
  scope: { userId: string };
  getOwnedExerciseWithSession: (plannedExerciseId: string) => Promise<
    (PlannedExerciseRecord & {
      plannedSession: { id: string; userId: string; scheduledDate: Date; completedAt?: Date | null; startedAt?: Date | null };
    }) | null
  >;
  getOwnedSession: (plannedSessionId: string) => Promise<PlannedSessionRecord | null>;
  lockOwnedSessionForMutation: (
    tx: ProgramDalClientTx,
    plannedSessionId: string,
    notFoundMessage: string,
    fallback?: { startedAt?: Date | null; completedAt?: Date | null },
  ) => Promise<LockedSessionRecord>;
}) {
  const { db, scope, getOwnedExerciseWithSession, getOwnedSession, lockOwnedSessionForMutation } = input;

  return {
    async upsertLoggedSet(inputSet: {
      plannedExerciseId: string;
      setIndex: number;
      weight: number;
      reps: number;
      rpe?: number | null;
    }): Promise<LoggedSetRecord> {
      if (!db.loggedSet) {
        throw new Error('Program DAL client missing loggedSet methods');
      }

      const plannedExercise = await getOwnedExerciseWithSession(inputSet.plannedExerciseId);

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
              plannedExerciseId: inputSet.plannedExerciseId,
              setIndex: inputSet.setIndex,
            },
          },
          create: {
            plannedSessionId: plannedExercise.plannedSessionId,
            plannedExerciseId: inputSet.plannedExerciseId,
            userId: scope.userId,
            setIndex: inputSet.setIndex,
            weight: inputSet.weight,
            reps: inputSet.reps,
            rpe: inputSet.rpe ?? null,
          },
          update: {
            weight: inputSet.weight,
            reps: inputSet.reps,
            rpe: inputSet.rpe ?? null,
          },
        });
      });
    },

    async markExerciseSkipped(inputSkip: {
      plannedExerciseId: string;
      reasonCode: string;
      reasonText?: string | null;
      now?: Date;
    }): Promise<PlannedExerciseRecord> {
      const reasonCode = inputSkip.reasonCode.trim();

      if (!reasonCode) {
        throw new Error('Skip reason code is required');
      }

      const plannedExercise = await getOwnedExerciseWithSession(inputSkip.plannedExerciseId);

      if (!plannedExercise) {
        throw new Error('Planned exercise not found');
      }

      if (plannedExercise.plannedSession.completedAt) {
        throw new Error('Cannot skip exercises after session completion');
      }

      const reasonText = inputSkip.reasonText?.trim();
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
            id: inputSkip.plannedExerciseId,
          },
          data: {
            isSkipped: true,
            skipReasonCode: reasonCode,
            skipReasonText: reasonText ? reasonText : null,
            skippedAt: inputSkip.now ?? new Date(),
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

    async updateSessionNote(inputNote: {
      plannedSessionId: string;
      note: string | null;
    }): Promise<PlannedSessionRecord> {
      const plannedSession = await getOwnedSession(inputNote.plannedSessionId);

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
          inputNote.plannedSessionId,
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
            id: inputNote.plannedSessionId,
          },
          data: {
            note: inputNote.note,
          },
        });
      });
    },

    async completeSession(inputComplete: {
      plannedSessionId: string;
      fatigue: number;
      readiness: number;
      comment?: string | null;
      completedAt: Date;
      effectiveDurationSec: number;
    }): Promise<PlannedSessionRecord> {
      const plannedSession = await getOwnedSession(inputComplete.plannedSessionId);

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
          inputComplete.plannedSessionId,
          'Planned session not found',
        );

        if (lockedSession.completedAt) {
          throw new Error('Session already completed');
        }

        const comment = inputComplete.comment?.trim() ? inputComplete.comment.trim() : null;
        if (tx.plannedSession.updateMany) {
          const result = await tx.plannedSession.updateMany({
            where: {
              id: inputComplete.plannedSessionId,
              userId: scope.userId,
              completedAt: null,
            },
            data: {
              completedAt: inputComplete.completedAt,
              effectiveDurationSec: inputComplete.effectiveDurationSec,
              postSessionFatigue: inputComplete.fatigue,
              postSessionReadiness: inputComplete.readiness,
              postSessionComment: comment,
            },
          });

          if (result.count === 0) {
            throw new Error('Session already completed');
          }

          const updated = await getOwnedSession(inputComplete.plannedSessionId);
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
            id: inputComplete.plannedSessionId,
          },
          data: {
            completedAt: inputComplete.completedAt,
            effectiveDurationSec: inputComplete.effectiveDurationSec,
            postSessionFatigue: inputComplete.fatigue,
            postSessionReadiness: inputComplete.readiness,
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

    async correctSessionDuration(inputDuration: {
      plannedSessionId: string;
      effectiveDurationSec: number;
      durationCorrectedAt: Date;
    }): Promise<PlannedSessionRecord> {
      const plannedSession = await getOwnedSession(inputDuration.plannedSessionId);

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
          id: inputDuration.plannedSessionId,
        },
        data: {
          effectiveDurationSec: inputDuration.effectiveDurationSec,
          durationCorrectedAt: inputDuration.durationCorrectedAt,
        },
      });
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
