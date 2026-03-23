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
const DEFAULT_PAGES_PER_QUERY = 5;
const DEFAULT_FULLTEXT_BUDGET_PER_RUN = 20;
const DEFAULT_MAX_WORK_ITEMS_PER_RUN = 12;
const DEFAULT_FRESHNESS_PRIORITY_WEIGHT = 0.05;

export const DEFAULT_PIPELINE_FRESHNESS_DAYS = 1825;
export const DEFAULT_PIPELINE_RETRY_COUNT = 2;

export type AdaptiveKnowledgePipelineConfig = {
  readonly allowedDomains: readonly string[];
  readonly freshnessWindowDays: number;
  readonly freshnessPriorityWeight: number;
  readonly backfillMaxDays: number;
  readonly maxRetries: number;
  readonly requestTimeoutMs: number;
  readonly maxQueriesPerRun: number;
  readonly pagesPerQuery: number;
  readonly fulltextBudgetPerRun: number;
  readonly maxWorkItemsPerRun: number;
  readonly workItemCaps: {
    readonly 'discover-front-page'?: number;
    readonly 'revisit-front'?: number;
    readonly 'acquire-fulltext'?: number;
    readonly 'extract-study-card'?: number;
    readonly 'link-study-question'?: number;
    readonly 'analyze-contradiction'?: number;
    readonly 'publish-doctrine'?: number;
  };
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
  freshnessPriorityWeight: number;
  backfillMaxDays: number;
  retryCount: number;
  maxRetries: number;
  timeoutMs: number;
  requestTimeoutMs: number;
  maxQueriesPerRun: number;
  pagesPerQuery: number;
  fulltextBudgetPerRun: number;
  maxWorkItemsPerRun: number;
  workItemCaps: AdaptiveKnowledgePipelineConfig['workItemCaps'];
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

function parseProbability(value: string, label: string): number {
  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    throw new Error(`${label} must be a number between 0 and 1`);
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${label} must be a number between 0 and 1`);
  }
  return parsed;
}

function parseMaybeProbability(value: string | undefined, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return parseProbability(value, label);
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

function parseWorkItemCapsFromEnv(env: EnvInput): AdaptiveKnowledgePipelineConfig['workItemCaps'] {
  return Object.freeze({
    'discover-front-page': parseMaybeInteger(env.PIPELINE_MAX_DISCOVER_FRONT_PAGE_ITEMS, 'PIPELINE_MAX_DISCOVER_FRONT_PAGE_ITEMS'),
    'revisit-front': parseMaybeInteger(env.PIPELINE_MAX_REVISIT_FRONT_ITEMS, 'PIPELINE_MAX_REVISIT_FRONT_ITEMS'),
    'acquire-fulltext': parseMaybeInteger(env.PIPELINE_MAX_ACQUIRE_FULLTEXT_ITEMS, 'PIPELINE_MAX_ACQUIRE_FULLTEXT_ITEMS'),
    'extract-study-card': parseMaybeInteger(env.PIPELINE_MAX_EXTRACT_STUDY_CARD_ITEMS, 'PIPELINE_MAX_EXTRACT_STUDY_CARD_ITEMS'),
    'link-study-question': parseMaybeInteger(env.PIPELINE_MAX_LINK_STUDY_QUESTION_ITEMS, 'PIPELINE_MAX_LINK_STUDY_QUESTION_ITEMS'),
    'analyze-contradiction': parseMaybeInteger(env.PIPELINE_MAX_ANALYZE_CONTRADICTION_ITEMS, 'PIPELINE_MAX_ANALYZE_CONTRADICTION_ITEMS'),
    'publish-doctrine': parseMaybeInteger(env.PIPELINE_MAX_PUBLISH_DOCTRINE_ITEMS, 'PIPELINE_MAX_PUBLISH_DOCTRINE_ITEMS'),
  });
}

function parseWorkItemCapsFromOverrides(
  caps: AdaptiveKnowledgePipelineConfig['workItemCaps'] | undefined,
): AdaptiveKnowledgePipelineConfig['workItemCaps'] {
  const parsed = caps ?? {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
      throw new Error(`workItemCaps.${key} must be a positive integer`);
    }
  }
  return Object.freeze({ ...parsed });
}

function parseFromEnv(env: EnvInput): AdaptiveKnowledgePipelineConfig {
  const allowedDomains = parseAllowedDomainsFromEnv(env.PIPELINE_ALLOWED_DOMAINS);
  assertAllowedDomains(allowedDomains);

  const freshnessWindowDays =
    parseMaybeInteger(env.PIPELINE_FRESHNESS_WINDOW_DAYS, 'PIPELINE_FRESHNESS_WINDOW_DAYS') ??
    DEFAULT_PIPELINE_FRESHNESS_DAYS;

  const freshnessPriorityWeight =
    parseMaybeProbability(env.PIPELINE_FRESHNESS_PRIORITY_WEIGHT, 'PIPELINE_FRESHNESS_PRIORITY_WEIGHT') ??
    DEFAULT_FRESHNESS_PRIORITY_WEIGHT;

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
  const pagesPerQuery =
    parseMaybeInteger(env.PIPELINE_PAGES_PER_QUERY, 'PIPELINE_PAGES_PER_QUERY') ?? DEFAULT_PAGES_PER_QUERY;
  const fulltextBudgetPerRun =
    parseMaybeInteger(env.PIPELINE_FULLTEXT_BUDGET_PER_RUN, 'PIPELINE_FULLTEXT_BUDGET_PER_RUN') ??
    DEFAULT_FULLTEXT_BUDGET_PER_RUN;
  const maxWorkItemsPerRun =
    parseMaybeInteger(env.PIPELINE_MAX_WORK_ITEMS_PER_RUN, 'PIPELINE_MAX_WORK_ITEMS_PER_RUN') ??
    DEFAULT_MAX_WORK_ITEMS_PER_RUN;
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

  const cron = env.PIPELINE_SCHEDULE_CRON?.trim() || DEFAULT_PIPELINE_SCHEDULE_CRON;
  const timezone = env.PIPELINE_SCHEDULE_TIMEZONE?.trim() || DEFAULT_PIPELINE_SCHEDULE_TIMEZONE;

  return Object.freeze({
    allowedDomains,
    freshnessWindowDays,
    freshnessPriorityWeight,
    backfillMaxDays,
    maxRetries,
    requestTimeoutMs,
    maxQueriesPerRun,
    pagesPerQuery,
    fulltextBudgetPerRun,
    maxWorkItemsPerRun,
    workItemCaps: parseWorkItemCapsFromEnv(env),
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

  const freshnessPriorityWeight = overrides.freshnessPriorityWeight ?? DEFAULT_FRESHNESS_PRIORITY_WEIGHT;
  if (!Number.isFinite(freshnessPriorityWeight) || freshnessPriorityWeight < 0 || freshnessPriorityWeight > 1) {
    throw new Error('freshnessPriorityWeight must be a number between 0 and 1');
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
  const pagesPerQuery = overrides.pagesPerQuery ?? DEFAULT_PAGES_PER_QUERY;
  if (!Number.isInteger(pagesPerQuery) || pagesPerQuery <= 0) {
    throw new Error('pagesPerQuery must be a positive integer');
  }
  const fulltextBudgetPerRun = overrides.fulltextBudgetPerRun ?? DEFAULT_FULLTEXT_BUDGET_PER_RUN;
  if (!Number.isInteger(fulltextBudgetPerRun) || fulltextBudgetPerRun <= 0) {
    throw new Error('fulltextBudgetPerRun must be a positive integer');
  }
  const maxWorkItemsPerRun = overrides.maxWorkItemsPerRun ?? DEFAULT_MAX_WORK_ITEMS_PER_RUN;
  if (!Number.isInteger(maxWorkItemsPerRun) || maxWorkItemsPerRun <= 0) {
    throw new Error('maxWorkItemsPerRun must be a positive integer');
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

  return Object.freeze({
    allowedDomains,
    freshnessWindowDays,
    freshnessPriorityWeight,
    backfillMaxDays,
    maxRetries: retries,
    requestTimeoutMs,
    maxQueriesPerRun,
    pagesPerQuery,
    fulltextBudgetPerRun,
    maxWorkItemsPerRun,
    workItemCaps: parseWorkItemCapsFromOverrides(overrides.workItemCaps),
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
