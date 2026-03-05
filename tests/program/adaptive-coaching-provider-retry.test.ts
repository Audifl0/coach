import assert from 'node:assert/strict';
import test from 'node:test';

import { createLlmProposalClient } from '../../src/server/llm/client';
import { createOpenAiProposalClient } from '../../src/server/llm/providers/openai-client';

test('openai adapter parses strict structured payload and exposes metadata', async () => {
  const client = createOpenAiProposalClient(
    {
      apiKey: 'sk-test',
      model: 'gpt-5-mini',
      timeoutMs: 5000,
    },
    {
      now: (() => {
        const timeline = [1000, 1088];
        return () => timeline.shift() ?? 1088;
      })(),
      sdk: {
        responses: {
          create: async () => ({
            _request_id: 'req_123',
            output_text: JSON.stringify({
              actionType: 'progress',
              plannedSessionId: 'session_1',
              reasons: ['Readiness trend improved', 'Adherence remains stable'],
              evidenceTags: ['G-001'],
              forecastProjection: {
                projectedReadiness: 4,
                projectedRpe: 7.1,
              },
            }),
          }),
        },
      },
    },
  );

  const result = await client.generate({
    systemPrompt: 'system',
    userPrompt: 'user',
    plannedSessionId: 'session_1',
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.metadata.provider, 'openai');
    assert.equal(result.metadata.requestId, 'req_123');
    assert.equal(result.metadata.latencyMs, 88);
  }
});

test('openai adapter marks schema-invalid payloads as retryable invalid_payload', async () => {
  const client = createOpenAiProposalClient(
    {
      apiKey: 'sk-test',
      model: 'gpt-5-mini',
      timeoutMs: 5000,
    },
    {
      sdk: {
        responses: {
          create: async () => ({
            output_text: JSON.stringify({
              actionType: 'progress',
              plannedSessionId: 'session_1',
              reasons: ['Readiness trend improved', 'Adherence remains stable'],
              forecastProjection: {
                projectedReadiness: 4,
                projectedRpe: 7.1,
              },
            }),
          }),
        },
      },
    },
  );

  const result = await client.generate({
    systemPrompt: 'system',
    userPrompt: 'user',
    plannedSessionId: 'session_1',
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'invalid_payload');
    assert.equal(result.retryable, true);
    assert.equal(result.fallbackReason, 'openai_invalid_payload');
  }
});

test('openai adapter normalizes timeout failures', async () => {
  const client = createOpenAiProposalClient(
    {
      apiKey: 'sk-test',
      model: 'gpt-5-mini',
      timeoutMs: 5000,
    },
    {
      sdk: {
        responses: {
          create: async () => {
            const error = new Error('Request timeout');
            (error as Error & { code: string }).code = 'ETIMEDOUT';
            throw error;
          },
        },
      },
    },
  );

  const result = await client.generate({
    systemPrompt: 'system',
    userPrompt: 'user',
    plannedSessionId: 'session_1',
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'timeout');
    assert.equal(result.retryable, true);
    assert.equal(result.fallbackReason, 'openai_timeout');
  }
});

test('primary timeout triggers exactly one bounded primary retry before fallback path', async () => {
  let primaryAttempts = 0;

  const client = createLlmProposalClient({
    primary: {
      async generate() {
        primaryAttempts += 1;
        return {
          ok: false,
          reason: 'timeout',
          retryable: true,
          fallbackReason: 'openai_timeout',
          parseStatus: 'not_attempted',
          metadata: {
            provider: 'openai',
            model: 'gpt-5-mini',
            latencyMs: 50,
            requestId: null,
          },
        };
      },
    },
    fallback: {
      async generate() {
        return {
          ok: true,
          parseStatus: 'valid',
          proposal: {
            actionType: 'hold',
            plannedSessionId: 'session_1',
            reasons: ['Fallback provider succeeded', 'Conservative continuation'],
            evidenceTags: ['G-001'],
            forecastProjection: {
              projectedReadiness: 3,
              projectedRpe: 7,
            },
          },
          metadata: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            latencyMs: 30,
            requestId: 'req_fallback',
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
  assert.notEqual(result.candidate, null);
  assert.equal(result.meta.provider, 'anthropic');
  assert.equal(result.meta.fallbackReason, 'openai_timeout');
});
