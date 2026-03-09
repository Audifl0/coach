export type AuthenticatedDashboardSmokeOptions = {
  baseUrl: string;
  username: string;
  password: string;
  expectedFocusLabel: string;
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  log?: (message: string) => void;
};

export function runAuthenticatedDashboardSmoke(
  options: AuthenticatedDashboardSmokeOptions,
): Promise<void>;
