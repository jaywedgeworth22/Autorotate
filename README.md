# Autorotate

[![CI](https://github.com/jaywedgeworth22/Autorotate/actions/workflows/ci.yml/badge.svg)](https://github.com/jaywedgeworth22/Autorotate/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](CHANGELOG.md)

**Autorotate is a multi-platform zero-plaintext secret-rotation lifecycle engine**: a web control center (`Autorotate.codes`) plus native iOS, macOS, and Android companion apps that keep credentials fresh across Infisical, files, Apple Keychain, Android Keystore, and generic webhooks — without ever persisting plaintext secrets.

## What it does

- **Rotation pipeline** — every rotation runs a strict state machine:
  `LOCK → ROTATE → PUSH → VERIFY → COMMIT → AUDIT`. Any failure aborts and
  rolls back before new material is committed.
- **Zero-plaintext rule** — secret material exists only in memory during a
  rotation and is never written to disk, logs, or the database unencrypted.
- **Targets** — Infisical projects, local/remote files, the Apple Keychain,
  Android Keystore, and arbitrary HTTPS webhooks. See the connector capability matrix in
  [docs/architecture.md](docs/architecture.md).
- **Audit chain** — every run appends a hash-chained audit record, so the
  history is tamper-evident.
- **Mac agent** — optional Python agent writes `~/.secrets/global-api-keys`
  and Keychain history on `mac.jays.services`.

## Monorepo layout

```
Autorotate/
├── apps/
│   ├── web/                # Web control center (React + Vite frontend,
│   │                       #   Hono + tRPC + Drizzle backend, MySQL)
│   └── agent/              # Mac Python agent (global-api-keys + Keychain)
├── apple/                  # Apple-platform workspace (XcodeGen)
│   ├── AutorotateCore/        #   Shared SwiftPM package: rotation engine,
│   │                       #   connectors, crypto, Keychain, stores
│   ├── Autorotate-iOS/        #   iOS app (SwiftUI, iOS 17+, codes.autorotate)
│   ├── Autorotate-macOS/      #   macOS app (SwiftUI, macOS 14+, codes.autorotate.macos)
│   └── project.yml         #   XcodeGen spec → Autorotate.xcodeproj
├── android/                # Android companion app (Kotlin + Compose, codes.autorotate)
│   ├── app/                #   Material 3, Biometrics, QR Scanner, .env Importer
│   └── build.gradle.kts    #   Gradle build spec
├── docs/
│   ├── architecture.md     # System architecture + connector capability matrix
│   └── build-plan.md       # Original build plan
├── .github/                # CI, release, CodeQL, Dependabot, templates
├── scripts/                # Repo automation (e.g. push-to-github.sh)
└── AGENTS.md               # Coordination manifest for AI agent fleets
```

## Quickstart

### Web control center (`Autorotate.codes`)

```bash
cd apps/web
cp .env.example .env        # fill in DATABASE_URL etc.
npm install
npm run db:push             # create schema
npm run db:seed             # optional demo data
npm run dev                 # start dev server
```

### Apple apps (iOS + macOS)

```bash
brew install xcodegen
cd apple
xcodegen generate
open Autorotate.xcodeproj
```

Or build/test just the shared core with SwiftPM:

```bash
cd apple/AutorotateCore
swift build && swift test
```

### Android companion app

```bash
cd android
./gradlew assembleDebug
```

To produce a signed release build locally, create `android/keystore.properties`
(never committed — see `.gitignore`) with `storeFile`, `storePassword`,
`keyAlias`, and `keyPassword`, then run `./gradlew assembleRelease`.  Without
that file the release build type is left unsigned rather than falling back to
the debug key.

## Releases

Distributable artifacts (APK, IPA, `.pkg`) are published through
[GitHub Releases](../../releases), never committed to the repository — see
`.gitignore`.  A prior release (`1.0.0`) committed a debug-signed Android APK
and a development provisioning profile containing a hardware device UDID
directly to this public repo; both were removed, but the signing identity and
UDID were exposed in git history and **must be treated as public** going
forward (see `docs/AUDIT-2026-08-26.md`, findings AR-33 and AR-34).  The
debug keystore in particular is not a secret an owner can rotate — it ships
with every Android SDK install — so no additional action recovers
confidentiality for that artifact; the fix is that release builds are no
longer signed with it (see AR-13).

## Documentation

- [Architecture & connector capability matrix](docs/architecture.md)
- [How the Grok and GitHub trees were merged](MERGE.md)
- [Build plan](docs/build-plan.md)
- [Apple workspace notes](apple/README.md) · [macOS notes](apple/README-macOS.md)
- [Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md) ·
  [Changelog](CHANGELOG.md) · [Agent coordination](AGENTS.md)

## License

Apache License 2.0 — © 2026 Jay.  See [LICENSE](LICENSE) and [NOTICE](NOTICE).

This project was previously distributed under the MIT License (placeholder
copyright "Autorotate Systems").  As of 2026-08-21 new copies are Apache-2.0.
Historical commits remain MIT as originally published.
