# Changelog

All notable changes to this project are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html):
breaking changes bump MAJOR, backwards-compatible features bump MINOR, and
backwards-compatible fixes bump PATCH.

## [1.2.0] - 2026-08-21

### Added

- Complete backup of the Kimi Agent dump (`Kimi_Agent_Autorotate Secret Rotator`)
  under `backups/kimi-agent-autorotate/` with ORIGIN hashes.  The dump had no
  `.git`; this repository's history from `fc50b10` is that product.
- Backup of dump `app/` under `backups/secret-rotator/` (same product family;
  there is no standalone Secret Rotator repo).
- Grok's extra platform catalog in the live web registry and AutorotateCore
  (Coolify, xAI, Groq, Vault, JWT/HMAC generators, and related update-only
  targets).  Dedicated live rotators (Resend, Hugging Face, Neon, Vercel,
  Slack) were already merged in 1.1.0.

### Changed

- Relicensed the project from MIT to Apache License 2.0.  Copyright is Jay
  (the earlier "Autorotate Systems" MIT notice was a placeholder, not a company).
  See `LICENSE` and `NOTICE`.  Historical commits remain MIT as published.


### Added

- Merged the Grok App Builder Autorotate PWA with this monorepo. Backups of both
  trees live under `backups/` (see `MERGE.md`).
- Live rotators for Resend, Slack (`auth.rotate`), Hugging Face, Neon, and
  Vercel token create (web engine).
- `global-api-keys` parser (`apps/web/api/autorotate/env-parse.ts`) with trailing
  Mac agent token support.
- Mac Python agent (`apps/agent/autorotate-agent.py`) for `mac.jays.services`.
- Git tag `backup/pre-grok-merge-2026-08-21` freezes the pre-merge web engine.

### Changed

- Vercel connector is now programmatic (was update-only). Slack is partial.
- Architecture matrix updated for the merged capability set.

## [1.0.0] - 2026-08-21

Initial release of Autorotate — multi-platform secret rotation.

### Added

- **Web control center** (`apps/web`): React + Vite frontend with a Hono +
  tRPC + Drizzle (MySQL) backend; secret inventory, rotation runs, targets,
  audit-chain viewer, and demo mode.
- **AutorotateCore** (`apple/AutorotateCore`): shared Swift package with the
  `LOCK → ROTATE → PUSH → VERIFY → COMMIT → AUDIT` rotation engine,
  connectors (Infisical, file, Keychain, webhook), crypto helpers, and
  append-only hash-chained audit store.
- **iOS app** (`apple/Autorotate-iOS`): SwiftUI companion (iOS 17+) with
  Keychain inventory, background rotation via BGTaskScheduler, and local
  notifications.
- **macOS app** (`apple/Autorotate-macOS`): SwiftUI companion (macOS 14+) with
  file-target management, Keychain inventory, and a rotation scheduler.
- Repo standards pack: CI (web + Apple jobs), release automation, CodeQL,
  Dependabot, issue/PR templates, CODEOWNERS, and the AGENTS.md agent
  coordination manifest.

### Security

- Zero-plaintext storage invariant enforced across all platforms; stored
  credentials encrypted at rest with `AUTOROTATE_ENC_KEY` (web) or the system
  Keychain (Apple).
