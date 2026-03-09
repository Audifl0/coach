import type { ProfileInput, ProfilePatchInput } from '@/lib/profile/contracts';

export type AthleteProfileRecord = {
  userId: string;
  goal: ProfileInput['goal'];
  weeklySessionTarget: number;
  sessionDuration: ProfileInput['sessionDuration'];
  equipmentCategories: ProfileInput['equipmentCategories'];
  limitationsDeclared: boolean;
  limitations: ProfileInput['limitations'];
  createdAt: Date;
  updatedAt: Date;
};

type ProfileDbClient = {
  athleteProfile: {
    findUnique(args: { where: { userId: string } }): Promise<AthleteProfileRecord | null>;
    upsert(args: {
      where: { userId: string };
      create: Omit<AthleteProfileRecord, 'createdAt' | 'updatedAt'>;
      update: Omit<AthleteProfileRecord, 'userId' | 'createdAt' | 'updatedAt'>;
    }): Promise<AthleteProfileRecord>;
    update(args: {
      where: { userId: string };
      data: Partial<Omit<AthleteProfileRecord, 'userId' | 'createdAt' | 'updatedAt'>>;
    }): Promise<AthleteProfileRecord>;
  };
};

export function createProfileDbClient(db: unknown): ProfileDbClient {
  return db as ProfileDbClient;
}

export function mergeProfilePatch(current: ProfileInput, patch: ProfilePatchInput): ProfileInput {
  return {
    goal: patch.goal ?? current.goal,
    weeklySessionTarget: patch.weeklySessionTarget ?? current.weeklySessionTarget,
    sessionDuration: patch.sessionDuration ?? current.sessionDuration,
    equipmentCategories: patch.equipmentCategories ?? current.equipmentCategories,
    limitationsDeclared: patch.limitationsDeclared ?? current.limitationsDeclared,
    limitations: patch.limitations ?? current.limitations,
  };
}

export function createProfileDal(db: ProfileDbClient) {
  return {
    async getProfileByUserId(userId: string): Promise<AthleteProfileRecord | null> {
      return db.athleteProfile.findUnique({ where: { userId } });
    },

    async upsertProfile(userId: string, input: ProfileInput): Promise<AthleteProfileRecord> {
      return db.athleteProfile.upsert({
        where: { userId },
        create: {
          userId,
          goal: input.goal,
          weeklySessionTarget: input.weeklySessionTarget,
          sessionDuration: input.sessionDuration,
          equipmentCategories: input.equipmentCategories,
          limitationsDeclared: input.limitationsDeclared,
          limitations: input.limitations,
        },
        update: {
          goal: input.goal,
          weeklySessionTarget: input.weeklySessionTarget,
          sessionDuration: input.sessionDuration,
          equipmentCategories: input.equipmentCategories,
          limitationsDeclared: input.limitationsDeclared,
          limitations: input.limitations,
        },
      });
    },

    async patchProfile(userId: string, patch: ProfilePatchInput): Promise<AthleteProfileRecord> {
      const existing = await db.athleteProfile.findUnique({ where: { userId } });
      if (!existing) {
        throw new Error('Profile does not exist');
      }

      const merged = mergeProfilePatch(
        {
          goal: existing.goal,
          weeklySessionTarget: existing.weeklySessionTarget,
          sessionDuration: existing.sessionDuration,
          equipmentCategories: existing.equipmentCategories,
          limitationsDeclared: existing.limitationsDeclared,
          limitations: existing.limitations,
        },
        patch,
      );

      return db.athleteProfile.update({
        where: { userId },
        data: merged,
      });
    },
  };
}
