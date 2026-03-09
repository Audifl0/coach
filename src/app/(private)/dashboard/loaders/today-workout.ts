import { loadDashboardProgramTodaySection } from '@/server/dashboard/program-dashboard';
import type { ProgramTodaySessionCandidates } from '@/lib/program/contracts';

import { pickDashboardSession } from '../page-helpers';

export async function loadDashboardTodayWorkout(input: {
  programDal: {
    getTodayOrNextSessionCandidates: () => Promise<ProgramTodaySessionCandidates>;
  };
}) {
  const programTodaySection = await loadDashboardProgramTodaySection({
    getTodayOrNextSessionCandidates: async () => input.programDal.getTodayOrNextSessionCandidates(),
  });
  const sessionSurface = pickDashboardSession(programTodaySection.status === 'error' ? null : programTodaySection.data);

  return {
    programTodaySection,
    sessionSurface,
  };
}
