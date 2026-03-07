import { parseProgramGenerateInput, type ProgramGenerateInput } from '@/lib/program/contracts';
import { ProgramGenerationError } from '@/server/services/program-generation';

export type ProgramGenerateRouteDeps = {
  resolveSession: () => Promise<{ userId: string } | null>;
  generatePlan: (userId: string, input: ProgramGenerateInput) => Promise<{
    startDate: string;
    endDate: string;
    sessions: unknown[];
  }>;
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

export function createProgramGeneratePostHandler(deps: ProgramGenerateRouteDeps) {
  return async function POST(request: Request): Promise<Response> {
    const session = await deps.resolveSession();
    if (!session) {
      return json({ error: 'Unauthorized' }, 401);
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Invalid request payload' }, 400);
    }

    let input: ProgramGenerateInput;
    try {
      input = parseProgramGenerateInput(payload);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid generate payload' }, 400);
    }

    try {
      const plan = await deps.generatePlan(session.userId, input);
      return json(
        {
          plan: {
            startDate: plan.startDate,
            endDate: plan.endDate,
          },
          sessions: plan.sessions,
        },
        200,
      );
    } catch (error) {
      if (error instanceof ProgramGenerationError) {
        return json({ error: error.message }, error.status);
      }

      return json({ error: error instanceof Error ? error.message : 'Program generation failed' }, 500);
    }
  };
}
