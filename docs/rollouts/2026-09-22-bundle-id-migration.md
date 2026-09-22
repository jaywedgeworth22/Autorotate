# 2026-09-22 — Bundle Identifier Migration

Issue raised during the macOS signing-cert change window as part of a fleet-wide bundle rename using domains Jay owns as the base.  This document covers **Autorotate only**; the rest of the fleet (BotFleet, ContactLogo, DealDex, HogHunter, Socratic.Trade, Congress.Trade, Usage-Monitor, the MiniMax-ios companion) is on separate lanes owned by other seats.  The fleet-wide context lives in `/Users/jay/.minimax/sessions/mvs_0bdfe8c73c1046a986df888aa99dcb2e/workspace/fleet-bundle-id-plan.md`.

Autorotate is the simplest lane in the fleet — one iOS rename, one new app group shared across iOS + macOS, and one new associated domain for the iOS Universal Links / shared web-credentials flow.  No web refs, no Electron helpers, no LaunchAgents.

## Previous → New

| Surface | Previous | New |
|---|---|---|
| iOS app (`Autorotate-iOS`) | `codes.autorotate` | `codes.autorotate.ios` |
| macOS app (`Autorotate-macOS`) | `codes.autorotate.macos` | `codes.autorotate.macos` (keep) |
| iOS BG task identifier | `codes.autorotate.refresh` | `codes.autorotate.ios.refresh` |
| iOS Sentry release default | `codes.autorotate@<v>+<b>` | `codes.autorotate.ios@<v>+<b>` |
| App Group (new) | — | `group.codes.autorotate` |
| Associated Domain (new, iOS only) | — | `autorotate.codes` |
| Associated Domain values (new, iOS only) | — | `webcredentials:autorotate.codes` (`applinks` deferred until URL routing exists) |
| Keychain Sharing group | `codes.autorotate.shared` | `codes.autorotate.shared` (keep — separate namespace, not part of this rename) |
| Android Java package + `applicationId` | `codes.autorotate` | `codes.autorotate` (unchanged; out of scope for this PR) |

The macOS app already carried `codes.autorotate.macos` from the 2026-08-22 rebrand — only the iOS app needed the `.ios` suffix, and the new app group + associated domain join it to its sibling.

## What changed in the repo

- `apple/project.yml`:
  - iOS target `PRODUCT_BUNDLE_IDENTIFIER`: `codes.autorotate` → `codes.autorotate.ios`.
  - macOS target `PRODUCT_BUNDLE_IDENTIFIER`: `codes.autorotate.macos` (unchanged).
  - `bundleIdPrefix: codes.autorotate` (unchanged — base for both targets' derived strings).
  - Header comment now lists App Groups + Associated Domains alongside Keychain Sharing for the post-XcodeGen capability setup.
- `apple/Autorotate-iOS/Info.plist`:
  - `BGTaskSchedulerPermittedIdentifiers` array: `codes.autorotate.refresh` → `codes.autorotate.ios.refresh`.
  - File header comment updated to reference the new BG identifier.
- `apple/Autorotate-iOS/BackgroundRotation.swift`:
  - `BackgroundRotation.taskIdentifier`: `codes.autorotate.refresh` → `codes.autorotate.ios.refresh` (must match the Info.plist entry).
  - File header comment updated.
- `apple/Autorotate-iOS/SentryTelemetry.swift`:
  - `releaseName()` fallback default: `codes.autorotate` → `codes.autorotate.ios`.
  - Doc-comment example updated to match.
- `apple/Autorotate-iOS/AppUpdatePrompt.swift`:
  - Reads the new `codes.autorotate.ios` manifest key first and temporarily falls back to the legacy `codes.autorotate` key for version/build only, so existing TestFlight update checks keep working while fleet publishers migrate without inheriting the old App Store Connect record's Apple ID or deep links.
  - The `ios-versions.json` producer must publish `codes.autorotate.ios` with the renamed app's Apple ID and URLs; during the migration window it may retain the legacy key only as a version/build alias for already-installed builds.
- `apple/Autorotate-iOS/Autorotate.entitlements`:
  - **Added** `com.apple.security.application-groups` with `group.codes.autorotate`.
  - **Added** `com.apple.developer.associated-domains` with `webcredentials:autorotate.codes`. Universal Links (`applinks`) are deferred because the iOS target currently has no URL/NSUserActivity routing implementation.
  - Existing `keychain-access-groups` entry (`$(AppIdentifierPrefix)codes.autorotate.shared`) preserved unchanged.
  - Header comment expanded to explain the App Group + Associated Domain rationale.
- `apple/Autorotate-macOS/AutorotateMac.entitlements`:
  - **Added** `com.apple.security.application-groups` with `group.codes.autorotate`.
  - Existing sandbox / file / network / keychain-access-groups entries preserved unchanged.
  - Header comment notes that Associated Domains are intentionally absent on macOS.
- `apple/README.md`:
  - Module-map entry for `Autorotate-iOS`: bundle `codes.autorotate` → `codes.autorotate.ios`.
  - iOS target signing-capabilities section: added App Groups + Associated Domains capability rows; Background fetch reference updated to the new BG identifier.
  - New subsections `### App Group group.codes.autorotate (both apps)` and `### Associated Domains autorotate.codes (iOS only)` directly after the Keychain Sharing section; the associated-domain guidance enables Shared Web Credentials only until URL routing is implemented.
- `README.md`:
  - Tree comment for `apple/Autorotate-iOS/`: bundle `codes.autorotate` → `codes.autorotate.ios`.  macOS line and Android line intentionally untouched (out of scope).
- `AGENTS.md`:
  - Top-of-file dated callout: `2026-09-22 [MM]: Bundle identifier migration — see rollout doc for new IDs`.
  - Module-map iOS row: bundle `codes.autorotate` → `codes.autorotate.ios`.  Android row gets a one-liner that the rename is intentionally out of scope for the 2026-09-22 lane.
  - New canonical `## Bundle identifiers` table at the bottom of the file (mirrors the BotFleet convention) listing every surface + the new app group + associated domain + a pointer to this rollout doc.
- `docs/EFFORT-LOG.md`:
  - Top metadata line updated to call out `codes.autorotate.ios` / `codes.autorotate.macos` with a pointer to this rollout doc.
  - New `2026-09-22 - MM - IN_PROGRESS` stanza at the top of `## In Progress`.
  - New `2026-09-22 — MM:` entry in `## Changelog of this log`.
- `STATUS.md` (historical):
  - Top-of-file archaeology note — `codes.autorotate` (iOS) and `codes.autorotate.shared` (Keychain Sharing) reflect the 2026-08-22 rebrand state and remain verbatim as historical record.  macOS bundle (`codes.autorotate.macos`) unchanged.
- `docs/rollouts/2026-08-22-autorotate-apple-ids.md` (pre-rename rollout):
  - Top-of-file archaeology note — current IDs reflected here; iOS is now `codes.autorotate.ios`.
- `docs/rollouts/2026-09-18-sentry-release-tagging.md` (pre-rename Sentry doc):
  - Top-of-file archaeology note — release-table entries are the pre-rename state; iOS release names will now emit `codes.autorotate.ios@<v>+<b>` from `releaseName()`.
- `docs/audit-2026-08-31/ios.md` (historical audit):
  - Top-of-file archaeology note — bundle-ID references reflect the 2026-08-31 audit state; iOS is now `codes.autorotate.ios`; Keychain Sharing group + service-prefix family unchanged (audit findings still apply).
- `docs/audit-2026-08-31/android.md` (historical audit):
  - Top-of-file archaeology note — Android namespace `codes.autorotate` is **unchanged** by this lane (out of scope).
- `docs/EFFORT-LOG.md` prior historical rows (rebrand record from 2026-08-22, etc.) — preserve verbatim as historical record.  No edits required (already historical context).

### Out-of-scope files (not edited, intentionally)

- `apple/AutorotateCore/` — references to `codes.autorotate.shared` (Keychain access group), `codes.autorotate.<secretId>` (managed-secret service names), `codes.autorotate.credential.<connectorId>.<secretId>` (connector admin credential service names), `codes.autorotate.infisical.<workspaceId>` (Infisical service), and the test fixture `codes.autorotate.test`.  These are **internal** Keychain service-name strings, not bundle IDs; renaming them would invalidate existing keychain items on user devices.  Out of scope for this lane.
- `apple/Autorotate-iOS/KeychainInventory.swift` and `apple/Autorotate-macOS/KeychainInventory.swift` — both reference `codes.autorotate` (and the legacy `com.autorotate`) as service-prefix filters used to categorise Keychain items; same reason as above, out of scope.
- `android/` — entire tree intentionally out of scope. The Java package namespace + Gradle `applicationId` remain `codes.autorotate` and are unchanged by this PR.
- `backups/kimi-agent-topspin/` — archaeology; do not edit.
- No `dealdex.net`, `services.jays.*`, `com.botfleet.*`, `com.contactlogo.*`, `com.jayservices.HogHunter`, `trade.socratic.*`, `trade.congress.*`, `net.dealdex`, or `app.botfleet.*` references exist in this repo.

## Cross-repo files touched (not in this PR's diff)

- `~/Library/LaunchAgents/` — none (no server-side / harness components on this app).
- `~/apps/autorotate-*-start.sh` / `~/apps/autorotate-*.py` — none of these exist; Autorotate has no agent harness.
- `/Users/jay/Code/Autorotate/` — the human integration tree.  No edits; the worktree stays on `minimax/bundle-rename` and the owner merges through the PR.

## Owner action items

1. **Apple Developer Portal** — register the new explicit App IDs: `codes.autorotate.ios`, `codes.autorotate.macos` (the macOS one already exists, verify it), and the new App Group capability `group.codes.autorotate` on **both** App IDs (it must be registered per-App-ID for `UserDefaults` sharing + FileProvider container participation).  This PR does not have the credentials to do so.
2. **`autorotate.codes` DNS + AASA** — host the Apple App Site Association at `https://autorotate.codes/.well-known/apple-app-site-association` on the verified `autorotate.codes` zone. The iOS target has no `onOpenURL`, `NSUserActivity`, scene URL-context, or equivalent route handler today, so Universal Links are not implemented and the AASA must not publish an `applinks` claim yet. Shared Web Credentials is ready; its top-level `webcredentials.apps` entry must use the Autorotate Team ID plus bundle ID, `CC8UTF7ATG.codes.autorotate.ios` (not a BotFleet App ID). The complete minimum structure is:

   ```json
   {
     "webcredentials": {
       "apps": ["CC8UTF7ATG.codes.autorotate.ios"]
     }
   }
   ```

   `webcredentials:autorotate.codes` is wired in `apple/Autorotate-iOS/Autorotate.entitlements` and will validate once this AASA is reachable. Add `applinks:autorotate.codes` and a path-scoped `applinks.details` entry only in the same change that adds and tests the matching in-app route handlers.
3. **App Store Connect app record** — before the first upload with the renamed bundle ID, the owner must create a new App Store Connect app record bound to the explicit App ID `codes.autorotate.ios`. A TestFlight re-upload cannot create or retarget that app record.
4. **Code-signing** — the certificate refresh is vendor-driven and out of scope.  After the cert swap, the build picks up the new bundle ID without any further source change (it reads `PRODUCT_BUNDLE_IDENTIFIER = "codes.autorotate.ios"` from `apple/project.yml`).
5. **TestFlight re-upload** — vendor (hosted `testflight.yml`), after the App Store Connect app record exists.  No source change required beyond this PR's `apple/project.yml`; `xcodegen generate` regenerates `apple/Autorotate.xcodeproj` with the new `PRODUCT_BUNDLE_IDENTIFIER`.
6. **macOS keychain access group** — if the owner wants existing macOS Keychain items to remain shared with the renamed iOS app, no action is needed (`codes.autorotate.shared` is unchanged).  If a clean cut is desired, the owner signs the new app group separately — out of scope for this PR.
7. **Android bundle** — the Java package namespace + Gradle `applicationId` remain unchanged as `codes.autorotate` and are out of scope for this PR.

## Cross-module interface claim

This migration explicitly claims the **Apple signing-capability interface** between the iOS and macOS app modules: the shared `group.codes.autorotate` App Group must be declared consistently in both entitlement files and registered against both App IDs. The interface surface is limited to `apple/Autorotate-iOS/Autorotate.entitlements`, `apple/Autorotate-macOS/AutorotateMac.entitlements`, the XcodeGen signing configuration in `apple/project.yml`, and this rollout contract. No iOS or macOS runtime implementation is shared by this claim. This is the explicit interface exception required by `AGENTS.md` for one task to span both app modules.

## Verification

- `git grep -nE 'codes\.autorotate([^.]|$)'` (excluding `android/` and `backups/`) returns only:
  - `AGENTS.md` Android row + new Bundle Identifiers table (Android row carries `codes.autorotate` for the explicitly-out-of-scope Android lane; the table also surfaces it for the Keychain Sharing group `codes.autorotate.shared` which is unchanged).
  - `STATUS.md`, `docs/rollouts/2026-08-22-autorotate-apple-ids.md`, `docs/rollouts/2026-09-18-sentry-release-tagging.md`, `docs/audit-2026-08-31/ios.md`, `docs/audit-2026-08-31/android.md` — each carries a top-of-file archaeology note explaining why the old IDs remain verbatim.
  - `docs/EFFORT-LOG.md` — the top metadata line + the new IN_PROGRESS stanza + the historical rebrand row (preserved as archaeology).
- `git grep -nE 'codes\.autorotate\b'` (matching the acceptance-criteria regex, with `\b` word boundary) — same set as above for the non-Android scope, plus the entire `android/` tree which is **intentionally out of scope** for the rename (Java namespace + `applicationId`).
- `plutil -lint apple/Autorotate-iOS/Info.plist`, `plutil -lint apple/Autorotate-macOS/Info.plist`, `plutil -lint apple/Autorotate-iOS/Autorotate.entitlements`, `plutil -lint apple/Autorotate-macOS/AutorotateMac.entitlements` — all clean.
- `xcodegen generate` regenerates `apple/Autorotate.xcodeproj` from `apple/project.yml`; the new `PRODUCT_BUNDLE_IDENTIFIER = codes.autorotate.ios` flows into the iOS target build settings without any hand edit.
- `xcodebuild -list -project apple/Autorotate.xcodeproj` (post-`xcodegen generate`) lists `Autorotate-iOS` and `Autorotate-macOS` targets cleanly.
- `apple/Autorotate-iOS/BackgroundRotation.swift` `taskIdentifier` matches the `BGTaskSchedulerPermittedIdentifiers` entry in the iOS Info.plist (`codes.autorotate.ios.refresh` on both sides).
- `apple/Autorotate-iOS/SentryTelemetry.swift` `releaseName()` fallback default + doc comment match the new iOS bundle ID.
- `apple/Autorotate-iOS/AppUpdatePrompt.swift` resolves `codes.autorotate.ios` first and falls back to the legacy `codes.autorotate` manifest entry during migration; `scripts/test-bundle-id-migration.py` locks this alias and the rollout prerequisites.
- `apple/Autorotate-iOS/Autorotate.entitlements` carries `com.apple.security.application-groups: [group.codes.autorotate]` and `com.apple.developer.associated-domains: [webcredentials:autorotate.codes]`; `applinks` remains absent until matching URL routing exists.
- `apple/Autorotate-macOS/AutorotateMac.entitlements` carries `com.apple.security.application-groups: [group.codes.autorotate]` (no Associated Domains on macOS, by design).
- `AGENTS.md` Bundle Identifiers section is the new canonical table for future seats; top-of-file callout points to this rollout doc.
- `docs/EFFORT-LOG.md` carries the new `2026-09-22 - MM - IN_PROGRESS` stanza at the top of `## In Progress` and a matching changelog row.
- `apple/AutorotateCore/` references to `codes.autorotate.*` were searched but **not** edited — they are internal Keychain service-name strings, not bundle IDs.  See `Out-of-scope files` above.

## Out of scope

- Apple Developer Portal App ID registration (owner).
- App Store Connect app-record creation for `codes.autorotate.ios` before the first upload (owner).
- `autorotate.codes` AASA hosting + DNS (owner); the AASA App ID is `CC8UTF7ATG.codes.autorotate.ios`.
- Code-signing cert refresh (vendor).
- TestFlight re-upload (vendor).
- Android Java package + `applicationId` remain `codes.autorotate` and are out of scope for this PR.
- Keychain service-name strings in `apple/AutorotateCore/` (internal API; renaming would invalidate existing Keychain items on user devices).
- Renaming the macOS app from `codes.autorotate.macos` — already correct from the 2026-08-22 rebrand, no change needed.
- Other fleet apps' bundle renames (separate per-app PRs, separate seats).
