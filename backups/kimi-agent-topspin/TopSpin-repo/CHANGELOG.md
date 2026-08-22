# Changelog

All notable changes to this project are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html):
breaking changes bump MAJOR, backwards-compatible features bump MINOR, and
backwards-compatible fixes bump PATCH.

## [1.0.0] - 2026-08-21

Initial release of TopSpin — multi-platform secret rotation.

### Added

- **Web control center** (`apps/web`): React + Vite frontend with a Hono +
  tRPC + Drizzle (MySQL) backend; secret inventory, rotation runs, targets,
  audit-chain viewer, and demo mode.
- **TopSpinCore** (`apple/TopSpinCore`): shared Swift package with the
  `LOCK → ROTATE → PUSH → VERIFY → COMMIT → AUDIT` rotation engine,
  connectors (Infisical, file, Keychain, webhook), crypto helpers, and
  append-only hash-chained audit store.
- **iOS app** (`apple/TopSpin-iOS`): SwiftUI companion (iOS 17+) with
  Keychain inventory, background rotation via BGTaskScheduler, and local
  notifications.
- **macOS app** (`apple/TopSpin-macOS`): SwiftUI companion (macOS 14+) with
  file-target management, Keychain inventory, and a rotation scheduler.
- Repo standards pack: CI (web + Apple jobs), release automation, CodeQL,
  Dependabot, issue/PR templates, CODEOWNERS, and the AGENTS.md agent
  coordination manifest.

### Security

- Zero-plaintext storage invariant enforced across all platforms; stored
  credentials encrypted at rest with `TOPSPIN_ENC_KEY` (web) or the system
  Keychain (Apple).
