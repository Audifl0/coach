import type { ConnectorFetchInput, ConnectorFetchResult } from '../connectors/shared';
import type { AdaptiveKnowledgeResearchFront, NormalizedEvidenceRecord } from '../contracts';
import {
  markResearchFrontActive,
  markResearchFrontCooldown,
  markResearchFrontExhausted,
  type loadResearchFronts,
} from '../registry/research-fronts';

type DiscoveryExecutorConnector = (input: ConnectorFetchInput) => Promise<ConnectorFetchResult>;

export type ExecuteDiscoveryWorkItemInput = {
  outputRootDir: string;
  now: Date;
  front: AdaptiveKnowledgeResearchFront;
  connector: DiscoveryExecutorConnector;
  cursorState?: { seenRecordIds: string[] };
  connectorInput?: Partial<ConnectorFetchInput>;
};

export type ExecuteDiscoveryWorkItemResult = {
  status: 'completed' | 'cooldown' | 'exhausted';
  records: NormalizedEvidenceRecord[];
  sourceResult: ConnectorFetchResult;
};

export async function executeDiscoveryWorkItem(
  input: ExecuteDiscoveryWorkItemInput,
): Promise<ExecuteDiscoveryWorkItemResult> {
  const sourceResult = await input.connector({
    query: input.front.query,
    now: input.now,
    cursorState: input.cursorState,
    pagination: {
      page: input.front.pageCursor.page,
      cursor: input.front.pageCursor.nextCursor ?? undefined,
      pagesPerQuery: 1,
    },
    ...input.connectorInput,
  });

  const nextEvidence = {
    pagesVisited: input.front.evidence.pagesVisited + 1,
    reformulationsTried: input.front.evidence.reformulationsTried,
    sourcesVisited: input.front.evidence.sourcesVisited,
  };
  const nextCursor = {
    page: input.front.pageCursor.page + 1,
    nextCursor: sourceResult.telemetry.nextCursor ?? null,
  };

  if (sourceResult.records.length > 0) {
    await markResearchFrontActive(
      input.outputRootDir,
      {
        id: input.front.id,
        reason: 'discovery-progress',
        pageCursor: nextCursor,
        evidence: nextEvidence,
      },
      input.now,
    );

    return {
      status: 'completed',
      records: sourceResult.records,
      sourceResult,
    };
  }

  const skipReasons = sourceResult.telemetry.skipReasons;
  const staleOnly = Boolean(
    skipReasons &&
      skipReasons.stalePublication > 0 &&
      skipReasons.disallowedDomain === 0 &&
      skipReasons.alreadySeen === 0 &&
      skipReasons.invalidUrl === 0 &&
      skipReasons.offTopic === 0,
  );

  if (staleOnly) {
    await markResearchFrontCooldown(
      input.outputRootDir,
      {
        id: input.front.id,
        reason: 'source-temporarily-cold',
        until: new Date(input.now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        pageCursor: nextCursor,
        evidence: nextEvidence,
      },
      input.now,
    );

    return {
      status: 'cooldown',
      records: [],
      sourceResult,
    };
  }

  await markResearchFrontExhausted(
    input.outputRootDir,
    {
      id: input.front.id,
      reason: 'no-admissible-results',
      pageCursor: nextCursor,
      evidence: nextEvidence,
    },
    input.now,
  );

  return {
    status: 'exhausted',
    records: [],
    sourceResult,
  };
}
