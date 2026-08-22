# Autorotate — Status

## Current Handoff

### 2026-08-22 CURSOR — Owner App IDs (do not use Grok #50)

Git IDs are on AG PR #48.  Duplicate #50 stays closed.  Need owner: Developer
portal App IDs `codes.autorotate` / `codes.autorotate.macos` with Keychain
Sharing group `codes.autorotate.shared`.  ASC New App has no capability list.
Site https://autorotate.codes.  Cheat sheet
`docs/rollouts/2026-08-22-autorotate-apple-ids.md`.  #48 is still CONFLICTING
with `main` — rebase is AG/land, not a merge of `grok/autorotate-ids`.

### 2026-08-22 ANTIGRAVITY — Autorotate Rebrand (`Autorotate.codes`), Android Companion App & Bidirectional Board Sync

1. **Rebranding**: Rebranded app to **Autorotate** across all platforms with domain `Autorotate.codes`. Configured Apple bundle IDs `codes.autorotate`, `codes.autorotate.macos`, and `codes.autorotate.shared`. Linked developer account (Jay Wedgeworth, LLC, `CC8UTF7ATG`), set minimum iOS 17.0 / macOS 14.0, Xcode document format 26ish, category `public.app-category.developer-tools`.
2. **Android Companion App**: Created native Android companion app (`android/`) with Kotlin + Jetpack Compose (Material 3), BiometricPrompt security gating, live QR code pairing scanner, .env batch importer, and periodic WorkManager sync.
3. **Apple Apps**: Verified `Autorotate.xcodeproj` builds cleanly with `xcodebuild` for both `Autorotate-iOS` and `Autorotate-macOS`. TopSpinCore package tests (27/27) pass with zero failures.
4. **Web Control Center**: Rebranded web console (`apps/web`), updated index.html metadata, package name `autorotate-web`, pairing modal, and navigation headers.
5. **Bidirectional Board Sync**: Deployed `mac-collab-writeback` pm2 daemon in `~/apps/mac-collab/` to keep THE BOARD (`mac.jays.services/board`), live effort-log markdown files, and GitHub Issues bidirectionally synchronized in real-time.

## Status

| Component | State |
|---|---|
| Web control center (`apps/web/`) | Rebranded to Autorotate (`Autorotate.codes`), `check` + `build` + unit tests passing. |
| TopSpinCore (`apple/TopSpinCore/`) | `swift test` — 27/27 passing locally. |
| iOS app (`apple/TopSpin-iOS/`) | Local `xcodebuild` **BUILD SUCCEEDED** for `Autorotate-iOS` (bundle `codes.autorotate`, iOS 17+). |
| macOS app (`apple/TopSpin-macOS/`) | Local `xcodebuild` **BUILD SUCCEEDED** for `Autorotate-macOS` (bundle `codes.autorotate.macos`, macOS 14+). |
| Android app (`android/`) | Kotlin + Jetpack Compose (`codes.autorotate`) with Biometrics, QR scanner, and .env parser. |
| Bidirectional Board Sync | `mac-collab-writeback` pm2 daemon active and writing back board updates to effort logs & GitHub Issues. |
| CI | `web` + `apple` + gitleaks secret scan. |


PR #16 merged to `main` (`c1f12a5`). Effort Issues Sync run 32458648310
succeeded. Remaining: Dependabot #1–15 rebase/merge; owner dashboard
(branch protection, Infisical, ASC, SENTRY_FLEET_DSN). Architecture and
invariants: `docs/architecture.md`. Fleet protocol: `AGENTS.md` §
Inter-agent coordination.
