# AR31 — Autorotate-iOS audit

**Date:** 2026-08-31  
**Module:** `apple/Autorotate-iOS/` (SwiftUI, iOS 17+, bundle `codes.autorotate`)  
**Seat:** GROK (read-only)  
**Prior:** AR-08 runtime chain-verify UI, inline nav titles — **verified present**  
**Cap:** 20 findings (`AR31-IOS-01` …)

## Scorecard

| Area | Assessment |
|---|---|
| Theme / light default | **Fail** — forced dark + hardcoded dark tokens |
| Navigation / titles | Pass — inline titles on all stacks |
| AR-08 audit chain UI | Pass — Settings → Verify audit chain |
| Keychain inventory | **Fail** — filters stale `com.autorotate` prefix |
| Biometrics | **Fail** — toggle does not gate UI |
| Pairing / QR | Broken / incomplete |
| App update prompt | Wired; fleet copy drifted |
| Accessibility | Thin |
| Core API boundary | Pass — public imports only |
| TopSpin leftovers | Residual dirs + stale `com.autorotate` copy |

---

### AR31-IOS-01. Critical — App boots forced dark (fleet light-default violated)

`AutorotateApp` hard-codes `.preferredColorScheme(.dark)`.  `Theme.swift` is a dark-only palette (near-black backgrounds, light text) with no Light / Dark / System preference and no adaptive colors.  Even removing the preferred scheme alone would leave light mode unreadable.

Owner rule: default UI theme is **light**; dark only when the user chooses Dark or System (and system is dark).  Documented earlier in `docs/rollouts/HANDOFF-2026-08-20-kimi-autorotate-fleet-onboard.md` and still unfixed.

- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/AutorotateApp.swift:61`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Theme.swift:17-38`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Theme.swift:133-136` (`autoRotateScreenBackground`)

**Fix direction:** adaptive semantic colors; Settings appearance control (Light | Dark | System); default = light; apply `preferredColorScheme` only from that preference.

---

### AR31-IOS-02. High — Keychain inventory never lists live items (`com.` vs `codes.`)

Core writes services under `codes.autorotate.*` (`KeychainManager.sharedAccessGroup`, credential / Infisical / managed-secret services).  iOS `KeychainInventory` still categorizes and filters with `com.autorotate` prefixes only, so Settings → “Keychain — managed items” stays empty even when items exist.  macOS inventory already accepts `codes.autorotate` (and legacy `com.topspin`).

- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/KeychainInventory.swift:44-49`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/KeychainInventory.swift:85-86`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/KeychainInventory.swift:99-102`
- Contrast: `/Users/jay/apps/autorotate-grok/apple/AutorotateCore/Sources/AutorotateCore/KeychainManager.swift:145,176-193`
- Contrast: `/Users/jay/apps/autorotate-grok/apple/Autorotate-macOS/KeychainInventory.swift:25-26,63`

---

### AR31-IOS-03. High — Biometrics toggle is cosmetic

Settings claims Face ID / Touch ID “Protects admin credentials and rotation triggers,” but:

1. `ContentView` never reads `model.isUnlocked` — no lock screen / gate.
2. `lockApp()` is never called on `scenePhase` background/inactive.
3. `authenticateWithBiometrics()` fail-opens (`isUnlocked = true`) when `canEvaluatePolicy` fails (simulator / no enrolled biometrics).
4. Enabling the toggle only runs one evaluate; success does not change subsequent navigation or rotate actions.

- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/SettingsView.swift:82-96`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/AppModel.swift:361-391`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/ContentView.swift` (no unlock gate)
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/AutorotateApp.swift:69-73` (background schedules refresh only)

---

### AR31-IOS-04. High — Pairing QR is incomplete and contradicts Settings copy

Secrets toolbar presents a live camera QR scanner.  On success it only writes `infisicalBaseUrl` and `infisicalEnvironment` — not workspaceId, clientId, or clientSecret — then dismisses.  Settings → Companion still says a “signed pairing flow (QR code + shared access group) is **planned**,” so product copy and chrome disagree.  Camera setup returns silently if input/output cannot be added (denied permission → black screen, no error).

- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/QRCodeScannerView.swift:73-95`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/QRCodeScannerView.swift:129-136`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/SettingsView.swift:343-349`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/SecretsListView.swift:69-74`

---

### AR31-IOS-05. High — User-visible identifiers still say `com.autorotate.*`

Runtime identifiers are `codes.autorotate.*` (entitlements value, BGTask id, Core services).  User-facing Settings and Add Target copy still show the old reverse-DNS, which will confuse anyone verifying Keychain Sharing or Console logs.

Examples:

- Settings toggle label: `Shared access group (com.autorotate.shared)` — real group `codes.autorotate.shared`
- Background footer: `BGAppRefreshTask (com.autorotate.refresh)` — real id `codes.autorotate.refresh`
- Add Target Keychain footer: service `com.autorotate.<secretId>` — real `codes.autorotate.<secretId>`

Entitlements / Info.plist **values** match `codes.`; comments and UI strings do not.  `project.yml` Keychain Sharing note is correct.

- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/SettingsView.swift:170`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/SettingsView.swift:335`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/AddTargetView.swift:166`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Autorotate.entitlements:28-31` (value OK; header comment wrong)
- `/Users/jay/apps/autorotate-grok/apple/project.yml:12-13,56-59`

---

### AR31-IOS-06. Medium — AppUpdatePrompt forked behind fleet canonical; no plist Apple ID

`.appUpdatePrompt()` is attached on `ContentView` (good).  In-tree `AppUpdatePrompt.swift` still carries a hardcoded `knownAppleIds` map that **omits** `codes.autorotate` (Apple ID `6804248985` per `ios-fleet/apps.json`).  Fleet canonical `/Users/jay/apps/ios-fleet/AppUpdatePrompt.swift` dropped that map and relies on manifest / `AppUpdateAppleId`.  iOS `Info.plist` / `project.yml` set neither `AppUpdateAppleId` nor `AppUpdateManifestURL`.  Prompt still works when the public manifest (which includes `codes.autorotate` + appleId) or iTunes Lookup succeeds; offline / manifest miss is fragile.

- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/AppUpdatePrompt.swift:31-37,48-57`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/ContentView.swift:37`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Info.plist` (no AppUpdate* keys)
- Manifest: `/Users/jay/apps/ios-fleet/ios-app-versions.json` → `codes.autorotate` / `6804248985`

---

### AR31-IOS-07. Medium — Siri shortcut incomplete and bypasses claimed biometric gate

`RotateDueSecretsIntent` exists but there is no `AppShortcutsProvider` / App Shortcuts phrases, so discovery is weak.  `perform()` builds a fresh `ModelContainer` + `AppModel` and calls `rotateDueSecretsNow()` with no biometric check, contradicting Settings security copy.  Prefer `AutorotateSchema.makeContainer()` for one schema path.

- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Intents/RotateSecretIntent.swift:13-25`

---

### AR31-IOS-08. Medium — `.env` importer retains plaintext in view state; sheet ignores Theme

`ParsedEnvRow.value` holds secrets in `@State` through parse → review → import.  After success the sheet dismisses without zeroing `rawText` / row values.  Review UI does not display values (good) but memory retention is longer than needed.  `ImportEnvView` also skips `.autoRotateScreenBackground()` / `.scrollContentBackground(.hidden)`, so the sheet does not match the forced-dark chrome of other flows.

- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/ImportEnvView.swift:13-20,34-77,239-251`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/AppModel.swift:393-421`

---

### AR31-IOS-09. Medium — Accessibility / VoiceOver thin

Only four toolbar / rotate `accessibilityLabel`s exist (Secrets list).  `StatusDot` is color-only with no accessibility value; `RunStatusBadge` / empty states / dashboard tiles lack labels or hints; `EmptyStateView` has no primary action control (Add / Import).  Large Dynamic Type will stress monospaced fingerprint chips and fixed 28×28 rotate controls without `minimumScaleFactor` / `@ScaledMetric`.

- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/SecretsListView.swift:74-88,209`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/Components.swift:16-34,188-210`

---

### AR31-IOS-10. Medium — Landscape / notch / Dynamic Island polish gaps

`project.yml` enables iPhone landscape.  QR overlay uses a fixed 260×260 frame and top material banner without explicit safe-area / Dynamic Island handling beyond `ignoresSafeArea` on the camera layer.  Dashboard two-column grid and list rows are generally fine; QR and long mono chips are the risk surfaces on SE-class widths + landscape.

- `/Users/jay/apps/autorotate-grok/apple/project.yml:67-68`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/QRCodeScannerView.swift:27-42`

---

### AR31-IOS-11. Medium — Leftover TopSpin asset trees

`apple/TopSpin-iOS/` and `apple/TopSpin-macOS/` remain as AppIcon-only trees beside `Autorotate-iOS` / `Autorotate-macOS`.  Not referenced by current `project.yml` targets, but they are leftover branding surface in the Apple tree.

- `/Users/jay/apps/autorotate-grok/apple/TopSpin-iOS/`
- `/Users/jay/apps/autorotate-grok/apple/TopSpin-macOS/`

---

### AR31-IOS-12. Medium — Webhook “include plaintext” is easy to enable on-device

Add Target offers `Include plaintext value in payload` with a caption warning only.  On a phone this is a one-toggle exfil path if pointed at an untrusted URL.  Prefer confirmation dialog, default-off badge, or hiding the control behind an advanced disclosure on iOS.

- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/AddTargetView.swift:147-153`

---

### AR31-IOS-13. Medium — iOS file targets are free-text paths without document picker

Add Secret / Add Target file flows take absolute paths.  Footer admits sandbox limits and mentions document picker, but no `fileImporter` / security-scoped bookmark path exists on iOS (unlike macOS bookmarks).  Users can configure required file targets that always fail PUSH.

- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/AddTargetView.swift:119-140`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/AddSecretView.swift:200-207`

---

### AR31-IOS-14. Low — Silent `try?` on destructive / write paths

Swipe-delete secret, target enable toggles, target delete, and admin credential replace swallow errors (`try?`), so failures look like success.  Prefer surfacing `errorMessage` alerts already used elsewhere.

- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/SecretsListView.swift:52-53`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/SecretDetailView.swift:90,107,259,402`

---

### AR31-IOS-15. Low — Copy: single sentence gap + stale service name in one footer

`AddTargetView` Keychain footer: `…after first unlock. iCloud sync falls back…` uses a single ASCII space between sentences (fleet rule requires two spaces in file-sourced UI strings) and the wrong `com.autorotate` service prefix (see AR31-IOS-05).  Most other multi-sentence footers already use double spaces.

- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/AddTargetView.swift:166`

---

### AR31-IOS-16. Low — Background-task comment / footer drift (runtime OK)

Registration id `codes.autorotate.refresh` matches Info.plist.  File headers and Settings footer still say `com.autorotate.refresh`.  Not a functional BGTask bug; same stale-naming class as AR31-IOS-05.

- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/BackgroundRotation.swift:8-9,22`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Info.plist:28-32`

---

### AR31-IOS-17. Low — Empty / error states uneven

Secrets and Runs empty states are present.  Dashboard empty health is only “NO SECRETS” + caption (no Add CTA).  Secret detail missing-id uses `EmptyStateView` without message.  Storage-container failure alert at launch is good.  QR / camera denial has no empty/error state (see AR31-IOS-04).

- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/DashboardView.swift:25-30,98-106`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/SecretDetailView.swift:59-61`

---

### AR31-IOS-18. Info — AR-08 chain verify + inline titles (prior work verified)

Settings auto-runs and exposes “Verify audit chain” with intact/broken UI, legacy prefix count, and broken entry id — fulfills AR-08 runtime check.  All primary navigations use `.navigationBarTitleDisplayMode(.inline)` (Dashboard, Secrets, Runs, Settings, sheets, detail).  No regression finding; listed for closure of the prior note.

- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/Views/SettingsView.swift:247-308,385`
- `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS/AppModel.swift:340-348`

---

### AR31-IOS-19. Info — Core boundary looks clean

iOS sources `import AutorotateCore` only; no `@_spi` / `@testable` into Core internals.  App-side `KeychainAdminCredentialProvider` and `ConnectorFactory` sit on documented public protocols/types.  Duplicate of Core’s `KeychainCredentialProvider` is intentional per file comment (audit-friendly wrapper).

---

### AR31-IOS-20. Info — Entitlements vs `project.yml` (no pbxproj edit needed)

`CODE_SIGN_ENTITLEMENTS` → `Autorotate-iOS/Autorotate.entitlements` with `$(AppIdentifierPrefix)codes.autorotate.shared`.  Info.plist merge path for BGTask + Face ID + Camera usage is consistent with `GENERATE_INFOPLIST_FILE` + `INFOPLIST_FILE`.  No entitlement/value mismatch found; comment/UI string drift is AR31-IOS-05.  Do not hand-edit any generated `pbxproj` — fix via sources / `project.yml` / entitlements plist only.

---

## Out of scope / not verified on device

Simulator screenshots, real Face ID, real BGAppRefresh delivery timing, and App Store Connect listing copy were not exercised in this pass.  Findings above are from static review of `/Users/jay/apps/autorotate-grok/apple/Autorotate-iOS` against Core + fleet rules.

## Suggested fix order

1. Light-default theme + appearance preference (AR31-IOS-01)  
2. Keychain inventory `codes.autorotate` (+ optional legacy prefixes) (AR31-IOS-02)  
3. Real biometric gate or honest Settings copy (AR31-IOS-03)  
4. Pairing: finish or hide QR; align Companion copy (AR31-IOS-04, 05)  
5. Resync `AppUpdatePrompt.swift` from ios-fleet; set `AppUpdateAppleId` (AR31-IOS-06)  
