---
phase: 08-release-blockers-and-regression-restoration
plan: 08-06
recorded_on: 2026-03-07
---

# 08-06 Build Crash Diagnosis

## Reproduction

- `corepack pnpm build`
  - Compiles successfully.
  - Reaches `Generating static pages using 15 workers (0/17) ...`
  - Exits with `Next.js build worker exited with code: 1 and signal: null`.
- `corepack pnpm next build --webpack`
  - Compiles successfully.
  - Reaches static-generation stage after TypeScript.
  - Exits with `Next.js build worker exited with code: 1 and signal: null`.

## Isolated Seam

The failing seam is bounded to two issues that intersect during static generation:

1. `next.config.ts` does not pin the project root, so Next.js infers `/home/flo` from an unrelated lockfile and warns that workspace-root detection may be wrong.
2. `src/app/(private)/dashboard/page.tsx` still performs same-origin authenticated self-fetches to:
   - `/api/program/today`
   - `/api/program/trends?period=30d`

## Why This Is the Minimal Fix Surface

- The build failure happens after compile and typecheck, which rules out syntax and type errors.
- The dashboard page is the only server page still doing server-side same-origin HTTP fetches for authenticated dashboard preload data.
- Phase 07 audit material already identified dashboard SSR internal fetches as a risky runtime/build seam.

## Patch Direction

- Pin the Next.js workspace/build root to `/home/flo/projects/coach`.
- Keep the route contracts intact, but load dashboard today/trends data through stable server-side boundaries instead of HTTP self-fetches during render.
