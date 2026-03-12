import OpenAI from 'openai';

import {
  parseSourceSynthesisBatch,
  parseValidatedSynthesis,
  type NormalizedEvidenceRecord,
  type SourceSynthesisBatch,
  type ValidatedSynthesis,
} from './contracts';

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
): { reason: CorpusRemoteSynthesisFailureReason; retryable: boolean } {
  if (error && typeof error === 'object') {
    const asRecord = error as Record<string, unknown>;
    const status = typeof asRecord.status === 'number' ? asRecord.status : null;
    const code = typeof asRecord.code === 'string' ? asRecord.code : null;
    const message = typeof asRecord.message === 'string' ? asRecord.message.toLowerCase() : '';

    if (code === 'ETIMEDOUT' || message.includes('timeout') || status === 408) {
      return { reason: 'timeout', retryable: true };
    }

    if (status === 429) {
      return { reason: 'rate_limited', retryable: true };
    }

    if (status && status >= 500) {
      return { reason: 'provider_error', retryable: true };
    }

    if (message.includes('fetch') || message.includes('network')) {
      return { reason: 'transport_error', retryable: true };
    }
  }

  return { reason: 'unknown', retryable: false };
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
          required: ['recordId', 'topicKeys', 'outcomes', 'evidenceSignals', 'limitations', 'safetySignals'],
          properties: {
            recordId: { type: 'string', minLength: 1 },
            topicKeys: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', minLength: 1 },
            },
            population: { type: 'string' },
            intervention: { type: 'string' },
            applicationContext: { type: 'string' },
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
              type: 'object',
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
            targetPopulation: { type: 'string' },
            applicationContext: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
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
        message: 'invalid_payload',
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
      message: normalized.reason,
      reason: normalized.reason,
      retryable: normalized.retryable,
      metadata: {
        provider: 'openai',
        model: input.config.model,
        latencyMs,
        requestId: null,
      },
    });
  }
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
    async synthesizeLot(input) {
      return requestStructuredOutput({
        sdk,
        config,
        now,
        schemaName: 'corpus_source_synthesis',
        schema: buildSourceSynthesisSchema(),
        parse: parseSourceSynthesisBatch,
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
        parse: parseValidatedSynthesis,
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
