# Authentication Recovery Runbook

## Purpose

Restore account access when a user forgets their password.
This phase supports manual admin resets from the server only.

## Scope

- Supported: username and password reset by server operator.
- Supported: forced revocation of all active sessions for the target account.
- Not supported in phase 1: email self-service reset links.

## Prerequisites

- Shell access to the application host.
- Environment configured for Prisma database access.
- Operator knows the target username.

## Reset Steps

1. Open a shell in the project root.
2. Run `corepack pnpm tsx scripts/admin-reset-password.ts`.
3. Enter the target username.
4. Enter the new password.
5. Confirm by typing `RESET <username>` when prompted.
6. Verify the command prints the generic completion message.

## Expected Result

- Password hash is rotated for the target account.
- Existing active sessions are revoked for that account.
- User must log in again with the new password.

## Security Notes

- Do not paste plaintext passwords into logs, tickets, or chat.
- The command returns a generic completion message to avoid username enumeration.
- Treat reset operations as privileged actions and run only from trusted admin access.
