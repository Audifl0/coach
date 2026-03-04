import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { createProgramDal } from '@/server/dal/program';

type RouteContext = {
  params: { sessionId: string } | Promise<{ sessionId: string }>;
};

type SessionDetailLoggedSet = {
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
  movementPattern: string;
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

type SessionDetailRecord = {
  id: string;
  userId?: string;
  scheduledDate: Date | string;
  dayIndex: number;
  focusLabel: string;
  state: 'planned' | 'completed' | 'skipped';
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

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function toIsoDate(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
}

function toIsoDateTime(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return value.toISOString();
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

export function createProgramSessionDetailGetHandler(deps: ProgramSessionDetailRouteDeps) {
  return async function GET(_request: Request, context: RouteContext): Promise<Response> {
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

    return json(
      {
        session: {
          id: detail.id,
          scheduledDate: toIsoDate(detail.scheduledDate),
          dayIndex: detail.dayIndex,
          focusLabel: detail.focusLabel,
          state: detail.state,
          startedAt: toIsoDateTime(detail.startedAt),
          completedAt: toIsoDateTime(detail.completedAt),
          effectiveDurationSec: detail.effectiveDurationSec ?? null,
          durationCorrectedAt: toIsoDateTime(detail.durationCorrectedAt),
          note: detail.note ?? null,
          postSessionFatigue: detail.postSessionFatigue ?? null,
          postSessionReadiness: detail.postSessionReadiness ?? null,
          postSessionComment: detail.postSessionComment ?? null,
          exercises: scopedExercises,
        },
      },
      200,
    );
  };
}

async function buildDefaultDeps(): Promise<ProgramSessionDetailRouteDeps> {
  const { prisma } = await import('@/lib/db/prisma');
  const repository = await buildDefaultSessionGateRepository();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    getSessionDetail: async (sessionId, userId) => {
      const dal = createProgramDal(prisma as never, { userId });
      const session = await dal.getSessionById(sessionId);
      if (!session) {
        return null;
      }

      const exerciseIds = session.exercises.map((exercise) => exercise.id);
      const loggedSets =
        exerciseIds.length > 0
          ? await prisma.loggedSet.findMany({
            where: {
              userId,
              plannedSessionId: sessionId,
              plannedExerciseId: {
                in: exerciseIds,
              },
            },
            orderBy: {
              setIndex: 'asc',
            },
            select: {
              plannedExerciseId: true,
              setIndex: true,
              weight: true,
              reps: true,
              rpe: true,
            },
          })
          : [];

      const setsByExercise = new Map<string, SessionDetailLoggedSet[]>();
      for (const row of loggedSets) {
        const bucket = setsByExercise.get(row.plannedExerciseId) ?? [];
        bucket.push({
          setIndex: row.setIndex,
          weight: row.weight as unknown as number,
          reps: row.reps,
          rpe: row.rpe as unknown as number | null,
        });
        setsByExercise.set(row.plannedExerciseId, bucket);
      }

      return {
        ...session,
        exercises: session.exercises.map((exercise) => ({
          ...exercise,
          loggedSets: setsByExercise.get(exercise.id) ?? [],
        })),
      } as SessionDetailRecord;
    },
  };
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramSessionDetailGetHandler(deps)(request, context);
}
