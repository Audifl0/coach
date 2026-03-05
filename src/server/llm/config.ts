import { z } from 'zod';

import { llmProviderValues, type LlmProvider } from '@/server/llm/contracts';

const boolSchema = z
  .string()
  .optional()
  .transform((value) => value === 'true');

const enabledRuntimeSchema = z.object({
  LLM_PROVIDER_PRIMARY: z.enum(llmProviderValues),
  LLM_PROVIDER_FALLBACK: z.enum(llmProviderValues),
  LLM_OPENAI_MODEL: z.string().trim().min(1),
  LLM_ANTHROPIC_MODEL: z.string().trim().min(1),
  LLM_OPENAI_API_KEY: z.string().trim().min(1),
  LLM_ANTHROPIC_API_KEY: z.string().trim().min(1),
  LLM_PRIMARY_TIMEOUT_MS: z.coerce.number().int().min(1000).max(15000).default(5000),
  LLM_FALLBACK_TIMEOUT_MS: z.coerce.number().int().min(1000).max(15000).default(5000),
  LLM_GLOBAL_MAX_LATENCY_MS: z.coerce.number().int().min(1000).max(20000),
  LLM_PRIMARY_MAX_RETRIES: z.coerce.number().int().min(0).max(1).default(1),
  LLM_FALLBACK_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(1).default(1),
});

export type LlmRuntimeConfig = {
  enabled: true;
  primaryProvider: LlmProvider;
  fallbackProvider: LlmProvider;
  openAi: { model: string; apiKey: string; timeoutMs: number };
  anthropic: { model: string; apiKey: string; timeoutMs: number };
  primaryMaxRetries: number;
  fallbackMaxAttempts: number;
  globalMaxLatencyMs: number;
};

export function isRealProviderEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return boolSchema.parse(env.LLM_REAL_PROVIDER_ENABLED);
}

export function parseLlmRuntimeConfig(env: NodeJS.ProcessEnv = process.env): LlmRuntimeConfig | null {
  const enabled = isRealProviderEnabled(env);
  if (!enabled) {
    return null;
  }

  const parsed = enabledRuntimeSchema.parse(env);
  return {
    enabled: true,
    primaryProvider: parsed.LLM_PROVIDER_PRIMARY,
    fallbackProvider: parsed.LLM_PROVIDER_FALLBACK,
    openAi: {
      model: parsed.LLM_OPENAI_MODEL,
      apiKey: parsed.LLM_OPENAI_API_KEY,
      timeoutMs: parsed.LLM_PRIMARY_TIMEOUT_MS,
    },
    anthropic: {
      model: parsed.LLM_ANTHROPIC_MODEL,
      apiKey: parsed.LLM_ANTHROPIC_API_KEY,
      timeoutMs: parsed.LLM_FALLBACK_TIMEOUT_MS,
    },
    primaryMaxRetries: parsed.LLM_PRIMARY_MAX_RETRIES,
    fallbackMaxAttempts: parsed.LLM_FALLBACK_MAX_ATTEMPTS,
    globalMaxLatencyMs: parsed.LLM_GLOBAL_MAX_LATENCY_MS,
  };
}
