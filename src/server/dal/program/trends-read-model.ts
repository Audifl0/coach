import type { MovementPattern } from '@/lib/program/types';

import type { ProgramDalClient } from '../program';

type TrendPeriod = '7d' | '30d' | '90d';

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function resolveTrendRange(period: TrendPeriod, now: Date): { from: Date; to: Date; dates: string[] } {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const to = endOfUtcDay(now);
  const from = startOfUtcDay(now);
  from.setUTCDate(from.getUTCDate() - (days - 1));

  const dates: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    dates.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { from, to, dates };
}

export function createTrendsReadModelDal(input: {
  db: ProgramDalClient;
  scope: { userId: string };
}) {
  const { db, scope } = input;

  return {
    async getTrendSummary(inputSummary: {
      period: TrendPeriod;
      now?: Date;
    }): Promise<{
      period: TrendPeriod;
      generatedAt: string;
      metrics: {
        volume: { kpi: number; unit: 'kg'; points: Array<{ date: string; value: number }> };
        intensity: { kpi: number; unit: 'kg'; points: Array<{ date: string; value: number }> };
        adherence: { kpi: number; unit: 'ratio'; points: Array<{ date: string; value: number }> };
      };
    }> {
      if (!db.plannedSession.findMany) {
        throw new Error('Program DAL client missing plannedSession.findMany');
      }

      const now = inputSummary.now ?? new Date();
      const range = resolveTrendRange(inputSummary.period, now);
      const sessions = await db.plannedSession.findMany({
        where: {
          userId: scope.userId,
          scheduledDate: {
            gte: range.from,
            lte: range.to,
          },
        },
        orderBy: {
          completedAt: 'asc',
        },
        include: {
          exercises: {
            select: {
              id: true,
              orderIndex: true,
            },
          },
          loggedSets: {
            select: {
              plannedExerciseId: true,
              weight: true,
              reps: true,
            },
          },
        },
      });

      const byDate = new Map<
        string,
        { volume: number; planned: number; completed: number; intensitySum: number; intensityCount: number }
      >();
      for (const date of range.dates) {
        byDate.set(date, { volume: 0, planned: 0, completed: 0, intensitySum: 0, intensityCount: 0 });
      }

      let totalIntensitySum = 0;
      let totalIntensityCount = 0;
      let totalCompleted = 0;
      let totalPlanned = 0;

      for (const session of sessions) {
        const date = toIsoDate(session.scheduledDate);
        const bucket = byDate.get(date);
        if (!bucket) {
          continue;
        }

        bucket.planned += 1;
        totalPlanned += 1;
        if (session.completedAt) {
          bucket.completed += 1;
          totalCompleted += 1;
        }

        const sets = session.loggedSets ?? [];
        const sessionVolume = sets.reduce((sum, item) => sum + item.weight * item.reps, 0);
        bucket.volume += sessionVolume;

        const keyExercise = [...session.exercises]
          .sort((left, right) => (left.orderIndex ?? Number.MAX_SAFE_INTEGER) - (right.orderIndex ?? Number.MAX_SAFE_INTEGER))[0];
        if (keyExercise) {
          const keySets = sets.filter((setItem) => setItem.plannedExerciseId === keyExercise.id);
          if (keySets.length > 0) {
            for (const keySet of keySets) {
              bucket.intensitySum += keySet.weight;
              bucket.intensityCount += 1;
              totalIntensitySum += keySet.weight;
              totalIntensityCount += 1;
            }
          }
        }
      }

      const volumePoints = range.dates.map((date) => ({
        date,
        value: byDate.get(date)?.volume ?? 0,
      }));
      const intensityPoints = range.dates.map((date) => {
        const bucket = byDate.get(date);
        return {
          date,
          value: bucket && bucket.intensityCount > 0 ? bucket.intensitySum / bucket.intensityCount : 0,
        };
      });
      const adherencePoints = range.dates.map((date) => {
        const bucket = byDate.get(date);
        return {
          date,
          value: bucket && bucket.planned > 0 ? bucket.completed / bucket.planned : 0,
        };
      });

      return {
        period: inputSummary.period,
        generatedAt: (inputSummary.now ?? new Date()).toISOString(),
        metrics: {
          volume: {
            kpi: volumePoints.reduce((sum, point) => sum + point.value, 0),
            unit: 'kg',
            points: volumePoints,
          },
          intensity: {
            kpi: totalIntensityCount > 0 ? totalIntensitySum / totalIntensityCount : 0,
            unit: 'kg',
            points: intensityPoints,
          },
          adherence: {
            kpi: totalPlanned > 0 ? totalCompleted / totalPlanned : 0,
            unit: 'ratio',
            points: adherencePoints,
          },
        },
      };
    },

    async getExerciseTrendSeries(inputSeries: {
      period: TrendPeriod;
      exerciseKey: string;
      now?: Date;
    }): Promise<{
      period: TrendPeriod;
      exercise: { key: string; displayName: string; movementPattern: MovementPattern };
      points: Array<{ date: string; reps: number; load: number }>;
    } | null> {
      if (!db.plannedSession.findMany) {
        throw new Error('Program DAL client missing plannedSession.findMany');
      }

      const range = resolveTrendRange(inputSeries.period, inputSeries.now ?? new Date());
      const sessions = await db.plannedSession.findMany({
        where: {
          userId: scope.userId,
          scheduledDate: {
            gte: range.from,
            lte: range.to,
          },
        },
        orderBy: {
          completedAt: 'asc',
        },
        include: {
          exercises: {
            select: {
              id: true,
              orderIndex: true,
              exerciseKey: true,
              displayName: true,
              movementPattern: true,
            },
          },
          loggedSets: {
            select: {
              plannedExerciseId: true,
              weight: true,
              reps: true,
            },
          },
        },
      });

      const byDate = new Map<string, { reps: number; loadSum: number; loadCount: number }>();
      let exerciseIdentity: { key: string; displayName: string; movementPattern: MovementPattern } | null = null;

      for (const session of sessions) {
        const matchingExercises = session.exercises.filter((item) => item.exerciseKey === inputSeries.exerciseKey);
        if (matchingExercises.length === 0) {
          continue;
        }

        const target = [...matchingExercises].sort(
          (left, right) => (left.orderIndex ?? Number.MAX_SAFE_INTEGER) - (right.orderIndex ?? Number.MAX_SAFE_INTEGER),
        )[0];
        if (!target || !target.displayName || !target.movementPattern) {
          continue;
        }

        exerciseIdentity = {
          key: inputSeries.exerciseKey,
          displayName: target.displayName,
          movementPattern: target.movementPattern,
        };

        const sets = (session.loggedSets ?? []).filter((item) => item.plannedExerciseId === target.id);
        if (sets.length === 0) {
          continue;
        }

        const date = toIsoDate(session.scheduledDate);
        const existing = byDate.get(date) ?? { reps: 0, loadSum: 0, loadCount: 0 };
        for (const setItem of sets) {
          existing.reps += setItem.reps;
          existing.loadSum += setItem.weight;
          existing.loadCount += 1;
        }
        byDate.set(date, existing);
      }

      if (!exerciseIdentity || byDate.size === 0) {
        return null;
      }

      const points = [...byDate.entries()]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([date, value]) => ({
          date,
          reps: value.reps,
          load: value.loadCount > 0 ? value.loadSum / value.loadCount : 0,
        }));

      return {
        period: inputSeries.period,
        exercise: exerciseIdentity,
        points,
      };
    },
  };
}
