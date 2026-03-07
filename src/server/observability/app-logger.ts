import pino from 'pino';

export type RouteFailureLogRecord = {
  event: 'route_failure';
  route: string;
  method: string;
  status: number;
  source: 'route_handler' | 'route_module';
  errorName: string;
};

export type DegradedPathLogRecord = {
  event: 'degraded_path';
  route: string;
  boundary: 'program_today' | 'program_trends';
  reason: 'load_failed';
};

export type AppLogRecord = RouteFailureLogRecord | DegradedPathLogRecord;

type AppLogLevel = 'error' | 'warn';
type AppLogWriter = (level: AppLogLevel, record: AppLogRecord) => void;

type RouteFailureInput = Omit<RouteFailureLogRecord, 'event' | 'errorName'> & {
  error: unknown;
};

type DegradedPathInput = Omit<DegradedPathLogRecord, 'event'>;

const baseLogger = pino({
  name: 'coach-app',
  level: process.env.APP_LOG_LEVEL ?? 'info',
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

function defaultWrite(level: AppLogLevel, record: AppLogRecord): void {
  baseLogger[level](record);
}

function getErrorName(error: unknown): string {
  if (error instanceof Error && error.name.trim().length > 0) {
    return error.name;
  }

  return 'UnknownError';
}

function createRouteFailureRecord(input: RouteFailureInput): RouteFailureLogRecord {
  return {
    event: 'route_failure',
    route: input.route,
    method: input.method,
    status: input.status,
    source: input.source,
    errorName: getErrorName(input.error),
  };
}

function createDegradedPathRecord(input: DegradedPathInput): DegradedPathLogRecord {
  return {
    event: 'degraded_path',
    route: input.route,
    boundary: input.boundary,
    reason: input.reason,
  };
}

export function createAppLogger(write: AppLogWriter = defaultWrite) {
  return {
    logRouteFailure(input: RouteFailureInput): void {
      write('error', createRouteFailureRecord(input));
    },

    logDegradedPath(input: DegradedPathInput): void {
      write('warn', createDegradedPathRecord(input));
    },
  };
}

export type AppLogger = ReturnType<typeof createAppLogger>;

export const appLogger = createAppLogger();

export function logRouteFailure(input: RouteFailureInput, logger: AppLogger = appLogger): void {
  logger.logRouteFailure(input);
}

export function logDegradedPath(input: DegradedPathInput, logger: AppLogger = appLogger): void {
  logger.logDegradedPath(input);
}
