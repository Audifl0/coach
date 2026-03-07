import assert from 'node:assert/strict';
import test from 'node:test';

import { createAuthRateLimiter } from '../../src/lib/auth/rate-limit';

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
  assert.equal(limiter.consumeSignupAttempt({ clientIp: '198.51.100.5' }).limited, false);

  const limitedAttempt = limiter.consumeSignupAttempt({ clientIp: '203.0.113.10' });

  assert.equal(limitedAttempt.limited, true);
  assert.equal(limitedAttempt.retryAfterSeconds, 60);
  assert.equal(limitedAttempt.count, 3);
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
