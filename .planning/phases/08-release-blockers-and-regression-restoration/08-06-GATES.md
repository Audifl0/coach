---
phase: 08-release-blockers-and-regression-restoration
plan: 08-06
verified_on: 2026-03-07
---

# 08-06 Release Gates

## Commands

- `corepack pnpm build`
- `corepack pnpm typecheck`
- `corepack pnpm test`

## Result

- Build: pass
- Typecheck: pass
- Test: pass

## Notes

- Next.js still emits the middleware-to-proxy deprecation warning during build.
- The warning does not block the release gates for this gap-closure plan.
