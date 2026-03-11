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
