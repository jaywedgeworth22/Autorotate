# TopSpin — Native (iOS / macOS)

This folder contains the Apple-platform deliverables for TopSpin, the
secret-rotation product. Everything follows `../docs/architecture.md`:
the six-step rotation pipeline (LOCK → ROTATE → PUSH → VERIFY → COMMIT →
AUDIT), no plaintext persistence, fingerprint-only audit logs.

## Layout

```
native/
├── README.md                    ← this file
└── TopSpinCore/                 ← SwiftPM package (no third-party deps)
    ├── Package.swift            ← swift-tools 5.9, iOS 17 / macOS 14
    ├── Sources/TopSpinCore/
    │   ├── Models.swift             SecretRecord, RotationPolicy, RotationRun,
    │   │                            RotationStepResult, AuditEntry, TargetBinding
    │   │                            (+ Infisical/File/Webhook/Keychain configs)
    │   ├── Connectors.swift         SecretConnector protocol, ConnectorError,
    │   │                            ConnectorRegistry (capability matrix)
    │   ├── Connectors+Providers.swift   AWS IAM (SigV4), GitHub, Stripe,
    │   │                                OpenAI, Anthropic, Cloudflare
    │   ├── Connectors+More.swift        Vercel, Twilio, SendGrid, Slack, npm,
    │   │                                Docker Hub, Kubernetes, Infisical
    │   │                                (source), GenericREST
    │   ├── InfisicalClient.swift    Universal Auth login, raw secrets v3
    │   │                            upsert/read-back, configurable baseUrl
    │   ├── KeychainManager.swift    Security-framework wrapper (see
    │   │                            entitlements below); credential store AND
    │   │                            rotation target
    │   ├── FileTargets.swift        .env / JSON / YAML / TOML / INI key
    │   │                            updaters with atomic writes (tmp+rename)
    │   ├── RotationEngine.swift     actor running the full pipeline,
    │   │                            per-secret locking, dueSecrets(now:)
    │   ├── Stores.swift             SecretStore / AuditStore / RotationRunStore
    │   │                            protocols + in-memory reference impls
    │   ├── HTTPClient.swift         async/await URLSession wrapper
    │   ├── Crypto.swift             SHA-256/HMAC façade (CryptoKit on Apple
    │   │                            platforms, pure-Swift fallback for CI)
    │   └── Fingerprint.swift        sha256(value)[0:8] fingerprints + CSPRNG
    │                                secret generation
    └── Tests/TopSpinCoreTests/    XCTest suite for parsers, models, engine
├── project.yml                  ← XcodeGen spec (iOS target + macOS
│                                  placeholder owned by the macOS agent)
├── TopSpin-iOS/                 ← iOS 17+ SwiftUI app (bundle com.topspin.ios)
│   ├── TopSpinApp.swift         ← @main App, BGTask registration, dark theme
│   ├── ContentView.swift        ← TabView: Dashboard/Secrets/Runs/Settings
│   ├── AppModel.swift           ← @Observable @MainActor engine wiring
│   ├── Stores+SwiftData.swift   ← SwiftData SecretStore/AuditStore/
│   │                              RotationRunStore + connector-config store
│   ├── AdminCredentialProvider.swift  ← Keychain-backed AdminCredentialProvider
│   ├── ConnectorFactory.swift   ← per-connector config fields + instantiation
│   ├── SettingsStorage.swift    ← UserDefaults, non-secret only (Sendable)
│   ├── KeychainInventory.swift  ← lists TopSpin-managed keychain items
│   ├── BackgroundRotation.swift ← BGAppRefreshTask com.topspin.refresh
│   ├── NotificationManager.swift← local alerts on rotation failure
│   ├── Theme.swift + Views/     ← security-instrument UI (green #2EE6A8)
│   ├── TopSpin.entitlements     ← keychain-access-groups com.topspin.shared
│   └── Info.plist               ← BGTaskSchedulerPermittedIdentifiers, fetch
└── TopSpin-macOS/               ← placeholder, owned by the macOS agent
```

The SwiftUI app targets (`TopSpin-iOS`, `TopSpin-macOS`) consume
`TopSpinCore` and back the store protocols with SwiftData/UserDefaults.
They are generated from the XcodeGen `project.yml` (see below).

## Building

### The core package (no Xcode required)

```bash
cd native/TopSpinCore
swift build        # builds the library
swift test         # runs the parser/model/engine unit tests
```

Works on any Mac with Xcode 15+ (Swift 5.9). The package is platform-gated
to iOS 17 / macOS 14; on Linux everything except the `Security`-framework
`KeychainManager` compiles, which keeps CI possible. `swift build` and the
22-case `swift test` suite (parsers, models, fingerprint vectors, and an
end-to-end engine run incl. the per-secret lock) pass on Swift 5.9.2.

### The apps (XcodeGen)

Both app targets are described by a single `project.yml` in this folder and
generated with [XcodeGen](https://github.com/yonsm/XcodeGen):

```bash
brew install xcodegen
cd native
xcodegen generate          # creates TopSpin.xcodeproj
open TopSpin.xcodeproj
```

Both app targets link the `TopSpinCore` SwiftPM package (local path
`./TopSpinCore`) — no other dependencies.

#### iOS app (`TopSpin-iOS/`, bundle id `com.topspin.ios`, iOS 17+)

1. `xcodegen generate` as above, then open `TopSpin.xcodeproj`.
2. Select the `TopSpin-iOS` target → **Signing & Capabilities**:
   - Set your **Team** (Automatic signing is preconfigured).
   - Add the **Keychain Sharing** capability with group
     `$(AppIdentifierPrefix)com.topspin.shared` (already in
     `TopSpin-iOS/TopSpin.entitlements`).
   - Add **Background Modes** → check **Background fetch**
     (matches `BGTaskSchedulerPermittedIdentifiers` = `com.topspin.refresh`
     in `TopSpin-iOS/Info.plist`, merged with the `INFOPLIST_KEY_*` build
     settings because `GENERATE_INFOPLIST_FILE = YES`).
   - **Push is NOT needed** — notifications are local
     (`UNUserNotificationCenter`, rotation-failure alerts only).
3. Run on a device or simulator (iOS 17+). Background refresh tasks only
   fire on real devices; from Xcode you can simulate one via
   `e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"com.topspin.refresh"]`
   in the debugger while paused.

If you haven't enabled Keychain Sharing yet, the app still works: Settings →
Keychain options → turn off "Shared access group" to use app-private items
during development (the iCloud-sync toggle degrades gracefully in the same
way — `kSecAttrSynchronizable` failures fall back to local items).

#### macOS app (`TopSpin-macOS/`)

See `README-macOS.md`. Its XcodeGen target (`TopSpin-macOS`) is already
merged into `project.yml` alongside the iOS target — one
`xcodegen generate` produces both.

## Entitlements & capabilities

### Keychain Sharing (both apps + extensions)

TopSpin stores connector admin credentials, the Infisical Universal Auth
clientSecret, and (optionally) managed secret values in the Apple Keychain,
shared across the iOS app, macOS app, and extensions via one access group:

```xml
<key>keychain-access-groups</key>
<array>
    <string>$(AppIdentifierPrefix)com.topspin.shared</string>
</array>
```

Enable the **Keychain Sharing** capability in Xcode and add
`$(AppIdentifierPrefix)com.topspin.shared` to every target that must share
items. `KeychainManager` defaults to this group
(`KeychainManager.sharedAccessGroup`); pass `accessGroup: nil` for
app-private items during development.

### iCloud Keychain ("if allowed")

Managed-secret targets may set `synchronizable: true`
(`KeychainTargetConfig.synchronizable`), which stores items with
`kSecAttrSynchronizable = true` so they follow the user's iCloud Keychain.

- No extra entitlement is needed on iOS; on macOS 14+ the Keychain Sharing
  capability must be enabled.
- Sync only happens **if allowed** — the user must have iCloud Keychain
  turned on. If not, `SecItemAdd` fails and `KeychainManager.save`
  automatically retries as a device-local item.
- Admin credentials and the Infisical clientSecret are **never** marked
  synchronizable by TopSpin — they stay on-device.

### Background rotation (iOS)

The scheduler (`RotationEngine.rotateDueSecrets`) is driven by
`BGTaskScheduler` — a `BGAppRefreshTask` registered as
`com.topspin.refresh` (see `TopSpin-iOS/BackgroundRotation.swift`; a new
refresh is scheduled every time the app backgrounds). Items use
`kSecAttrAccessibleAfterFirstUnlock` so background tasks can read admin
credentials after the device's first unlock.

### macOS file targets

The macOS app needs user-selected file access (security-scoped bookmarks or
Full Disk Access for paths like `~/.aws/credentials`) depending on sandbox
configuration; `FileTargetEngine` works with any readable/writable path.

## Storage rule (hard requirement)

Plaintext secret values exist **only in memory** during a rotation run.
`SecretRecord`, `RotationRun`, `AuditEntry` and all stores carry metadata
plus `sha256(value)[0:8]` fingerprints — never values. Values land only at
the provider, Infisical, target files, the Keychain, and (optionally)
webhook receivers that explicitly opt in via
`WebhookTargetConfig.includeSecretValue`.

## Connector capability matrix

See `ConnectorRegistry.all` and `docs/architecture.md` §3. `updateOnly`
connectors (Vercel, Slack, PAT-mode GitHub, …) throw
`ConnectorError.manualRotationRequired` from `rotate(...)`; the engine then
uses the value the user imported from the provider UI
(`RotationEngine.rotate(secretId:actor:trigger:importedValue:)`).
