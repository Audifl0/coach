import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { mergeHybridProgramDraft } from '../../src/lib/program/hybrid-generation';
import { buildWeeklyProgramPlan } from '../../src/lib/program/planner';
import type { ProfileInput } from '../../src/lib/profile/contracts';
import { createProgramGenerationService } from '../../src/server/services/program-generation';
import { loadCoachKnowledgeBible } from '../../src/lib/coach/knowledge-bible';
import { resolveProgramKnowledgeBible } from '../../src/server/services/program-generation-hybrid';

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

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
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

test('program generation defaults use principleLimit 6 and sourceLimit 8', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'program-knowledge-defaults-'));
  const snapshotDir = path.join(rootDir, 'snapshots', 'run-defaults', 'validated');
  await mkdir(snapshotDir, { recursive: true });

  await writeJson(path.join(snapshotDir, 'knowledge-bible.json'), {
    principles: Array.from({ length: 9 }, (_, index) => ({
      id: `p_${index + 1}`,
      title: `Principle ${index + 1}`,
      description: `Description ${index + 1}`,
      guardrail: index % 2 === 0 ? `SAFE-0${(index % 3) + 1}` : null,
      tags: ['progression', 'load'],
    })),
    sources: Array.from({ length: 10 }, (_, index) => ({
      id: `s_${index + 1}`,
      title: `Source ${index + 1}`,
      summary: `Summary ${index + 1}`,
      sourceClass: index % 2 === 0 ? 'guideline' : 'review',
      tags: ['progression', 'load'],
    })),
  });
  await writeJson(path.join(rootDir, 'active.json'), {
    snapshotId: 'run-defaults',
    snapshotDir,
    promotedAt: '2026-03-05T00:00:00.000Z',
  });

  const manualBible = loadCoachKnowledgeBible({
    knowledgeRootDir: rootDir,
    queryTags: ['progression', 'load'],
    principleLimit: 6,
    sourceLimit: 8,
  });

  assert.equal(manualBible.principles.length, 6);
  assert.equal(manualBible.sources.length, 8);

  const resolvedBible = resolveProgramKnowledgeBible({
    profile: createProfile({
      goal: 'progression',
    }),
  });

  assert.equal(typeof resolvedBible.snapshotId, 'string');
});
