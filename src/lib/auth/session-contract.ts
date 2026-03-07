export const SESSION_COOKIE_NAME = 'coach_session';
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_DURATION_MS / 1000);
export const SESSION_ROLLING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
