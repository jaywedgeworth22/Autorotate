# Autorotate Effort Log — GitHub repo still `TopSpin`
Protocol: /Users/jay/apps/EFFORT-LOG-PROTOCOL.md (canonical). Live board: this file
(mirror: docs/EFFORT-LOG.md in the repo). As of 2026-08-25.

**Product name is Autorotate.**  Canonical domain is `https://autorotate.codes`.  GitHub may stay `jaywedgeworth22/TopSpin`.  Apple IDs `codes.autorotate` / `codes.autorotate.macos`.

> ⚠️ **AGENT AVAILABILITY NOTICE (2026-08-21):** KIMI is **RETIRED / UNAVAILABLE** long-term (owner directive). All agents MUST NOT assign work or wait on KIMI in-flight work. Reassign any open KIMI effort board lanes or GitHub issues to active seats (AG, GROK, CLAUDE, MONET, etc.).

## Deployed
- (none)

## Completed
- **Inline navigation bar title display mode across iOS views** — AG · COMPLETED 2026-08-25.  Applied .navigationBarTitleDisplayMode(.inline) to all NavigationStack root and detail views so centered compact title stays pinned during scroll.
- **Site & App Triage, Security Fixes, Cross-Platform Master 3D Icons, and iOS/Android Release Builds** — AG · COMPLETED 2026-08-22.  Merged PR #47 (canary secret isolation) and added dry-run live rotate guard (`shouldMintProviderCredential`).  Generated and linked full-bleed 3D silver key master app icon assets across Web (favicon, apple-touch-icon, app-icon), Apple (iOS/macOS 1024x1024 asset catalogs via XcodeGen), and Android (adaptive mipmaps across all density buckets).  Verified 22/22 Web Vitest + build, 27/27 Swift TopSpinCore tests, local iOS & macOS xcodebuilds, and Android Gradle `assembleRelease`/`bundleRelease`.  Generated signed release packages: iOS IPA (`releases/ios/Autorotate-1.0.1.ipa`) and Android APK (`releases/android/Autorotate-1.0.0.apk`).  Registered Autorotate in `ios-fleet/ship-testflight.sh` tooling.
- **2026-08-22 - CURSOR - COMPLETED - Autorotate Apple IDs codes.autorotate after autorotate.codes.**  Apple IDs live in AG #48. Closed duplicate Grok #50. Portal App IDs still owner. dealdex.net HTTP 200. <!-- wb-agent-report:56b8070663e7402b946796c1d86dea80 -->
- **Autorotate Apple IDs in git (`codes.autorotate`)** — GROK PR [#50](https://github.com/jaywedgeworth22/TopSpin/pull/50) closed as duplicate of AG [#48](https://github.com/jaywedgeworth22/TopSpin/pull/48) which already sets `codes.autorotate` / `codes.autorotate.macos`.  Cursor 2026-08-22: do not merge both.  Owner still creates those App IDs in the Developer portal before TestFlight.
- **Autorotate Rebrand (`Autorotate.codes`), Native Android Companion App & Apple Build Verification** — AG · COMPLETED 2026-08-22.  Rebranded monorepo across Web (`Autorotate.codes`), Apple apps (`codes.autorotate`, `codes.autorotate.macos`, `codes.autorotate.shared`), and added native Android companion app (`android/` with Kotlin + Jetpack Compose Material 3, Biometrics, QR scanner, .env parser).  Apple targets generated via XcodeGen (`Autorotate.xcodeproj`), linked developer team `CC8UTF7ATG` (Jay Wedgeworth, LLC), minimum iOS 17 / macOS 14.  Local `xcodebuild` **BUILD SUCCEEDED** for both iOS and macOS targets; AutorotateCore 27/27 tests pass; web `check` + `build` pass.
- **Web and iOS utility and power enhancements** — AG · PR [#48](https://github.com/jaywedgeworth22/Autorotate/pull/48) (`ag/utility-power-enhancements`). Interactive .env importer & wizard, multi-select & batch actions, secret drift detection & live read-back inspector, dry-run simulator, workspace alert webhooks (Slack/Discord), QR pairing, Face ID biometrics, SwiftUI .env importer, QR scanner, Siri Shortcuts, and native Swift rotators for Resend, Hugging Face, Neon. Swift tests 27/27, Vitest 16/16, TypeScript check + Vite/esbuild production builds passing.
- **iOS first-launch update prompt (fleet)** — CURSOR · COMPLETED/MERGED #36 squash `994cc73` 2026-08-21.  On first open, ask to update when a newer version exists.  TestFlight opens TestFlight; App Store opens the App Store.  Manifest: `jaywedgeworth22/ios-app-versions`.  Silent until an ASC/TestFlight record exists.  Same prompt landing in ST / CT / UM / DealDex.
- **Fleet onboarding — join ai-fleet-coordinator as app `Autorotate` (TS).** KIMI bootstrap + CURSOR closeout 2026-08-21. App PR [#16](https://github.com/jaywedgeworth22/Autorotate/pull/16) merged (`c1f12a5`). Coordinator PR [#57](https://github.com/jaywedgeworth22/ai-fleet-coordinator/pull/57) already merged. Local + CI: iOS/macOS **BUILD SUCCEEDED**, AutorotateCore 22/22, web `npm ci` + check + build + 9/9 after lockfile hosts pinned to npmjs.org (`1baf3cc`). Effort Issues Sync dispatched (run 32458648310 success). Integration tree `~/Code/Autorotate` ff to `c1f12a5`.
- **Merge Grok App Builder PWA with this monorepo** — GROK · merged as [#38](https://github.com/jaywedgeworth22/Autorotate/pull/38) (`900bd54`). Backups under `backups/`. Live web engine folds Grok rotators + parser + Mac agent.
- **Apache-2.0 + Kimi dump backup + catalog fold-in** — CURSOR · PR [#42](https://github.com/jaywedgeworth22/Autorotate/pull/42) · branch `cursor/kimi-apache-merge`. Relicensed to Apache 2.0 (© Jay). Kimi dump at `backups/kimi-agent-autorotate/`. Secret Rotator nickname (`app/`) at `backups/secret-rotator/` (not a standalone app). Grok extra catalog folded into live web + AutorotateCore.

## In Progress
- **Owner: Developer portal App IDs for Autorotate** — leftover after Grok #50 closed as duplicate of AG #48.  https://autorotate.codes.  Do not reopen or merge #50.  `com.jay.shellular` stays disabled.
- **Dependabot leftover radix/react PRs** — CURSOR · after #16. Remaining npm PRs blocked on serial lockfile rebase. Auto-merge not enabled on the repo. PR #17 (`fix/no-target-commit`) is another seat — do not touch.

## Planned / Reserved
- Owner dashboard items: branch protection on `main` (require PR + checks `web`, `apple`, `gitleaks`); Infisical project for prod secrets; App Store Connect records before TestFlight; `SENTRY_FLEET_DSN` then sentry-ci-report.

## Changelog of this log
- 2026-08-25 — AG added inline navigation bar title display mode across iOS views.
- 2026-08-22 — CURSOR: Grok leftover = owner App IDs + ASC capabilities cheat sheet.  Branding autorotate.codes.  DealDex mention uses dealdex.net.  PR #50 not to merge.
- 2026-08-22 — CURSOR closed Grok PR #50 as duplicate of AG #48 (same `codes.autorotate` IDs).  Product/domain: Autorotate / autorotate.codes.  DealDex public host dealdex.net.  Contact+logo product is contactlogo.com when that app is in scope.
- 2026-08-21 — AG implemented full power enhancements across Web, iOS, and AutorotateCore, opening PR [#48](https://github.com/jaywedgeworth22/Autorotate/pull/48).
- 2026-08-21 — AG reserved Web and iOS utility and power enhancements (`ag/utility-power-enhancements`).
- 2026-08-21 — CURSOR completed Apache-2.0 relicensing + Kimi/Secret Rotator backup + extra catalog fold-in (PR #42).
- 2026-08-21 — CURSOR reserved Apache-2.0 relicensing + Kimi/Secret Rotator backup + extra catalog fold-in (`cursor/kimi-apache-merge`). Closed Grok PWA merge row (PR #38).
- 2026-08-21 — CURSOR closed fleet onboard (PR #16 + board closeout #21). Merged Dependabot actions #3–7 and radix #1/#9/#14. Remaining npm PRs blocked on serial lockfile rebase.
- 2026-08-20 — bootstrapped by onboard-new-app.sh; first rows added by KIMI during fleet onboarding.
