import { z } from 'zod';

import type { CoachKnowledgeBible } from '@/lib/coach/knowledge-bible';
import type { ProfileInput } from '@/lib/profile/contracts';

import { exerciseCatalog, getExerciseCatalogEntry } from './catalog';
import type { WeeklyProgramPlan } from './planner';

const hybridProgramDraftSchema = z.object({
  reasoningSummary: z.array(z.string().trim().min(1).max(220)).min(2).max(4),
  evidencePrincipleIds: z.array(z.string().trim().min(1)).min(1).max(8),
  evidenceSourceIds: z.array(z.string().trim().min(1)).min(1).max(8),
  sessions: z.array(
    z.object({
      sessionIndex: z.number().int().min(0).max(6),
      focusLabel: z.string().trim().min(1).max(80),
      exerciseKeys: z.array(z.string().trim().min(1)).min(1).max(4),
    }).strict(),
  ).min(1).max(7),
}).strict();

export type HybridProgramDraft = z.infer<typeof hybridProgramDraftSchema>;

function normalizeLimitationTag(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function isExerciseAllowed(profile: ProfileInput, exerciseKey: string): boolean {
  const entry = getExerciseCatalogEntry(exerciseKey);
  if (!entry) {
    return false;
  }

  const availableEquipment = new Set(profile.equipmentCategories);
  const blockedLimitations = new Set(
    profile.limitationsDeclared
      ? profile.limitations.filter((item) => item.severity !== 'none').map((item) => normalizeLimitationTag(item.zone))
      : [],
  );

  return (
    entry.equipmentTags.every((tag) => availableEquipment.has(tag)) &&
    entry.blockedLimitations.every((zone) => !blockedLimitations.has(zone))
  );
}

export function parseHybridProgramDraft(input: unknown): HybridProgramDraft {
  return hybridProgramDraftSchema.parse(input);
}

export function buildProgramGenerationPrompt(input: {
  profile: ProfileInput;
  baselinePlan: WeeklyProgramPlan;
  knowledgeBible: CoachKnowledgeBible;
  biblePromptBlock: string;
}): {
  systemPrompt: string;
  userPrompt: string;
} {
  const allowedExerciseCatalog = exerciseCatalog
    .filter((entry) => isExerciseAllowed(input.profile, entry.key))
    .map((entry) => ({
      key: entry.key,
      name: entry.displayName,
      movementPattern: entry.movementPattern,
      equipmentTags: entry.equipmentTags,
    }));

  return {
    systemPrompt: [
      'You are building an initial French strength-training program.',
      'Return strict JSON only.',
      'Use the knowledge bible to justify session structure and exercise choices.',
      'Use only exercise keys provided in allowed_exercises.',
      'Do not exceed the provided number of sessions and keep sessionIndex aligned with the baseline sessions.',
    ].join(' '),
    userPrompt: [
      `profile=${JSON.stringify(input.profile)}`,
      `baseline_plan=${JSON.stringify(input.baselinePlan)}`,
      `knowledge_snapshot=${input.knowledgeBible.snapshotId ?? 'none'}`,
      `allowed_exercises=${JSON.stringify(allowedExerciseCatalog)}`,
      input.biblePromptBlock,
      'Return JSON with: reasoningSummary, evidencePrincipleIds, evidenceSourceIds, sessions[].',
      'Each session must include: sessionIndex, focusLabel, exerciseKeys.',
    ].join('\n'),
  };
}

export function mergeHybridProgramDraft(input: {
  profile: ProfileInput;
  baselinePlan: WeeklyProgramPlan;
  draft: unknown;
}): WeeklyProgramPlan {
  const parsed = parseHybridProgramDraft(input.draft);
  const draftBySessionIndex = new Map(parsed.sessions.map((session) => [session.sessionIndex, session] as const));

  return {
    ...input.baselinePlan,
    sessions: input.baselinePlan.sessions.map((baselineSession, sessionIndex) => {
      const draftSession = draftBySessionIndex.get(sessionIndex);
      if (!draftSession) {
        return baselineSession;
      }

      const chosenEntries = draftSession.exerciseKeys
        .filter((exerciseKey, index, all) => all.indexOf(exerciseKey) === index)
        .filter((exerciseKey) => isExerciseAllowed(input.profile, exerciseKey))
        .map((exerciseKey) => getExerciseCatalogEntry(exerciseKey))
        .filter((entry): entry is NonNullable<ReturnType<typeof getExerciseCatalogEntry>> => entry !== null);

      const mergedExercises = baselineSession.exercises.map((baselineExercise, exerciseIndex) => {
        const nextEntry = chosenEntries[exerciseIndex];
        if (!nextEntry) {
          return baselineExercise;
        }

        return {
          ...baselineExercise,
          exerciseKey: nextEntry.key,
          displayName: nextEntry.displayName,
          movementPattern: nextEntry.movementPattern,
          isSubstituted: false,
          originalExerciseKey: null,
        };
      });

      return {
        ...baselineSession,
        focusLabel: draftSession.focusLabel.trim() || baselineSession.focusLabel,
        exercises: mergedExercises,
      };
    }),
  };
}
