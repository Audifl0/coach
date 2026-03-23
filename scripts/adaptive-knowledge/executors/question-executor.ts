import { linkStudiesToScientificQuestions } from '../question-linking';
import { parseAdaptiveKnowledgeWorkItem, type AdaptiveKnowledgeWorkItem, type ScientificQuestion, type StudyDossierRegistryRecord } from '../contracts';
import { upsertScientificQuestions } from '../registry/scientific-questions';

export type ExecuteQuestionWorkItemContext = {
  outputRootDir: string;
  now: Date;
  question: ScientificQuestion;
  studyDossiers: readonly StudyDossierRegistryRecord[];
};

export type ExecuteQuestionWorkItemResult = {
  status: 'completed' | 'blocked';
  reason?: string;
  delta: {
    questionsLinked: number;
    maturedQuestions: number;
  };
  question: ScientificQuestion;
  backlogReasons: string[];
};

export async function executeQuestionWorkItem(
  item: AdaptiveKnowledgeWorkItem,
  context: ExecuteQuestionWorkItemContext,
): Promise<ExecuteQuestionWorkItemResult> {
  const parsedItem = parseAdaptiveKnowledgeWorkItem(item);
  if (parsedItem.kind !== 'link-study-question') {
    return {
      status: 'blocked',
      reason: 'unsupported-question-work-item',
      delta: { questionsLinked: 0, maturedQuestions: 0 },
      question: context.question,
      backlogReasons: [],
    };
  }

  const beforeCoverage = context.question.coverageStatus;
  const beforeLinkedCount = context.question.linkedStudyIds.length;
  const linking = linkStudiesToScientificQuestions({
    studyDossiers: context.studyDossiers,
    questions: [context.question],
    now: context.now,
  });
  const nextQuestion = linking.questions[0] ?? context.question;
  await upsertScientificQuestions(context.outputRootDir, [nextQuestion], context.now);

  return {
    status: 'completed',
    delta: {
      questionsLinked: Math.max(0, nextQuestion.linkedStudyIds.length - beforeLinkedCount),
      maturedQuestions: beforeCoverage !== 'mature' && nextQuestion.coverageStatus === 'mature' ? 1 : 0,
    },
    question: nextQuestion,
    backlogReasons: linking.backlogReasons,
  };
}
