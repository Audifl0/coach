export const llmProviderValues = ['openai', 'anthropic'] as const;
export type LlmProvider = (typeof llmProviderValues)[number];

export const llmFailureReasonValues = [
  'provider_unavailable',
  'timeout',
  'rate_limited',
  'invalid_response',
  'schema_violation',
  'authentication_error',
  'transport_error',
  'unknown_error',
] as const;
export type LlmFailureReason = (typeof llmFailureReasonValues)[number];

export type LlmAttemptResult =
  | {
    ok: true;
    provider: LlmProvider;
    model: string;
    latencyMs: number;
    requestId: string;
    output: unknown;
  }
  | {
    ok: false;
    provider: LlmProvider;
    model: string;
    latencyMs: number;
    requestId?: string;
    failureReason: LlmFailureReason;
    message: string;
    retriable: boolean;
    cause?: unknown;
  };
