#!/usr/bin/env node

function normalizeBaseUrl(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    throw new Error('Authenticated smoke requires a base URL.');
  }

  const url = new URL(trimmed);
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function readRequiredEnv(name, env = process.env) {
  const value = env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required for authenticated smoke.`);
  }

  return value;
}

function createHeaders(headers) {
  return headers instanceof Headers ? headers : new Headers(headers ?? {});
}

export function extractSessionCookie(headers) {
  if (!headers) {
    throw new Error('Authenticated smoke login did not return headers.');
  }

  if (typeof headers.getSetCookie === 'function') {
    const cookies = headers.getSetCookie();
    const sessionCookie = cookies.find((value) => value.startsWith('coach_session='));
    if (sessionCookie) {
      return sessionCookie.split(';', 1)[0];
    }
  }

  const rawCookie = headers.get('set-cookie');
  if (!rawCookie) {
    throw new Error('Authenticated smoke login did not return the coach_session cookie.');
  }

  const sessionCookie = rawCookie
    .split(/,(?=[^;,]+=)/)
    .map((value) => value.trim())
    .find((value) => value.startsWith('coach_session='));

  if (!sessionCookie) {
    throw new Error('Authenticated smoke login did not return the coach_session cookie.');
  }

  return sessionCookie.split(';', 1)[0];
}

function buildCookieHeaders(sessionCookie) {
  return {
    cookie: sessionCookie,
  };
}

function readFocusLabels(payload) {
  const labels = [];
  const todayLabel = payload?.todaySession?.focusLabel;
  const nextLabel = payload?.nextSession?.focusLabel;

  if (typeof todayLabel === 'string' && todayLabel.trim().length > 0) {
    labels.push(todayLabel);
  }

  if (typeof nextLabel === 'string' && nextLabel.trim().length > 0) {
    labels.push(nextLabel);
  }

  return labels;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    throw new Error('Authenticated smoke expected JSON from /api/program/today.');
  }
}

export async function runAuthenticatedDashboardSmoke({
  baseUrl,
  username,
  password,
  expectedFocusLabel,
  fetchImpl = fetch,
  log = console.log,
}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  const loginResponse = await fetchImpl(`${normalizedBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!loginResponse.ok) {
    log(`smoke_login=failed http_status=${loginResponse.status}`);
    throw new Error(`Authenticated smoke login failed with HTTP ${loginResponse.status}.`);
  }

  const sessionCookie = extractSessionCookie(createHeaders(loginResponse.headers));
  log(`smoke_login=ok http_status=${loginResponse.status}`);

  const dashboardResponse = await fetchImpl(`${normalizedBaseUrl}/dashboard`, {
    headers: buildCookieHeaders(sessionCookie),
  });

  if (!dashboardResponse.ok) {
    log(`smoke_dashboard=failed http_status=${dashboardResponse.status}`);
    throw new Error(`Authenticated dashboard smoke failed with HTTP ${dashboardResponse.status}.`);
  }

  log(`smoke_dashboard=ok http_status=${dashboardResponse.status}`);

  const todayResponse = await fetchImpl(`${normalizedBaseUrl}/api/program/today`, {
    headers: buildCookieHeaders(sessionCookie),
  });

  if (!todayResponse.ok) {
    log(`smoke_business_data=failed http_status=${todayResponse.status}`);
    throw new Error(`Authenticated today smoke failed with HTTP ${todayResponse.status}.`);
  }

  const payload = await readJson(todayResponse);
  const focusLabels = readFocusLabels(payload);
  if (!focusLabels.includes(expectedFocusLabel)) {
    log(`smoke_business_data=failed expected_focus_label=${expectedFocusLabel}`);
    throw new Error(`Authenticated smoke did not find focus label "${expectedFocusLabel}".`);
  }

  log(`smoke_business_data=ok expected_focus_label=${expectedFocusLabel}`);
}

function resolveBaseUrl(argv, env = process.env) {
  const argvBaseUrl = argv[2];
  if (argvBaseUrl) {
    return argvBaseUrl;
  }

  if (env.RESTORE_DRILL_BASE_URL) {
    return env.RESTORE_DRILL_BASE_URL;
  }

  if (env.APP_DOMAIN) {
    return `https://${env.APP_DOMAIN}`;
  }

  throw new Error('Provide a base URL argument or set APP_DOMAIN / RESTORE_DRILL_BASE_URL.');
}

async function main() {
  const baseUrl = resolveBaseUrl(process.argv, process.env);

  await runAuthenticatedDashboardSmoke({
    baseUrl,
    username: readRequiredEnv('OPS_SMOKE_USERNAME'),
    password: readRequiredEnv('OPS_SMOKE_PASSWORD'),
    expectedFocusLabel: readRequiredEnv('OPS_SMOKE_EXPECTED_FOCUS_LABEL'),
  });
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
