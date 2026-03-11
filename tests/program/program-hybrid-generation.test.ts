import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeHybridProgramDraft } from '../../src/lib/program/hybrid-generation';
import { buildWeeklyProgramPlan } from '../../src/lib/program/planner';
import type { ProfileInput } from '../../src/lib/profile/contracts';
import { createProgramGenerationService } from '../../src/server/services/program-generation';

function createProfile(overrides: Partial<ProfileInput> = {}): ProfileInput {
  return {
    goal: 'hypertrophy',
    weeklySessionTarget: 3,
    sessionDuration: '45_to_75m',
    equipmentCategories: ['dumbbells', 'bench', 'machines'],
    limitationsDeclared: false,
    limitations: [],
    ...overrides,
  };
}

test('hybrid draft merges allowed exercise overrides into the deterministic baseline plan', () => {
  const profile = createProfile();
  const baselinePlan = buildWeeklyProgramPlan({
    profile,
    anchorDate: '2026-03-11',
  });

  const merged = mergeHybridProgramDraft({
    profile,
    baselinePlan,
    draft: {
      reasoningSummary: ['Use a push/lower emphasis', 'Keep progression conservative'],
      evidencePrincipleIds: ['p_safe'],
      evidenceSourceIds: ['s_guideline'],
      sessions: [
        {
          sessionIndex: 0,
          focusLabel: 'Bas du corps + poussee',
          exerciseKeys: ['leg_press', 'machine_chest_press'],
        },
      ],
    },
  });

  assert.equal(merged.sessions[0]?.focusLabel, 'Bas du corps + poussee');
  assert.equal(merged.sessions[0]?.exercises[0]?.exerciseKey, 'leg_press');
  assert.equal(merged.sessions[0]?.exercises[1]?.exerciseKey, 'machine_chest_press');
});

test('hybrid draft ignores exercise overrides that violate profile constraints', () => {
  const profile = createProfile({
    equipmentCategories: ['bodyweight'],
    limitationsDeclared: true,
    limitations: [{ zone: 'knee_acute', severity: 'moderate', temporality: 'temporary' }],
  });
  const baselinePlan = buildWeeklyProgramPlan({
    profile,
    anchorDate: '2026-03-11',
  });

  const merged = mergeHybridProgramDraft({
    profile,
    baselinePlan,
    draft: {
      reasoningSummary: ['Attempted override', 'Should fail closed'],
      evidencePrincipleIds: ['p_safe'],
      evidenceSourceIds: ['s_guideline'],
      sessions: [
        {
          sessionIndex: 0,
          focusLabel: 'Tentative invalide',
          exerciseKeys: ['leg_press', 'dumbbell_bench_press'],
        },
      ],
    },
  });

  assert.notEqual(merged.sessions[0]?.exercises[0]?.exerciseKey, 'leg_press');
  assert.notEqual(merged.sessions[0]?.exercises[1]?.exerciseKey, 'dumbbell_bench_press');
});

test('program generation service falls back to deterministic baseline when hybrid draft is invalid', async () => {
  const profile = createProfile();
  const persisted: Array<{ exerciseKeys: string[] }> = [];
  const service = createProgramGenerationService({
    getProfile: async () => profile,
    replaceActivePlan: async (_userId, input) => {
      persisted.push({
        exerciseKeys: input.sessions[0]?.exercises.map((exercise) => exercise.exerciseKey) ?? [],
      });
      return {};
    },
    getKnowledgeBible: () => ({ snapshotId: 'snap_1', principles: [], sources: [] }),
    createHybridDraft: async () => ({
      sessions: [
        {
          sessionIndex: 0,
          focusLabel: 'Draft invalide',
          exerciseKeys: [],
        },
      ],
    }),
  });

  const result = await service.generate('user_1', { regenerate: false, anchorDate: '2026-03-11' });

  assert.equal(result.sessions.length, 3);
  assert.equal(result.meta.mode, 'fallback_baseline');
  assert.equal(result.meta.knowledgeSnapshotId, 'snap_1');
  assert.equal(persisted.length, 1);
  assert.ok(persisted[0]?.exerciseKeys.length > 0);
});

test('program generation service keeps PROG-01/PROG-02 contract under valid hybrid draft', async () => {
  const profile = createProfile();
  const service = createProgramGenerationService({
    getProfile: async () => profile,
    replaceActivePlan: async () => ({}),
    getKnowledgeBible: () => ({
      snapshotId: 'snap_hybrid',
      principles: [{ id: 'p_safe', title: 'Safe', description: 'Safe', guardrail: 'SAFE-03', tags: ['progression'] }],
      sources: [{ id: 's_guideline', title: 'Source', summary: 'Summary', sourceClass: 'guideline', tags: ['progression'] }],
    }),
    createHybridDraft: async () => ({
      reasoningSummary: ['Use a stable split', 'Preserve prescription detail'],
      evidencePrincipleIds: ['p_safe'],
      evidenceSourceIds: ['s_guideline'],
      sessions: [
        {
          sessionIndex: 0,
          focusLabel: 'Haut du corps',
          exerciseKeys: ['machine_chest_press', 'lat_pulldown'],
        },
      ],
    }),
  });

  const result = await service.generate('user_1', { regenerate: false, anchorDate: '2026-03-11' });

  assert.equal(result.meta.mode, 'hybrid');
  assert.equal(result.meta.knowledgeSnapshotId, 'snap_hybrid');
  assert.equal(result.sessions.length, 3);
  assert.equal(result.sessions[0]?.focusLabel.length > 0, true);
  assert.equal((result.sessions[0]?.exercises[0]?.sets ?? 0) > 0, true);
  assert.equal((result.sessions[0]?.exercises[0]?.targetReps ?? 0) > 0, true);
  assert.equal((result.sessions[0]?.exercises[0]?.targetLoad ?? '').length > 0, true);
  assert.equal((result.sessions[0]?.exercises[0]?.restMinSec ?? 0) >= 0, true);
});
