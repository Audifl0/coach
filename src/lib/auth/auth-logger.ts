export type AuthFailureLogRecord = {
  event: 'auth_failure';
  route: 'login';
  clientIp: string;
  username: string;
  failureCount: number;
  limited: boolean;
};

export type AuthThrottleLogRecord = {
  event: 'auth_throttle';
  route: 'login' | 'signup';
  clientIp: string;
  retryAfterSeconds: number;
  username?: string;
};

export type AuthLogRecord = AuthFailureLogRecord | AuthThrottleLogRecord;

type AuthLogWriter = (record: AuthLogRecord) => void;

function defaultWrite(record: AuthLogRecord): void {
  console.warn(JSON.stringify(record));
}

export function createAuthLogger(write: AuthLogWriter = defaultWrite) {
  return {
    logFailure(record: Omit<AuthFailureLogRecord, 'event'>): void {
      write({ event: 'auth_failure', ...record });
    },

    logThrottle(record: Omit<AuthThrottleLogRecord, 'event'>): void {
      write({ event: 'auth_throttle', ...record });
    },
  };
}

export type AuthLogger = ReturnType<typeof createAuthLogger>;

export const defaultAuthLogger = createAuthLogger();
