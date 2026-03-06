---
status: testing
phase: 06-trends-and-operational-reliability
source:
  - 06-01-SUMMARY.md
  - 06-02-SUMMARY.md
  - 06-03-SUMMARY.md
  - 06-04-SUMMARY.md
started: 2026-03-06T17:30:00Z
updated: 2026-03-06T17:30:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Dashboard trends summary appears with three KPI cards and horizon toggles
expected: |
  On the authenticated dashboard, a Trends section is visible.
  It shows exactly three summary cards for Volume, Intensity, and Adherence.
  It also exposes three horizon toggles: 7d, 30d, and 90d.
awaiting: user response

## Tests

### 1. Dashboard trends summary appears with three KPI cards and horizon toggles
expected: On the authenticated dashboard, a Trends section is visible with exactly three summary cards for Volume, Intensity, and Adherence, plus horizon toggles for 7d, 30d, and 90d.
result: pending

### 2. Horizon toggles update the displayed trend data and return cleanly to 30d
expected: Switching from 30d to 7d or 90d updates the visible KPI values or chart lines for that horizon, and switching back to 30d restores the true 30d data instead of leaving stale 7d or 90d values onscreen.
result: pending

### 3. Drilldown opens and shows separate reps and load charts for one exercise
expected: Opening the trends drilldown for an exercise shows a dedicated detail view with two distinct charts or series: one for reps evolution and one for load evolution, both aligned to the currently selected horizon.
result: pending

### 4. Restore drill runbook can be executed on VPS and produces evidence without targeting production
expected: Following the restore drill runbook on the VPS runs the drill against the dedicated restore target database, not the production database, and produces timestamped evidence logs for restore plus smoke checks.
result: pending

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0

## Gaps

none yet
