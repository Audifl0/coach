import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateRecommendationConfidence } from '../../src/lib/adaptive-coaching/confidence';
import {
  buildAdaptiveExplanationEnvelope,
  deriveEvidenceContextQuality,
  retrieveAdaptiveEvidence,
} from '../../src/lib/adaptive-coaching/evidence';

test('evidence retrieval returns deterministic top-k snippets with short refs and source classes', () => {
  const evidence = retrieveAdaptiveEvidence({
    queryTags: ['fatigue', 'adherence', 'readiness'],
    topK: 3,
  });

  assert.equal(evidence.length, 3);
  assert.ok(evidence[0]?.ref.startsWith('G-'));
  assert.ok(evidence[1]?.ref.startsWith('R-') || evidence[1]?.ref.startsWith('G-'));
  assert.ok(evidence[2]?.ref.startsWith('E-') || evidence[2]?.ref.startsWith('R-') || evidence[2]?.ref.startsWith('G-'));
  assert.ok(['guideline', 'review', 'expertise'].includes(evidence[0]?.sourceClass ?? ''));
});

test('explanation envelope requires 2-3 reasons and at least one evidence reference', () => {
  const evidence = retrieveAdaptiveEvidence({
    queryTags: ['fatigue'],
    topK: 1,
  });

  const envelope = buildAdaptiveExplanationEnvelope({
    reasons: ['Fatigue trend has increased', 'Recent adherence dipped'],
    evidence,
  });

  assert.equal(envelope.reasons.length, 2);
  assert.equal(envelope.evidenceTags.length, 1);

  assert.throws(() =>
    buildAdaptiveExplanationEnvelope({
      reasons: ['Only one reason'],
      evidence,
    }),
  );

  assert.throws(() =>
    buildAdaptiveExplanationEnvelope({
      reasons: ['Reason 1', 'Reason 2'],
      evidence: [],
    }),
  );
});

test('missing evidence corpus hits lower context quality and trigger SAFE-03 confidence gate', () => {
  const lowContextQuality = deriveEvidenceContextQuality(0);
  assert.equal(lowContextQuality < 0.5, true);

  const result = evaluateRecommendationConfidence({
    candidateRecommendation: {
      actionType: 'hold',
      deltaLoadPct: 0,
      deltaRep: 0,
      movementTags: [],
      equipmentTags: [],
      substitutionExerciseKey: null,
    },
    modelConfidence: 0.9,
    contextQuality: lowContextQuality,
  });

  assert.equal(result.fallbackRequired, true);
  assert.equal(result.reasonCodes.includes('low_context_quality'), true);
});
