import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildQuestionSynthesisDossier,
  mergeQuestionContradictions,
  refreshQuestionContradictions,
} from '../contradiction-analysis';
import {
  parseAdaptiveKnowledgeWorkItem,
  type AdaptiveKnowledgeWorkItem,
  type QuestionSynthesisDossier,
  type ScientificContradiction,
  type ScientificQuestion,
  type StudyDossierRegistryRecord,
} from '../contracts';

export type ExecuteContradictionWorkItemContext = {
  outputRootDir: string;
  now: Date;
  question: ScientificQuestion;
  linkedStudies: readonly StudyDossierRegistryRecord[];
  contradictions: readonly ScientificContradiction[];
};

export type ExecuteContradictionWorkItemResult = {
  status: 'completed' | 'blocked';
  reason?: string;
  delta: {
    contradictionsAnalyzed: number;
    blockingContradictions: number;
  };
  dossier: QuestionSynthesisDossier;
};

function registryPath(outputRootDir: string): string {
  return path.join(outputRootDir, 'registry', 'question-synthesis-dossiers.json');
}

export async function executeContradictionWorkItem(
  item: AdaptiveKnowledgeWorkItem,
  context: ExecuteContradictionWorkItemContext,
): Promise<ExecuteContradictionWorkItemResult> {
  const parsedItem = parseAdaptiveKnowledgeWorkItem(item);
  if (parsedItem.kind !== 'analyze-contradiction') {
    return {
      status: 'blocked',
      reason: 'unsupported-contradiction-work-item',
      delta: {
        contradictionsAnalyzed: 0,
        blockingContradictions: 0,
      },
      dossier: buildQuestionSynthesisDossier({
        question: context.question,
        linkedStudies: context.linkedStudies,
        contradictions: context.contradictions,
        now: context.now,
      }),
    };
  }

  const refreshed = refreshQuestionContradictions({
    question: context.question,
    linkedStudies: context.linkedStudies,
  });
  const contradictions = mergeQuestionContradictions({
    existing: context.contradictions,
    refreshed,
  });
  const dossier = buildQuestionSynthesisDossier({
    question: context.question,
    linkedStudies: context.linkedStudies,
    contradictions,
    now: context.now,
  });

  const filePath = registryPath(context.outputRootDir);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    JSON.stringify(
      {
        version: 'v1',
        generatedAt: context.now.toISOString(),
        items: [dossier],
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  return {
    status: 'completed',
    delta: {
      contradictionsAnalyzed: 1,
      blockingContradictions: contradictions.filter((entry) => entry.resolved === false && entry.severity === 'blocking').length,
    },
    dossier,
  };
}
