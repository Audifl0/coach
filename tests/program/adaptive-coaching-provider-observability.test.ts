import assert from 'node:assert/strict';
import test from 'node:test';

import { createLlmProposalClient } from '../../src/server/llm/client';
import { createProviderAttemptAuditEnvelope } from '../../src/server/llm/observability';

test('attempt logs include provider/model/latency/parse status/fallback reason/request ID', () => {
  const payload = createProviderAttemptAuditEnvelope({
    provider: 'openai',
    model: 'gpt-5-mini',
    latencyMs: 84,
    parseStatus: 'invalid',
    fallbackReason: 'openai_invalid_payload',
    requestId: 'req_123',
    promptBody: 'must not be present',
    profileGoal: 'strength',
    reasons: ['must not be present'],
  } as Record<string, unknown>);

  assert.equal(payload.provider, 'openai');
  assert.equal(payload.model, 'gpt-5-mini');
  assert.equal(payload.latencyMs, 84);
  assert.equal(payload.parseStatus, 'invalid');
  assert.equal(payload.fallbackReason, 'openai_invalid_payload');
  assert.equal(payload.requestId, 'req_123');
});

test('audit envelope excludes prompt body, profile fields and reasons text', () => {
  const payload = createProviderAttemptAuditEnvelope({
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    latencyMs: 61,
    parseStatus: 'valid',
    fallbackReason: null,
    requestId: 'req_abc',
    promptBody: 'private prompt',
    profile: { goal: 'hypertrophy' },
    reasons: ['Private reason'],
    userId: 'user-123',
  } as Record<string, unknown>);

  assert.equal('promptBody' in payload, false);
  assert.equal('profile' in payload, false);
  assert.equal('reasons' in payload, false);
  assert.equal('userId' in payload, false);
});

test('client emits allowlisted attempt audit events only', async () => {
  const events: Array<Record<string, unknown>> = [];

  const client = createLlmProposalClient({
    primary: {
      async generate() {
        return {
          ok: false,
          reason: 'timeout',
          retryable: true,
          fallbackReason: 'openai_timeout',
          parseStatus: 'not_attempted',
          metadata: {
            provider: 'openai',
            model: 'gpt-5-mini',
            latencyMs: 20,
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
            latencyMs: 35,
            requestId: 'req_fallback',
          },
        };
      },
    },
    onAttemptAudit(event) {
      events.push(event);
    },
  });

  await client.generate({
    systemPrompt: 'private-system-prompt',
    userPrompt: 'private-user-prompt',
    plannedSessionId: 'session_1',
  });

  assert.equal(events.length, 3);
  assert.equal(events[0]?.provider, 'openai');
  assert.equal(events[2]?.provider, 'anthropic');
  assert.equal('systemPrompt' in (events[0] ?? {}), false);
  assert.equal('userPrompt' in (events[0] ?? {}), false);
  assert.equal('reasons' in (events[2] ?? {}), false);
});
