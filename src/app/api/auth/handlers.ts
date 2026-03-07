import { NextResponse } from 'next/server';

import { type AuthLogger, defaultAuthLogger } from '@/lib/auth/auth-logger';
import {
  AuthValidationError,
  GENERIC_AUTH_ERROR_MESSAGE,
  InvalidCredentialsError,
  SESSION_COOKIE_NAME,
  SignupConflictError,
  createAuthService,
  hashSessionToken,
} from '@/lib/auth/auth';
import { resolveClientIp } from '@/lib/auth/client-ip';
import { createAuthRateLimiter, type AuthRateLimiter } from '@/lib/auth/rate-limit';

type LoginService = Pick<ReturnType<typeof createAuthService>, 'login'>;
type SignupService = Pick<ReturnType<typeof createAuthService>, 'signup'>;
type RevokeSessionByHash = (sessionTokenHash: string) => Promise<boolean>;

type LoginHandlerDeps = {
  limiter?: AuthRateLimiter;
  logger?: AuthLogger;
  resolveClientIp?: (headers: Pick<Headers, 'get'>) => string;
  repeatedFailureLogThreshold?: number;
};

type SignupHandlerDeps = {
  limiter?: AuthRateLimiter;
  logger?: AuthLogger;
  resolveClientIp?: (headers: Pick<Headers, 'get'>) => string;
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

function readSessionTokenFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const [name, ...rest] = pair.trim().split('=');
    if (name !== SESSION_COOKIE_NAME) {
      continue;
    }

    const value = rest.join('=').trim();
    if (value.length > 0) {
      return value;
    }
  }

  return null;
}

function buildLogoutResponse() {
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
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

export function createLogoutHandler(revokeSessionByTokenHash: RevokeSessionByHash) {
  return async function logoutRouteHandler(request: Request): Promise<Response> {
    const sessionToken = readSessionTokenFromCookie(request.headers.get('cookie'));

    if (!sessionToken) {
      return buildLogoutResponse();
    }

    const sessionTokenHash = hashSessionToken(sessionToken);
    await revokeSessionByTokenHash(sessionTokenHash);

    return buildLogoutResponse();
  };
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
