import { NextResponse } from 'next/server';

import { type AuthLogger, defaultAuthLogger } from '@/lib/auth/auth-logger';
import { AuthValidationError, SignupConflictError, createAuthService } from '@/lib/auth/auth';
import { resolveClientIp } from '@/lib/auth/client-ip';
import { createAuthRateLimiter, type AuthRateLimiter, defaultAuthRateLimiter } from '@/lib/auth/rate-limit';

type SignupService = Pick<ReturnType<typeof createAuthService>, 'signup'>;

type SignupHandlerDeps = {
  limiter?: AuthRateLimiter;
  logger?: AuthLogger;
  resolveClientIp?: (headers: Pick<Headers, 'get'>) => string;
};

function createThrottleResponse(retryAfterSeconds: number): Response {
  return NextResponse.json(
    { error: 'Too many attempts. Please try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
      },
    },
  );
}

export function createSignupHandler(authService: SignupService, deps: SignupHandlerDeps = {}) {
  const limiter = deps.limiter ?? createAuthRateLimiter();
  const logger = deps.logger ?? defaultAuthLogger;
  const resolveRequestClientIp = deps.resolveClientIp ?? resolveClientIp;

  return async function signupRouteHandler(request: Request): Promise<Response> {
    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    const clientIp = resolveRequestClientIp(request.headers);
    const limit = limiter.consumeSignupAttempt({ clientIp });
    if (limit.limited && limit.retryAfterSeconds !== null) {
      logger.logThrottle({
        route: 'signup',
        clientIp,
        retryAfterSeconds: limit.retryAfterSeconds,
      });
      return createThrottleResponse(limit.retryAfterSeconds);
    }

    try {
      const signup = await authService.signup(payload);
      return NextResponse.json(
        { id: signup.id, username: signup.username },
        { status: 201 },
      );
    } catch (error) {
      if (error instanceof AuthValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      if (error instanceof SignupConflictError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }

      return NextResponse.json({ error: 'Unable to create account' }, { status: 500 });
    }
  };
}

const runtimeSignupLimiter = defaultAuthRateLimiter;
const runtimeSignupLogger = defaultAuthLogger;

async function buildDefaultAuthService() {
  const { prisma } = await import('@/lib/db/prisma');
  return createAuthService({
    findUserByUsername(username) {
      return prisma.user.findUnique({ where: { username } });
    },
    createUser(input) {
      return prisma.user.create({
        data: {
          username: input.username,
          passwordHash: input.passwordHash,
        },
      });
    },
    createSession(input) {
      return prisma.session.create({
        data: {
          userId: input.userId,
          sessionTokenHash: input.sessionTokenHash,
          expiresAt: input.expiresAt,
        },
      });
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  const auth = await buildDefaultAuthService();
  return createSignupHandler(auth, {
    limiter: runtimeSignupLimiter,
    logger: runtimeSignupLogger,
    resolveClientIp,
  })(request);
}
