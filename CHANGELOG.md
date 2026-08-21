# Changelog

All notable changes to this project are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html):
breaking changes bump MAJOR, backwards-compatible features bump MINOR, and
backwards-compatible fixes bump PATCH.

## [1.1.0] - 2026-08-21

### Added

- Merged the Grok App Builder TopSpin PWA with this monorepo. Backups of both
  trees live under `backups/` (see `MERGE.md`).
- Live rotators for Resend, Slack (`auth.rotate`), Hugging Face, Neon, and
  Vercel token create (web engine).
- `global-api-keys` parser (`apps/web/api/topspin/env-parse.ts`) with trailing
  Mac agent token support.
- Mac Python agent (`apps/agent/topspin-agent.py`) for `mac.jays.services`.
- Git tag `backup/pre-grok-merge-2026-08-21` freezes the pre-merge web engine.

### Changed

- Vercel connector is now programmatic (was update-only). Slack is partial.
- Architecture matrix updated for the merged capability set.

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
