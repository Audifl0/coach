import { z } from 'zod';

import { llmProviderValues, type LlmProvider } from './contracts';

type EnvInput = Record<string, string | undefined>;

const DEFAULT_GLOBAL_MAX_LATENCY_MS = 8000;

const integerFromEnv = (field: string, min: number, max: number) =>
  z
    .string({
      error: () => `${field} is required`,
    })
    .transform((value, ctx) => {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
        ctx.issues.push({
          code: 'custom',
          message: `${field} must be an integer`,
          input: value,
        });
        return z.NEVER;
      }

      return parsed;
    })
    .refine((value) => value >= min && value <= max, {
      message: `${field} must be between ${min} and ${max}`,
    });

const realProviderEnabledSchema = z
  .object({
    LLM_REAL_PROVIDER_ENABLED: z.enum(['true', 'false']).default('false'),
  })
  .transform((value) => value.LLM_REAL_PROVIDER_ENABLED === 'true');

const enabledRuntimeSchema = z
  .object({
    LLM_REAL_PROVIDER_ENABLED: z.literal('true'),
    LLM_PROVIDER_PRIMARY: z.enum(llmProviderValues, {
      error: () => 'LLM_PROVIDER_PRIMARY is required',
    }),
    LLM_PROVIDER_FALLBACK: z.enum(llmProviderValues, {
      error: () => 'LLM_PROVIDER_FALLBACK is required',
    }),
    LLM_PROVIDER_OPENAI_MODEL: z.string().trim().min(1, 'LLM_PROVIDER_OPENAI_MODEL is required'),
    LLM_PROVIDER_ANTHROPIC_MODEL: z.string().trim().min(1, 'LLM_PROVIDER_ANTHROPIC_MODEL is required'),
    LLM_PROVIDER_OPENAI_API_KEY: z.string().trim().min(1, 'LLM_PROVIDER_OPENAI_API_KEY is required'),
    LLM_PROVIDER_ANTHROPIC_API_KEY: z.string().trim().min(1, 'LLM_PROVIDER_ANTHROPIC_API_KEY is required'),
    LLM_PRIMARY_TIMEOUT_MS: integerFromEnv('LLM_PRIMARY_TIMEOUT_MS', 1, 30_000),
    LLM_PRIMARY_MAX_RETRIES: integerFromEnv('LLM_PRIMARY_MAX_RETRIES', 0, 1),
    LLM_FALLBACK_TIMEOUT_MS: integerFromEnv('LLM_FALLBACK_TIMEOUT_MS', 1, 30_000),
    LLM_FALLBACK_MAX_ATTEMPTS: integerFromEnv('LLM_FALLBACK_MAX_ATTEMPTS', 1, 1),
    LLM_GLOBAL_MAX_LATENCY_MS: integerFromEnv('LLM_GLOBAL_MAX_LATENCY_MS', 1, 60_000),
  })
  .superRefine((value, ctx) => {
    if (value.LLM_PROVIDER_PRIMARY !== 'openai') {
      ctx.addIssue({
        code: 'custom',
        path: ['LLM_PROVIDER_PRIMARY'],
        message: 'LLM_PROVIDER_PRIMARY must be openai',
      });
    }

    if (value.LLM_PROVIDER_FALLBACK !== 'anthropic') {
      ctx.addIssue({
        code: 'custom',
        path: ['LLM_PROVIDER_FALLBACK'],
        message: 'LLM_PROVIDER_FALLBACK must be anthropic',
      });
    }

    if (value.LLM_PROVIDER_PRIMARY === value.LLM_PROVIDER_FALLBACK) {
      ctx.addIssue({
        code: 'custom',
        path: ['LLM_PROVIDER_FALLBACK'],
        message: 'LLM_PROVIDER_FALLBACK must be different from LLM_PROVIDER_PRIMARY',
      });
    }
  });

type ProviderRuntimeConfig = {
  provider: LlmProvider;
  model: string;
  apiKey: string;
  timeoutMs: number;
};

export type LlmRuntimeConfig = {
  enabled: boolean;
  globalMaxLatencyMs: number;
  providers: {
    primary: ProviderRuntimeConfig & { maxRetries: number };
    fallback: ProviderRuntimeConfig & { maxAttempts: number };
  } | null;
};

export function isRealProviderEnabled(env: EnvInput): boolean {
  return realProviderEnabledSchema.parse({
    LLM_REAL_PROVIDER_ENABLED: env.LLM_REAL_PROVIDER_ENABLED ?? 'false',
  });
}

export function parseLlmRuntimeConfig(env: EnvInput): LlmRuntimeConfig {
  if (!isRealProviderEnabled(env)) {
    return {
      enabled: false,
      globalMaxLatencyMs: DEFAULT_GLOBAL_MAX_LATENCY_MS,
      providers: null,
    };
  }

  const parsed = enabledRuntimeSchema.parse(env);

  return {
    enabled: true,
    globalMaxLatencyMs: parsed.LLM_GLOBAL_MAX_LATENCY_MS,
    providers: {
      primary: {
        provider: parsed.LLM_PROVIDER_PRIMARY,
        model: parsed.LLM_PROVIDER_OPENAI_MODEL,
        apiKey: parsed.LLM_PROVIDER_OPENAI_API_KEY,
        timeoutMs: parsed.LLM_PRIMARY_TIMEOUT_MS,
        maxRetries: parsed.LLM_PRIMARY_MAX_RETRIES,
      },
      fallback: {
        provider: parsed.LLM_PROVIDER_FALLBACK,
        model: parsed.LLM_PROVIDER_ANTHROPIC_MODEL,
        apiKey: parsed.LLM_PROVIDER_ANTHROPIC_API_KEY,
        timeoutMs: parsed.LLM_FALLBACK_TIMEOUT_MS,
        maxAttempts: parsed.LLM_FALLBACK_MAX_ATTEMPTS,
      },
    },
  };
}
