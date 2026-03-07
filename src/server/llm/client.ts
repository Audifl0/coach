import { parseAdaptiveRecommendationProposal, type AdaptiveRecommendationProposal } from '@/lib/adaptive-coaching/contracts';
import type {
  LlmAttemptFailure,
  LlmAttemptResult,
  LlmProposalProviderClient,
  LlmRequestInput,
} from '@/server/llm/contracts';
import { createProviderAttemptAuditEnvelope } from '@/server/llm/observability';

type ProviderAttemptSummary = {
  provider: 'openai' | 'anthropic';
  model: string;
  latencyMs: number;
  requestId: string | null;
  parseStatus: 'valid' | 'invalid' | 'not_attempted';
  fallbackReason: string | null;
};

export type LlmClientResult = {
  candidate: AdaptiveRecommendationProposal | null;
  meta: {
    provider: 'openai' | 'anthropic' | null;
    fallbackReason: string | null;
    chain: ProviderAttemptSummary[];
  };
};

export type LlmProposalClient = {
  generate(input: LlmRequestInput): Promise<LlmClientResult>;
};

export type LlmClientDeps = {
  primary: LlmProposalProviderClient;
  fallback: LlmProposalProviderClient;
  primaryMaxRetries?: number;
  onAttemptAudit?: (event: Record<string, unknown>) => void;
};

function getFallbackReason(result: LlmAttemptResult | null): string | null {
  if (!result || result.ok) {
    return null;
  }

  return result.fallbackReason;
}

function toSummary(result: LlmAttemptResult): ProviderAttemptSummary {
  return {
    provider: result.metadata.provider,
    model: result.metadata.model,
    latencyMs: result.metadata.latencyMs,
    requestId: result.metadata.requestId,
    parseStatus: result.parseStatus,
    fallbackReason: getFallbackReason(result),
  };
}

function validateCandidate(proposal: AdaptiveRecommendationProposal): AdaptiveRecommendationProposal | null {
  try {
    const parsed = parseAdaptiveRecommendationProposal(proposal);
    if (!Array.isArray(parsed.evidenceTags) || parsed.evidenceTags.length < 1) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function toInvalidPayloadFailure(result: LlmAttemptResult): LlmAttemptFailure {
  return {
    ok: false,
    reason: 'invalid_payload',
    retryable: true,
    fallbackReason: `${result.metadata.provider}_invalid_payload`,
    parseStatus: 'invalid',
    metadata: result.metadata,
  };
}

export function createLlmProposalClient(deps: LlmClientDeps): LlmProposalClient {
  const primaryRetries = Math.max(0, Math.min(1, deps.primaryMaxRetries ?? 1));
  const onAttemptAudit = deps.onAttemptAudit;

  function recordAttempt(result: LlmAttemptResult, attempts: ProviderAttemptSummary[]) {
    const summary = toSummary(result);
    attempts.push(summary);
    if (onAttemptAudit) {
      onAttemptAudit(createProviderAttemptAuditEnvelope(summary as Record<string, unknown>));
    }
  }

  return {
    async generate(input) {
      const attempts: ProviderAttemptSummary[] = [];
      let fallbackReason: string | null = null;
      let lastPrimaryFailure: LlmAttemptResult | null = null;

      for (let attempt = 0; attempt <= primaryRetries; attempt += 1) {
        const primaryResult = await deps.primary.generate(input);

        if (primaryResult.ok) {
          const validated = validateCandidate(primaryResult.proposal);
          if (validated) {
            recordAttempt(primaryResult, attempts);
            return {
              candidate: validated,
              meta: {
                provider: 'openai',
                fallbackReason,
                chain: attempts,
              },
            };
          }

          const invalidFailure = toInvalidPayloadFailure(primaryResult);
          recordAttempt(invalidFailure, attempts);
          lastPrimaryFailure = invalidFailure;
          fallbackReason = invalidFailure.fallbackReason;
          continue;
        }

        recordAttempt(primaryResult, attempts);
        lastPrimaryFailure = primaryResult;
        fallbackReason = getFallbackReason(primaryResult);
        if (!primaryResult.retryable || attempt >= primaryRetries) {
          break;
        }
      }

      const fallbackResult = await deps.fallback.generate(input);
      if (fallbackResult.ok) {
        const validated = validateCandidate(fallbackResult.proposal);
        if (validated) {
          recordAttempt(fallbackResult, attempts);
          return {
            candidate: validated,
            meta: {
              provider: 'anthropic',
              fallbackReason,
              chain: attempts,
            },
          };
        }

        const invalidFallback = toInvalidPayloadFailure(fallbackResult);
        recordAttempt(invalidFallback, attempts);
        return {
          candidate: null,
          meta: {
            provider: null,
            fallbackReason: invalidFallback.fallbackReason,
            chain: attempts,
          },
        };
      }

      recordAttempt(fallbackResult, attempts);
      const terminalFallbackReason =
        getFallbackReason(fallbackResult) ??
        getFallbackReason(lastPrimaryFailure);
      return {
        candidate: null,
        meta: {
          provider: null,
          fallbackReason: terminalFallbackReason,
          chain: attempts,
        },
      };
    },
  };
}
