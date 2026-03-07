import { z } from 'zod';

type OpsEnvInput = Readonly<Record<string, string | undefined>>;

const DEFAULT_RESTORE_DRILL_BASE_URL = 'http://127.0.0.1:3000';

const hostnameSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => /^[a-z0-9.-]+$/i.test(value) && !value.startsWith('.') && !value.endsWith('.'),
    'APP_DOMAIN must be a bare hostname without protocol or path',
  );

const httpUrlSchema = z
  .string()
  .trim()
  .url()
  .refine(
    (value) => value.startsWith('http://') || value.startsWith('https://'),
    'RESTORE_DRILL_BASE_URL must use http:// or https://',
  );

const opsRuntimeSchema = z
  .object({
    APP_DOMAIN: hostnameSchema,
    POSTGRES_DB: z.string().trim().min(1),
    RESTORE_TARGET_DB: z.string().trim().min(1),
    RESTORE_DRILL_BASE_URL: httpUrlSchema.default(DEFAULT_RESTORE_DRILL_BASE_URL),
    OPS_SMOKE_USERNAME: z.string().trim().min(1),
    OPS_SMOKE_PASSWORD: z.string().min(1),
    OPS_SMOKE_EXPECTED_FOCUS_LABEL: z.string().trim().min(1),
  })
  .superRefine((value, ctx) => {
    if (value.RESTORE_TARGET_DB === value.POSTGRES_DB) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESTORE_TARGET_DB'],
        message: 'RESTORE_TARGET_DB must differ from POSTGRES_DB',
      });
    }
  });

export type OpsRuntimeConfig = {
  appDomain: string;
  deployBaseUrl: string;
  productionDatabaseName: string;
  restore: {
    targetDatabaseName: string;
    baseUrl: string;
  };
  smoke: {
    username: string;
    password: string;
    expectedFocusLabel: string;
  };
};

export { DEFAULT_RESTORE_DRILL_BASE_URL };

export function parseOpsRuntimeConfig(env: OpsEnvInput = process.env): OpsRuntimeConfig {
  const parsed = opsRuntimeSchema.parse(env);

  return {
    appDomain: parsed.APP_DOMAIN,
    deployBaseUrl: `https://${parsed.APP_DOMAIN}`,
    productionDatabaseName: parsed.POSTGRES_DB,
    restore: {
      targetDatabaseName: parsed.RESTORE_TARGET_DB,
      baseUrl: parsed.RESTORE_DRILL_BASE_URL,
    },
    smoke: {
      username: parsed.OPS_SMOKE_USERNAME,
      password: parsed.OPS_SMOKE_PASSWORD,
      expectedFocusLabel: parsed.OPS_SMOKE_EXPECTED_FOCUS_LABEL,
    },
  };
}
