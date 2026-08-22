# AGENTS.md — Agent Coordination Manifest

This file is the **authoritative coordination manifest for AI agent fleets**
working on the TopSpin monorepo. Human contributors should read
[CONTRIBUTING.md](CONTRIBUTING.md) instead. Read this file fully before
touching any code.

## Mission

TopSpin rotates secrets across platforms without ever persisting plaintext.
Agents working here extend the web control center, the Apple companion apps,
and the shared TopSpinCore engine **without weakening the security
invariants**. When a task and an invariant conflict, the invariant wins —
stop and escalate in the PR description.

## Module map & ownership boundaries

| Module | Path | Stack | Ownership boundary |
|---|---|---|---|
| Web control center | `apps/web/` | React + Vite frontend; Hono + tRPC + Drizzle backend; MySQL | Everything under `apps/web/`. Never edit `apple/` from a web task. |
| TopSpinCore | `apple/TopSpinCore/` | SwiftPM library (no third-party deps) | Shared engine: rotation pipeline, connectors, crypto, Keychain, stores. Changes here affect BOTH apps — require cross-platform review. |
| iOS app | `apple/TopSpin-iOS/` | SwiftUI, iOS 17+ | iOS-only UI/background/notifications. Must only consume TopSpinCore's **public** API. |
| macOS app | `apple/TopSpin-macOS/` | SwiftUI, macOS 14+ | macOS-only UI/scheduler/file targets. Must only consume TopSpinCore's **public** API. |
| Docs | `docs/` | Markdown | `architecture.md` is the source of truth for the connector capability matrix; keep it in sync with code changes. |

Claim exactly one module per task/branch unless the task explicitly spans an
interface listed below. Never "drive-by" edit another module.

## Hard invariants (violations = automatic rejection)

1. **NEVER persist plaintext secrets** — not to the DB, disk, logs, crash
   reports, error messages, or git history. Secret material lives in memory
   only for the duration of a rotation; clear buffers after use.
2. **Audit chain stays append-only and hash-chained** — never update or
   delete existing audit records; corrections are new appended entries.
3. **The connector capability matrix in `docs/architecture.md` is the source
   of truth** — if you change connector behavior, update the matrix in the
   same commit.
4. **FK columns are `bigint unsigned` in Drizzle** — all foreign-key columns
   in `apps/web/db/schema.ts` must match the referenced primary key type
   (`bigint`, `unsigned`); mismatched types break MySQL migrations.

## Workflow protocol for agents

1. **Read** `docs/architecture.md` before writing any code.
2. **Claim a module** from the map above (announce in your branch name or PR
   body, e.g. `module: apple/TopSpinCore`).
3. **Branch** off `main`: `feat/<desc>`, `fix/<desc>`, or `chore/<desc>`.
4. **Commit** with [Conventional Commits](https://www.conventionalcommits.org/),
   scoped by module: `feat(core): …`, `fix(web): …`, `chore(repo): …`.
5. **CI green** — `web` job (`npm ci && npm run check && npm run build` in
   `apps/web`) and/or `apple` job (`swift test` in `apple/TopSpinCore`,
   `xcodegen generate`, both app schemes build) must pass before merge.
6. **PR** — fill the template; the checklist items "no plaintext secrets
   persisted" and "audit-chain integrity preserved" are mandatory, not
   advisory.

## Interfaces between modules

- **tRPC contracts** — `apps/web/contracts/` defines the typed API surface
  between the web frontend and backend (router inputs/outputs, error
  shapes). Frontend and backend changes that alter the contract must land
  together, and `contracts/` must be updated in the same commit.
- **TopSpinCore public API** — `apple/TopSpinCore/Sources/TopSpinCore/` is
  the only import surface for both apps (`RotationEngine`, connectors,
  stores, crypto). Apps must not reach into Core internals; new app-facing
  capabilities require a public API addition in Core first.
- The web app and Apple apps do **not** talk to each other directly today;
  any future sync interface must be designed in `docs/architecture.md`
  before implementation.

## Session handoff template

When an agent session ends mid-work (or hands a module to another agent),
append a handoff note to your PR description using this template:

```markdown
### Session handoff
- **Module claimed**: <e.g. apps/web>
- **Branch**: <branch name>
- **Done**: <completed work, commit SHAs>
- **In progress**: <partial state, what compiles/passes and what does not>
- **Next steps**: <ordered remaining tasks>
- **Invariants touched**: <zero-plaintext / audit-chain / capability-matrix /
  FK-typing — how each was preserved>
- **Open questions**: <decisions needing a maintainer>
```
