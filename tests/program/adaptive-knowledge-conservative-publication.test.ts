import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  parsePublishedDoctrinePrinciple,
  parseQuestionSynthesisDossier,
  parseScientificContradiction,
  type PublishedDoctrinePrinciple,
  type QuestionSynthesisDossier,
} from '../../scripts/adaptive-knowledge/contracts';
import {
  evaluateDoctrineCandidatePublication,
  reconcileDoctrineAgainstDossiers,
} from '../../scripts/adaptive-knowledge/conservative-publication';
import {
  appendDoctrineRevisionEntries,
  loadDoctrineRevisionHistory,
  loadPublishedDoctrineSnapshot,
  writePublishedDoctrineSnapshot,
} from '../../scripts/adaptive-knowledge/registry/doctrine';

function buildContradiction(overrides: Record<string, unknown> = {}) {
  return parseScientificContradiction({
    questionId: 'q-weekly-volume-hypertrophy',
    studyIds: ['study-1', 'study-2'],
    reasonCode: 'outcome-direction-divergence',
    summaryFr: 'Les etudes divergent sur la direction de l effet hypertrophique.',
    severity: 'blocking',
    resolved: false,
    ...overrides,
  });
}

function buildDossier(overrides: Partial<QuestionSynthesisDossier> = {}): QuestionSynthesisDossier {
  return parseQuestionSynthesisDossier({
    questionId: overrides.questionId ?? 'q-weekly-volume-hypertrophy',
    coverageStatus: overrides.coverageStatus ?? 'mature',
    linkedStudyIds: overrides.linkedStudyIds ?? ['study-1', 'study-2', 'study-3'],
    contradictions: overrides.contradictions ?? [],
    summaryFr: overrides.summaryFr ?? 'La question est assez couverte et les limites sont explicites.',
    confidenceLevel: overrides.confidenceLevel ?? 'moderate',
    publicationReadiness: overrides.publicationReadiness ?? 'ready',
    generatedAt: overrides.generatedAt ?? '2026-03-22T12:00:00.000Z',
  });
}

function buildPrinciple(overrides: Partial<PublishedDoctrinePrinciple> = {}): PublishedDoctrinePrinciple {
  return parsePublishedDoctrinePrinciple({
    principleId: overrides.principleId ?? 'principle-volume-hypertrophy',
    statementFr: overrides.statementFr ?? 'Un volume hebdomadaire modere a eleve peut soutenir l hypertrophie.',
    conditionsFr: overrides.conditionsFr ?? 'Surtout chez des pratiquants intermediaires sans fatigue excessive.',
    limitsFr: overrides.limitsFr ?? 'Les effets peuvent diminuer chez des pratiquants avances et sous forte fatigue.',
    confidenceLevel: overrides.confidenceLevel ?? 'moderate',
    questionIds: overrides.questionIds ?? ['q-weekly-volume-hypertrophy'],
    studyIds: overrides.studyIds ?? ['study-1', 'study-2', 'study-3'],
    revisionStatus: overrides.revisionStatus ?? 'active',
    publishedAt: overrides.publishedAt ?? '2026-03-22T12:00:00.000Z',
  });
}

async function loadJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}

test('candidate doctrine principle is rejected when unresolved contradiction is blocking', async () => {
  const result = evaluateDoctrineCandidatePublication({
    candidate: buildPrinciple(),
    dossier: buildDossier({
      contradictions: [buildContradiction()],
      publicationReadiness: 'blocked',
    }),
  });

  assert.equal(result.published, false);
  assert.equal(result.reasons.includes('unresolved_blocking_contradiction'), true);
});

test('candidate doctrine principle is rejected when too few studies support the question', async () => {
  const result = evaluateDoctrineCandidatePublication({
    candidate: buildPrinciple({ studyIds: ['study-1'] }),
    dossier: buildDossier({
      linkedStudyIds: ['study-1'],
      coverageStatus: 'partial',
      publicationReadiness: 'candidate',
    }),
  });

  assert.equal(result.published, false);
  assert.equal(result.reasons.includes('insufficient_supporting_studies'), true);
});

test('candidate doctrine principle is published when evidence, limits, and provenance are sufficient', async () => {
  const result = evaluateDoctrineCandidatePublication({
    candidate: buildPrinciple(),
    dossier: buildDossier(),
  });

  assert.equal(result.published, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.principle?.revisionStatus, 'active');
});

test('existing published principle can be reopened when new contradictions appear', async () => {
  const principle = buildPrinciple({ revisionStatus: 'active' });
  const snapshot = {
    version: 'v1',
    generatedAt: '2026-03-22T12:00:00.000Z',
    principles: [principle],
  };

  const reconciled = reconcileDoctrineAgainstDossiers({
    snapshot,
    dossiers: [
      buildDossier({
        questionId: 'q-weekly-volume-hypertrophy',
        contradictions: [buildContradiction()],
        publicationReadiness: 'blocked',
      }),
    ],
    now: new Date('2026-03-22T13:00:00.000Z'),
  });

  assert.equal(reconciled.snapshot.principles[0]?.revisionStatus, 'reopened');
  assert.equal(reconciled.revisions.some((entry) => entry.changeType === 'reopened'), true);
});

test('doctrine registry writes snapshot and revision history artifacts', async () => {
  const outputRootDir = await mkdtemp(path.join(tmpdir(), 'adaptive-doctrine-'));
  const snapshot = {
    version: 'v1',
    generatedAt: '2026-03-22T12:00:00.000Z',
    principles: [buildPrinciple()],
  };

  await writePublishedDoctrineSnapshot(outputRootDir, snapshot);
  await appendDoctrineRevisionEntries(outputRootDir, [
    {
      revisionId: 'rev-1',
      principleId: 'principle-volume-hypertrophy',
      changedAt: '2026-03-22T12:30:00.000Z',
      changeType: 'published',
      reason: 'Evidence threshold met.',
    },
  ]);

  const loadedSnapshot = await loadPublishedDoctrineSnapshot(outputRootDir);
  const history = await loadDoctrineRevisionHistory(outputRootDir);

  assert.equal(loadedSnapshot.principles.length, 1);
  assert.equal(history.entries.length, 1);
  assert.equal(history.entries[0]?.changeType, 'published');

  const snapshotFile = await loadJson(path.join(outputRootDir, 'registry', 'published-doctrine.json'));
  const historyFile = await loadJson(path.join(outputRootDir, 'registry', 'doctrine-revisions.json'));
  assert.equal(typeof snapshotFile, 'object');
  assert.equal(typeof historyFile, 'object');
});
