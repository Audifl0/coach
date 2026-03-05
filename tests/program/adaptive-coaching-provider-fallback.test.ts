import assert from 'node:assert/strict';
import test from 'node:test';

import { createLlmProposalClient } from '../../src/server/llm/client';

test('schema-invalid primary payload triggers one retry before fallback provider attempt', async () => {
  let primaryAttempts = 0;
  let fallbackAttempts = 0;

  const client = createLlmProposalClient({
    primary: {
      async generate() {
        primaryAttempts += 1;
        return {
          ok: false,
          reason: 'invalid_payload',
          retryable: true,
          fallbackReason: 'openai_invalid_payload',
          parseStatus: 'invalid',
          metadata: {
            provider: 'openai',
            model: 'gpt-5-mini',
            latencyMs: 10,
            requestId: null,
          },
        };
      },
    },
    fallback: {
      async generate() {
        fallbackAttempts += 1;
        return {
          ok: true,
          parseStatus: 'valid',
          proposal: {
            actionType: 'hold',
            plannedSessionId: 'session_1',
            reasons: ['Secondary provider returned valid output', 'Conservative continuation'],
            evidenceTags: ['G-001'],
            forecastProjection: {
              projectedReadiness: 3,
              projectedRpe: 7.2,
            },
          },
          metadata: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            latencyMs: 20,
            requestId: 'req_anthropic',
          },
        };
      },
    },
    primaryMaxRetries: 1,
  });

  const result = await client.generate({
    systemPrompt: 'system',
    userPrompt: 'user',
    plannedSessionId: 'session_1',
  });

  assert.equal(primaryAttempts, 2);
  assert.equal(fallbackAttempts, 1);
  assert.notEqual(result.candidate, null);
  assert.equal(result.meta.provider, 'anthropic');
  assert.equal(result.meta.fallbackReason, 'openai_invalid_payload');
});

test('if retry and fallback fail, client returns null candidate for SAFE-03 handoff', async () => {
  const client = createLlmProposalClient({
    primary: {
      async generate() {
        return {
          ok: false,
          reason: 'provider_error',
          retryable: true,
          fallbackReason: 'openai_provider_error',
          parseStatus: 'not_attempted',
          metadata: {
            provider: 'openai',
            model: 'gpt-5-mini',
            latencyMs: 40,
            requestId: null,
          },
        };
      },
    },
    fallback: {
      async generate() {
        return {
          ok: false,
          reason: 'invalid_payload',
          retryable: false,
          fallbackReason: 'anthropic_invalid_payload',
          parseStatus: 'invalid',
          metadata: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            latencyMs: 30,
            requestId: null,
          },
        };
      },
    },
    primaryMaxRetries: 1,
  });

  const result = await client.generate({
    systemPrompt: 'system',
    userPrompt: 'user',
    plannedSessionId: 'session_1',
  });

  assert.equal(result.candidate, null);
  assert.equal(result.meta.provider, null);
  assert.equal(result.meta.fallbackReason, 'anthropic_invalid_payload');
  assert.equal(result.meta.chain[0]?.provider, 'openai');
  assert.equal(result.meta.chain[1]?.provider, 'openai');
  assert.equal(result.meta.chain[2]?.provider, 'anthropic');
});
