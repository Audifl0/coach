export function isProfileComplete(profile: unknown): boolean {
  if (!profile || typeof profile !== 'object') {
    return false;
  }

  const candidate = profile as {
    goal?: unknown;
    weeklySessionTarget?: unknown;
    sessionDuration?: unknown;
    equipmentCategories?: unknown;
    limitationsDeclared?: unknown;
    limitations?: unknown;
  };

  if (!candidate.goal) {
    return false;
  }

  if (typeof candidate.weeklySessionTarget !== 'number' || candidate.weeklySessionTarget < 1) {
    return false;
  }

  if (!candidate.sessionDuration) {
    return false;
  }

  if (!Array.isArray(candidate.equipmentCategories) || candidate.equipmentCategories.length === 0) {
    return false;
  }

  if (typeof candidate.limitationsDeclared !== 'boolean') {
    return false;
  }

  if (!Array.isArray(candidate.limitations)) {
    return false;
  }

  if (candidate.limitationsDeclared && candidate.limitations.length === 0) {
    return false;
  }

  if (!candidate.limitationsDeclared && candidate.limitations.length > 0) {
    return false;
  }

  return true;
}
