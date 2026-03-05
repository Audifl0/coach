import type { AdaptiveRecommendationProposal } from '@/lib/adaptive-coaching/contracts';

export const llmProviderValues = ['openai', 'anthropic'] as const;

export type LlmProvider = (typeof llmProviderValues)[number];

export const llmFailureReasonValues = [
  'timeout',
  'rate_limited',
  'provider_error',
  'transport_error',
  'invalid_payload',
  'refusal',
  'unknown',
] as const;

export type LlmFailureReason = (typeof llmFailureReasonValues)[number];

export type LlmRequestInput = {
  systemPrompt: string;
  userPrompt: string;
  plannedSessionId: string;
};

export type LlmAttemptMetadata = {
  provider: LlmProvider;
  model: string;
  latencyMs: number;
  requestId: string | null;
};

export type LlmAttemptFailure = {
  ok: false;
  reason: LlmFailureReason;
  retryable: boolean;
  fallbackReason: string;
  parseStatus: 'invalid' | 'not_attempted';
  metadata: LlmAttemptMetadata;
};

export type LlmAttemptSuccess = {
  ok: true;
  proposal: AdaptiveRecommendationProposal;
  parseStatus: 'valid';
  metadata: LlmAttemptMetadata;
};

export type LlmAttemptResult = LlmAttemptFailure | LlmAttemptSuccess;

export type LlmProposalProviderClient = {
  generate(input: LlmRequestInput): Promise<LlmAttemptResult>;
};
