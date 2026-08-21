# TopSpin — Handoff Note for a Local (Non-Kimi) Agent

**Date:** 2026-08-21 · **From:** Kimi orchestration swarm · **To:** a local agent (or human) running on the Mac

> **2026-08-21 GROK update:** the Grok App Builder PWA was merged into this
> monorepo (`MERGE.md`). Backups of both trees are under `backups/`. Native
> Apple apps were not rewritten. The six-step pipeline and zero-plaintext
> rule still apply.

This document is a complete, self-contained briefing. You do not need any prior
context. Follow the tasks in order.

---

## 0. What exists right now

TopSpin is a multi-platform secret-rotation product. Everything below is **already
built and committed** in this repository (`main` branch, clean tree):

| Component | Path | State |
|---|---|---|
| Web control center (React 19 + Vite + Hono/tRPC/Drizzle/MySQL) | `apps/web/` | `npm run check` + `npm run build` passed at build time; seeded demo data; demo-mode rotation engine |
| Shared Swift package (rotation engine, 15 connectors, Infisical client, KeychainManager, file-target engine) | `apple/TopSpinCore/` | **Compiler-verified**: `swift build` + `swift test` — 22/22 tests passing (Swift 5.9.2, Linux toolchain) |
| iOS app (SwiftUI, iOS 17+) | `apple/TopSpin-iOS/` | Manually audited against TopSpinCore APIs; **never compiled** (no Mac available at build time) |
| macOS app (SwiftUI + MenuBarExtra, macOS 14+) | `apple/TopSpin-macOS/` | Same — manually audited, **never compiled** |
| XcodeGen spec (both app targets, already merged) | `apple/project.yml` | YAML-validated; paths verified to resolve |
| Architecture spec | `docs/architecture.md` | Source of truth for the rotation pipeline + connector capability matrix |
| Standards pack | root + `.github/` | LICENSE (MIT), CONTRIBUTING, SECURITY, CHANGELOG v1.0.0, CODEOWNERS, CoC, PR/issue templates, Dependabot, CodeQL |
| Agent coordination manifest | `AGENTS.md` | Module ownership, invariants, workflow protocol for AI agent fleets |
| CI | `.github/workflows/ci.yml` | `web` job (ubuntu) + `apple` job (`macos-26`, Xcode 26, builds both schemes) |
| Secret scan gate | `.github/workflows/secret-scan.yml` | Gitleaks full-history scan on every push/PR |
| Push script | `scripts/push-to-github.sh` | Creates `jaywedgeworth22/TopSpin` (public) via REST API and pushes `main` |

### Product invariants (never violate these)
1. **Zero plaintext persistence.** Secret values exist only in memory during a
   rotation run. Persistent stores hold metadata + sha256 fingerprints only.
   Values land only at: the provider, Infisical, target files, Apple Keychain.
2. **Audit log is append-only and hash-chained** (`entryHash = sha256(prevHash + canonical)[0:16]`).
3. Rotation pipeline is exactly `LOCK → ROTATE → PUSH → VERIFY → COMMIT → AUDIT`.
4. The connector capability matrix in `docs/architecture.md` §3 is the source of truth.

---

## Task 1 — Push to GitHub as `jaywedgeworth22/TopSpin` (PUBLIC)

The repo is prepared but **not yet pushed** — the build environment had no GitHub
credentials. The token reportedly lives in the owner's "global api keys" store on
`mac.jays.services` (a `mac-collab` service); retrieve it there or use any
`gh`-authenticated session.

### Option A — gh CLI (preferred)
```bash
cd /Code/TopSpin            # or wherever this repo was placed
gh auth status              # must be logged in as jaywedgeworth22
gh repo create jaywedgeworth22/TopSpin --public \
  --description "Multi-platform secret rotation: web control center + iOS/macOS companions (zero-plaintext, LOCK-ROTATE-PUSH-VERIFY-COMMIT-AUDIT)" \
  --source . --remote origin --push
```

### Option B — token + script
```bash
cd /Code/TopSpin
GITHUB_TOKEN=<token-with-repo-scope> bash scripts/push-to-github.sh
# owner defaults to jaywedgeworth22; repo is created PUBLIC; script is idempotent
```

### Before pushing — mandatory secret sweep (this will be a PUBLIC repo)
```bash
# If gitleaks is installed locally (brew install gitleaks):
gitleaks git --verbose .        # must report 0 leaks
# Also confirm by eye:
grep -rn "BEGIN.*PRIVATE KEY\|ghp_\|sk-\|AKIA" --include="*" . | grep -v ".git/" | grep -viE "example|placeholder|format|e\.g\.|docs/"
# Expected: only docs/code discussing formats, no real values.
# apps/web/.env must NOT be tracked — verify: git ls-files | grep -x "apps/web/.env" → empty
```
Note: `apps/web/.env.example` contains placeholders only — that is intentional and safe.

### After pushing
1. Confirm `https://github.com/jaywedgeworth22/TopSpin` is **Public**.
2. Actions tab: `CI` and `Secret Scan` workflows should trigger on the push — watch the first run.
3. Settings → Branches → add protection for `main`: require PR + status checks `web`, `apple`, `gitleaks`.
4. If `macos-26` runner label is unavailable in your plan, edit `.github/workflows/ci.yml`:
   `runs-on: macos-latest` and keep the Xcode_26 `xcode-select` step (it no-ops gracefully if absent,
   falling back to the runner's default Xcode — then update the step once Xcode 26 is installed).

---

## Task 2 — Build with Xcode 26 locally

Prereqs: macOS with Xcode 26 installed, `brew install xcodegen`.

```bash
cd /Code/TopSpin/apple

# 1. Package first — must stay green:
cd TopSpinCore && swift build && swift test     # expect 22/22 pass
cd ..

# 2. Generate the Xcode project (both targets: TopSpin-iOS, TopSpin-macOS):
xcodegen generate
open TopSpin.xcodeproj

# 3. CLI builds (unsigned):
xcodebuild -project TopSpin.xcodeproj -scheme TopSpin-macOS \
  -destination 'platform=macOS' build CODE_SIGNING_ALLOWED=NO
xcodebuild -project TopSpin.xcodeproj -scheme TopSpin-iOS \
  -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO
```

### Expected first-build fixups (the app targets were never compiled)
TopSpinCore is proven; the SwiftUI/SwiftData app code is not. Most likely issues:
- SwiftData `@ModelActor` / `@Query` macro nuances in `Stores+SwiftData.swift` and `MenuBarExtra` scenes.
- `@Observable` didSet/computed-accessor details in `AppSettings.swift` / `AppState.swift`.
- Info.plist merge: both apps set `GENERATE_INFOPLIST_FILE=YES`; the iOS app also has a checked-in
  `TopSpin-iOS/Info.plist` (BGTaskScheduler identifiers) that Xcode merges — if you get duplicate-key
  errors, move those keys entirely into the plist or entirely into `INFOPLIST_KEY_*`, not both.
- `SWIFT_VERSION` is `5.0` (language mode for the 5.9 toolchain) — with Xcode 26's Swift 6 toolchain
  you may raise it, but expect strict-concurrency errors if you jump to `6.0`; keep `5.0` until clean.

### Capabilities to enable for real device runs (Signing & Capabilities)
- **Keychain Sharing** on both targets: `$(AppIdentifierPrefix)com.topspin.shared`
  (already declared in the entitlements files — Xcode needs your team to sign).
- iOS: Background Modes → "Background fetch" (matches Info.plist BGTask identifier `com.topspin.refresh`).
- macOS: App Sandbox + User Selected File Read/Write + bookmarks + outgoing network (all pre-declared
  in `TopSpin-macOS/TopSpinMac.entitlements`).
- Apps degrade gracefully without these (app-private keychain fallback) — fine for simulator/dev.

---

## Task 3 — Web app local run (optional verification)
```bash
cd /Code/TopSpin/apps/web
cp .env.example .env       # fill DATABASE_URL (MySQL/TiDB) or ask owner for the dev instance
npm install
npm run db:push && npm run db:seed
npm run dev                # http://localhost:3000 — demo mode is ON by default (TOPSPIN_DEMO unset)
```
The demo workspace (15 connectors, 40 secrets, 122 targets, 60 runs, hash-chained audit) makes every
screen explorable without any real credentials.

---

## 4. If something is ambiguous
- Architecture/pipeline/capability questions → `docs/architecture.md`.
- "Who owns what / how agents collaborate" → `AGENTS.md`.
- Build-order/commit history of how this was made → `docs/build-plan.md`.
- Do not introduce any feature that persists plaintext secrets, breaks the audit chain, or changes the
  6-step pipeline without updating `docs/architecture.md` in the same PR.

## 5. Report back
When done, the expected end state is: public repo live, CI green (web + apple + gitleaks),
both Xcode schemes building locally under Xcode 26. Note any first-build fixups as a PR
against `main` following `CONTRIBUTING.md`.
