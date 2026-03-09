import { buildDefaultSessionGateRepository, validateSessionFromCookies } from '@/lib/auth/session-gate';
import { createProgramDal, createProgramDbClient } from '@/server/dal/program';
import { logRouteFailure } from '@/server/observability/app-logger';
import {
  createProgramSessionDetailGetHandler,
  type ProgramSessionDetailRouteDeps,
  type SessionDetailLoggedSet,
  type SessionDetailRecord,
  type SessionRouteContext,
} from './route-handlers';

async function buildDefaultDeps(): Promise<ProgramSessionDetailRouteDeps> {
  const { prisma } = await import('@/lib/db/prisma');
  const repository = await buildDefaultSessionGateRepository();

  return {
    resolveSession: () => validateSessionFromCookies(repository),
    getSessionDetail: async (sessionId, userId) => {
      const dal = createProgramDal(createProgramDbClient(prisma), { userId });
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

export async function GET(request: Request, context: SessionRouteContext): Promise<Response> {
  try {
    const deps = await buildDefaultDeps();
    return createProgramSessionDetailGetHandler(deps)(request, context);
  } catch (error) {
    logRouteFailure({
      route: '/api/program/sessions/[sessionId]',
      method: 'GET',
      status: 500,
      source: 'route_module',
      error,
    });

    return Response.json({ error: 'Unable to load session detail' }, { status: 500 });
  }
}
