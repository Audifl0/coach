export type ProgramGenerationResponse = {
  plan: {
    startDate: string;
    endDate: string;
  };
  sessions: unknown[];
  meta?: {
    mode: string;
    knowledgeSnapshotId: string | null;
  };
};

type RequestProgramGenerationInput = {
  regenerate?: boolean;
  anchorDate?: string;
};

function toErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('error' in body)) {
    return null;
  }

  const error = (body as { error?: unknown }).error;
  return typeof error === 'string' && error.trim().length > 0 ? error : null;
}

export async function requestProgramGeneration(
  input: RequestProgramGenerationInput = {},
): Promise<ProgramGenerationResponse> {
  const response = await fetch('/api/program/generate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      regenerate: input.regenerate ?? false,
      ...(input.anchorDate ? { anchorDate: input.anchorDate } : {}),
    }),
  });

  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(toErrorMessage(body) ?? 'Program generation failed');
  }

  return body as ProgramGenerationResponse;
}
