# TopSpin — Multi-Platform Secret Rotation Suite

## Goal
Build "TopSpin": a secret-rotation product delivered on three surfaces:
1. **Web app** (React) — dashboard, rotation engine, platform connectors, Infisical sync, file-target updates.
2. **iOS app** (SwiftUI, Xcode-ready source) — rotation client + Apple Keychain integration.
3. **macOS app** (SwiftUI, Xcode-ready source) — same shared core as iOS + Keychain.

## Core product design (all platforms share this architecture)
- **Rotation engine**: connector registry covering as many platforms as feasible —
  Infisical (native sync target), AWS IAM access keys, GitHub PATs / OAuth tokens,
  Stripe restricted keys, OpenAI, Anthropic, Vercel, Cloudflare, Twilio, SendGrid,
  Slack, NPM, Docker Hub, Doppler-style generic REST connectors.
- **Targets**: Infisical projects (set/update secrets via API), local secret files
  (`.env`, JSON, YAML/TOML config, `~/.aws/credentials`-style INI), Apple Keychain
  (native apps only, via Security framework / Keychain Services).
- **Storage model**: apps never persist plaintext secrets in their own DB. Secrets flow
  directly provider → targets (Infisical / Keychain / files). App DB stores metadata
  only: rotation records, schedules, connector configs, status, audit log.
- **Rotation flow per secret**: generate/rotate at provider → update Infisical →
  update file targets → update Keychain (native) → verify → log audit entry →
  schedule next rotation.

## Stages

### Stage 1 — Architecture & connector spec (Orchestrator + coder subagent)
- Define shared rotation-engine contract (JSON spec + TS/Swift type shapes).
- Produce connector capability matrix (which platforms support programmatic rotation,
  which are "update-only" targets).
- Output: `docs/architecture.md`, `shared/rotation-engine-spec.json`.

### Stage 2 — Web app (skill: vibecoding-webapp-swarm)
- Load `vibecoding-webapp-swarm` SKILL.md at stage start.
- React + TypeScript + Tailwind + shadcn/ui dashboard:
  Secrets inventory, connectors, rotation history/audit log, schedules,
  Infisical sync settings, file-target manager, Keychain-status (native bridge note),
  one-click rotate, demo mode with simulated rotation engine in-browser.
- Backend decision pending user answer (full-stack tRPC+DB vs frontend demo).

### Stage 3 — Native apps (iOS + macOS) (skill: vibecoding-general-swarm for orchestration)
- Coder subagent(s) generate Xcode-ready Swift source:
  - `TopSpinCore` Swift package: rotation engine, Infisical API client (REST),
    connector protocols, KeychainManager (Security framework), file-target updaters
    (macOS), crypto (Keychain access groups, kSecAttrAccessibleAfterFirstUnlock).
  - `TopSpin-iOS` SwiftUI app target (views, rotation triggers, background refresh
    via BGTaskScheduler, Keychain storage).
  - `TopSpin-macOS` SwiftUI app target (menu bar + main window, file-target access,
    Keychain + iCloud Keychain sync notes).
  - XcodeGen `project.yml` so user can `xcodegen generate` and open in Xcode.
- Output: `native/` folder with complete buildable source tree.

### Stage 4 — QC, integration, delivery
- Reviewer subagent checks web build passes, Swift code coherence, spec alignment.
- Package deliverables under /mnt/agents/output/TopSpin/; save website version.
- Final response with file references + setup instructions.
