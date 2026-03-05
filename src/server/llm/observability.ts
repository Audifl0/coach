type AttemptAuditFields = {
  provider: 'openai' | 'anthropic';
  model: string;
  latencyMs: number;
  parseStatus: 'valid' | 'invalid' | 'not_attempted';
  fallbackReason: string | null;
  requestId: string | null;
};

const ALLOWED_KEYS = [
  'provider',
  'model',
  'latencyMs',
  'parseStatus',
  'fallbackReason',
  'requestId',
] as const;

export function createProviderAttemptAuditEnvelope(input: Record<string, unknown>): AttemptAuditFields {
  const envelope = {} as Record<string, unknown>;
  for (const key of ALLOWED_KEYS) {
    envelope[key] = input[key];
  }

  return envelope as AttemptAuditFields;
}
