export type AuthLimiterDecision = {
  limited: boolean;
  retryAfterMs: number | null;
  retryAfterSeconds: number | null;
  count: number;
};

type Clock = () => number;

type LoginLimitConfig = {
  maxFailures: number;
  windowMs: number;
};

type SignupLimitConfig = {
  maxAttempts: number;
  windowMs: number;
};

type AuthRateLimiterConfig = {
  now?: Clock;
  login?: LoginLimitConfig;
  signup?: SignupLimitConfig;
};

type Bucket = {
  count: number;
  resetAt: number;
};

export const DEFAULT_AUTH_RATE_LIMITS = {
  login: {
    maxFailures: 5,
    windowMs: 15 * 60 * 1000,
  },
  signup: {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000,
  },
} satisfies {
  login: LoginLimitConfig;
  signup: SignupLimitConfig;
};

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function buildLoginKey(username: string, clientIp: string): string {
  return `${normalizeUsername(username)}::${clientIp.trim() || 'unknown'}`;
}

function buildSignupKey(clientIp: string): string {
  return clientIp.trim() || 'unknown';
}

function buildDecision(count: number, retryAfterMs: number | null, limited: boolean): AuthLimiterDecision {
  return {
    limited,
    retryAfterMs,
    retryAfterSeconds: retryAfterMs === null ? null : Math.ceil(retryAfterMs / 1000),
    count,
  };
}

function getBucket(store: Map<string, Bucket>, key: string, now: number): Bucket | null {
  const bucket = store.get(key);
  if (!bucket) {
    return null;
  }

  if (bucket.resetAt <= now) {
    store.delete(key);
    return null;
  }

  return bucket;
}

function updateBucket(
  store: Map<string, Bucket>,
  key: string,
  windowMs: number,
  now: number,
): Bucket {
  const existing = getBucket(store, key, now);
  const nextBucket = existing
    ? {
        count: existing.count + 1,
        resetAt: existing.resetAt,
      }
    : {
        count: 1,
        resetAt: now + windowMs,
      };

  store.set(key, nextBucket);
  return nextBucket;
}

export function createAuthRateLimiter(config: AuthRateLimiterConfig = {}) {
  const now = config.now ?? Date.now;
  const loginConfig = config.login ?? DEFAULT_AUTH_RATE_LIMITS.login;
  const signupConfig = config.signup ?? DEFAULT_AUTH_RATE_LIMITS.signup;
  const loginFailures = new Map<string, Bucket>();
  const signupAttempts = new Map<string, Bucket>();

  return {
    checkLoginLimit(input: { username: string; clientIp: string }): AuthLimiterDecision {
      const currentTime = now();
      const bucket = getBucket(loginFailures, buildLoginKey(input.username, input.clientIp), currentTime);
      if (!bucket || bucket.count < loginConfig.maxFailures) {
        return buildDecision(bucket?.count ?? 0, null, false);
      }

      return buildDecision(bucket.count, bucket.resetAt - currentTime, true);
    },

    recordLoginFailure(input: { username: string; clientIp: string }): AuthLimiterDecision {
      const currentTime = now();
      const bucket = updateBucket(
        loginFailures,
        buildLoginKey(input.username, input.clientIp),
        loginConfig.windowMs,
        currentTime,
      );

      return buildDecision(
        bucket.count,
        bucket.count >= loginConfig.maxFailures ? bucket.resetAt - currentTime : null,
        bucket.count >= loginConfig.maxFailures,
      );
    },

    resetLoginFailures(input: { username: string; clientIp: string }): void {
      loginFailures.delete(buildLoginKey(input.username, input.clientIp));
    },

    consumeSignupAttempt(input: { clientIp: string }): AuthLimiterDecision {
      const currentTime = now();
      const bucket = updateBucket(
        signupAttempts,
        buildSignupKey(input.clientIp),
        signupConfig.windowMs,
        currentTime,
      );

      return buildDecision(
        bucket.count,
        bucket.count > signupConfig.maxAttempts ? bucket.resetAt - currentTime : null,
        bucket.count > signupConfig.maxAttempts,
      );
    },
  };
}

export type AuthRateLimiter = ReturnType<typeof createAuthRateLimiter>;
