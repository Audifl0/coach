import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAdaptiveRecommendationProposal } from '../../src/lib/adaptive-coaching/contracts';
import { ADAPTIVE_PROPOSAL_JSON_SCHEMA } from '../../src/server/llm/schema';

function buildProviderPayload() {
  return {
    actionType: 'hold',
    plannedSessionId: 'session_1',
    reasons: ['Recent readiness is stable', 'Conservative adjustment keeps execution safe'],
    evidenceTags: ['readiness', 'execution_consistency'],
    forecastProjection: {
      projectedReadiness: 3,
      projectedRpe: 7,
    },
  };
}

test('canonical schema requires all fields and disallows additional properties', () => {
  assert.equal(ADAPTIVE_PROPOSAL_JSON_SCHEMA.type, 'object');
  assert.deepEqual(ADAPTIVE_PROPOSAL_JSON_SCHEMA.required, [
    'actionType',
    'plannedSessionId',
    'reasons',
    'evidenceTags',
    'forecastProjection',
  ]);
  assert.equal(ADAPTIVE_PROPOSAL_JSON_SCHEMA.additionalProperties, false);
});

test('missing evidenceTags or empty evidenceTags is invalid', () => {
  const valid = buildProviderPayload();
  const parsed = parseAdaptiveRecommendationProposal(valid);
  assert.equal(parsed.evidenceTags.length, 2);

  assert.throws(() => {
    parseAdaptiveRecommendationProposal({
      ...valid,
      evidenceTags: [],
    });
  });

  assert.throws(() => {
    const { evidenceTags: _unused, ...missingEvidenceTags } = valid;
    parseAdaptiveRecommendationProposal(missingEvidenceTags);
  });
});

test('provider payload contract excludes status field', () => {
  const valid = buildProviderPayload();
  const parsed = parseAdaptiveRecommendationProposal(valid);
  assert.equal(Object.hasOwn(parsed, 'status'), false);

  assert.throws(() => {
    parseAdaptiveRecommendationProposal({
      ...valid,
      status: 'proposed',
    });
  });
});
