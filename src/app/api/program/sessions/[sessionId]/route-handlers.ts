import { buildSessionDetailProjection } from '@/lib/program/select-today-session';
import {
  parseExerciseSkipInput,
  parseLoggedSetInput,
  parseSessionCompleteInput,
  parseSessionDurationCorrectionInput,
  parseSessionNoteInput,
} from '@/lib/program/contracts';
import type { MovementPattern, SessionState } from '@/lib/program/types';

export type SessionRouteContext = {
  params: Promise<{ sessionId: string }>;
};

export type SessionExerciseRouteContext = {
  params: Promise<{ sessionId: string; plannedExerciseId: string }>;
};

type OwnedExercise = {
  plannedSessionId: string;
};

export type SessionDetailLoggedSet = {
  setIndex: number;
  weight: number | string | { toString(): string };
  reps: number;
  rpe: number | string | { toString(): string } | null;
};

type SessionDetailExercise = {
  id: string;
  userId?: string;
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
  loggedSets?: SessionDetailLoggedSet[];
};

export type SessionDetailRecord = {
  id: string;
  userId?: string;
  scheduledDate: Date | string;
  dayIndex: number;
  focusLabel: string;
  state: SessionState;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  effectiveDurationSec?: number | null;
  durationCorrectedAt?: Date | string | null;
  note?: string | null;
  postSessionFatigue?: number | null;
  postSessionReadiness?: number | null;
  postSessionComment?: string | null;
  exercises: SessionDetailExercise[];
};

export type ProgramSessionDetailRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  getSessionDetail: (sessionId: string, userId: string) => Promise<SessionDetailRecord | null>;
};

export type ProgramSessionCompleteRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  completeSession: (
    input: { plannedSessionId: string; fatigue: number; readiness: number; comment?: string },
    userId?: string,
  ) => Promise<void>;
};

export type ProgramSessionDurationRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  correctDuration: (input: { plannedSessionId: string; effectiveDurationSec: number }, userId?: string) => Promise<void>;
};

export type ProgramSessionExerciseSetsRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  getExerciseOwnership: (plannedExerciseId: string, userId?: string) => Promise<OwnedExercise | null>;
  logSet: (
    input: {
      plannedExerciseId: string;
      setIndex: number;
      weight: number;
      reps: number;
      rpe?: number;
    },
    userId?: string,
  ) => Promise<unknown>;
};

export type ProgramSessionExerciseSkipRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  getExerciseOwnership: (plannedExerciseId: string, userId?: string) => Promise<OwnedExercise | null>;
  skipExercise: (input: { plannedExerciseId: string; reasonCode: string; reasonText?: string }, userId?: string) => Promise<void>;
  revertSkippedExercise: (input: { plannedExerciseId: string }, userId?: string) => Promise<void>;
};

export type ProgramSessionNoteRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  updateSessionNote: (input: { plannedSessionId: string; note: string | null }, userId?: string) => Promise<void>;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function toNumber(value: number | string | { toString(): string } | null): number | null {
  if (value === null) {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  return Number(value.toString());
}

function isOwnershipError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('mismatched account context');
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('not found');
}

function isBadRequestError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('completed') || message.includes('cannot') || message.includes('already') || message.includes('required') || message.includes('incomplete') || message.includes('24 hours');
}

async function assertOwnedExerciseForSession(
  deps: ProgramSessionExerciseSkipRouteDeps,
  userId: string,
  sessionId: string,
  plannedExerciseId: string,
): Promise<Response | null> {
  let ownership: OwnedExercise | null = null;
  try {
    ownership = await deps.getExerciseOwnership(plannedExerciseId, userId);
  } catch (error) {
    if (isOwnershipError(error)) {
      return json({ error: 'Planned exercise not found' }, 404);
    }

    return json({ error: 'Unable to verify planned exercise ownership' }, 500);
  }

  if (!ownership || ownership.plannedSessionId !== sessionId) {
    return json({ error: 'Planned exercise not found' }, 404);
  }

  return null;
}

function createSetMutationHandler(
  deps: ProgramSessionExerciseSetsRouteDeps,
  mutation: 'POST' | 'PATCH',
) {
  const successStatus = mutation === 'POST' ? 201 : 200;

  return async function handler(request: Request, context: SessionExerciseRouteContext): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { sessionId, plannedExerciseId } = await context.params;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Invalid request payload' }, 400);
    }

    let parsed: { setIndex: number; weight: number; reps: number; rpe?: number };
    try {
      parsed = parseLoggedSetInput(payload);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid logged set payload' }, 400);
    }

    let ownership: OwnedExercise | null = null;
    try {
      ownership = await deps.getExerciseOwnership(plannedExerciseId, session.userId);
    } catch (error) {
      if (isOwnershipError(error)) {
        return json({ error: 'Planned exercise not found' }, 404);
      }

      return json({ error: 'Unable to verify planned exercise ownership' }, 500);
    }

    if (!ownership || ownership.plannedSessionId !== sessionId) {
      return json({ error: 'Planned exercise not found' }, 404);
    }

    try {
      const saved = await deps.logSet(
        {
          plannedExerciseId,
          setIndex: parsed.setIndex,
          weight: parsed.weight,
          reps: parsed.reps,
          rpe: parsed.rpe,
        },
        session.userId,
      );

      return json(
        {
          set: saved ?? {
            plannedExerciseId,
            setIndex: parsed.setIndex,
            weight: parsed.weight,
            reps: parsed.reps,
            rpe: parsed.rpe ?? null,
          },
        },
        successStatus,
      );
    } catch (error) {
      if (isOwnershipError(error) || isNotFoundError(error)) {
        return json({ error: 'Planned exercise not found' }, 404);
      }

      if (isBadRequestError(error)) {
        return json({ error: error instanceof Error ? error.message : 'Invalid logging request' }, 400);
      }

      return json({ error: 'Unable to save logged set' }, 500);
    }
  };
}

export function createProgramSessionDetailGetHandler(deps: ProgramSessionDetailRouteDeps) {
  return async function GET(_request: Request, context: SessionRouteContext): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { sessionId } = await context.params;
    const detail = await deps.getSessionDetail(sessionId, session.userId);
    if (!detail) {
      return json({ error: 'Session not found' }, 404);
    }

    const scopedExercises = detail.exercises
      .filter((exercise) => typeof exercise.userId === 'undefined' || exercise.userId === session.userId)
      .map((exercise) => ({
        id: exercise.id,
        exerciseKey: exercise.exerciseKey,
        displayName: exercise.displayName,
        movementPattern: exercise.movementPattern,
        sets: exercise.sets,
        targetReps: exercise.targetReps,
        targetLoad: exercise.targetLoad,
        restMinSec: exercise.restMinSec,
        restMaxSec: exercise.restMaxSec,
        isSubstituted: exercise.isSubstituted,
        originalExerciseKey: exercise.originalExerciseKey,
        isSkipped: Boolean(exercise.isSkipped),
        skipReasonCode: exercise.skipReasonCode ?? null,
        skipReasonText: exercise.skipReasonText ?? null,
        loggedSets: [...(exercise.loggedSets ?? [])]
          .sort((a, b) => a.setIndex - b.setIndex)
          .map((setItem) => ({
            setIndex: setItem.setIndex,
            weight: Number(toNumber(setItem.weight) ?? 0),
            reps: setItem.reps,
            rpe: toNumber(setItem.rpe),
          })),
      }));

    const payload = buildSessionDetailProjection({
      ...detail,
      exercises: scopedExercises,
    });

    return json(payload, 200);
  };
}

export function createProgramSessionCompletePostHandler(deps: ProgramSessionCompleteRouteDeps) {
  return async function POST(request: Request, context: SessionRouteContext): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { sessionId } = await context.params;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Invalid request payload' }, 400);
    }

    let parsed: { fatigue: number; readiness: number; comment?: string };
    try {
      parsed = parseSessionCompleteInput(payload);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid session completion payload' }, 400);
    }

    try {
      await deps.completeSession(
        {
          plannedSessionId: sessionId,
          fatigue: parsed.fatigue,
          readiness: parsed.readiness,
          comment: parsed.comment,
        },
        session.userId,
      );

      return json(
        {
          sessionId,
          completed: true,
          fatigue: parsed.fatigue,
          readiness: parsed.readiness,
          comment: parsed.comment ?? null,
        },
        200,
      );
    } catch (error) {
      if (isNotFoundError(error)) {
        return json({ error: 'Planned session not found' }, 404);
      }

      if (isBadRequestError(error)) {
        return json({ error: error instanceof Error ? error.message : 'Invalid session completion request' }, 400);
      }

      return json({ error: 'Unable to complete session' }, 500);
    }
  };
}

export function createProgramSessionDurationPatchHandler(deps: ProgramSessionDurationRouteDeps) {
  return async function PATCH(request: Request, context: SessionRouteContext): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { sessionId } = await context.params;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Invalid request payload' }, 400);
    }

    let parsed: { effectiveDurationSec: number };
    try {
      parsed = parseSessionDurationCorrectionInput(payload);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid duration correction payload' }, 400);
    }

    try {
      await deps.correctDuration(
        {
          plannedSessionId: sessionId,
          effectiveDurationSec: parsed.effectiveDurationSec,
        },
        session.userId,
      );

      return json(
        {
          sessionId,
          effectiveDurationSec: parsed.effectiveDurationSec,
        },
        200,
      );
    } catch (error) {
      if (isNotFoundError(error)) {
        return json({ error: 'Planned session not found' }, 404);
      }

      if (isBadRequestError(error)) {
        return json({ error: error instanceof Error ? error.message : 'Invalid duration correction request' }, 400);
      }

      return json({ error: 'Unable to correct session duration' }, 500);
    }
  };
}

export function createProgramSessionExerciseSetsPostHandler(deps: ProgramSessionExerciseSetsRouteDeps) {
  return createSetMutationHandler(deps, 'POST');
}

export function createProgramSessionExerciseSetsPatchHandler(deps: ProgramSessionExerciseSetsRouteDeps) {
  return createSetMutationHandler(deps, 'PATCH');
}

export function createProgramSessionExerciseSkipPostHandler(deps: ProgramSessionExerciseSkipRouteDeps) {
  return async function POST(request: Request, context: SessionExerciseRouteContext): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { sessionId, plannedExerciseId } = await context.params;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Invalid request payload' }, 400);
    }

    let parsed: { reasonCode: string; reasonText?: string };
    try {
      parsed = parseExerciseSkipInput(payload);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid skip payload' }, 400);
    }

    const ownershipError = await assertOwnedExerciseForSession(deps, session.userId, sessionId, plannedExerciseId);
    if (ownershipError) {
      return ownershipError;
    }

    try {
      await deps.skipExercise(
        {
          plannedExerciseId,
          reasonCode: parsed.reasonCode,
          reasonText: parsed.reasonText,
        },
        session.userId,
      );

      return json(
        {
          plannedExerciseId,
          skipped: true,
        },
        200,
      );
    } catch (error) {
      if (isOwnershipError(error) || isNotFoundError(error)) {
        return json({ error: 'Planned exercise not found' }, 404);
      }

      if (isBadRequestError(error)) {
        return json({ error: error instanceof Error ? error.message : 'Invalid skip request' }, 400);
      }

      return json({ error: 'Unable to skip exercise' }, 500);
    }
  };
}

export function createProgramSessionExerciseSkipDeleteHandler(deps: ProgramSessionExerciseSkipRouteDeps) {
  return async function DELETE(_request: Request, context: SessionExerciseRouteContext): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { sessionId, plannedExerciseId } = await context.params;

    const ownershipError = await assertOwnedExerciseForSession(deps, session.userId, sessionId, plannedExerciseId);
    if (ownershipError) {
      return ownershipError;
    }

    try {
      await deps.revertSkippedExercise({ plannedExerciseId }, session.userId);
      return json(
        {
          plannedExerciseId,
          skipped: false,
        },
        200,
      );
    } catch (error) {
      if (isOwnershipError(error) || isNotFoundError(error)) {
        return json({ error: 'Planned exercise not found' }, 404);
      }

      if (isBadRequestError(error)) {
        return json({ error: error instanceof Error ? error.message : 'Invalid skip revert request' }, 400);
      }

      return json({ error: 'Unable to revert skipped exercise' }, 500);
    }
  };
}

export function createProgramSessionNotePatchHandler(deps: ProgramSessionNoteRouteDeps) {
  return async function PATCH(request: Request, context: SessionRouteContext): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { sessionId } = await context.params;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Invalid request payload' }, 400);
    }

    let parsed: { note?: string | null };
    try {
      parsed = parseSessionNoteInput(payload);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid note payload' }, 400);
    }

    try {
      await deps.updateSessionNote(
        {
          plannedSessionId: sessionId,
          note: parsed.note ?? null,
        },
        session.userId,
      );

      return json(
        {
          sessionId,
          note: parsed.note ?? null,
        },
        200,
      );
    } catch (error) {
      if (isNotFoundError(error)) {
        return json({ error: 'Planned session not found' }, 404);
      }

      if (isBadRequestError(error)) {
        return json({ error: error instanceof Error ? error.message : 'Invalid note request' }, 400);
      }

      return json({ error: 'Unable to update session note' }, 500);
    }
  };
}
