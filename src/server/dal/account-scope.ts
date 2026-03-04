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

export function assertAccountOwnership(scope: AccountScope, ownerUserId: string): void {
  if (!ownerUserId || scope.userId !== ownerUserId) {
    throw new Error('Mismatched account context for protected data access');
  }
}

type AccountOwnedWhere = {
  userId?: string;
  [key: string]: unknown;
};

export function buildAccountScopedWhere<TWhere extends AccountOwnedWhere>(
  scope: AccountScope,
  where?: TWhere,
): TWhere & { userId: string } {
  if (where?.userId && where.userId !== scope.userId) {
    throw new Error('Mismatched account context for protected data access');
  }

  return {
    ...(where ?? ({} as TWhere)),
    userId: scope.userId,
  };
}
