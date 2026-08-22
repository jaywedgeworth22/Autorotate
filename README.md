# TopSpin

[![CI](https://github.com/jaywedgeworth22/TopSpin/actions/workflows/ci.yml/badge.svg)](https://github.com/jaywedgeworth22/TopSpin/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](CHANGELOG.md)

**TopSpin is a multi-platform secret-rotation system**: a web control center plus
iOS and macOS companion apps that keep credentials fresh across Infisical,
files, the macOS/iOS Keychain, and generic webhooks — without ever persisting
plaintext secrets.

## What it does

- **Rotation pipeline** — every rotation runs a strict state machine:
  `LOCK → ROTATE → PUSH → VERIFY → COMMIT → AUDIT`. Any failure aborts and
  rolls back before new material is committed.
- **Zero-plaintext rule** — secret material exists only in memory during a
  rotation and is never written to disk, logs, or the database unencrypted.
- **Targets** — Infisical projects, local/remote files, the Apple Keychain,
  and arbitrary HTTPS webhooks. See the connector capability matrix in
  [docs/architecture.md](docs/architecture.md).
- **Audit chain** — every run appends a hash-chained audit record, so the
  history is tamper-evident.
- **Mac agent** — optional Python agent writes `~/.secrets/global-api-keys`,
  Drive, and Keychain history on `mac.jays.services`.

The 2026-08-21 merge with the Grok App Builder PWA is documented in
[MERGE.md](MERGE.md).  Native iOS/macOS apps were not rewritten.  The Kimi
Agent dump (`Kimi_Agent_TopSpin Secret Rotator`) is backed up under
`backups/kimi-agent-topspin/` — that dump had no git history; this repo
*is* that history starting at `fc50b10`.

## Monorepo layout

```
TopSpin/
├── apps/
│   ├── web/                # Web control center (React + Vite frontend,
│   │                       #   Hono + tRPC + Drizzle backend, MySQL)
│   └── agent/              # Mac Python agent (global-api-keys + Keychain)
├── apple/                  # Apple-platform workspace (XcodeGen)
│   ├── TopSpinCore/        #   Shared SwiftPM package: rotation engine,
│   │                       #   connectors, crypto, Keychain, stores
│   ├── TopSpin-iOS/        #   iOS app (SwiftUI, iOS 17+)
│   ├── TopSpin-macOS/      #   macOS app (SwiftUI, macOS 14+)
│   └── project.yml         #   XcodeGen spec → TopSpin.xcodeproj
├── backups/                # Frozen copies of prior implementations
│   ├── github-web-pre-merge-2026-08-21/
│   ├── grok-web-2026-08-21/
│   ├── kimi-agent-topspin/  # Complete Kimi dump (TopSpin-repo, native, zips, app/)
│   └── secret-rotator/      # Dump `app/` (same product family; not a standalone repo)
├── docs/
│   ├── architecture.md     # System architecture + connector capability matrix
│   └── build-plan.md       # Original build plan
├── MERGE.md                # How the GitHub and Grok trees were combined
├── .github/                # CI, release, CodeQL, Dependabot, templates
├── scripts/                # Repo automation (e.g. push-to-github.sh)
└── AGENTS.md               # Coordination manifest for AI agent fleets
```

## Quickstart

### Web control center

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
open TopSpin.xcodeproj
```

Or build/test just the shared core with SwiftPM:

```bash
cd apple/TopSpinCore
swift build && swift test
```

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
copyright "TopSpin Systems").  As of 2026-08-21 new copies are Apache-2.0.
Historical commits remain MIT as originally published.
