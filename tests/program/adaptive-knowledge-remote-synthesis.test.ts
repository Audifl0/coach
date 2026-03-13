import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CorpusRemoteSynthesisError,
  createOpenAiCorpusSynthesisClient,
} from '../../scripts/adaptive-knowledge/remote-synthesis';
import { synthesizeCorpusWithRemoteModel } from '../../scripts/adaptive-knowledge/synthesis';

const baseRecords = [
  {
    id: 'guideline-1',
    sourceType: 'guideline' as const,
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/guideline-1',
    sourceDomain: 'pubmed.ncbi.nlm.nih.gov',
    publishedAt: '2025-11-02',
    title: 'Guideline',
    summaryEn: 'Keep progression conservative.',
    tags: ['progression', 'fatigue'],
    provenanceIds: ['guideline-1'],
  },
  {
    id: 'review-1',
    sourceType: 'review' as const,
    sourceUrl: 'https://doi.org/review-1',
    sourceDomain: 'doi.org',
    publishedAt: '2025-11-02',
    title: 'Review',
    summaryEn: 'Readiness should influence loading.',
    tags: ['readiness'],
    provenanceIds: ['review-1'],
  },
];

function createSdkReturning(payload: unknown) {
  return {
    responses: {
      create: async () => ({
        output_text: JSON.stringify(payload),
        _request_id: 'req_test',
      }),
    },
  };
}

test('openai corpus synthesis client parses source-synthesis payloads', async () => {
  const client = createOpenAiCorpusSynthesisClient(
    {
      apiKey: 'test',
      model: 'gpt-test',
      timeoutMs: 5000,
      promptVersion: 'test-v1',
    },
    {
      sdk: createSdkReturning({
        lotId: 'lot-guideline',
        recordIds: ['guideline-1'],
        studyExtractions: [
          {
            recordId: 'guideline-1',
            topicKeys: ['progression'],
            population: 'recreational lifters',
            intervention: 'progressive overload',
            applicationContext: 'hypertrophy block',
            outcomes: ['strength progression'],
            evidenceSignals: ['guideline'],
            limitations: ['context specific'],
            safetySignals: ['conservative progression'],
          },
        ],
        retainedClaims: [
          {
            id: 'p_safe',
            title: 'Progression prudente',
            summaryFr: 'Conserver une progression prudente.',
            guidanceFr: 'Monter la charge seulement si la recuperation suit.',
            provenanceRecordIds: ['guideline-1'],
            evidenceLevel: 'guideline',
            guardrail: 'SAFE-01',
            confidence: 0.92,
          },
        ],
        rejectedClaims: [],
        coverageTags: ['progression'],
        contradictions: [],
        modelRun: {
          provider: 'openai',
          model: 'gpt-test',
          promptVersion: 'test-v1',
          requestId: 'req_test',
          latencyMs: 12,
        },
      }),
    },
  );

  const result = await client.synthesizeLot({
    lotId: 'lot-guideline',
    records: [baseRecords[0]!],
  });

  assert.equal(result.retainedClaims[0]?.id, 'p_safe');
  assert.equal(result.studyExtractions[0]?.population, 'recreational lifters');
  assert.equal(result.modelRun.provider, 'openai');
});

test('openai lot request uses a strict extraction schema compatible with provider json_schema rules', async () => {
  let capturedBody: Record<string, unknown> | null = null;
  const client = createOpenAiCorpusSynthesisClient(
    {
      apiKey: 'test',
      model: 'gpt-test',
      timeoutMs: 5000,
      promptVersion: 'test-v1',
    },
    {
      sdk: {
        responses: {
          create: async (body) => {
            capturedBody = body;
            return {
              output_text: JSON.stringify({
                lotId: 'lot-guideline',
                recordIds: ['guideline-1'],
                studyExtractions: [],
                retainedClaims: [],
                rejectedClaims: [],
                coverageTags: [],
                contradictions: [],
                modelRun: {
                  provider: 'openai',
                  model: 'gpt-test',
                  promptVersion: 'test-v1',
                  requestId: 'req_schema',
                  latencyMs: 1,
                },
              }),
              _request_id: 'req_schema',
            };
          },
        },
      },
    },
  );

  await client.synthesizeLot({
    lotId: 'lot-guideline',
    records: [baseRecords[0]!],
  });

  const format = (capturedBody?.text as { format?: { schema?: any } } | undefined)?.format;
  const extractionSchema = format?.schema?.properties?.studyExtractions?.items;

  assert.equal(format?.type, 'json_schema');
  assert.deepEqual(
    extractionSchema.required,
    [
      'recordId',
      'topicKeys',
      'population',
      'intervention',
      'applicationContext',
      'outcomes',
      'evidenceSignals',
      'limitations',
      'safetySignals',
      'rejectionReason',
    ],
  );
  assert.deepEqual(extractionSchema.properties.population.type, ['string', 'null']);
  assert.deepEqual(extractionSchema.properties.rejectionReason.type, ['object', 'null']);
});

test('openai corpus synthesis client converts invalid payloads to deterministic invalid_payload errors', async () => {
  const client = createOpenAiCorpusSynthesisClient(
    {
      apiKey: 'test',
      model: 'gpt-test',
      timeoutMs: 5000,
      promptVersion: 'test-v1',
    },
    {
      sdk: {
        responses: {
          create: async () => ({
            output_text: '{"invalid":true}',
            _request_id: 'req_invalid',
          }),
        },
      },
    },
  );

  await assert.rejects(
    () =>
      client.synthesizeLot({
        lotId: 'lot-guideline',
        records: [baseRecords[0]!],
      }),
    (error: unknown) => {
      assert.equal(error instanceof CorpusRemoteSynthesisError, true);
      assert.equal((error as CorpusRemoteSynthesisError).reason, 'invalid_payload');
      return true;
    },
  );
});

test('openai corpus synthesis client normalizes timeout/provider errors', async () => {
  const client = createOpenAiCorpusSynthesisClient(
    {
      apiKey: 'test',
      model: 'gpt-test',
      timeoutMs: 5000,
      promptVersion: 'test-v1',
    },
    {
      sdk: {
        responses: {
          create: async () => {
            const error = new Error('timeout talking to provider') as Error & { status?: number };
            error.status = 408;
            throw error;
          },
        },
      },
    },
  );

  await assert.rejects(
    () =>
      client.synthesizeLot({
        lotId: 'lot-guideline',
        records: [baseRecords[0]!],
      }),
    (error: unknown) => {
      assert.equal(error instanceof CorpusRemoteSynthesisError, true);
      assert.equal((error as CorpusRemoteSynthesisError).reason, 'timeout');
      return true;
    },
  );
});

test('openai corpus synthesis client surfaces lot diagnostics on provider schema failures', async () => {
  const client = createOpenAiCorpusSynthesisClient(
    {
      apiKey: 'test',
      model: 'gpt-test',
      timeoutMs: 5000,
      promptVersion: 'test-v1',
    },
    {
      sdk: {
        responses: {
          create: async () => {
            const error = new Error("Invalid schema for response_format 'corpus_source_synthesis'") as Error & {
              status?: number;
              code?: string;
              type?: string;
              _request_id?: string;
            };
            error.status = 400;
            error.code = 'invalid_json_schema';
            error.type = 'invalid_request_error';
            error._request_id = 'req_bad_schema';
            throw error;
          },
        },
      },
    },
  );

  await assert.rejects(
    () =>
      client.synthesizeLot({
        lotId: 'lot-guideline',
        records: [baseRecords[0]!],
      }),
    (error: unknown) => {
      assert.equal(error instanceof CorpusRemoteSynthesisError, true);
      assert.match((error as CorpusRemoteSynthesisError).message, /lot=lot-guideline/);
      assert.match((error as CorpusRemoteSynthesisError).message, /code=invalid_json_schema/);
      assert.match((error as CorpusRemoteSynthesisError).message, /request_id=req_bad_schema/);
      return true;
    },
  );
});

test('remote synthesis orchestration runs the two-step lot plus consolidation flow', async () => {
  const output = await synthesizeCorpusWithRemoteModel({
    runId: 'run-remote',
    records: baseRecords,
    client: {
      synthesizeLot: async (input) => ({
        lotId: input.lotId,
        recordIds: input.records.map((record) => record.id),
        studyExtractions: input.records.map((record) => ({
          recordId: record.id,
          topicKeys: record.tags.slice(0, 1),
          population: 'general population',
          intervention: record.title,
          applicationContext: 'program design',
          outcomes: ['training adaptation'],
          evidenceSignals: [record.sourceType],
          limitations: [],
          safetySignals: ['conservative progression'],
        })),
        retainedClaims: [
          {
            id: `claim-${input.lotId}`,
            title: `Claim ${input.lotId}`,
            summaryFr: 'Synthese lot.',
            guidanceFr: 'Garder une progression prudente.',
            provenanceRecordIds: input.records.map((record) => record.id),
            evidenceLevel: input.records[0]?.sourceType ?? 'review',
            guardrail: 'SAFE-03',
            confidence: 0.8,
          },
        ],
        rejectedClaims: [],
        coverageTags: input.records.flatMap((record) => record.tags),
        contradictions: [],
        modelRun: {
          provider: 'openai',
          model: 'gpt-test',
          promptVersion: 'test-v1',
          requestId: `req-${input.lotId}`,
          latencyMs: 5,
        },
      }),
      consolidate: async (input) => ({
        principles: [
          {
            id: 'p_final',
            title: 'Progression prudente',
            summaryFr: 'Conserver une progression prudente.',
            guidanceFr: 'Monter progressivement tout en surveillant la fatigue.',
            provenanceRecordIds: input.records.map((record) => record.id),
            evidenceLevel: 'review',
            guardrail: 'SAFE-03',
            confidence: 0.88,
          },
        ],
        studyExtractions: input.batches.flatMap((batch) => batch.studyExtractions),
        rejectedClaims: [],
        coverage: {
          recordCount: input.records.length,
          batchCount: input.batches.length,
          retainedClaimCount: 1,
          sourceDomains: ['doi.org', 'pubmed.ncbi.nlm.nih.gov'],
          coveredTags: ['fatigue', 'progression', 'readiness'],
        },
        contradictions: [],
        modelRun: {
          provider: 'openai',
          model: 'gpt-test',
          promptVersion: 'test-v1',
          requestId: null,
          requestIds: input.batches.map((batch) => batch.modelRun.requestId ?? 'missing'),
          totalLatencyMs: 10,
        },
      }),
    },
  });

  assert.equal(output.principles.length, 1);
  assert.equal(output.validatedSynthesis.coverage.batchCount, 2);
  assert.equal(output.validatedSynthesis.studyExtractions.length, 2);
  assert.deepEqual(output.validatedSynthesis.modelRun.requestIds, ['req-lot-guideline', 'req-lot-review']);
});

test('remote synthesis defers invalid lots instead of failing the whole bootstrap orchestration', async () => {
  const output = await synthesizeCorpusWithRemoteModel({
    runId: 'run-remote-deferred',
    records: baseRecords,
    client: {
      synthesizeLot: async (input) => {
        if (input.lotId === 'lot-guideline') {
          throw new CorpusRemoteSynthesisError({
            message: 'lot=lot-guideline;message=invalid_payload',
            reason: 'invalid_payload',
            retryable: true,
            metadata: {
              provider: 'openai',
              model: 'gpt-test',
              latencyMs: 4,
              requestId: 'req_invalid_lot',
            },
          });
        }

        return {
          lotId: input.lotId,
          recordIds: input.records.map((record) => record.id),
          studyExtractions: input.records.map((record) => ({
            recordId: record.id,
            topicKeys: record.tags.slice(0, 1),
            population: 'general population',
            intervention: record.title,
            applicationContext: 'program design',
            outcomes: ['training adaptation'],
            evidenceSignals: [record.sourceType],
            limitations: [],
            safetySignals: ['conservative progression'],
          })),
          retainedClaims: [],
          rejectedClaims: [],
          coverageTags: input.records.flatMap((record) => record.tags),
          contradictions: [],
          modelRun: {
            provider: 'openai',
            model: 'gpt-test',
            promptVersion: 'test-v1',
            requestId: `req-${input.lotId}`,
            latencyMs: 5,
          },
        };
      },
      consolidate: async (input) => ({
        principles: [],
        studyExtractions: input.batches.flatMap((batch) => batch.studyExtractions),
        rejectedClaims: [],
        coverage: {
          recordCount: input.records.length,
          batchCount: input.batches.length,
          retainedClaimCount: 0,
          sourceDomains: ['doi.org', 'pubmed.ncbi.nlm.nih.gov'],
          coveredTags: ['fatigue', 'progression', 'readiness'],
        },
        contradictions: [],
        modelRun: {
          provider: 'openai',
          model: 'gpt-test',
          promptVersion: 'test-v1',
          requestId: null,
          requestIds: input.batches.map((batch) => batch.modelRun.requestId ?? 'missing'),
          totalLatencyMs: 5,
        },
      }),
    },
  });

  assert.equal(output.validatedSynthesis.coverage.batchCount, 1);
  assert.equal(output.validatedSynthesis.studyExtractions.length, 1);
  assert.equal(
    output.validatedSynthesis.rejectedClaims.some((claim) => claim.code === 'deferred_remote_extraction'),
    true,
  );
});

test('remote synthesis defers retryable timeout and rate-limit lots instead of failing bootstrap orchestration', async () => {
  const output = await synthesizeCorpusWithRemoteModel({
    runId: 'run-remote-retryable-deferred',
    records: baseRecords,
    client: {
      synthesizeLot: async (input) => {
        if (input.lotId === 'lot-guideline') {
          throw new CorpusRemoteSynthesisError({
            message: 'lot=lot-guideline;message=Request timed out.',
            reason: 'timeout',
            retryable: true,
            metadata: {
              provider: 'openai',
              model: 'gpt-test',
              latencyMs: 5,
              requestId: 'req_timeout',
            },
          });
        }
        if (input.lotId === 'lot-review') {
          throw new CorpusRemoteSynthesisError({
            message: 'lot=lot-review;status=429;message=Rate limited.',
            reason: 'rate_limited',
            retryable: true,
            metadata: {
              provider: 'openai',
              model: 'gpt-test',
              latencyMs: 5,
              requestId: 'req_rate_limited',
            },
          });
        }

        return {
          lotId: input.lotId,
          recordIds: input.records.map((record) => record.id),
          studyExtractions: [],
          retainedClaims: [],
          rejectedClaims: [],
          coverageTags: input.records.flatMap((record) => record.tags),
          contradictions: [],
          modelRun: {
            provider: 'openai',
            model: 'gpt-test',
            promptVersion: 'test-v1',
            requestId: `req-${input.lotId}`,
            latencyMs: 5,
          },
        };
      },
      consolidate: async () => ({
        principles: [],
        studyExtractions: [],
        rejectedClaims: [],
        coverage: {
          recordCount: 0,
          batchCount: 0,
          retainedClaimCount: 0,
          sourceDomains: ['unavailable'],
          coveredTags: [],
        },
        contradictions: [],
        modelRun: {
          provider: 'openai',
          model: 'gpt-test',
          promptVersion: 'test-v1',
          requestId: null,
          requestIds: [],
          totalLatencyMs: 0,
        },
      }),
    },
  });

  assert.equal(output.principles.length, 0);
  assert.equal(
    output.validatedSynthesis.rejectedClaims.some((claim) => claim.code === 'deferred_remote_timeout'),
    true,
  );
  assert.equal(
    output.validatedSynthesis.rejectedClaims.some((claim) => claim.code === 'deferred_remote_rate_limit'),
    true,
  );
});
