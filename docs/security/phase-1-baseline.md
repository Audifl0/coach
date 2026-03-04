# Phase 1 Security Baseline

## Baseline Controls

This project applies a pragmatic baseline for personal and close-circle usage.

### Transport Security

- Production access is expected over HTTPS only.
- Session cookies are configured `Secure` and `HttpOnly`.

### Password Storage

- Passwords are never stored in plaintext.
- Passwords are hashed with per-password random salt using Node `scrypt`.
- Minimum password length policy is enforced.

### Session Safety

- Session tokens are random and stored hashed in persistence.
- Cookies use `SameSite=Lax` and a long-lived max age (30 days target).
- Manual password reset revokes active sessions for the affected account.

### Account Isolation

- Protected DAL access requires authenticated session context.
- Missing account context fails closed.
- Mismatched account context is rejected.
- Account-scoped query filters are forced to the authenticated user.

## Boundaries for Phase 1

- No self-service email password recovery.
- No advanced brute-force monitoring or lockout analytics.
- No login history timeline in the user-facing product.

## Operational Expectation

Use the auth recovery runbook for manual resets:
`docs/operations/auth-recovery.md`.
