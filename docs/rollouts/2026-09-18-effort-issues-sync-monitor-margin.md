# 2026-09-18 - effort-issues-sync-monitor-margin

## Context & Objective

Sentry issue **FLEET-INFRA-CD** (`https://jays-services.sentry.io/issues/7708936176/`)
regressed again at 2026-09-18T05:56Z as `Cron failure: ci-autorotate-effort-issues-sync` /
`A missed check-in was detected`.  The daily effort-board mirror is healthy.
GitHub's `schedule` trigger for `.github/workflows/effort-issues-sync.yml` is
delivered hours late, so the 15-minute Crons margin is structurally guaranteed
to page every day.  Goal: stop that false page without changing the sync
cron, the sync script, or Coolify.

## Changes Made

Widened the Sentry Crons `checkin_margin` for workflow `Effort Issues Sync`
from 15 minutes to 600 minutes (10h), via a new per-workflow
`CHECKIN_MARGIN_OVERRIDES` map in `scripts/sentry-ci-report.py`.  Every other
monitor keeps the 15-minute default.  The workflow crontab (`41 5 * * *`) and
`scripts/sync-effort-issues.py` are unchanged.

Evidence:

- Monitor `ci-autorotate-effort-issues-sync` (`c429651c-5c02-49e4-86e4-4c80a66b2a14`):
  crontab `41 5 * * *`, `checkin_margin` 15, `max_runtime` 60.  16 missed
  events since 2026-09-03.  0 users.  Seer actionability super_low.  Every
  day misses at 05:56Z and auto-resolves when the late OK lands
  (~09:20-10:57Z).
- Scheduled Actions runs (`gh run list --workflow effort-issues-sync.yml`)
  all start late, then finish in ~12s on `ubuntu-latest`: 2026-09-17 10:24Z,
  09-16 10:16Z, 09-15 10:25Z, 09-14 10:57Z, 09-13 10:36Z (typical delay
  3.6-5.3h).  Worst in the retained window: 2026-09-14 10:57Z (~5h 16m after
  the 05:41Z slot).  All retained scheduled runs are `success`.
- Reporter is `workflow_run` `completed` + schedule-only.  No `in_progress`.
  `in_progress` cannot cover this: GitHub has not created the run yet at
  05:56Z.  Do not add a second in_progress path from this issue.
- Last OK 2026-09-17T10:24:58Z matches reporter run `35210345046` after
  scheduled sync `35210323486` (12s success).  No 2026-09-18 schedule run
  existed at the 05:56Z miss.

Files touched:

- `scripts/sentry-ci-report.py` — `CHECKIN_MARGIN_OVERRIDES["Effort Issues Sync"] = 600`
- `scripts/sentry-ci-report-margins_test.py` — AST parse of the override + cron
- `STATUS.md` / `docs/EFFORT-LOG.md` — handoff rows
- `docs/rollouts/2026-09-18-effort-issues-sync-monitor-margin.md` — this note

## Decisions & Trade-offs

600 minutes matches Socratic.Trade #3194 / #3387 / #3389 and sits above the
measured 5h 16m worst delay while still paging ~15:41Z if the daily sync
never starts.  Effort-board mirroring is not RTH-critical; a 4-5h GitHub
delay still lands the same day.

Do not copy this onto 30-min macos iOS-ship crons (FLEET-INFRA-CC / DA / CX).
Those drop most ticks; a 100-105 minute margin already failed.

Deliberately NOT `"Fixes FLEET-INFRA-CD"`: the live monitor already uses
slug `ci-autorotate-effort-issues-sync`, but the 600-minute config only
upserts on the next scheduled check-in.  Resolve CD after that monitor
lands `ok` under the 600-minute config.  Tomorrow 05:56Z will still miss
if this merges today, until ~10:xx upserts the new margin.

Out of scope: changing `effort-issues-sync.yml`, the sync script, adding
`in_progress`, and dispatching this workflow.

## Verification State

```
python3 -m py_compile scripts/sentry-ci-report.py   # clean
python3 scripts/sentry-ci-report-margins_test.py
# MARGIN_PARSE_OK {'Effort Issues Sync': 600}
# EFFORT_SYNC_CRON_OK 41 5 * * *
```

Did not run web/apple/android CI locally on this seat.  Hosted `CI` is the
product gate and is unchanged by a reporter-only edit.  Did not
`workflow_dispatch` `effort-issues-sync.yml`.  Did not PUT the Sentry
monitor by hand; the next scheduled check-in upserts the new margin.

## Next Steps & Blockers

1. Merge this PR.  Do not dispatch the sync to "verify".
2. Wait for the next scheduled run (GitHub typically ~09:20-10:57Z).
   Confirm monitor `ci-autorotate-effort-issues-sync` upserts
   `checkin_margin: 600` and lands `ok`.
3. Ignore/resolve FLEET-INFRA-CD after that OK.  Do not rematch it with
   a second margin PR.
4. If a 05:41Z slot has no Actions run by ~15:41Z the same day, treat that
   as a real silent sync and page.

Blockers: none.  Reporter-only.  Extra-ship no (`testflight.yml` is
`workflow_dispatch` only).  No Coolify.

## Zero-Code Findings

The sync script and board mirror were not the failure mode.  This is
GitHub schedule delivery vs a 15-minute Crons margin, the same class
Socratic.Trade #3194 already fixed for `Deploy freshness`.
