const APPROVED_ALLOWED_DOMAINS = [
  'acsm.org',
  'pubmed.ncbi.nlm.nih.gov',
  'crossref.org',
  'doi.org',
  'openalex.org',
  'jtsstrength.com',
] as const;

const DEFAULT_BACKFILL_MAX_DAYS = 1825;
const DEFAULT_PIPELINE_SCHEDULE_CRON = '0 4 * * 1';
const DEFAULT_PIPELINE_SCHEDULE_TIMEZONE = 'UTC';
const DEFAULT_PIPELINE_TIMEOUT_MS = 8000;
const DEFAULT_BOOTSTRAP_MAX_JOBS_PER_RUN = 12;
const DEFAULT_BOOTSTRAP_MAX_PAGES_PER_JOB = 5;
const DEFAULT_BOOTSTRAP_MAX_CANONICAL_RECORDS_PER_RUN = 250;
const DEFAULT_BOOTSTRAP_MAX_RUNTIME_MS = 15 * 60 * 1000;
const MAX_PIPELINE_RETRY_COUNT = 3;

export const DEFAULT_PIPELINE_FRESHNESS_DAYS = 1825;
export const DEFAULT_PIPELINE_RETRY_COUNT = 2;

export type AdaptiveKnowledgePipelineConfig = {
  readonly allowedDomains: readonly string[];
  readonly freshnessWindowDays: number;
  readonly backfillMaxDays: number;
  readonly maxRetries: number;
  readonly requestTimeoutMs: number;
  readonly maxQueriesPerRun: number;
  readonly schedule: {
    readonly cron: string;
    readonly timezone: string;
  };
  readonly bootstrap: {
    readonly maxJobsPerRun: number;
    readonly maxPagesPerJob: number;
    readonly maxCanonicalRecordsPerRun: number;
    readonly maxRuntimeMs: number;
  };
  readonly cadence: 'weekly';
};

type EnvInput = Partial<Record<string, string | undefined>>;
type OverridesInput = Partial<{
  allowedDomains: string[];
  freshnessWindowDays: number;
  backfillMaxDays: number;
  retryCount: number;
  maxRetries: number;
  timeoutMs: number;
  requestTimeoutMs: number;
  maxQueriesPerRun: number;
  bootstrapMaxJobsPerRun: number;
  bootstrapMaxPagesPerJob: number;
  bootstrapMaxCanonicalRecordsPerRun: number;
  bootstrapMaxRuntimeMs: number;
  scheduleCron: string;
  scheduleTimezone: string;
}>;
type ConfigInput = EnvInput | OverridesInput;

function isEnvInput(input: ConfigInput | undefined): input is EnvInput {
  if (!input) {
    return false;
  }
  return Object.keys(input).some((key) => key.startsWith('PIPELINE_'));
}

function parsePositiveInteger(value: string, label: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} must be a positive integer`);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function parseMaybeInteger(value: string | undefined, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return parsePositiveInteger(value, label);
}

function parseDomainToken(token: string): string {
  const value = token.trim().toLowerCase();
  if (!value) {
    throw new Error('PIPELINE_ALLOWED_DOMAINS contains an empty domain');
  }
  if (value.includes('://') || value.includes('/')) {
    throw new Error(`PIPELINE_ALLOWED_DOMAINS contains malformed host "${token}"`);
  }
  if (!/^[a-z0-9.-]+$/.test(value) || !value.includes('.')) {
    throw new Error(`PIPELINE_ALLOWED_DOMAINS contains malformed host "${token}"`);
  }
  return value;
}

function parseAllowedDomainsFromEnv(raw: string | undefined): string[] {
  if (!raw) {
    return [...APPROVED_ALLOWED_DOMAINS];
  }
  const domains = raw
    .split(',')
    .map((token) => parseDomainToken(token))
    .filter((token) => token.length > 0);
  if (domains.length === 0) {
    throw new Error('PIPELINE_ALLOWED_DOMAINS must contain at least one domain');
  }
  return domains;
}

function parseAllowedDomainsFromOverrides(raw: string[] | undefined): string[] {
  if (!raw || raw.length === 0) {
    return [...APPROVED_ALLOWED_DOMAINS];
  }
  return raw.map((token) => parseDomainToken(token));
}

function assertAllowedDomains(domains: readonly string[]): void {
  for (const domain of domains) {
    if (!APPROVED_ALLOWED_DOMAINS.includes(domain as (typeof APPROVED_ALLOWED_DOMAINS)[number])) {
      throw new Error(`PIPELINE_ALLOWED_DOMAINS includes non-approved domain "${domain}"`);
    }
  }
}

function parseFromEnv(env: EnvInput): AdaptiveKnowledgePipelineConfig {
  const allowedDomains = parseAllowedDomainsFromEnv(env.PIPELINE_ALLOWED_DOMAINS);
  assertAllowedDomains(allowedDomains);

  const freshnessWindowDays =
    parseMaybeInteger(env.PIPELINE_FRESHNESS_WINDOW_DAYS, 'PIPELINE_FRESHNESS_WINDOW_DAYS') ??
    DEFAULT_PIPELINE_FRESHNESS_DAYS;

  const backfillMaxDays =
    parseMaybeInteger(env.PIPELINE_BACKFILL_MAX_DAYS, 'PIPELINE_BACKFILL_MAX_DAYS') ?? DEFAULT_BACKFILL_MAX_DAYS;

  const maxRetries = parseMaybeInteger(env.PIPELINE_MAX_RETRIES, 'PIPELINE_MAX_RETRIES') ?? DEFAULT_PIPELINE_RETRY_COUNT;
  if (maxRetries > MAX_PIPELINE_RETRY_COUNT) {
    throw new Error(`PIPELINE_MAX_RETRIES must be <= ${MAX_PIPELINE_RETRY_COUNT}`);
  }

  const requestTimeoutMs =
    parseMaybeInteger(env.PIPELINE_REQUEST_TIMEOUT_MS, 'PIPELINE_REQUEST_TIMEOUT_MS') ?? DEFAULT_PIPELINE_TIMEOUT_MS;
  const maxQueriesPerRun =
    parseMaybeInteger(env.PIPELINE_MAX_QUERIES_PER_RUN, 'PIPELINE_MAX_QUERIES_PER_RUN') ?? 6;
  const bootstrapMaxJobsPerRun =
    parseMaybeInteger(env.PIPELINE_BOOTSTRAP_MAX_JOBS_PER_RUN, 'PIPELINE_BOOTSTRAP_MAX_JOBS_PER_RUN') ??
    DEFAULT_BOOTSTRAP_MAX_JOBS_PER_RUN;
  const bootstrapMaxPagesPerJob =
    parseMaybeInteger(env.PIPELINE_BOOTSTRAP_MAX_PAGES_PER_JOB, 'PIPELINE_BOOTSTRAP_MAX_PAGES_PER_JOB') ??
    DEFAULT_BOOTSTRAP_MAX_PAGES_PER_JOB;
  const bootstrapMaxCanonicalRecordsPerRun =
    parseMaybeInteger(
      env.PIPELINE_BOOTSTRAP_MAX_CANONICAL_RECORDS_PER_RUN,
      'PIPELINE_BOOTSTRAP_MAX_CANONICAL_RECORDS_PER_RUN',
    ) ?? DEFAULT_BOOTSTRAP_MAX_CANONICAL_RECORDS_PER_RUN;
  const bootstrapMaxRuntimeMs =
    parseMaybeInteger(env.PIPELINE_BOOTSTRAP_MAX_RUNTIME_MS, 'PIPELINE_BOOTSTRAP_MAX_RUNTIME_MS') ??
    DEFAULT_BOOTSTRAP_MAX_RUNTIME_MS;

  if (backfillMaxDays < freshnessWindowDays) {
    throw new Error('PIPELINE_BACKFILL_MAX_DAYS must be greater than or equal to PIPELINE_FRESHNESS_WINDOW_DAYS');
  }

  const cron = env.PIPELINE_SCHEDULE_CRON?.trim() || DEFAULT_PIPELINE_SCHEDULE_CRON;
  const timezone = env.PIPELINE_SCHEDULE_TIMEZONE?.trim() || DEFAULT_PIPELINE_SCHEDULE_TIMEZONE;

  return Object.freeze({
    allowedDomains,
    freshnessWindowDays,
    backfillMaxDays,
    maxRetries,
    requestTimeoutMs,
    maxQueriesPerRun,
    schedule: Object.freeze({
      cron,
      timezone,
    }),
    bootstrap: Object.freeze({
      maxJobsPerRun: bootstrapMaxJobsPerRun,
      maxPagesPerJob: bootstrapMaxPagesPerJob,
      maxCanonicalRecordsPerRun: bootstrapMaxCanonicalRecordsPerRun,
      maxRuntimeMs: bootstrapMaxRuntimeMs,
    }),
    cadence: 'weekly' as const,
  });
}

function parseFromOverrides(overrides: OverridesInput = {}): AdaptiveKnowledgePipelineConfig {
  const allowedDomains = parseAllowedDomainsFromOverrides(overrides.allowedDomains);
  assertAllowedDomains(allowedDomains);

  const freshnessWindowDays = overrides.freshnessWindowDays ?? DEFAULT_PIPELINE_FRESHNESS_DAYS;
  if (!Number.isInteger(freshnessWindowDays) || freshnessWindowDays <= 0) {
    throw new Error('freshnessWindowDays must be a positive integer');
  }

  const backfillMaxDays = overrides.backfillMaxDays ?? DEFAULT_BACKFILL_MAX_DAYS;
  if (!Number.isInteger(backfillMaxDays) || backfillMaxDays <= 0) {
    throw new Error('backfillMaxDays must be a positive integer');
  }

  const retries = overrides.maxRetries ?? overrides.retryCount ?? DEFAULT_PIPELINE_RETRY_COUNT;
  if (!Number.isInteger(retries) || retries < 0 || retries > MAX_PIPELINE_RETRY_COUNT) {
    throw new Error(`maxRetries must be an integer between 0 and ${MAX_PIPELINE_RETRY_COUNT}`);
  }

  const requestTimeoutMs = overrides.requestTimeoutMs ?? overrides.timeoutMs ?? DEFAULT_PIPELINE_TIMEOUT_MS;
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new Error('requestTimeoutMs must be a positive integer');
  }
  const maxQueriesPerRun = overrides.maxQueriesPerRun ?? 6;
  if (!Number.isInteger(maxQueriesPerRun) || maxQueriesPerRun <= 0) {
    throw new Error('maxQueriesPerRun must be a positive integer');
  }
  const bootstrapMaxJobsPerRun = overrides.bootstrapMaxJobsPerRun ?? DEFAULT_BOOTSTRAP_MAX_JOBS_PER_RUN;
  if (!Number.isInteger(bootstrapMaxJobsPerRun) || bootstrapMaxJobsPerRun <= 0) {
    throw new Error('bootstrapMaxJobsPerRun must be a positive integer');
  }
  const bootstrapMaxPagesPerJob = overrides.bootstrapMaxPagesPerJob ?? DEFAULT_BOOTSTRAP_MAX_PAGES_PER_JOB;
  if (!Number.isInteger(bootstrapMaxPagesPerJob) || bootstrapMaxPagesPerJob <= 0) {
    throw new Error('bootstrapMaxPagesPerJob must be a positive integer');
  }
  const bootstrapMaxCanonicalRecordsPerRun =
    overrides.bootstrapMaxCanonicalRecordsPerRun ?? DEFAULT_BOOTSTRAP_MAX_CANONICAL_RECORDS_PER_RUN;
  if (!Number.isInteger(bootstrapMaxCanonicalRecordsPerRun) || bootstrapMaxCanonicalRecordsPerRun <= 0) {
    throw new Error('bootstrapMaxCanonicalRecordsPerRun must be a positive integer');
  }
  const bootstrapMaxRuntimeMs = overrides.bootstrapMaxRuntimeMs ?? DEFAULT_BOOTSTRAP_MAX_RUNTIME_MS;
  if (!Number.isInteger(bootstrapMaxRuntimeMs) || bootstrapMaxRuntimeMs <= 0) {
    throw new Error('bootstrapMaxRuntimeMs must be a positive integer');
  }

  if (backfillMaxDays < freshnessWindowDays) {
    throw new Error('backfillMaxDays must be greater than or equal to freshnessWindowDays');
  }

  return Object.freeze({
    allowedDomains,
    freshnessWindowDays,
    backfillMaxDays,
    maxRetries: retries,
    requestTimeoutMs,
    maxQueriesPerRun,
    schedule: Object.freeze({
      cron: overrides.scheduleCron?.trim() || DEFAULT_PIPELINE_SCHEDULE_CRON,
      timezone: overrides.scheduleTimezone?.trim() || DEFAULT_PIPELINE_SCHEDULE_TIMEZONE,
    }),
    bootstrap: Object.freeze({
      maxJobsPerRun: bootstrapMaxJobsPerRun,
      maxPagesPerJob: bootstrapMaxPagesPerJob,
      maxCanonicalRecordsPerRun: bootstrapMaxCanonicalRecordsPerRun,
      maxRuntimeMs: bootstrapMaxRuntimeMs,
    }),
    cadence: 'weekly' as const,
  });
}

export function parseAdaptiveKnowledgePipelineConfig(input?: ConfigInput): AdaptiveKnowledgePipelineConfig {
  if (isEnvInput(input)) {
    return parseFromEnv(input);
  }
  return parseFromOverrides(input as OverridesInput | undefined);
}
