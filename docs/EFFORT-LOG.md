# Autorotate Effort Log — cross-agent board
Protocol: /Users/jay/apps/EFFORT-LOG-PROTOCOL.md (canonical). Live board: this file
(mirror: docs/EFFORT-LOG.md in the repo). As of 2026-08-25.

**Product name is Autorotate.**  Canonical domain is `https://autorotate.codes`.  GitHub may stay `jaywedgeworth22/TopSpin`.  Apple IDs `codes.autorotate` / `codes.autorotate.macos`.

> ⚠️ **AGENT AVAILABILITY NOTICE (2026-08-21):** KIMI is **RETIRED / UNAVAILABLE** long-term (owner directive). All agents MUST NOT assign work or wait on KIMI in-flight work. Reassign any open KIMI effort board lanes or GitHub issues to active seats (AG, GROK, CLAUDE, MONET, etc.).

## In Progress
- **2026-09-16 - CLAUDE - IN_PROGRESS - Establish real release process: keystore + GitHub Releases workflow (audit follow-up AR-33/13).** PR #213 (`claude/android-release-process`, merged) lands the android-release workflow job (signed APK on `v*` tag, skips cleanly with no secrets configured) + `android/RELEASE.md`. Seer flagged a CRITICAL bug in review (`storeFile` resolved with `file()` instead of `rootProject.file()`, so the keystore path would miss once secrets are actually configured) — fixed in the same PR (bcaa42b), thread resolved, merged. Stays In Progress: owner still needs to generate the upload keystore and add the 4 GitHub secrets — see RELEASE.md and board `a9d2c89b`. <!-- wb-agent-report:a9d2c89bc060404aa66778a3c4dfd073 -->

## Planned / Reserved
(none)

## Deployed
- (none)

## Completed
- **2026-09-16 - CLAUDE - COMPLETED - Encrypt target configJson at rest (Infisical clientSecret, webhook auth headers) — invariant-1 plaintext exposure.** PR #212 (`claude/encrypt-target-config-at-rest`, merged): new `targets.configEnc` (AES-256-GCM, same pattern as `connectors.configEnc`) + `readTargetConfig()` accessor + idempotent backfill script `db/migrate-target-config-encryption.ts` (`npm run db:migrate-target-encryption`, run once per environment post-deploy). Same PR also fixed the missing `permissions:` block on `auto-update-prs.yml` (Sentry FLEET-INFRA-C5, root cause 1 of 2). Board `b052d650` marked completed. <!-- wb-agent-report:b052d650a60c4451a316fe17f7c70a9f -->
- **2026-09-16 - CLAUDE - COMPLETED - Fix Auto Update PRs CI, root cause 2 of 2 (Sentry FLEET-INFRA-C5).** The `permissions:` fix (PR #212) landed but the very next run still failed: `.github/workflows/auto-update-prs.yml` was pinned to `chinthakagodawita/autoupdate@v1.22.0`, which was never a real release of that action (latest real tag is `v1.7.0`) — Actions couldn't even resolve it. PR #214 (`claude/fix-autoupdate-action-version`, auto-merge armed) pins to `v1.7.0`.
- **2026-09-13 — AG — COMPLETED/MERGED #189 — Make Sentry bug reporter subtle (autoInject false + footer/nav trigger) (board `87c80482`, branch `ag/sentry-subtle-feedback`).**  Set `autoInject: false` in `apps/web/src/lib/sentry.ts` to eliminate floating action button.  Exported `openSentryFeedback()` helper and wired subtle links into AppShell sidebar and landing Footer.
- **2026-09-15 — AG — COMPLETED/MERGED #192 — GitHub Actions CI/CD for TestFlight Publish.**  Set up `.github/workflows/testflight.yml` to securely codesign and publish the macOS and iOS apps to TestFlight via GitHub runners.  Configured repo secrets.  Triggered workflow dispatch.
- **2026-09-15 - AG - COMPLETED - Verified owner dashboard items: branch protection on `main`, Infisical project for prod secrets, App Store Connect records before TestFlight, and `SENTRY_FLEET_DSN` then sentry-ci-report are all established.**
- **2026-09-08 — GROK — COMPLETED/MERGED #162 — Sentry macOS/web DSN split (board `f479c056`, branch `grok/sentry-macos-web-dsn-split`, worktree `~/apps/autorotate-grok-sentry-macos`).**  Mirror ContactLogo PR #67. Mac Sentry Cocoa; Infisical `SENTRY_DSN_MACOS` injects into Mac `SENTRY_DSN`. iOS unchanged.
- **2026-09-04 — GROK — COMPLETED/MERGED #148 — Sentry max-features:** Web Feedback, iOS Error Replay, Android Native.
- **2026-09-01 — GROK — COMPLETED/MERGED #143 — Android official Sentry SDK (crash+ANR, no PII/request bodies) (board 1fe88b1d, worktree `~/apps/autorotate-grok-sentry-android` @ `grok/sentry-android`).**  Owner un-deferred Android.  Secrets app: `RequestSize.NONE`, no screenshots/view hierarchy.
- **2026-09-01 — GROK — COMPLETED/MERGED #141 — Add fleet sentry-ci-report.yml + scripts/sentry-ci-report.py (branch `grok/sentry-ci-report`, worktree `~/apps/autorotate-grok-sentry-ci`, board `a37932ef`).**  Gold copy UM PR #1394.  APP=`autorotate`.  Fingerprint `[ci-failure, autorotate, workflow]`.  <!-- wb-agent-report:a37932ef -->
- **2026-09-01 — GROK — COMPLETED/MERGED #134 — Web Sentry SDK + rotation cron/metrics (board 12ccfa7e, PR #134, worktree `~/apps/autorotate-grok-sentry-adopt` @ `grok/sentry-fleet-adoption`).**  `@sentry/react` client (DSN-gated, sendDefaultPii false, replay 100% error / 0% session, no feedback widget) plus `@sentry/node` for scheduler cron + `rotation.success`/`rotation.fail`.  Android Sentry is iOS-only until Android ships.
- **COMPLETED/MERGED #178 — Dependabot leftover radix/react PRs** — CURSOR · after #16. Remaining npm PRs blocked on serial lockfile rebase. Auto-merge not enabled on the repo. PR #17 (`fix/no-target-commit`) is another seat — do not touch.
- **COMPLETED — Owner: Developer portal App IDs for Autorotate (Already Registered)** — leftover after Grok #50 closed as duplicate of AG #48.  https://autorotate.codes.  Do not reopen or merge #50.  `com.jay.shellular` stays disabled.
- **2026-08-27 — CLAUDE — COMPLETED — Full-field security & quality audit remediation (AR-01..AR-35).**  Reviewed all five surfaces (web front/back, AutorotateCore, iOS, macOS, Android) against the zero-plaintext / hash-chained-audit / capability-matrix invariants; documented 35 findings in `docs/AUDIT-2026-08-26.md` (PR #76) and remediated every one across eight merged PRs (#87, #86, #90, #91, #94, #89, #93, #95).  #93 passed two independent adversarial-review rounds.  Four items deferred to owner decisions.  Tracking mirrored to GitHub issues (epic + per-finding) and THE BOARD (finding `945db49c`, completed).
- **2026-08-26 — ANTIGRAVITY — COMPLETED — Add Vercel free feature optimizations (branch `antigravity/vercel-optimizations`).**  Created `apps/web/vercel.json` with Vite framework preset, 1-year immutable cache headers, strict security headers, clean URLs, and trailing slash normalization.
- **Inline navigation bar title display mode across iOS views** — AG · COMPLETED 2026-08-25.  Applied .navigationBarTitleDisplayMode(.inline) to all NavigationStack root and detail views so centered compact title stays pinned during scroll.
- **2026-08-25 — CURSOR — COMPLETED — Pin AppUpdatePrompt.swift from ST fleet, drop knownAppleIds.**  PR #75, branch `cursor/app-update-prompt-pin-1b43`.
- **Site & App Triage, Security Fixes, Cross-Platform Master 3D Icons, and iOS/Android Release Builds** — AG · COMPLETED 2026-08-22.
- **2026-08-22 - CURSOR - COMPLETED - Autorotate Apple IDs codes.autorotate after autorotate.codes.**  <!-- wb-agent-report:56b8070663e7402b946796c1d86dea80 -->
- **Autorotate Rebrand (`Autorotate.codes`), Native Android Companion App & Apple Build Verification** — AG · COMPLETED 2026-08-22.
- **Web and iOS utility and power enhancements** — AG · PR #48 (`ag/utility-power-enhancements`). Swift tests 27/27, Vitest 16/16, TypeScript check + Vite/esbuild production builds passing.
- **iOS first-launch update prompt (fleet)** — CURSOR · COMPLETED/MERGED #36 squash `994cc73` 2026-08-21.
- **Fleet onboarding — join ai-fleet-coordinator as app `Autorotate` (TS).** KIMI bootstrap + CURSOR closeout 2026-08-21. App PR #16 merged (`c1f12a5`). Coordinator PR #57 already merged.
- **Merge Grok App Builder PWA with this monorepo** — GROK · merged as PR #38 (`900bd54`).
- **Apache-2.0 + Kimi dump backup + catalog fold-in** — CURSOR · PR #42.

## Changelog of this log
- 2026-09-18 — CURSOR: Brand-clarity sweep across web + Apple + Android + docs. Dropped the period-laden 'Autorotate.Codes' wordmark that survived the 2026-08-22 AG rebrand #63 (INFOPLIST_KEY_CFBundleDisplayName on iOS+macOS, both navigationTitles, Web Footer wordmark, Footer tagline, three Android screens, Android strings.xml domain, README/STATUS/AGENTS/docs/architecture canonical-domain refs, index.html og:description, both privacy pages' mailto). Domain ref normalizes to lowercase `autorotate.codes` everywhere user-visible. 'TopSpin' brand strings left intact only where they describe a historical event (this log row, docs/AUDIT-2026-08-26.md, `apple/Autorotate-macOS/KeychainInventory.swift`'s deliberate `com.topspin.*` migration namespaces, the engine.ts dry-run placeholder, and the GitHub-repo-name fact `jaywedgeworth22/TopSpin`). Board `b2aff3a7` claimed + In Progress, PR opened, auto-merge armed.
- 2026-09-16 — CLAUDE: Synced mirror with PRs #212 (configJson encryption, merged), #213 (Android release process, merged, Seer CRITICAL fix included), #214 (Auto Update PRs CI second root cause, auto-merge armed). Live board `/Users/jay/apps/AUTOROTATE-EFFORT-LOG.md` updated in the same pass.
- 2026-09-16 — AG: Fixed effort log structure (duplicate In Progress sections, misplaced rows). Moved TestFlight CI/CD (PR #192) and Sentry subtle feedback (PR #189) to Completed. Closed GH issues #190 and #194. PRODUCER board entries for already-closed PRs #32/#35 noted as resolved (those PRs were already closed 2026-09-01).
- 2026-09-01 — GROK — claimed web Sentry SDK + rotation cron/metrics (board 12ccfa7e).
- 2026-08-23 — GROK: claimed full internal rename (issue #59). Repo name already Autorotate.
- 2026-08-27 — CLAUDE remediated the full-field audit (AR-01..AR-35) across 8 merged PRs.
- 2026-08-25 — CURSOR reserved pin of fleet AppUpdatePrompt.swift into the iOS target.
- 2026-08-25 — AG added inline navigation bar title display mode across iOS views.
- 2026-08-22 — CURSOR closed Grok PR #50 as duplicate of AG #48.
- 2026-08-21 — AG implemented full power enhancements across Web, iOS, and AutorotateCore, opening PR #48.
- 2026-08-21 — CURSOR completed Apache-2.0 relicensing + Kimi/Secret Rotator backup + extra catalog fold-in (PR #42).
- 2026-08-21 — CURSOR closed fleet onboard (PR #16 + board closeout #21).
- 2026-08-20 — bootstrapped by onboard-new-app.sh; first rows added by KIMI during fleet onboarding.
