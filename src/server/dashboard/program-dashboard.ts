import type {
  ProgramTodaySessionCandidates,
  ProgramTodayResponse,
  ProgramTrendsSummaryResponse,
} from '@/lib/program/contracts';
import {
  isProgramTodayResponseEmpty,
  selectTodayWorkoutProjection,
} from '@/lib/program/select-today-session';
import { parseProgramTrendsSummaryResponse } from '@/lib/program/contracts';

export type DashboardProgramTodaySection =
  | { status: 'ready'; data: ProgramTodayResponse }
  | { status: 'empty'; data: ProgramTodayResponse }
  | { status: 'error' };

export type DashboardTrendsSection =
  | { status: 'ready'; data: ProgramTrendsSummaryResponse }
  | { status: 'empty' }
  | { status: 'error' };

export async function loadDashboardProgramTodaySection(input: {
  getTodayOrNextSessionCandidates: () => Promise<ProgramTodaySessionCandidates>;
}): Promise<DashboardProgramTodaySection> {
  try {
    const data = selectTodayWorkoutProjection(await input.getTodayOrNextSessionCandidates());

    if (isProgramTodayResponseEmpty(data)) {
      return {
        status: 'empty',
        data,
      };
    }

    return {
      status: 'ready',
      data,
    };
  } catch {
    return {
      status: 'error',
    };
  }
}

export async function loadDashboardTrendsSection(input: {
  getTrendSummary: (input: { period: '30d' }) => Promise<unknown>;
}): Promise<DashboardTrendsSection> {
  try {
    const summary = await input.getTrendSummary({ period: '30d' });
    if (!summary) {
      return {
        status: 'empty',
      };
    }

    return {
      status: 'ready',
      data: parseProgramTrendsSummaryResponse(summary),
    };
  } catch {
    return {
      status: 'error',
    };
  }
}
