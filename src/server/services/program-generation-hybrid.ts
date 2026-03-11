import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

import { loadCoachKnowledgeBible, renderCoachKnowledgeBibleForPrompt, type CoachKnowledgeBible } from '@/lib/coach/knowledge-bible';
import {
  buildProgramGenerationPrompt,
  mergeHybridProgramDraft,
  parseHybridProgramDraft,
} from '@/lib/program/hybrid-generation';
import type { WeeklyProgramPlan } from '@/lib/program/planner';
import type { ProfileInput } from '@/lib/profile/contracts';
import { parseLlmRuntimeConfig, type LlmRuntimeConfig } from '@/server/llm/config';

const PROGRAM_GENERATION_DRAFT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reasoningSummary', 'evidencePrincipleIds', 'evidenceSourceIds', 'sessions'],
  properties: {
    reasoningSummary: {
      type: 'array',
      minItems: 2,
      maxItems: 4,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 220,
      },
    },
    evidencePrincipleIds: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: { type: 'string', minLength: 1 },
    },
    evidenceSourceIds: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: { type: 'string', minLength: 1 },
    },
    sessions: {
      type: 'array',
      minItems: 1,
      maxItems: 7,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sessionIndex', 'focusLabel', 'exerciseKeys'],
        properties: {
          sessionIndex: { type: 'integer', minimum: 0, maximum: 6 },
          focusLabel: { type: 'string', minLength: 1, maxLength: 80 },
          exerciseKeys: {
            type: 'array',
            minItems: 1,
            maxItems: 4,
            items: { type: 'string', minLength: 1 },
          },
        },
      },
    },
  },
} as const;

type BuildHybridProgramDraftInput = {
  profile: ProfileInput;
  baselinePlan: WeeklyProgramPlan;
  knowledgeBible: CoachKnowledgeBible;
};

function buildAnthropicInputSchema() {
  return {
    ...PROGRAM_GENERATION_DRAFT_JSON_SCHEMA,
    required: [...PROGRAM_GENERATION_DRAFT_JSON_SCHEMA.required],
    properties: {
      ...PROGRAM_GENERATION_DRAFT_JSON_SCHEMA.properties,
      sessions: {
        ...PROGRAM_GENERATION_DRAFT_JSON_SCHEMA.properties.sessions,
      },
    },
  };
}

function extractOpenAiPayloadText(response: unknown): string {
  const record =
    response && typeof response === 'object'
      ? response as {
        output_text?: unknown;
        output?: Array<{ content?: Array<{ type?: unknown; text?: unknown }> }>;
      }
      : {};

  if (typeof record.output_text === 'string' && record.output_text.trim().length > 0) {
    return record.output_text;
  }

  for (const block of record.output ?? []) {
    for (const content of block.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string' && content.text.trim().length > 0) {
        return content.text;
      }
    }
  }

  return '';
}

function extractAnthropicToolPayload(message: {
  content?: Array<{
    type?: string;
    input?: unknown;
  }>;
}): unknown {
  for (const block of message.content ?? []) {
    if (block.type === 'tool_use') {
      return block.input;
    }
  }

  return null;
}

async function generateWithOpenAi(input: {
  config: LlmRuntimeConfig;
  systemPrompt: string;
  userPrompt: string;
}): Promise<unknown> {
  const sdk = new OpenAI({
    apiKey: input.config.openAi.apiKey,
    maxRetries: 0,
    timeout: input.config.openAi.timeoutMs,
  });

  const response = await sdk.responses.create(
    {
      model: input.config.openAi.model,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: input.systemPrompt }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: input.userPrompt }],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'initial_program_generation_draft',
          schema: PROGRAM_GENERATION_DRAFT_JSON_SCHEMA,
          strict: true,
        },
      },
    },
    {
      timeout: input.config.openAi.timeoutMs,
    },
  );

  const payloadText = extractOpenAiPayloadText(response);
  return payloadText.length > 0 ? JSON.parse(payloadText) : null;
}

async function generateWithAnthropic(input: {
  config: LlmRuntimeConfig;
  systemPrompt: string;
  userPrompt: string;
}): Promise<unknown> {
  const sdk = new Anthropic({
    apiKey: input.config.anthropic.apiKey,
    timeout: input.config.anthropic.timeoutMs,
    maxRetries: 0,
  });

  const message = await sdk.messages.create({
    model: input.config.anthropic.model,
    max_tokens: 1400,
    system: input.systemPrompt,
    messages: [{ role: 'user', content: input.userPrompt }],
    tools: [
      {
        name: 'emit_initial_program_generation_draft',
        description: 'Return the initial training-program draft in strict JSON format.',
        input_schema: buildAnthropicInputSchema(),
      },
    ],
    tool_choice: {
      type: 'tool',
      name: 'emit_initial_program_generation_draft',
    },
  });

  return extractAnthropicToolPayload(message);
}

export function createHybridProgramDraftBuilder(input: {
  config: LlmRuntimeConfig;
}): (draftInput: BuildHybridProgramDraftInput) => Promise<unknown> {
  return async (draftInput) => {
    const biblePromptBlock = renderCoachKnowledgeBibleForPrompt({
      bible: draftInput.knowledgeBible,
      heading: 'Scientific coach bible',
    });
    const prompts = buildProgramGenerationPrompt({
      profile: draftInput.profile,
      baselinePlan: draftInput.baselinePlan,
      knowledgeBible: draftInput.knowledgeBible,
      biblePromptBlock,
    });

    try {
      if (input.config.primaryProvider === 'openai') {
        return await generateWithOpenAi({
          config: input.config,
          systemPrompt: prompts.systemPrompt,
          userPrompt: prompts.userPrompt,
        });
      }

      return await generateWithAnthropic({
        config: input.config,
        systemPrompt: prompts.systemPrompt,
        userPrompt: prompts.userPrompt,
      });
    } catch {
      if (input.config.fallbackProvider === input.config.primaryProvider) {
        return null;
      }

      try {
        if (input.config.fallbackProvider === 'openai') {
          return await generateWithOpenAi({
            config: input.config,
            systemPrompt: prompts.systemPrompt,
            userPrompt: prompts.userPrompt,
          });
        }

        return await generateWithAnthropic({
          config: input.config,
          systemPrompt: prompts.systemPrompt,
          userPrompt: prompts.userPrompt,
        });
      } catch {
        return null;
      }
    }
  };
}

export function resolveProgramKnowledgeBible(input: {
  profile: ProfileInput;
}): CoachKnowledgeBible {
  const queryTags = [
    input.profile.goal,
    'progression',
    'load',
    'readiness',
    'fatigue',
    ...(input.profile.limitationsDeclared ? ['limitations', 'pain', 'substitution'] : []),
  ];

  return loadCoachKnowledgeBible({
    queryTags,
    principleLimit: 4,
    sourceLimit: 4,
  });
}

export function buildHybridProgramPlan(input: {
  profile: ProfileInput;
  baselinePlan: WeeklyProgramPlan;
  draft: unknown;
}): WeeklyProgramPlan {
  return mergeHybridProgramDraft({
    profile: input.profile,
    baselinePlan: input.baselinePlan,
    draft: parseHybridProgramDraft(input.draft),
  });
}

export function validateHybridDraftEvidenceIds(input: {
  draft: unknown;
  knowledgeBible: CoachKnowledgeBible;
}): void {
  const parsed = parseHybridProgramDraft(input.draft);
  const validPrincipleIds = new Set(input.knowledgeBible.principles.map((principle) => principle.id));
  const validSourceIds = new Set(input.knowledgeBible.sources.map((source) => source.id));

  if (parsed.evidencePrincipleIds.some((id) => !validPrincipleIds.has(id))) {
    throw new Error('Hybrid draft referenced unknown evidence principle id');
  }

  if (parsed.evidenceSourceIds.some((id) => !validSourceIds.has(id))) {
    throw new Error('Hybrid draft referenced unknown evidence source id');
  }
}

export function buildDefaultHybridProgramDraftBuilder():
  | {
      getKnowledgeBible: (profile: ProfileInput) => CoachKnowledgeBible;
      createDraft: (input: BuildHybridProgramDraftInput) => Promise<unknown>;
    }
  | null {
  const runtimeConfig = parseLlmRuntimeConfig(process.env);
  if (runtimeConfig === null) {
    return null;
  }

  return {
    getKnowledgeBible: (profile) => resolveProgramKnowledgeBible({ profile }),
    createDraft: createHybridProgramDraftBuilder({ config: runtimeConfig }),
  };
}
