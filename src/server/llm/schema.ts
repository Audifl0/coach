export const ADAPTIVE_PROPOSAL_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['actionType', 'plannedSessionId', 'reasons', 'evidenceTags', 'forecastProjection'],
  properties: {
    actionType: {
      type: 'string',
      enum: ['progress', 'hold', 'deload', 'substitution'],
    },
    plannedSessionId: {
      type: 'string',
      minLength: 1,
    },
    reasons: {
      type: 'array',
      minItems: 2,
      maxItems: 3,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 180,
      },
    },
    evidenceTags: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'string',
        minLength: 2,
        maxLength: 32,
      },
    },
    forecastProjection: {
      type: 'object',
      additionalProperties: false,
      required: ['projectedReadiness', 'projectedRpe'],
      properties: {
        projectedReadiness: {
          type: 'integer',
          minimum: 1,
          maximum: 5,
        },
        projectedRpe: {
          type: 'number',
          minimum: 1,
          maximum: 10,
        },
      },
    },
    substitutionTarget: {
      type: 'object',
      additionalProperties: false,
      required: ['exerciseKey', 'displayName'],
      properties: {
        exerciseKey: {
          type: 'string',
          minLength: 1,
        },
        displayName: {
          type: 'string',
          minLength: 1,
        },
      },
    },
  },
} as const;
