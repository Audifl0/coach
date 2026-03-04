import { sessionContextSchema, type SessionContext } from '../../lib/auth/contracts';

export type AccountScope = {
  userId: string;
};

export function requireAccountScope(session: SessionContext | null | undefined): AccountScope {
  const parsed = sessionContextSchema.safeParse(session);

  if (!parsed.success) {
    throw new Error('Authenticated session context is required for account-scoped data access');
  }

  return {
    userId: parsed.data.userId,
  };
}
