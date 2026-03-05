import assert from 'node:assert/strict';
import test from 'node:test';

import { isRealProviderEnabled, parseLlmRuntimeConfig } from '../../src/server/llm/config';

function buildEnabledEnv(overrides: Partial<Record<string, string | undefined>> = {}) {
  return {
    LLM_REAL_PROVIDER_ENABLED: 'true',
    LLM_PROVIDER_PRIMARY: 'openai',
    LLM_PROVIDER_FALLBACK: 'anthropic',
    LLM_OPENAI_MODEL: 'gpt-4.1-mini',
    LLM_ANTHROPIC_MODEL: 'claude-3-5-haiku-latest',
    LLM_OPENAI_API_KEY: 'sk-openai',
    LLM_ANTHROPIC_API_KEY: 'sk-anthropic',
    LLM_PRIMARY_TIMEOUT_MS: '2500',
    LLM_PRIMARY_MAX_RETRIES: '1',
    LLM_FALLBACK_TIMEOUT_MS: '3000',
    LLM_FALLBACK_MAX_ATTEMPTS: '1',
    LLM_GLOBAL_MAX_LATENCY_MS: '8000',
    ...overrides,
  };
}

test('LLM_REAL_PROVIDER_ENABLED=false keeps real-provider config optional', () => {
  const env = {
    LLM_REAL_PROVIDER_ENABLED: 'false',
  };

  assert.equal(isRealProviderEnabled(env), false);
  const parsed = parseLlmRuntimeConfig(env);
  assert.equal(parsed, null);
});

test('LLM_REAL_PROVIDER_ENABLED=true requires full primary+fallback contract', () => {
  const parsed = parseLlmRuntimeConfig(buildEnabledEnv());

  assert.equal(parsed.enabled, true);
  assert.equal(parsed.primaryProvider, 'openai');
  assert.equal(parsed.fallbackProvider, 'anthropic');
  assert.equal(parsed.primaryMaxRetries, 1);
  assert.equal(parsed.fallbackMaxAttempts, 1);

  assert.throws(() => parseLlmRuntimeConfig(buildEnabledEnv({ LLM_PROVIDER_PRIMARY: undefined })));
  assert.throws(() => parseLlmRuntimeConfig(buildEnabledEnv({ LLM_PROVIDER_FALLBACK: undefined })));
  assert.throws(() => parseLlmRuntimeConfig(buildEnabledEnv({ LLM_OPENAI_MODEL: undefined })));
  assert.throws(() => parseLlmRuntimeConfig(buildEnabledEnv({ LLM_ANTHROPIC_MODEL: undefined })));
  assert.throws(() => parseLlmRuntimeConfig(buildEnabledEnv({ LLM_OPENAI_API_KEY: undefined })));
  assert.throws(() => parseLlmRuntimeConfig(buildEnabledEnv({ LLM_ANTHROPIC_API_KEY: undefined })));
});

test('missing global max latency or invalid timeout/retry values fail with deterministic error', () => {
  assert.throws(
    () => parseLlmRuntimeConfig(buildEnabledEnv({ LLM_GLOBAL_MAX_LATENCY_MS: undefined })),
    /LLM_GLOBAL_MAX_LATENCY_MS/,
  );
  assert.throws(() => parseLlmRuntimeConfig(buildEnabledEnv({ LLM_PRIMARY_TIMEOUT_MS: '-1' })), /LLM_PRIMARY_TIMEOUT_MS/);
  assert.throws(() => parseLlmRuntimeConfig(buildEnabledEnv({ LLM_FALLBACK_TIMEOUT_MS: '0' })), /LLM_FALLBACK_TIMEOUT_MS/);
  assert.throws(() => parseLlmRuntimeConfig(buildEnabledEnv({ LLM_PRIMARY_MAX_RETRIES: '2' })), /LLM_PRIMARY_MAX_RETRIES/);
  assert.throws(
    () => parseLlmRuntimeConfig(buildEnabledEnv({ LLM_FALLBACK_MAX_ATTEMPTS: '2' })),
    /LLM_FALLBACK_MAX_ATTEMPTS/,
  );
});
