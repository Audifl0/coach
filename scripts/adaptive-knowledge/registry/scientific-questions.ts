import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  parseScientificQuestion,
  parseScientificQuestionRegistryState,
  type ScientificQuestion,
  type ScientificQuestionRegistryState,
  type ScientificQuestionStudyLink,
} from '../contracts';

const REGISTRY_DIR = 'registry';
const SCIENTIFIC_QUESTION_REGISTRY_FILE = 'scientific-questions.json';
const SCIENTIFIC_QUESTION_REGISTRY_VERSION = 'v1';

function resolveScientificQuestionRegistryPath(outputRootDir: string): string {
  return path.join(outputRootDir, REGISTRY_DIR, SCIENTIFIC_QUESTION_REGISTRY_FILE);
}

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

async function writeJsonAtomically(targetPath: string, payload: unknown): Promise<void> {
  const tmpPath = `${targetPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  await rename(tmpPath, targetPath);
}

function buildSeedQuestions(now?: Date): ScientificQuestion[] {
  const updatedAt = nowIso(now);
  return [
    {
      questionId: 'q-weekly-volume-hypertrophy',
      labelFr: 'Volume hebdomadaire et hypertrophie',
      promptFr: 'Quel volume hebdomadaire de travail favorise le mieux l hypertrophie musculaire selon le contexte ?',
      topicKeys: ['hypertrophy-dose', 'hypertrophy', 'volume'],
      inclusionCriteria: ['Etudes comparant le nombre de series ou le volume hebdomadaire avec outcomes hypertrophie.'],
      exclusionCriteria: ['Etudes sans outcome hypertrophie.', 'Commentaires sans donnees empiriques.'],
      linkedStudyIds: [],
      coverageStatus: 'empty',
      publicationStatus: 'not-ready',
      updatedAt,
    },
    {
      questionId: 'q-rest-intervals-strength',
      labelFr: 'Temps de repos et force',
      promptFr: 'Quels temps de repos entre series soutiennent le mieux les gains de force ?',
      topicKeys: ['rest-intervals', 'strength', 'force'],
      inclusionCriteria: ['Etudes comparant des temps de repos et mesurant la force.'],
      exclusionCriteria: ['Etudes sans mesure de force.', 'Protocoles purement aerobie.'],
      linkedStudyIds: [],
      coverageStatus: 'empty',
      publicationStatus: 'not-ready',
      updatedAt,
    },
    {
      questionId: 'q-autoregulation-progression',
      labelFr: 'Autoregulation et progression',
      promptFr: 'Comment l autoregulation influence-t-elle la progression de charge ou de volume ?',
      topicKeys: ['progression', 'autoregulation', 'fatigue-readiness'],
      inclusionCriteria: ['Etudes sur l autoregulation, la readiness ou l ajustement dynamique de charge.'],
      exclusionCriteria: ['Etudes sans strategie de progression.', 'Descriptifs non interventionnels sans signal pratique.'],
      linkedStudyIds: [],
      coverageStatus: 'empty',
      publicationStatus: 'not-ready',
      updatedAt,
    },
    {
      questionId: 'q-exercise-selection-hypertrophy',
      labelFr: 'Selection d exercices et hypertrophie',
      promptFr: 'Comment la selection des exercices influence-t-elle les gains hypertrophiques ?',
      topicKeys: ['exercise-selection', 'hypertrophy'],
      inclusionCriteria: ['Etudes comparant des choix d exercices avec outcome hypertrophie ou croissance regionnelle.'],
      exclusionCriteria: ['Etudes sans outcome morphologique.', 'Etudes sur technique seule sans choix d exercice.'],
      linkedStudyIds: [],
      coverageStatus: 'empty',
      publicationStatus: 'not-ready',
      updatedAt,
    },
    {
      questionId: 'q-pain-safe-load-adaptation',
      labelFr: 'Adaptation de charge compatible avec la douleur',
      promptFr: 'Quelles adaptations de charge semblent compatibles avec la douleur ou les limitations mecaniques ?',
      topicKeys: ['limitations-pain', 'pain', 'load-management'],
      inclusionCriteria: ['Etudes ou revues traitant la modulation de charge en contexte de douleur ou limitation.'],
      exclusionCriteria: ['Etudes sans strategie d adaptation de charge.', 'Modeles uniquement chirurgicaux.'],
      linkedStudyIds: [],
      coverageStatus: 'empty',
      publicationStatus: 'not-ready',
      updatedAt,
    },
  ].map((question) => parseScientificQuestion(question));
}

function createSeedState(now?: Date): ScientificQuestionRegistryState {
  return parseScientificQuestionRegistryState({
    version: SCIENTIFIC_QUESTION_REGISTRY_VERSION,
    generatedAt: nowIso(now),
    items: buildSeedQuestions(now),
  });
}

export async function loadScientificQuestions(outputRootDir: string): Promise<ScientificQuestionRegistryState> {
  const registryPath = resolveScientificQuestionRegistryPath(outputRootDir);
  try {
    const raw = await readFile(registryPath, 'utf8');
    return parseScientificQuestionRegistryState(JSON.parse(raw) as unknown);
  } catch {
    const seeded = createSeedState();
    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeJsonAtomically(registryPath, seeded);
    return seeded;
  }
}

export async function upsertScientificQuestions(
  outputRootDir: string,
  questions: readonly ScientificQuestion[],
  now?: Date,
): Promise<ScientificQuestionRegistryState> {
  const registryPath = resolveScientificQuestionRegistryPath(outputRootDir);
  await mkdir(path.dirname(registryPath), { recursive: true });

  const existing = await loadScientificQuestions(outputRootDir);
  const nextById = new Map(existing.items.map((item) => [item.questionId, item]));

  for (const question of questions) {
    const parsed = parseScientificQuestion(question);
    nextById.set(parsed.questionId, parsed);
  }

  const nextState = parseScientificQuestionRegistryState({
    version: existing.version ?? SCIENTIFIC_QUESTION_REGISTRY_VERSION,
    generatedAt: nowIso(now),
    items: [...nextById.values()].sort((left, right) => left.questionId.localeCompare(right.questionId)),
  });

  await writeJsonAtomically(registryPath, nextState);
  return nextState;
}

export async function appendStudyLinksToQuestions(
  outputRootDir: string,
  links: readonly ScientificQuestionStudyLink[],
  now?: Date,
): Promise<ScientificQuestionRegistryState> {
  if (links.length === 0) {
    return loadScientificQuestions(outputRootDir);
  }

  const existing = await loadScientificQuestions(outputRootDir);
  const updatedAt = nowIso(now);
  const linksByQuestionId = new Map<string, Set<string>>();

  for (const link of links) {
    const current = linksByQuestionId.get(link.questionId) ?? new Set<string>();
    current.add(link.studyId);
    linksByQuestionId.set(link.questionId, current);
  }

  const nextQuestions = existing.items.map((question) => {
    const incoming = linksByQuestionId.get(question.questionId);
    if (!incoming || incoming.size === 0) {
      return question;
    }

    return parseScientificQuestion({
      ...question,
      linkedStudyIds: [...new Set([...question.linkedStudyIds, ...incoming])].sort(),
      updatedAt,
    });
  });

  return upsertScientificQuestions(outputRootDir, nextQuestions, now);
}
