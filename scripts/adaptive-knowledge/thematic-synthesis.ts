import { parseThematicSynthesis, type StudyCard, type ThematicSynthesis } from './contracts';
import type { CorpusRemoteSynthesisClient } from './remote-synthesis';

export async function synthesizeThematicPrinciples(input: {
  topicKey: string;
  topicLabel: string;
  studyCards: StudyCard[];
  client: CorpusRemoteSynthesisClient;
  runId: string;
}): Promise<ThematicSynthesis> {
  const result = await input.client.synthesizeThematicPrinciples({
    runId: input.runId,
    topicKey: input.topicKey,
    topicLabel: input.topicLabel,
    studyCards: input.studyCards,
  });

  return parseThematicSynthesis(result);
}
