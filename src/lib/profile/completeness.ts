import type { AthleteProfileRecord } from '@/server/dal/profile';

export function isProfileComplete(profile: AthleteProfileRecord | null | undefined): boolean {
  if (!profile) {
    return false;
  }

  if (!profile.goal) {
    return false;
  }

  if (!profile.weeklySessionTarget || profile.weeklySessionTarget < 1) {
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

  if (profile.limitationsDeclared && profile.limitations.length === 0) {
    return false;
  }

  if (!profile.limitationsDeclared && profile.limitations.length > 0) {
    return false;
  }

  return true;
}
