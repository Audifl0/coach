import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_PIPELINE_FRESHNESS_DAYS,
  DEFAULT_PIPELINE_RETRY_COUNT,
  parseAdaptiveKnowledgePipelineConfig,
} from '../../scripts/adaptive-knowledge/config';

function buildEnv(overrides: Partial<Record<string, string | undefined>> = {}) {
  return {
    PIPELINE_ALLOWED_DOMAINS:
      'acsm.org,pubmed.ncbi.nlm.nih.gov,crossref.org,openalex.org,jtsstrength.com',
    PIPELINE_FRESHNESS_WINDOW_DAYS: undefined,
    PIPELINE_BACKFILL_MAX_DAYS: undefined,
    PIPELINE_MAX_RETRIES: undefined,
    PIPELINE_REQUEST_TIMEOUT_MS: undefined,
    PIPELINE_SCHEDULE_CRON: undefined,
    PIPELINE_SCHEDULE_TIMEZONE: undefined,
    ...overrides,
  };
}

test('defaults resolve five-year freshness policy, bounded retries, and weekly schedule metadata', () => {
  const parsed = parseAdaptiveKnowledgePipelineConfig(buildEnv());

  assert.equal(DEFAULT_PIPELINE_FRESHNESS_DAYS, 1825);
  assert.equal(DEFAULT_PIPELINE_RETRY_COUNT, 2);
  assert.equal(parsed.freshnessWindowDays, 1825);
  assert.equal(parsed.maxRetries, 2);
  assert.equal(parsed.backfillMaxDays >= parsed.freshnessWindowDays, true);
  assert.equal(parsed.schedule.cron, '0 4 * * 1');
  assert.equal(parsed.schedule.timezone, 'UTC');
});

test('allowlist parser rejects non-approved domains and malformed URL hosts', () => {
  const parsed = parseAdaptiveKnowledgePipelineConfig(buildEnv());
  assert.equal(parsed.allowedDomains.includes('pubmed.ncbi.nlm.nih.gov'), true);

  assert.throws(() => parseAdaptiveKnowledgePipelineConfig(buildEnv({ PIPELINE_ALLOWED_DOMAINS: 'example.com' })));

  assert.throws(() =>
    parseAdaptiveKnowledgePipelineConfig(
      buildEnv({
        PIPELINE_ALLOWED_DOMAINS: 'https://acsm.org/path',
      }),
    ),
  );

  assert.throws(() =>
    parseAdaptiveKnowledgePipelineConfig(
      buildEnv({
        PIPELINE_ALLOWED_DOMAINS: 'acsm.org,not a host',
      }),
    ),
  );
});

test('invalid freshness and retry overrides fail fast with deterministic validation errors', () => {
  assert.throws(
    () =>
      parseAdaptiveKnowledgePipelineConfig(
        buildEnv({
          PIPELINE_FRESHNESS_WINDOW_DAYS: '0',
        }),
      ),
    /PIPELINE_FRESHNESS_WINDOW_DAYS/,
  );

  assert.throws(
    () =>
      parseAdaptiveKnowledgePipelineConfig(
        buildEnv({
          PIPELINE_BACKFILL_MAX_DAYS: '100',
          PIPELINE_FRESHNESS_WINDOW_DAYS: '365',
        }),
      ),
    /PIPELINE_BACKFILL_MAX_DAYS/,
  );

  assert.throws(
    () =>
      parseAdaptiveKnowledgePipelineConfig(
        buildEnv({
          PIPELINE_MAX_RETRIES: '9',
        }),
      ),
    /PIPELINE_MAX_RETRIES/,
  );

  assert.throws(
    () =>
      parseAdaptiveKnowledgePipelineConfig(
        buildEnv({
          PIPELINE_REQUEST_TIMEOUT_MS: '0',
        }),
      ),
    /PIPELINE_REQUEST_TIMEOUT_MS/,
  );
});
