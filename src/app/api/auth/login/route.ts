import { NextResponse } from 'next/server';

import { type AuthLogger, defaultAuthLogger } from '@/lib/auth/auth-logger';
import {
  AuthValidationError,
  GENERIC_AUTH_ERROR_MESSAGE,
  InvalidCredentialsError,
  createAuthService,
} from '@/lib/auth/auth';
import { resolveClientIp } from '@/lib/auth/client-ip';
import { createAuthRateLimiter, type AuthRateLimiter, defaultAuthRateLimiter } from '@/lib/auth/rate-limit';

type LoginService = Pick<ReturnType<typeof createAuthService>, 'login'>;

type LoginHandlerDeps = {
  limiter?: AuthRateLimiter;
  logger?: AuthLogger;
  resolveClientIp?: (headers: Pick<Headers, 'get'>) => string;
  repeatedFailureLogThreshold?: number;
};

const DEFAULT_REPEATED_FAILURE_LOG_THRESHOLD = 3;

function extractUsername(payload: unknown): string | null {
  if (
    typeof payload !== 'object'
    || payload === null
    || !('username' in payload)
    || typeof payload.username !== 'string'
  ) {
    return null;
  }

  const normalized = payload.username.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

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

export function createLoginHandler(authService: LoginService, deps: LoginHandlerDeps = {}) {
  const limiter = deps.limiter ?? createAuthRateLimiter();
  const logger = deps.logger ?? defaultAuthLogger;
  const resolveRequestClientIp = deps.resolveClientIp ?? resolveClientIp;
  const repeatedFailureLogThreshold =
    deps.repeatedFailureLogThreshold ?? DEFAULT_REPEATED_FAILURE_LOG_THRESHOLD;

  return async function loginRouteHandler(request: Request): Promise<Response> {
    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    const clientIp = resolveRequestClientIp(request.headers);
    const username = extractUsername(payload);

    if (username) {
      const limit = limiter.checkLoginLimit({ username, clientIp });
      if (limit.limited && limit.retryAfterSeconds !== null) {
        logger.logThrottle({
          route: 'login',
          clientIp,
          retryAfterSeconds: limit.retryAfterSeconds,
          username,
        });
        return createThrottleResponse(limit.retryAfterSeconds);
      }
    }

    try {
      const login = await authService.login(payload);
      if (username) {
        limiter.resetLoginFailures({ username, clientIp });
      }

      const response = NextResponse.json(
        { userId: login.userId, username: login.username },
        { status: 200 },
      );

      response.cookies.set({
        name: login.cookie.name,
        value: login.cookie.token,
        path: login.cookie.path,
        httpOnly: login.cookie.httpOnly,
        secure: login.cookie.secure,
        sameSite: login.cookie.sameSite,
        expires: login.cookie.expires,
        maxAge: login.cookie.maxAge,
      });

      return response;
    } catch (error) {
      if (error instanceof AuthValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      if (error instanceof InvalidCredentialsError) {
        if (username) {
          const failure = limiter.recordLoginFailure({ username, clientIp });
          if (failure.count >= repeatedFailureLogThreshold) {
            logger.logFailure({
              route: 'login',
              clientIp,
              username,
              failureCount: failure.count,
              limited: failure.limited,
            });
          }
        }

        return NextResponse.json({ error: GENERIC_AUTH_ERROR_MESSAGE }, { status: 401 });
      }

      return NextResponse.json({ error: 'Unable to sign in' }, { status: 500 });
    }
  };
}

const runtimeLoginLimiter = defaultAuthRateLimiter;
const runtimeLoginLogger = defaultAuthLogger;

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
  return createLoginHandler(auth, {
    limiter: runtimeLoginLimiter,
    logger: runtimeLoginLogger,
    resolveClientIp,
  })(request);
}
