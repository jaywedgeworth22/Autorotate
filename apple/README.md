# Autorotate — Native Apple Apps (iOS / macOS)

This folder contains the Apple-platform deliverables for Autorotate (`Autorotate.codes`), the
zero-plaintext secret-rotation product. Everything follows `../docs/architecture.md`:
the six-step rotation pipeline (LOCK → ROTATE → PUSH → VERIFY → COMMIT →
AUDIT), no plaintext persistence, fingerprint-only audit logs.

## Layout

```
apple/
├── README.md                    ← this file
├── README-macOS.md              ← macOS companion documentation
└── AutorotateCore/                 ← SwiftPM package (no third-party deps)
    ├── Package.swift            ← swift-tools 5.9, iOS 17 / macOS 14
    ├── Sources/AutorotateCore/
    │   ├── Models.swift             SecretRecord, RotationPolicy, RotationRun,
    │   │                            RotationStepResult, AuditEntry, TargetBinding
    │   │                            (+ Infisical/File/Webhook/Keychain configs)
    │   ├── Connectors.swift         SecretConnector protocol, ConnectorError,
    │   │                            ConnectorRegistry (capability matrix)
    │   ├── Connectors+Providers.swift   AWS IAM (SigV4), GitHub, Stripe,
    │   │                                OpenAI, Anthropic, Cloudflare
    │   ├── Connectors+More.swift        Vercel, Twilio, SendGrid, Slack, npm,
    │   │                                Docker Hub, Kubernetes, Infisical
    │   │                                (source), GenericREST, Resend, Hugging Face, Neon
    │   ├── InfisicalClient.swift    Universal Auth login, raw secrets v3
    │   │                            upsert/read-back, configurable baseUrl
    │   ├── KeychainManager.swift    Security-framework wrapper (see
    │   │                            entitlements below); credential store AND
    │   │                            rotation target (codes.autorotate.shared)
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
    └── Tests/AutorotateCoreTests/    XCTest suite (27 tests)
├── project.yml                  ← XcodeGen spec → Autorotate.xcodeproj
├── Autorotate-iOS/                 ← iOS 17+ SwiftUI app (bundle codes.autorotate)
│   ├── AutorotateApp.swift         ← @main App, BGTask registration, dark theme
│   ├── ContentView.swift        ← TabView: Dashboard/Secrets/Runs/Settings
│   ├── AppModel.swift           ← @Observable @MainActor engine wiring
│   ├── Stores+SwiftData.swift   ← SwiftData SecretStore/AuditStore/
│   │                              RotationRunStore + connector-config store
│   ├── AdminCredentialProvider.swift  ← Keychain-backed AdminCredentialProvider
│   ├── ConnectorFactory.swift   ← per-connector config fields + instantiation
│   ├── SettingsStorage.swift    ← UserDefaults, non-secret only (Sendable)
│   ├── KeychainInventory.swift  ← lists Autorotate-managed keychain items
│   ├── BackgroundRotation.swift ← BGAppRefreshTask codes.autorotate.refresh
│   ├── NotificationManager.swift← local alerts on rotation failure
│   ├── Theme.swift + Views/     ← security-instrument UI (green #4ECCA3)
│   ├── Autorotate.entitlements     ← keychain-access-groups codes.autorotate.shared
│   └── Info.plist               ← BGTaskSchedulerPermittedIdentifiers, fetch
└── Autorotate-macOS/               ← macOS 14+ app (bundle codes.autorotate.macos)
```

The SwiftUI app targets (`Autorotate-iOS`, `Autorotate-macOS`) consume
`AutorotateCore` and back the store protocols with SwiftData/UserDefaults.
They are generated from the XcodeGen `project.yml`.

## Building

### The core package (no Xcode required)

```bash
cd apple/AutorotateCore
swift build        # builds the library
swift test         # runs the 27 unit tests
```

### The apps (XcodeGen)

Both app targets are described by `project.yml` in this folder:

```bash
brew install xcodegen
cd apple
xcodegen generate          # creates Autorotate.xcodeproj
open Autorotate.xcodeproj
```

#### iOS app (`Autorotate-iOS`, bundle id `codes.autorotate`, iOS 17+)

1. `xcodegen generate` as above, then open `Autorotate.xcodeproj`.
2. Select the `Autorotate-iOS` target → **Signing & Capabilities**:
   - Team: **Jay Wedgeworth, LLC (`CC8UTF7ATG`)**.
   - Keychain Sharing capability with group `$(AppIdentifierPrefix)codes.autorotate.shared`.
   - Background Modes: Background fetch (`codes.autorotate.refresh`).

#### macOS app (`Autorotate-macOS`, bundle id `codes.autorotate.macos`, macOS 14+)

See `README-macOS.md`.  One `xcodegen generate` produces both schemes.

## Entitlements & capabilities

### Keychain Sharing (both apps + extensions)

```xml
<key>keychain-access-groups</key>
<array>
    <string>$(AppIdentifierPrefix)codes.autorotate.shared</string>
</array>
```


Enable the **Keychain Sharing** capability in Xcode and add
`$(AppIdentifierPrefix)com.autorotate.shared` to every target that must share
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
  synchronizable by Autorotate — they stay on-device.

### Background rotation (iOS)

The scheduler (`RotationEngine.rotateDueSecrets`) is driven by
`BGTaskScheduler` — a `BGAppRefreshTask` registered as
`com.autorotate.refresh` (see `Autorotate-iOS/BackgroundRotation.swift`; a new
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
