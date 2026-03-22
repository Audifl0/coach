import OpenAI from 'openai';

import {
  parseSourceSynthesisBatch,
  parseStudyCard,
  parseThematicSynthesis,
  parseValidatedSynthesis,
  type NormalizedEvidenceRecord,
  type SourceSynthesisBatch,
  type StudyCard,
  type ThematicSynthesis,
  type ValidatedSynthesis,
} from './contracts';
import type { StudyCardExtractionPayload } from './study-card-extraction';

type OpenAiResponsesApi = {
  create: (
    body: Record<string, unknown>,
    options?: {
      timeout?: number;
    },
  ) => Promise<unknown>;
};

type OpenAiSdk = {
  responses: OpenAiResponsesApi;
};

export type OpenAiCorpusSynthesisConfig = {
  apiKey: string;
  model: string;
  timeoutMs: number;
  promptVersion?: string;
};

export type CorpusRemoteSynthesisClient = {
  extractStudyCards(input: {
    runId: string;
    records: NormalizedEvidenceRecord[];
    payloadByRecordId: Map<string, StudyCardExtractionPayload>;
  }): Promise<StudyCard[]>;
  synthesizeThematicPrinciples(input: {
    runId: string;
    topicKey: string;
    topicLabel: string;
    studyCards: StudyCard[];
  }): Promise<ThematicSynthesis>;
  synthesizeLot(input: {
    lotId: string;
    records: NormalizedEvidenceRecord[];
  }): Promise<SourceSynthesisBatch>;
  consolidate(input: {
    runId: string;
    records: NormalizedEvidenceRecord[];
    batches: SourceSynthesisBatch[];
  }): Promise<ValidatedSynthesis>;
};

export type CorpusRemoteSynthesisDeps = {
  sdk?: OpenAiSdk;
  now?: () => number;
};

export type CorpusRemoteSynthesisFailureReason =
  | 'timeout'
  | 'rate_limited'
  | 'provider_error'
  | 'transport_error'
  | 'invalid_payload'
  | 'unknown';

export class CorpusRemoteSynthesisError extends Error {
  readonly reason: CorpusRemoteSynthesisFailureReason;
  readonly retryable: boolean;
  readonly metadata: {
    provider: 'openai';
    model: string;
    latencyMs: number;
    requestId: string | null;
    operation?: 'synthesizeLot' | 'consolidate';
    lotId?: string | null;
  };

  constructor(input: {
    message: string;
    reason: CorpusRemoteSynthesisFailureReason;
    retryable: boolean;
    metadata: {
      provider: 'openai';
      model: string;
      latencyMs: number;
      requestId: string | null;
    };
  }) {
    super(input.message);
    this.name = 'CorpusRemoteSynthesisError';
    this.reason = input.reason;
    this.retryable = input.retryable;
    this.metadata = input.metadata;
  }
}

function extractRequestId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('_request_id' in value)) {
    return null;
  }

  const requestId = (value as { _request_id?: unknown })._request_id;
  return typeof requestId === 'string' ? requestId : null;
}

function extractPayloadText(response: unknown): string {
  const record =
    response && typeof response === 'object'
      ? (response as {
          output_text?: unknown;
          output?: Array<{ content?: Array<{ type?: unknown; text?: unknown }> }>;
        })
      : {};

  if (typeof record.output_text === 'string' && record.output_text.trim().length > 0) {
    return record.output_text;
  }

  for (const block of record.output ?? []) {
    for (const content of block.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string' && content.text.trim().length > 0) {
        return content.text;
      }
    }
  }

  return '';
}

function normalizeError(
  error: unknown,
): {
  reason: CorpusRemoteSynthesisFailureReason;
  retryable: boolean;
  message: string;
  requestId: string | null;
} {
  if (error && typeof error === 'object') {
    const asRecord = error as Record<string, unknown>;
    const status = typeof asRecord.status === 'number' ? asRecord.status : null;
    const code = typeof asRecord.code === 'string' ? asRecord.code : null;
    const type = typeof asRecord.type === 'string' ? asRecord.type : null;
    const message = typeof asRecord.message === 'string' ? asRecord.message.toLowerCase() : '';
    const rawMessage = typeof asRecord.message === 'string' ? asRecord.message : 'unknown';
    const requestId = extractRequestId(error);
    const diagnostic = [
      status !== null ? `status=${status}` : null,
      code ? `code=${code}` : null,
      type ? `type=${type}` : null,
      requestId ? `request_id=${requestId}` : null,
      `message=${rawMessage}`,
    ]
      .filter((part): part is string => part !== null)
      .join(';');

    if (code === 'ETIMEDOUT' || message.includes('timeout') || status === 408) {
      return { reason: 'timeout', retryable: true, message: diagnostic, requestId };
    }

    if (status === 429) {
      return { reason: 'rate_limited', retryable: true, message: diagnostic, requestId };
    }

    if (status && status >= 500) {
      return { reason: 'provider_error', retryable: true, message: diagnostic, requestId };
    }

    if (message.includes('fetch') || message.includes('network')) {
      return { reason: 'transport_error', retryable: true, message: diagnostic, requestId };
    }

    return { reason: 'unknown', retryable: false, message: diagnostic, requestId };
  }

  return {
    reason: 'unknown',
    retryable: false,
    message: error instanceof Error ? error.message : String(error),
    requestId: null,
  };
}

function isPayloadError(error: unknown): boolean {
  if (error instanceof SyntaxError) {
    return true;
  }

  if (error && typeof error === 'object' && 'name' in error) {
    return (error as { name?: string }).name === 'ZodError';
  }

  return false;
}

function buildLotPayload(records: NormalizedEvidenceRecord[]): string {
  return JSON.stringify(
    records.map((record) => ({
      id: record.id,
      sourceType: record.sourceType,
      title: record.title,
      summaryEn: record.summaryEn,
      tags: record.tags,
      publishedAt: record.publishedAt,
      sourceDomain: record.sourceDomain,
      provenanceIds: record.provenanceIds,
    })),
    null,
    2,
  );
}

function buildStudyCardPayload(
  records: NormalizedEvidenceRecord[],
  payloadByRecordId: Map<string, StudyCardExtractionPayload>,
): string {
  return JSON.stringify(
    records.map((record) => payloadByRecordId.get(record.id) ?? {
      recordId: record.id,
      title: record.title,
      summaryEn: record.summaryEn,
      sourceUrl: record.sourceUrl,
      topicKeys: record.tags,
      extractionSource: 'abstract',
    }),
    null,
    2,
  );
}

function buildStudyCardSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['studyCards'],
    properties: {
      studyCards: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'recordId',
            'title',
            'authors',
            'year',
            'journal',
            'doi',
            'studyType',
            'population',
            'protocol',
            'results',
            'practicalTakeaways',
            'limitations',
            'safetySignals',
            'evidenceLevel',
            'topicKeys',
            'extractionSource',
            'langueFr',
          ],
          properties: {
            recordId: { type: 'string', minLength: 1 },
            title: { type: 'string', minLength: 1 },
            authors: { type: 'string', minLength: 1 },
            year: { type: 'integer', minimum: 1900, maximum: 2100 },
            journal: { type: 'string', minLength: 1 },
            doi: { type: ['string', 'null'] },
            studyType: {
              type: 'string',
              enum: ['rct', 'meta-analysis', 'systematic-review', 'cohort', 'case-study', 'guideline', 'narrative-review'],
            },
            population: {
              type: 'object',
              additionalProperties: false,
              required: ['description', 'size', 'trainingLevel'],
              properties: {
                description: { type: 'string', minLength: 1 },
                size: { type: ['integer', 'null'], minimum: 1 },
                trainingLevel: { type: ['string', 'null'], enum: ['novice', 'intermediate', 'advanced', 'mixed', null] },
              },
            },
            protocol: {
              type: 'object',
              additionalProperties: false,
              required: ['duration', 'intervention', 'comparison'],
              properties: {
                duration: { type: 'string', minLength: 1 },
                intervention: { type: 'string', minLength: 1 },
                comparison: { type: ['string', 'null'] },
              },
            },
            results: {
              type: 'object',
              additionalProperties: false,
              required: ['primary', 'secondary'],
              properties: {
                primary: { type: 'string', minLength: 1 },
                secondary: { type: 'array', items: { type: 'string', minLength: 1 } },
              },
            },
            practicalTakeaways: { type: 'array', items: { type: 'string', minLength: 1 } },
            limitations: { type: 'array', items: { type: 'string', minLength: 1 } },
            safetySignals: { type: 'array', items: { type: 'string', minLength: 1 } },
            evidenceLevel: { type: 'string', enum: ['high', 'moderate', 'low'] },
            topicKeys: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
            extractionSource: { type: 'string', enum: ['full-text', 'abstract'] },
            langueFr: {
              type: 'object',
              additionalProperties: false,
              required: ['titreFr', 'resumeFr', 'conclusionFr'],
              properties: {
                titreFr: { type: 'string', minLength: 1 },
                resumeFr: { type: 'string', minLength: 1 },
                conclusionFr: { type: 'string', minLength: 1 },
              },
            },
          },
        },
      },
    },
  } as const;
}

function buildThematicSynthesisSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['topicKey', 'topicLabel', 'principlesFr', 'summaryFr', 'gapsFr', 'studyCount', 'lastUpdated'],
    properties: {
      topicKey: { type: 'string', minLength: 1 },
      topicLabel: { type: 'string', minLength: 1 },
      principlesFr: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'title', 'statement', 'conditions', 'guardrail', 'evidenceLevel', 'sourceCardIds'],
          properties: {
            id: { type: 'string', minLength: 1 },
            title: { type: 'string', minLength: 1 },
            statement: { type: 'string', minLength: 1 },
            conditions: { type: 'array', items: { type: 'string', minLength: 1 } },
            guardrail: { type: 'string', enum: ['SAFE-01', 'SAFE-02', 'SAFE-03'] },
            evidenceLevel: { type: 'string', enum: ['strong', 'moderate', 'emerging'] },
            sourceCardIds: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
          },
        },
      },
      summaryFr: { type: 'string', minLength: 1 },
      gapsFr: { type: 'array', items: { type: 'string', minLength: 1 } },
      studyCount: { type: 'integer', minimum: 0 },
      lastUpdated: { type: 'string', format: 'date-time' },
    },
  } as const;
}

function buildSourceSynthesisSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['lotId', 'recordIds', 'studyExtractions', 'retainedClaims', 'rejectedClaims', 'coverageTags', 'contradictions', 'modelRun'],
    properties: {
      lotId: { type: 'string', minLength: 1 },
      recordIds: {
        type: 'array',
        minItems: 1,
        items: { type: 'string', minLength: 1 },
      },
      studyExtractions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'recordId',
            'topicKeys',
            'population',
            'intervention',
            'applicationContext',
            'outcomes',
            'evidenceSignals',
            'limitations',
            'safetySignals',
            'rejectionReason',
          ],
          properties: {
            recordId: { type: 'string', minLength: 1 },
            topicKeys: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', minLength: 1 },
            },
            population: { type: ['string', 'null'] },
            intervention: { type: ['string', 'null'] },
            applicationContext: { type: ['string', 'null'] },
            outcomes: {
              type: 'array',
              items: { type: 'string', minLength: 1 },
            },
            evidenceSignals: {
              type: 'array',
              items: { type: 'string', minLength: 1 },
            },
            limitations: {
              type: 'array',
              items: { type: 'string', minLength: 1 },
            },
            safetySignals: {
              type: 'array',
              items: { type: 'string', minLength: 1 },
            },
            rejectionReason: {
              type: ['object', 'null'],
              additionalProperties: false,
              required: ['code', 'reason'],
              properties: {
                code: { type: 'string', minLength: 1 },
                reason: { type: 'string', minLength: 1 },
              },
            },
          },
        },
      },
      retainedClaims: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'title', 'summaryFr', 'guidanceFr', 'provenanceRecordIds', 'evidenceLevel', 'guardrail'],
          properties: {
            id: { type: 'string', minLength: 1 },
            title: { type: 'string', minLength: 1 },
            summaryFr: { type: 'string', minLength: 1 },
            guidanceFr: { type: 'string', minLength: 1 },
            provenanceRecordIds: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', minLength: 1 },
            },
            evidenceLevel: { type: 'string', minLength: 1 },
            guardrail: { type: 'string', enum: ['SAFE-01', 'SAFE-02', 'SAFE-03'] },
          },
        },
      },
      rejectedClaims: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['recordId', 'code', 'reason'],
          properties: {
            recordId: { type: 'string', minLength: 1 },
            code: { type: 'string', minLength: 1 },
            reason: { type: 'string', minLength: 1 },
          },
        },
      },
      coverageTags: {
        type: 'array',
        items: { type: 'string', minLength: 1 },
      },
      contradictions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['code', 'severity', 'recordIds', 'resolution'],
          properties: {
            code: { type: 'string', minLength: 1 },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            recordIds: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', minLength: 1 },
            },
            resolution: { type: 'string', enum: ['pending', 'retained', 'rejected'] },
          },
        },
      },
      modelRun: {
        type: 'object',
        additionalProperties: false,
        required: ['provider', 'model', 'promptVersion', 'requestId', 'latencyMs'],
        properties: {
          provider: { type: 'string', enum: ['openai'] },
          model: { type: 'string', minLength: 1 },
          promptVersion: { type: 'string', minLength: 1 },
          requestId: { type: ['string', 'null'] },
          latencyMs: { type: 'integer', minimum: 0 },
        },
      },
    },
  } as const;
}

function buildValidatedSynthesisSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['principles', 'studyExtractions', 'rejectedClaims', 'coverage', 'contradictions', 'modelRun'],
    properties: {
      principles: buildSourceSynthesisSchema().properties.retainedClaims,
      studyExtractions: buildSourceSynthesisSchema().properties.studyExtractions,
      rejectedClaims: buildSourceSynthesisSchema().properties.rejectedClaims,
      coverage: {
        type: 'object',
        additionalProperties: false,
        required: ['recordCount', 'batchCount', 'retainedClaimCount', 'sourceDomains', 'coveredTags'],
        properties: {
          recordCount: { type: 'integer', minimum: 0 },
          batchCount: { type: 'integer', minimum: 0 },
          retainedClaimCount: { type: 'integer', minimum: 0 },
          sourceDomains: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', minLength: 1 },
          },
          coveredTags: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
        },
      },
      contradictions: buildSourceSynthesisSchema().properties.contradictions,
      modelRun: {
        type: 'object',
        additionalProperties: false,
        required: ['provider', 'model', 'promptVersion', 'requestId', 'requestIds', 'totalLatencyMs'],
        properties: {
          provider: { type: 'string', enum: ['openai'] },
          model: { type: 'string', minLength: 1 },
          promptVersion: { type: 'string', minLength: 1 },
          requestId: { type: ['string', 'null'] },
          requestIds: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
          totalLatencyMs: { type: 'integer', minimum: 0 },
        },
      },
    },
  } as const;
}

async function requestStructuredOutput<T>(input: {
  sdk: OpenAiSdk;
  config: OpenAiCorpusSynthesisConfig;
  now: () => number;
  schemaName: string;
  schema: Record<string, unknown>;
  systemPrompt: string;
  userPrompt: string;
  diagnosticScope?: string;
  parse: (payload: unknown) => T;
}): Promise<T> {
  const startedAt = input.now();

  try {
    const response = await input.sdk.responses.create(
      {
        model: input.config.model,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: input.systemPrompt }],
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: input.userPrompt }],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: input.schemaName,
            schema: input.schema,
            strict: true,
          },
        },
      },
      {
        timeout: input.config.timeoutMs,
      },
    );

    const payloadText = extractPayloadText(response);
    const parsedUnknown = payloadText.length > 0 ? JSON.parse(payloadText) : null;
    return input.parse(parsedUnknown);
  } catch (error) {
    const latencyMs = Math.max(0, input.now() - startedAt);
    if (isPayloadError(error)) {
      throw new CorpusRemoteSynthesisError({
        message: input.diagnosticScope ? `${input.diagnosticScope};message=invalid_payload` : 'invalid_payload',
        reason: 'invalid_payload',
        retryable: true,
        metadata: {
          provider: 'openai',
          model: input.config.model,
          latencyMs,
          requestId: null,
        },
      });
    }

    const normalized = normalizeError(error);
    throw new CorpusRemoteSynthesisError({
      message: input.diagnosticScope ? `${input.diagnosticScope};${normalized.message}` : normalized.message,
      reason: normalized.reason,
      retryable: normalized.retryable,
      metadata: {
        provider: 'openai',
        model: input.config.model,
        latencyMs,
        requestId: normalized.requestId,
      },
    });
  }
}

function sanitizeStudyExtractionPayload<T>(payload: T): T {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((entry) => sanitizeStudyExtractionPayload(entry)) as T;
  }

  const record = { ...(payload as Record<string, unknown>) };
  if (Array.isArray(record.studyExtractions)) {
    record.studyExtractions = record.studyExtractions.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return entry;
      }
      const extraction = { ...(entry as Record<string, unknown>) };
      for (const key of ['population', 'intervention', 'applicationContext', 'rejectionReason'] as const) {
        if (extraction[key] === null) {
          delete extraction[key];
        }
      }
      return extraction;
    });
  }
  return record as T;
}

export function createOpenAiCorpusSynthesisClient(
  config: OpenAiCorpusSynthesisConfig,
  deps: CorpusRemoteSynthesisDeps = {},
): CorpusRemoteSynthesisClient {
  const sdk =
    deps.sdk ??
    new OpenAI({
      apiKey: config.apiKey,
      maxRetries: 0,
      timeout: config.timeoutMs,
    });
  const now = deps.now ?? (() => Date.now());
  const promptVersion = config.promptVersion ?? 'corpus-v1';

  return {
    async extractStudyCards(input) {
      const response = await requestStructuredOutput({
        sdk,
        config,
        now,
        schemaName: 'corpus_study_cards',
        schema: buildStudyCardSchema(),
        diagnosticScope: `operation=extractStudyCards;run=${input.runId}`,
        parse: (payload) => {
          const rawCards =
            payload && typeof payload === 'object' && Array.isArray((payload as { studyCards?: unknown }).studyCards)
              ? (payload as { studyCards: unknown[] }).studyCards
              : [];
          return rawCards.map((card) => parseStudyCard(card));
        },
        systemPrompt:
          'You extract conservative, structured study cards from sports-science papers. Prefer exact details from the provided payload. Use abstract-only evidence when full text is unavailable.',
        userPrompt:
          `Prompt version: ${promptVersion}\n` +
          `Run id: ${input.runId}\n` +
          'Return one StudyCard per record. Preserve the provided extractionSource exactly. Base the card only on the provided metadata, abstract, and optional full-text sections.\n' +
          `Records:\n${buildStudyCardPayload(input.records, input.payloadByRecordId)}`,
      });

      return response;
    },
    async synthesizeThematicPrinciples(input) {
      return requestStructuredOutput({
        sdk,
        config,
        now,
        schemaName: 'corpus_thematic_synthesis',
        schema: buildThematicSynthesisSchema(),
        diagnosticScope: `operation=synthesizeThematicPrinciples;run=${input.runId};topic=${input.topicKey}`,
        parse: (payload) => parseThematicSynthesis(payload),
        systemPrompt:
          'You synthesize practical, safety-first thematic principles in French from structured sports-science study cards. Stay conservative and keep every principle traceable to sourceCardIds present in the input.',
        userPrompt:
          `Prompt version: ${promptVersion}\n` +
          `Run id: ${input.runId}\n` +
          `Topic key: ${input.topicKey}\n` +
          `Topic label: ${input.topicLabel}\n` +
          'Return 2 to 4 French practical principles with conditions, guardrail, evidenceLevel, and sourceCardIds. Include a concise French summary and open evidence gaps. Use only the provided study cards.\n' +
          `Study cards:\n${JSON.stringify(input.studyCards, null, 2)}`,
      });
    },
    async synthesizeLot(input) {
      return requestStructuredOutput({
        sdk,
        config,
        now,
        schemaName: 'corpus_source_synthesis',
        schema: buildSourceSynthesisSchema(),
        diagnosticScope: `operation=synthesizeLot;lot=${input.lotId}`,
        parse: (payload) => parseSourceSynthesisBatch(sanitizeStudyExtractionPayload(payload)),
        systemPrompt:
          'You extract structured sports-science evidence and compact safety-first claims into auditable JSON. Keep outputs traceable and conservative.',
        userPrompt:
          `Prompt version: ${promptVersion}\n` +
          `Lot id: ${input.lotId}\n` +
          'First extract per-study structure (population, intervention, outcomes, safety signals, limitations), then return French runtime claims grounded only in the provided records. Reject unsupported or redundant material.\n' +
          `Records:\n${buildLotPayload(input.records)}`,
      });
    },
    async consolidate(input) {
      return requestStructuredOutput({
        sdk,
        config,
        now,
        schemaName: 'corpus_validated_synthesis',
        schema: buildValidatedSynthesisSchema(),
        diagnosticScope: `operation=consolidate;run=${input.runId}`,
        parse: (payload) => parseValidatedSynthesis(sanitizeStudyExtractionPayload(payload)),
        systemPrompt:
          'You consolidate previously extracted sports-science evidence into a compact, conservative, auditable JSON artifact for a training-program knowledge bible.',
        userPrompt:
          `Prompt version: ${promptVersion}\n` +
          `Run id: ${input.runId}\n` +
          `Source records: ${input.records.length}\n` +
          'Use the structured study extractions as the primary source of truth for retained principles and rejected material.\n' +
          `Batches:\n${JSON.stringify(input.batches, null, 2)}`,
      });
    },
  };
}

export function createConfiguredOpenAiCorpusSynthesisClient(
  env: NodeJS.ProcessEnv = process.env,
  deps: CorpusRemoteSynthesisDeps = {},
): CorpusRemoteSynthesisClient {
  const apiKey = env.ADAPTIVE_KNOWLEDGE_OPENAI_API_KEY?.trim() || env.LLM_OPENAI_API_KEY?.trim() || '';
  const model = env.ADAPTIVE_KNOWLEDGE_OPENAI_MODEL?.trim() || env.LLM_OPENAI_MODEL?.trim() || '';
  const timeoutRaw =
    env.ADAPTIVE_KNOWLEDGE_OPENAI_TIMEOUT_MS?.trim() ||
    env.LLM_PRIMARY_TIMEOUT_MS?.trim() ||
    env.PIPELINE_REQUEST_TIMEOUT_MS?.trim() ||
    '8000';
  const timeoutMs = Number.parseInt(timeoutRaw, 10);

  if (!apiKey || !model || !Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('remote corpus synthesis client is not configured');
  }

  return createOpenAiCorpusSynthesisClient(
    {
      apiKey,
      model,
      timeoutMs,
      promptVersion: env.ADAPTIVE_KNOWLEDGE_OPENAI_PROMPT_VERSION?.trim() || 'corpus-v1',
    },
    deps,
  );
}
