import Anthropic from '@anthropic-ai/sdk';

import { parseAdaptiveRecommendationProposal } from '@/lib/adaptive-coaching/contracts';
import type { LlmAttemptResult, LlmRequestInput } from '@/server/llm/contracts';
import { ADAPTIVE_PROPOSAL_JSON_SCHEMA } from '@/server/llm/schema';

type AnthropicMessagesApi = {
  create: (body: Record<string, unknown>) => Promise<{
    id?: string;
    content?: Array<{
      type?: string;
      input?: unknown;
    }>;
    stop_reason?: string | null;
  }>;
};

type AnthropicSdk = {
  messages: AnthropicMessagesApi;
};

export type AnthropicProviderConfig = {
  apiKey: string;
  model: string;
  timeoutMs: number;
};

export type AnthropicProviderDeps = {
  sdk?: AnthropicSdk;
  now?: () => number;
};

function normalizeError(
  error: unknown,
): { reason: 'timeout' | 'rate_limited' | 'provider_error' | 'transport_error' | 'unknown'; retryable: boolean } {
  if (error && typeof error === 'object') {
    const asRecord = error as Record<string, unknown>;
    const status = typeof asRecord.status === 'number' ? asRecord.status : null;
    const message = typeof asRecord.message === 'string' ? asRecord.message.toLowerCase() : '';

    if (status === 429) {
      return { reason: 'rate_limited', retryable: true };
    }

    if (status && status >= 500) {
      return { reason: 'provider_error', retryable: true };
    }

    if (message.includes('timeout')) {
      return { reason: 'timeout', retryable: true };
    }

    if (message.includes('fetch') || message.includes('network')) {
      return { reason: 'transport_error', retryable: true };
    }
  }

  return { reason: 'unknown', retryable: false };
}

function extractToolPayload(message: Awaited<ReturnType<AnthropicMessagesApi['create']>>): unknown {
  for (const block of message.content ?? []) {
    if (block.type === 'tool_use') {
      return block.input;
    }
  }

  return null;
}

export function createAnthropicProposalClient(
  config: AnthropicProviderConfig,
  deps: AnthropicProviderDeps = {},
): { generate: (input: LlmRequestInput) => Promise<LlmAttemptResult> } {
  const sdk =
    deps.sdk ??
    new Anthropic({
      apiKey: config.apiKey,
      timeout: config.timeoutMs,
      maxRetries: 0,
    });
  const now = deps.now ?? (() => Date.now());

  return {
    async generate(input) {
      const startedAt = now();
      try {
        const message = await sdk.messages.create({
          model: config.model,
          max_tokens: 700,
          system: input.systemPrompt,
          messages: [{ role: 'user', content: input.userPrompt }],
          tools: [
            {
              name: 'emit_adaptive_recommendation',
              description: 'Return the adaptive recommendation proposal in strict JSON schema format.',
              input_schema: ADAPTIVE_PROPOSAL_JSON_SCHEMA,
            },
          ],
          tool_choice: {
            type: 'tool',
            name: 'emit_adaptive_recommendation',
          },
        });

        const proposal = parseAdaptiveRecommendationProposal(extractToolPayload(message));
        const latencyMs = Math.max(0, now() - startedAt);

        return {
          ok: true,
          parseStatus: 'valid',
          proposal,
          metadata: {
            provider: 'anthropic',
            model: config.model,
            latencyMs,
            requestId: message.id ?? null,
          },
        };
      } catch (error) {
        const latencyMs = Math.max(0, now() - startedAt);
        if (error && typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'ZodError') {
          return {
            ok: false,
            reason: 'invalid_payload',
            retryable: false,
            fallbackReason: 'anthropic_invalid_payload',
            parseStatus: 'invalid',
            metadata: {
              provider: 'anthropic',
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
          fallbackReason: `anthropic_${normalized.reason}`,
          parseStatus: 'not_attempted',
          metadata: {
            provider: 'anthropic',
            model: config.model,
            latencyMs,
            requestId: null,
          },
        };
      }
    },
  };
}
