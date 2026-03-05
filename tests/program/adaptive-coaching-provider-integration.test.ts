import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdaptiveCoachingService } from '../../src/server/services/adaptive-coaching';
import { createLlmProposalClient } from '../../src/server/llm/client';
import type { LlmAttemptResult, LlmProposalProviderClient } from '../../src/server/llm/contracts';

function buildService(input: {
  primary: LlmProposalProviderClient;
  fallback: LlmProposalProviderClient;
  primaryMaxRetries?: number;
}) {
  const client = createLlmProposalClient({
    primary: input.primary,
    fallback: input.fallback,
    primaryMaxRetries: input.primaryMaxRetries ?? 1,
  });

  return createAdaptiveCoachingService({
    getProfile: async () => ({
      goal: 'strength',
      weeklySessionTarget: 4,
      sessionDuration: '45_to_75m',
      equipmentCategories: ['dumbbells'],
      limitationsDeclared: false,
      limitations: [],
    }),
    getTodayOrNextSessionCandidates: async () => ({
      todaySession: {
        id: 'session_chain',
        scheduledDate: new Date('2026-03-05T08:00:00.000Z'),
      },
      nextSession: null,
    }),
    getHistoryList: async () => [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }],
    listLatestAdaptiveRecommendation: async () => null,
    createAdaptiveRecommendation: async (payload) => ({
      ...payload,
      id: 'rec_chain',
      createdAt: new Date('2026-03-05T08:30:00.000Z'),
      updatedAt: new Date('2026-03-05T08:30:00.000Z'),
      appliedAt: null,
      rejectedAt: null,
    }),
    appendDecisionTrace: async () => ({ id: 'decision_chain' }),
    proposeRecommendation: async () => ({
      actionType: 'hold',
      plannedSessionId: 'session_chain',
      reasons: ['Local fallback should not run', 'Real-provider mode is enabled'],
      evidenceTags: ['local-default'],
      forecastProjection: {
        projectedReadiness: 3,
        projectedRpe: 7,
      },
    }),
    realProviderEnabled: true,
    proposeRecommendationWithProvider: async (proposalInput) => {
      const result = await client.generate({
        systemPrompt: 'system',
        userPrompt: 'user',
        plannedSessionId: proposalInput.plannedSessionId,
      });
      return result.candidate;
    },
  });
}

function invalidPrimaryResult(reason = 'openai_invalid_payload'): LlmAttemptResult {
  return {
    ok: false,
    reason: 'invalid_payload',
    retryable: true,
    fallbackReason: reason,
    parseStatus: 'invalid',
    metadata: {
      provider: 'openai',
      model: 'gpt-5-mini',
      latencyMs: 8,
      requestId: null,
    },
  };
}

test('primary invalid payload then fallback valid payload yields accepted recommendation in real-provider mode', async () => {
  let primaryCalls = 0;
  let fallbackCalls = 0;

  const service = buildService({
    primaryMaxRetries: 0,
    primary: {
      async generate() {
        primaryCalls += 1;
        return invalidPrimaryResult();
      },
    },
    fallback: {
      async generate() {
        fallbackCalls += 1;
        return {
          ok: true,
          parseStatus: 'valid',
          proposal: {
            actionType: 'progress',
            plannedSessionId: 'session_chain',
            reasons: ['Fallback provider returned valid schema', 'Recommendation remains bounded'],
            evidenceTags: ['G-001'],
            forecastProjection: {
              projectedReadiness: 4,
              projectedRpe: 7.3,
            },
          },
          metadata: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            latencyMs: 12,
            requestId: 'req_fallback',
          },
        };
      },
    },
  });

  const result = await service.generate('user_1');
  assert.equal(primaryCalls, 1);
  assert.equal(fallbackCalls, 1);
  assert.equal(result.recommendation.fallbackApplied, false);
  assert.equal(result.recommendation.status, 'validated');
  assert.deepEqual(result.meta.traceSteps, ['parse', 'integrity', 'safe_01_02', 'safe_03', 'status_assignment']);
});

test('primary invalid payload is retried once before fallback provider executes', async () => {
  let primaryCalls = 0;
  let fallbackCalls = 0;

  const service = buildService({
    primaryMaxRetries: 1,
    primary: {
      async generate() {
        primaryCalls += 1;
        return invalidPrimaryResult();
      },
    },
    fallback: {
      async generate() {
        fallbackCalls += 1;
        return {
          ok: true,
          parseStatus: 'valid',
          proposal: {
            actionType: 'hold',
            plannedSessionId: 'session_chain',
            reasons: ['Fallback executed only after bounded retry', 'Recommendation remains conservative'],
            evidenceTags: ['G-002'],
            forecastProjection: {
              projectedReadiness: 3,
              projectedRpe: 7,
            },
          },
          metadata: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            latencyMs: 13,
            requestId: 'req_fallback_retry',
          },
        };
      },
    },
  });

  const result = await service.generate('user_1');
  assert.equal(primaryCalls, 2);
  assert.equal(fallbackCalls, 1);
  assert.equal(result.recommendation.fallbackApplied, false);
  assert.equal(result.recommendation.actionType, 'hold');
});

test('primary and fallback full failure chain lands on deterministic SAFE-03 conservative fallback', async () => {
  const service = buildService({
    primaryMaxRetries: 1,
    primary: {
      async generate() {
        return invalidPrimaryResult('openai_schema_invalid');
      },
    },
    fallback: {
      async generate() {
        return {
          ok: false,
          reason: 'provider_error',
          retryable: false,
          fallbackReason: 'anthropic_provider_error',
          parseStatus: 'not_attempted',
          metadata: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            latencyMs: 20,
            requestId: null,
          },
        };
      },
    },
  });

  const result = await service.generate('user_1');
  assert.equal(result.recommendation.fallbackApplied, true);
  assert.equal(result.recommendation.status, 'fallback_applied');
  assert.equal(result.recommendation.fallbackReason, 'conservative_hold');
  assert.equal(result.recommendation.progressionDeltaLoadPct, 0);
  assert.equal(result.recommendation.progressionDeltaReps, 0);
  assert.deepEqual(result.meta.traceSteps, ['parse', 'integrity', 'safe_01_02', 'safe_03', 'status_assignment']);
});
