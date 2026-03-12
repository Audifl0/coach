import OpenAI from 'openai';

import { parseAdaptiveRecommendationProposal } from '@/lib/adaptive-coaching/contracts';
import type { LlmAttemptResult, LlmRequestInput } from '@/server/llm/contracts';
import { ADAPTIVE_PROPOSAL_JSON_SCHEMA } from '@/server/llm/schema';

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

export type OpenAiProviderConfig = {
  apiKey: string;
  model: string;
  timeoutMs: number;
};

export type OpenAiProviderDeps = {
  sdk?: OpenAiSdk;
  now?: () => number;
};

function extractPayloadText(response: unknown): string {
  const record =
    response && typeof response === 'object'
      ? response as {
        output_text?: unknown;
        output?: Array<{ content?: Array<{ type?: unknown; text?: unknown }> }>;
      }
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

function extractRequestId(response: unknown): string | null {
  if (!response || typeof response !== 'object' || !('_request_id' in response)) {
    return null;
  }

  const requestId = (response as { _request_id?: unknown })._request_id;
  return typeof requestId === 'string' ? requestId : null;
}

function normalizeError(
  error: unknown,
): { reason: 'timeout' | 'rate_limited' | 'provider_error' | 'transport_error' | 'unknown'; retryable: boolean } {
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

export function createOpenAiProposalClient(
  config: OpenAiProviderConfig,
  deps: OpenAiProviderDeps = {},
): { generate: (input: LlmRequestInput) => Promise<LlmAttemptResult> } {
  const sdk =
    deps.sdk ??
    new OpenAI({
      apiKey: config.apiKey,
      maxRetries: 0,
      timeout: config.timeoutMs,
    });
  const now = deps.now ?? (() => Date.now());

  return {
    async generate(input) {
      const startedAt = now();
      try {
        const response = await sdk.responses.create(
          {
            model: config.model,
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
                name: 'adaptive_recommendation_proposal',
                schema: ADAPTIVE_PROPOSAL_JSON_SCHEMA,
                strict: true,
              },
            },
          },
          {
            timeout: config.timeoutMs,
          },
        );

        const payloadText = extractPayloadText(response);
        const parsedUnknown = payloadText.length > 0 ? JSON.parse(payloadText) : null;
        const proposal = parseAdaptiveRecommendationProposal(parsedUnknown);
        const latencyMs = Math.max(0, now() - startedAt);

        return {
          ok: true,
          proposal,
          parseStatus: 'valid',
          metadata: {
            provider: 'openai',
            model: config.model,
            latencyMs,
            requestId: extractRequestId(response),
          },
        };
      } catch (error) {
        const latencyMs = Math.max(0, now() - startedAt);
        if (isPayloadError(error)) {
          return {
            ok: false,
            reason: 'invalid_payload',
            retryable: true,
            fallbackReason: 'openai_invalid_payload',
            parseStatus: 'invalid',
            metadata: {
              provider: 'openai',
              model: config.model,
              latencyMs,
              requestId: null,
            },
          };
        }

        const normalized = normalizeError(error);
        return {
          ok: false,
          reason: normalized.reason,
          retryable: normalized.retryable,
          fallbackReason: `openai_${normalized.reason}`,
          parseStatus: 'invalid',
          metadata: {
            provider: 'openai',
            model: config.model,
            latencyMs,
            requestId: null,
          },
        };
      }
    },
  };
}
