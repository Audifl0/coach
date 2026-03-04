import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { buildSessionDetailProjection } from '@/lib/program/select-today-session';
import { createProgramDal } from '@/server/dal/program';

type RouteContext = {
  params: { sessionId: string } | Promise<{ sessionId: string }>;
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
};

type SessionDetailRecord = {
  id: string;
  userId?: string;
  scheduledDate: Date | string;
  dayIndex: number;
  focusLabel: string;
  state: 'planned' | 'completed' | 'skipped';
  exercises: SessionDetailExercise[];
};

export type ProgramSessionDetailRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  getSessionDetail: (sessionId: string, userId: string) => Promise<SessionDetailRecord | null>;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
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

    const scopedExercises = detail.exercises.filter((exercise) =>
      typeof exercise.userId === 'undefined' || exercise.userId === session.userId,
    );

    const payload = buildSessionDetailProjection({
      ...detail,
      exercises: scopedExercises,
    });

    return json(payload, 200);
  };
}

async function buildDefaultDeps(): Promise<ProgramSessionDetailRouteDeps> {
  const { prisma } = await import('@/lib/db/prisma');
  const repository = await buildDefaultSessionGateRepository();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    getSessionDetail: async (sessionId, userId) => {
      const dal = createProgramDal(prisma as never, { userId });
      return dal.getSessionById(sessionId) as Promise<SessionDetailRecord | null>;
    },
  };
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const deps = await buildDefaultDeps();
  return createProgramSessionDetailGetHandler(deps)(request, context);
}
