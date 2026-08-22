# TopSpin — macOS App

The macOS deliverable for TopSpin: a SwiftUI app (macOS 14+, Swift 5.9) that
wraps the tested [`TopSpinCore`](../TopSpinCore) rotation engine with a main
window, a menu-bar companion, SwiftData persistence and sandboxed file-target
management. Everything follows `../docs/architecture.md` — six-step pipeline
(LOCK → ROTATE → PUSH → VERIFY → COMMIT → AUDIT), no plaintext persistence,
fingerprint-only audit logs.

## Layout

```
TopSpin-macOS/
├── TopSpinMacApp.swift        @main: WindowGroup (NavigationSplitView sidebar:
│                              Dashboard / Secrets / Runs / File Targets /
│                              Settings) + MenuBarExtra (health dot, due count,
│                              "Rotate due now", recent runs, quick links)
├── AppState.swift             Composition root: ModelContainer, SwiftData
│                              stores, KeychainManager, RotationEngine wiring
│                              (connectorProvider / infisicalClientProvider /
│                              keychainWriter closures), secret CRUD helpers
├── RotationScheduler.swift    Timer-based scheduler driving
│                              RotationEngine.rotateDueSecrets() while running
├── Stores+SwiftData.swift     @Model entities (Secret/Run/Audit/FileTarget) +
│                              @ModelActor stores implementing TopSpinCore's
│                              SecretStore / RotationRunStore / AuditStore,
│                              format auto-detection, last-write inspection
├── ConnectorConfig.swift      Per-secret connector settings ([String:String],
│                              non-secret) + ConnectorFactory for all 15
│                              registered connectors
├── Bookmarks.swift            Security-scoped bookmark create/resolve +
│                              SecurityScope RAII wrapper around pipeline runs
├── KeychainInventory.swift    Settings-screen listing of com.topspin Keychain
│                              items (metadata only — never values)
├── AppSettings.swift          UserDefaults-backed settings: Infisical config
│                              (clientId/workspace/env — the clientSecret goes
│                              to the Keychain), scheduler interval, iCloud
│                              Keychain sync preference
├── Theme.swift                Dark security-instrument aesthetic: near-black,
│                              #2EE6A8 accent, monospaced fingerprint chips
├── DashboardView.swift        Health ring, due queue, recent audit activity
├── SecretsView.swift          Table (masked values, fingerprint chips), Rotate
│                              Now with confirmation, update-only import sheet,
│                              policy editor, target bindings, credential store
├── RunsView.swift             Run history + per-step pipeline view with logs
├── FileTargetsView.swift      Drag-in / NSOpenPanel registration, format
│                              detection, managed keys, last-write status
├── SettingsView.swift         Infisical, Keychain inventory + iCloud toggle,
│                              scheduler interval
└── TopSpinMac.entitlements    Sandbox + user-selected read-write + bookmarks +
                               network client + keychain-access-groups
```

The XcodeGen target definition is already merged into the combined
`../project.yml` (both the iOS and macOS targets generate together).

## Build & run

```bash
brew install xcodegen
cd native
xcodegen generate
open TopSpin.xcodeproj
```

Select the **TopSpin-macOS** scheme, any Mac destination, and run (⌘R).
Requires Xcode 15+ (Swift 5.9 toolchain), macOS 14+.

The core package builds and tests standalone without Xcode:

```bash
cd native/TopSpinCore && swift build && swift test
```

## Capabilities & signing

Enable in Xcode (Signing & Capabilities) or verify they're picked up from
`TopSpinMac.entitlements`:

- **App Sandbox** — on; the app is fully sandboxed.
- **User Selected File (Read/Write)** —
  `com.apple.security.files.user-selected.read-write`: file targets are
  picked via NSOpenPanel or drag-and-drop; the app rewrites them atomically.
- **Security-scoped bookmarks** —
  `com.apple.security.files.bookmarks.app-scope`: lets the app persist
  `URL.bookmarkData(options: .withSecurityScope)` in SwiftData so scheduled
  rotations keep access to user-picked files across launches
  (`Bookmarks.swift` resolves and refreshes stale bookmarks).
- **Outgoing Connections (Client)** — provider APIs, Infisical, webhooks.
- **Keychain Sharing** — `$(AppIdentifierPrefix)com.topspin.shared` in
  `keychain-access-groups`, shared with the iOS app/extensions. Required on
  macOS 14+ for iCloud Keychain (`kSecAttrSynchronizable`) items; sync is
  "if allowed" (user's iCloud Keychain setting) and falls back to
  device-local automatically. Admin credentials and the Infisical
  clientSecret are never marked synchronizable.

## Data-flow notes

- SwiftData persists **metadata only**: secret records (name, policy,
  bindings, status, `sha256(value)[0:8]` fingerprint), run history with
  per-step results, the append-only audit log, and file-target bookmarks.
  Plaintext values never enter SwiftData — they flow provider → targets in
  memory inside `RotationEngine`.
- Connector admin credentials and the Infisical Universal Auth clientSecret
  live in the Keychain via `KeychainManager`
  (`com.topspin.credential.<connectorId>.<secretId>` /
  `com.topspin.infisical.<workspaceId>`), `kSecAttrAccessibleAfterFirstUnlock`.
- File-target writes happen inside a `SecurityScope` that holds
  security-scoped access to all registered file bookmarks for the duration
  of each pipeline run.
- The scheduler is a `Timer` while the app runs; the `MenuBarExtra` scene
  keeps the process resident, and its icon reflects due/failed state.
