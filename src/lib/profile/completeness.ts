import type { ProfileInput } from './contracts';

export type ProfileCompletenessInput = Pick<
  ProfileInput,
  | 'goal'
  | 'weeklySessionTarget'
  | 'sessionDuration'
  | 'equipmentCategories'
  | 'limitationsDeclared'
  | 'limitations'
>;

export function isProfileComplete(profile: ProfileCompletenessInput | null | undefined): boolean {
  if (!profile) {
    return false;
  }

  if (!profile.goal) {
    return false;
  }

  if (typeof profile.weeklySessionTarget !== 'number' || profile.weeklySessionTarget < 1) {
    return false;
  }

  if (!profile.sessionDuration) {
    return false;
  }

  if (!Array.isArray(profile.equipmentCategories) || profile.equipmentCategories.length === 0) {
    return false;
  }

  if (typeof profile.limitationsDeclared !== 'boolean') {
    return false;
  }

  if (!Array.isArray(profile.limitations)) {
    return false;
  }

  if (profile.limitationsDeclared && profile.limitations.length === 0) {
    return false;
  }

  if (!profile.limitationsDeclared && profile.limitations.length > 0) {
    return false;
  }

  return true;
}
