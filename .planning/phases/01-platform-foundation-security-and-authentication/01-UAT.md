---
status: testing
phase: 01-platform-foundation-security-and-authentication
source:
  - 01-01-SUMMARY.md
  - 01-02-SUMMARY.md
  - 01-03-SUMMARY.md
  - 01-04-SUMMARY.md
  - 01-05-SUMMARY.md
  - 01-06-SUMMARY.md
  - 01-07-SUMMARY.md
started: 2026-03-04T11:43:26Z
updated: 2026-03-04T11:43:26Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Signup flow to dashboard
expected: |
  From /signup, submitting a new username+password creates the account and lands on /dashboard as an authenticated user.
awaiting: user response

## Tests

### 1. Signup flow to dashboard
expected: From /signup, submitting a new username+password creates the account and lands on /dashboard as an authenticated user.
result: pending

### 2. Login failure is generic
expected: Logging in with a wrong password shows a generic invalid-credentials message and does not reveal whether the username exists.
result: pending

### 3. Login persistence
expected: After successful login, refreshing or revisiting keeps the user authenticated and on dashboard without re-login.
result: pending

### 4. Anonymous dashboard redirect with next
expected: Visiting /dashboard while not authenticated redirects to /login?next=/dashboard.
result: pending

### 5. Current-session logout behavior
expected: Clicking logout from dashboard signs out the current session, clears local auth cookie, and blocks immediate dashboard re-entry until login.
result: pending

### 6. Concurrent session isolation on logout
expected: If two sessions are active, logging out in one session does not invalidate the other still-active session.
result: pending

### 7. Revoked or stale session denied
expected: A revoked/stale session cannot access dashboard; access is redirected to login even if a cookie value is present.
result: pending

### 8. Admin reset recovery
expected: After admin password reset, old password no longer works and login with the new password succeeds.
result: pending

### 9. VPS HTTPS and ops scripts
expected: On target VPS/domain, deploy + HTTPS smoke test succeeds and backup/restore scripts execute successfully with documented workflow.
result: pending

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0

## Gaps

none
