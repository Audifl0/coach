import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InvalidCredentialsError,
  SignupConflictError,
  type LoginResult,
} from '../../src/lib/auth/auth';
import { createAuthLogger, type AuthLogRecord } from '../../src/lib/auth/auth-logger';
import { createAuthRateLimiter } from '../../src/lib/auth/rate-limit';
import { createLoginHandler } from '../../src/app/api/auth/login/route';
import { createSignupHandler } from '../../src/app/api/auth/signup/route';

test('login throttling keys repeated failures by normalized username and client IP', () => {
  let now = 1_700_000_000_000;
  const limiter = createAuthRateLimiter({
    now: () => now,
    login: { maxFailures: 2, windowMs: 60_000 },
    signup: { maxAttempts: 3, windowMs: 60_000 },
  });

  limiter.recordLoginFailure({ username: ' Coach ', clientIp: '203.0.113.10' });

  assert.equal(
    limiter.checkLoginLimit({ username: 'coach', clientIp: '198.51.100.5' }).limited,
    false,
  );
  assert.equal(
    limiter.checkLoginLimit({ username: 'different-user', clientIp: '203.0.113.10' }).limited,
    false,
  );

  limiter.recordLoginFailure({ username: 'COACH', clientIp: '203.0.113.10' });

  const limitedAttempt = limiter.checkLoginLimit({
    username: 'coach',
    clientIp: '203.0.113.10',
  });

  assert.equal(limitedAttempt.limited, true);
  assert.equal(limitedAttempt.retryAfterSeconds, 60);

  now += 61_000;
  assert.equal(
    limiter.checkLoginLimit({ username: 'coach', clientIp: '203.0.113.10' }).limited,
    false,
  );
});

test('signup throttling keys repeated attempts by client IP', () => {
  const limiter = createAuthRateLimiter({
    now: () => 1_700_000_000_000,
    login: { maxFailures: 5, windowMs: 60_000 },
    signup: { maxAttempts: 2, windowMs: 60_000 },
  });

  assert.equal(limiter.consumeSignupAttempt({ clientIp: '203.0.113.10' }).limited, false);
  assert.equal(limiter.consumeSignupAttempt({ clientIp: '203.0.113.10' }).limited, false);

  const limitedAttempt = limiter.consumeSignupAttempt({ clientIp: '203.0.113.10' });

  assert.equal(limitedAttempt.limited, true);
  assert.equal(limitedAttempt.retryAfterSeconds, 60);
  assert.equal(limitedAttempt.count, 3);
  assert.equal(limiter.consumeSignupAttempt({ clientIp: '198.51.100.5' }).limited, false);
});

test('limit enforcement returns a retry window handlers can expose through Retry-After', () => {
  let now = 1_700_000_000_000;
  const limiter = createAuthRateLimiter({
    now: () => now,
    login: { maxFailures: 1, windowMs: 45_000 },
    signup: { maxAttempts: 2, windowMs: 60_000 },
  });

  limiter.recordLoginFailure({ username: 'coach', clientIp: '203.0.113.10' });

  const initialWindow = limiter.checkLoginLimit({ username: 'coach', clientIp: '203.0.113.10' });
  assert.equal(initialWindow.limited, true);
  assert.equal(initialWindow.retryAfterSeconds, 45);

  now += 20_000;
  const reducedWindow = limiter.checkLoginLimit({ username: 'coach', clientIp: '203.0.113.10' });
  assert.equal(reducedWindow.retryAfterSeconds, 25);

  now += 26_000;
  const expiredWindow = limiter.checkLoginLimit({ username: 'coach', clientIp: '203.0.113.10' });
  assert.equal(expiredWindow.limited, false);
  assert.equal(expiredWindow.retryAfterSeconds, null);
});

function createLoginRequest(password: string, clientIp = '203.0.113.10'): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'coach', password }),
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': clientIp,
    },
  });
}

function createSignupRequest(clientIp = '203.0.113.10'): Request {
  return new Request('http://localhost/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ username: 'coach', password: 'secret123' }),
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': clientIp,
    },
  });
}

function createSuccessfulLoginResult(): LoginResult {
  return {
    userId: 'user_1',
    username: 'coach',
    sessionId: 'session_1',
    cookie: {
      token: 'session-token',
      name: 'coach_session',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 2592000,
      expires: new Date('2026-03-08T10:00:00.000Z'),
    },
  };
}

function createBufferedLogger() {
  const records: AuthLogRecord[] = [];

  return {
    records,
    logger: createAuthLogger((record) => {
      records.push(record);
    }),
  };
}

test('repeated failed login attempts return 429 with Retry-After after the configured threshold', async () => {
  let calls = 0;
  const { logger } = createBufferedLogger();
  const limiter = createAuthRateLimiter({
    now: () => 1_700_000_000_000,
    login: { maxFailures: 2, windowMs: 60_000 },
    signup: { maxAttempts: 3, windowMs: 60_000 },
  });
  const handler = createLoginHandler(
    {
      async login() {
        calls += 1;
        throw new InvalidCredentialsError();
      },
    },
    {
      limiter,
      logger,
      repeatedFailureLogThreshold: 2,
    },
  );

  const firstResponse = await handler(createLoginRequest('wrong-1'));
  const secondResponse = await handler(createLoginRequest('wrong-2'));
  const throttledResponse = await handler(createLoginRequest('wrong-3'));

  assert.equal(firstResponse.status, 401);
  assert.equal(secondResponse.status, 401);
  assert.equal(throttledResponse.status, 429);
  assert.equal(throttledResponse.headers.get('retry-after'), '60');
  assert.equal(calls, 2);
});

test('repeated signup attempts return 429 after the configured threshold', async () => {
  let calls = 0;
  const { logger } = createBufferedLogger();
  const limiter = createAuthRateLimiter({
    now: () => 1_700_000_000_000,
    login: { maxFailures: 5, windowMs: 60_000 },
    signup: { maxAttempts: 1, windowMs: 60_000 },
  });
  const handler = createSignupHandler(
    {
      async signup() {
        calls += 1;
        return { id: `user_${calls}`, username: 'coach' };
      },
    },
    {
      limiter,
      logger,
    },
  );

  const firstResponse = await handler(createSignupRequest());
  const throttledResponse = await handler(createSignupRequest());

  assert.equal(firstResponse.status, 201);
  assert.equal(throttledResponse.status, 429);
  assert.equal(throttledResponse.headers.get('retry-after'), '60');
  assert.equal(calls, 1);
});

test('sub-threshold auth failures keep existing 401 and 409 behavior, and successful login clears the failure bucket', async () => {
  const { logger } = createBufferedLogger();
  const limiter = createAuthRateLimiter({
    now: () => 1_700_000_000_000,
    login: { maxFailures: 2, windowMs: 60_000 },
    signup: { maxAttempts: 3, windowMs: 60_000 },
  });

  const loginHandler = createLoginHandler(
    {
      async login(input: unknown) {
        const password = (input as { password: string }).password;
        if (password === 'secret123') {
          return createSuccessfulLoginResult();
        }

        throw new InvalidCredentialsError();
      },
    },
    {
      limiter,
      logger,
      repeatedFailureLogThreshold: 1,
    },
  );
  const signupHandler = createSignupHandler(
    {
      async signup() {
        throw new SignupConflictError();
      },
    },
    {
      limiter,
      logger,
    },
  );

  const loginFailure = await loginHandler(createLoginRequest('wrong-pass'));
  const signupConflict = await signupHandler(createSignupRequest());
  const loginSuccess = await loginHandler(createLoginRequest('secret123'));
  const loginAfterSuccess = await loginHandler(createLoginRequest('wrong-pass'));

  assert.equal(loginFailure.status, 401);
  assert.equal(signupConflict.status, 409);
  assert.equal(loginSuccess.status, 200);
  assert.equal(loginAfterSuccess.status, 401);
});

test('throttle events emit structured operator-visible log records', async () => {
  const { logger, records } = createBufferedLogger();
  const limiter = createAuthRateLimiter({
    now: () => 1_700_000_000_000,
    login: { maxFailures: 2, windowMs: 60_000 },
    signup: { maxAttempts: 1, windowMs: 60_000 },
  });
  const loginHandler = createLoginHandler(
    {
      async login() {
        throw new InvalidCredentialsError();
      },
    },
    {
      limiter,
      logger,
      repeatedFailureLogThreshold: 2,
    },
  );
  const signupHandler = createSignupHandler(
    {
      async signup() {
        return { id: 'user_1', username: 'coach' };
      },
    },
    {
      limiter,
      logger,
    },
  );

  await loginHandler(createLoginRequest('wrong-1'));
  await loginHandler(createLoginRequest('wrong-2'));
  await loginHandler(createLoginRequest('wrong-3'));
  await signupHandler(createSignupRequest());
  await signupHandler(createSignupRequest());

  assert.deepEqual(records, [
    {
      event: 'auth_failure',
      route: 'login',
      clientIp: '203.0.113.10',
      username: 'coach',
      failureCount: 2,
      limited: true,
    },
    {
      event: 'auth_throttle',
      route: 'login',
      clientIp: '203.0.113.10',
      retryAfterSeconds: 60,
      username: 'coach',
    },
    {
      event: 'auth_throttle',
      route: 'signup',
      clientIp: '203.0.113.10',
      retryAfterSeconds: 60,
    },
  ]);
});
