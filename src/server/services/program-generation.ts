import { isProfileComplete } from '@/lib/profile/completeness';
import type { ProgramGenerateInput, ProgramSessionSummary } from '@/lib/program/contracts';
import { buildWeeklyProgramPlan } from '@/lib/program/planner';
import { validateProfileInput } from '@/lib/profile/contracts';
import { createProgramDal, type ReplaceActivePlanInput } from '@/server/dal/program';
import { createProfileDal } from '@/server/dal/profile';

type ProgramGenerationServiceDeps = {
  getProfile: (userId: string) => Promise<unknown | null>;
  replaceActivePlan: (userId: string, input: ReplaceActivePlanInput) => Promise<unknown>;
};

export class ProgramGenerationError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ProgramGenerationError';
    this.status = status;
  }
}

type ProgramGenerationResult = {
  startDate: string;
  endDate: string;
  sessions: ProgramSessionSummary[];
};

function toDateStart(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export function createProgramGenerationService(deps: ProgramGenerationServiceDeps) {
  return {
    async generate(userId: string, input: ProgramGenerateInput): Promise<ProgramGenerationResult> {
      const rawProfile = await deps.getProfile(userId);
      if (!rawProfile) {
        throw new ProgramGenerationError('Profile is required before generating a program', 400);
      }

      const profile = validateProfileInput(rawProfile);
      if (!isProfileComplete(profile)) {
        throw new ProgramGenerationError('Profile is incomplete', 400);
      }

      const plan = buildWeeklyProgramPlan({
        profile,
        anchorDate: input.anchorDate,
      });

      await deps.replaceActivePlan(userId, {
        startDate: toDateStart(plan.startDate),
        endDate: toDateStart(plan.endDate),
        sessions: plan.sessions.map((session) => ({
          scheduledDate: toDateStart(session.scheduledDate),
          dayIndex: session.dayIndex,
          focusLabel: session.focusLabel,
          state: session.state,
          exercises: session.exercises.map((exercise, orderIndex) => ({
            orderIndex,
            exerciseKey: exercise.exerciseKey,
            displayName: exercise.displayName,
            movementPattern: exercise.movementPattern,
            sets: exercise.sets,
            targetReps: exercise.targetReps,
            targetLoad: exercise.targetLoad,
            restMinSec: exercise.restMinSec,
            restMaxSec: exercise.restMaxSec,
          })),
        })),
      });

      return {
        startDate: plan.startDate,
        endDate: plan.endDate,
        sessions: plan.sessions,
      };
    },
  };
}

export async function buildDefaultProgramGenerationService() {
  const { prisma } = await import('@/lib/db/prisma');
  const profileDal = createProfileDal(prisma as never);

  return createProgramGenerationService({
    getProfile: (userId) => profileDal.getProfileByUserId(userId),
    replaceActivePlan: (userId, input) => {
      const programDal = createProgramDal(prisma as never, { userId });
      return programDal.replaceActivePlan(input);
    },
  });
}
