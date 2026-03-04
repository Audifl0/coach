type SessionLifecycle = {
  plannedSessionId: string;
  startedAt: Date | null;
  completedAt: Date | null;
  effectiveDurationSec?: number | null;
};

type SessionLoggingDal = {
  getPlannedExerciseOwnership(plannedExerciseId: string): Promise<{ plannedSessionId: string } | null>;
  getSessionLifecycle(plannedSessionId: string): Promise<SessionLifecycle | null>;
  markSessionStarted(plannedSessionId: string, startedAt: Date): Promise<unknown>;
  upsertLoggedSet(input: {
    plannedExerciseId: string;
    setIndex: number;
    weight: number;
    reps: number;
    rpe?: number | null;
  }): Promise<unknown>;
  markExerciseSkipped(input: {
    plannedExerciseId: string;
    reasonCode: string;
    reasonText?: string | null;
    now?: Date;
  }): Promise<unknown>;
  revertExerciseSkipped(plannedExerciseId: string): Promise<unknown>;
  updateSessionNote(input: { plannedSessionId: string; note: string | null }): Promise<unknown>;
  completeSession(input: {
    plannedSessionId: string;
    fatigue: number;
    readiness: number;
    comment?: string | null;
    completedAt: Date;
    effectiveDurationSec: number;
  }): Promise<unknown>;
  correctSessionDuration(input: {
    plannedSessionId: string;
    effectiveDurationSec: number;
    durationCorrectedAt: Date;
  }): Promise<unknown>;
};

function requireSessionLifecycle(lifecycle: SessionLifecycle | null, plannedSessionId: string): SessionLifecycle {
  if (!lifecycle) {
    throw new Error(`Planned session not found: ${plannedSessionId}`);
  }

  return lifecycle;
}

function assertNotCompleted(lifecycle: SessionLifecycle): void {
  if (lifecycle.completedAt) {
    throw new Error('Session is already completed');
  }
}

function isWithinCorrectionWindow(now: Date, completedAt: Date): boolean {
  const correctionWindowMs = 24 * 60 * 60 * 1000;
  return now.getTime() <= completedAt.getTime() + correctionWindowMs;
}

export function createSessionLoggingService(deps: { programDal: SessionLoggingDal; now?: () => Date }) {
  const now = deps.now ?? (() => new Date());
  const { programDal } = deps;

  return {
    async logSet(input: {
      plannedExerciseId: string;
      setIndex: number;
      weight: number;
      reps: number;
      rpe?: number | null;
    }): Promise<void> {
      const ownership = await programDal.getPlannedExerciseOwnership(input.plannedExerciseId);

      if (!ownership) {
        throw new Error('Planned exercise not found');
      }

      const lifecycle = requireSessionLifecycle(
        await programDal.getSessionLifecycle(ownership.plannedSessionId),
        ownership.plannedSessionId,
      );

      assertNotCompleted(lifecycle);

      if (!lifecycle.startedAt) {
        await programDal.markSessionStarted(ownership.plannedSessionId, now());
      }

      await programDal.upsertLoggedSet(input);
    },

    async skipExercise(input: {
      plannedExerciseId: string;
      reasonCode: string;
      reasonText?: string;
    }): Promise<void> {
      const ownership = await programDal.getPlannedExerciseOwnership(input.plannedExerciseId);

      if (!ownership) {
        throw new Error('Planned exercise not found');
      }

      const lifecycle = requireSessionLifecycle(
        await programDal.getSessionLifecycle(ownership.plannedSessionId),
        ownership.plannedSessionId,
      );

      assertNotCompleted(lifecycle);
      await programDal.markExerciseSkipped({
        plannedExerciseId: input.plannedExerciseId,
        reasonCode: input.reasonCode,
        reasonText: input.reasonText,
        now: now(),
      });
    },

    async revertSkippedExercise(plannedExerciseId: string): Promise<void> {
      const ownership = await programDal.getPlannedExerciseOwnership(plannedExerciseId);

      if (!ownership) {
        throw new Error('Planned exercise not found');
      }

      const lifecycle = requireSessionLifecycle(
        await programDal.getSessionLifecycle(ownership.plannedSessionId),
        ownership.plannedSessionId,
      );

      assertNotCompleted(lifecycle);
      await programDal.revertExerciseSkipped(plannedExerciseId);
    },

    async updateSessionNote(input: { plannedSessionId: string; note: string | null }): Promise<void> {
      const lifecycle = requireSessionLifecycle(
        await programDal.getSessionLifecycle(input.plannedSessionId),
        input.plannedSessionId,
      );

      assertNotCompleted(lifecycle);
      await programDal.updateSessionNote(input);
    },

    async completeSession(input: {
      plannedSessionId: string;
      fatigue: number;
      readiness: number;
      comment?: string;
    }): Promise<void> {
      const lifecycle = requireSessionLifecycle(
        await programDal.getSessionLifecycle(input.plannedSessionId),
        input.plannedSessionId,
      );

      assertNotCompleted(lifecycle);
      const completedAt = now();
      const effectiveDurationSec = lifecycle.startedAt
        ? Math.max(0, Math.floor((completedAt.getTime() - lifecycle.startedAt.getTime()) / 1000))
        : 0;

      await programDal.completeSession({
        plannedSessionId: input.plannedSessionId,
        fatigue: input.fatigue,
        readiness: input.readiness,
        comment: input.comment,
        completedAt,
        effectiveDurationSec,
      });
    },

    async correctDuration(input: {
      plannedSessionId: string;
      effectiveDurationSec: number;
    }): Promise<void> {
      const lifecycle = requireSessionLifecycle(
        await programDal.getSessionLifecycle(input.plannedSessionId),
        input.plannedSessionId,
      );

      const completedAt = lifecycle.completedAt;

      if (!completedAt) {
        throw new Error('Cannot correct duration for an incomplete session');
      }

      const current = now();
      if (!isWithinCorrectionWindow(current, completedAt)) {
        throw new Error('Duration correction is only allowed within 24 hours of completion');
      }

      await programDal.correctSessionDuration({
        plannedSessionId: input.plannedSessionId,
        effectiveDurationSec: input.effectiveDurationSec,
        durationCorrectedAt: current,
      });
    },
  };
}
