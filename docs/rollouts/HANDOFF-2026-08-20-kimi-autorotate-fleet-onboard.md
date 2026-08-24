# HANDOFF — TopSpin fleet onboarding (from KIMI, quota-limited)

**Date:** 2026-08-20 · **From:** KIMI (Kimi Work session) · **To:** any local seat (Grok / Claude / Codex / …)
**Slack `repo:`:** `TopSpin`, `ai-fleet-coordinator`, `fleet-infra` · **Acronym:** `TS`

Read first: `~/apps/AGENT-SYNC.md`, `~/apps/EFFORT-LOG-PROTOCOL.md`, repo `AGENTS.md`,
`docs/rollouts/2026-08-20-fleet-onboard.md` (on branch `kimi/fleet-onboard`).

---

## Done (verified)

1. **GitHub repo live** — `jaywedgeworth22/TopSpin`, **public**, `main` pushed.
   Pre-push secret sweep clean: `gitleaks git` full history = 0 leaks; grep hits were
   placeholders/format docs only; `apps/web/.env` untracked. Remotes in
   `~/Code/TopSpin`: `origin` = GitHub, `bundle` = old local bundle (kept as backup).
2. **Fleet script ran** — `onboard-new-app.sh --repo TopSpin --acronym TS …` from lane
   `~/apps/fleet-kimi`. Created: live board `~/apps/TOPSPIN-EFFORT-LOG.md`, grok lane
   `~/apps/topspin-grok` (branch `grok/fleet-onboard`), `~/Code/copilot-worktrees/TopSpin`,
   `fleet-apps.json` row.
3. **TopSpin-side bootstrap** — branch `kimi/fleet-onboard`, lane `~/apps/topspin-kimi`,
   **PR #16**. Commit `c2af3d7`: docs/EFFORT-LOG.md, STATUS.md, rollouts note,
   verbatim `sync-effort-issues.py` + `effort-issues-sync.yml` (cron `41 5 * * *`),
   `slack-sync.sh`, AGENTS.md keepout table + coordination stanza, CLAUDE.md symlink,
   auto-update-prs.yml, Claude Xcode write-block hook, README badge fix.
4. **Coordinator registries** — branch `kimi/topspin-onboard`, lane `~/apps/fleet-kimi`,
   **PR #57**: AGENT-SYNC (intro list, acronym table, Slack canonical names),
   EFFORT-LOG-PROTOCOL board registry, FLEET-UI-COPY, digest (DEFAULT_REPOS,
   LIVE_EFFORT_FILES, REPO_BADGE TS/repo-ts #059669, STRIP_ALIASES, CSS var, legend),
   calendar DEFAULT_REPOS, slack-sync topic comment. `check-fleet-registry.py` → **OK (8 apps)**.
5. **Live `~/apps` lockstep edits applied directly** (not via git): AGENT-SYNC.md,
   EFFORT-LOG-PROTOCOL.md, FLEET-UI-COPY.md, AGENT-COORDINATION-QUICKSTART.md,
   FLEET-INFRA-EFFORT-LOG.md (claim row under In Progress), ios-fleet/apps.json
   (`topspin` entry: bundleId `com.topspin.ios`, scheme `TopSpin-iOS`, pre-TestFlight note).
6. **CI first-run repairs** — commits `168863c` + `71f81c3` on PR #16:
   - secret-scan.yml: added `GITHUB_TOKEN` env (gitleaks-action v2 hard-requires it for PR scans — that was the 5s failure).
   - ci.yml web job: Node 20 → 22. Root cause of web failure: npm 10 on Node 20 crashed
     (`Exit handler never called!`), leaving node_modules empty; `npm run check` then fell
     back to a npx-fetched **TypeScript 6**, producing bogus `TS5102 baseUrl removed` errors.
     Lockfile itself is consistent (TS 5.9.3 pinned).
   - iOS compile fixes: `AddTargetView.fileSection` view → `fileTargetSection` (collided with
     `@State fileSection`); `AppModel.init` `nonisolated` → `@MainActor` (class-inherited),
     `TopSpinApp.init()` marked `@MainActor`, engine wiring uses a local `keychain` constant
     (definite-initialization order).
   - Untracked generated `apple/TopSpin.xcodeproj/` and added it to .gitignore (xcodegen output).

## In progress / state at handoff

- **iOS scheme build (`TopSpin-iOS`) was mid-verification locally.** Last full build
  (`/tmp/topspin-ios-build.log`) failed only on the AppModel definite-init error, which
  commit `168863c` then fixed — **the fixed code has not been rebuilt yet**. Resume:
  ```bash
  cd ~/apps/topspin-kimi/apple
  USER=jay xcodegen generate   # USER env must be set; sandbox shells may lack it
  USER=jay xcodebuild -project TopSpin.xcodeproj -scheme TopSpin-iOS \
    -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO
  ```
  Expect further first-build fixups (HANDOFF.md Task 2 lists likely suspects:
  SwiftData `@ModelActor`/`@Query` macros, `@Observable` accessors, Info.plist merge).
- **macOS scheme never attempted** (`TopSpin-macOS`, `-destination 'platform=macOS'`).
- **Web fix unverified** — no local `npm ci && npm run check && npm run build` run yet;
  CI on PR #16 will exercise it on the next push.
- Dependabot opened PRs #1–15 on TopSpin (actions + radix bumps) — triage after #16 lands.

## Next steps (ordered)

1. Rebuild iOS scheme in the lane; fix remaining compile errors; build macOS scheme; push fixes to `kimi/fleet-onboard`.
2. When PR #16 checks green (web, apple, gitleaks) → merge. If `macos-26` hosted label ever
   vanishes, HANDOFF.md describes the `macos-latest` fallback (note: this run found
   `Xcode_26.6.app` as the default on the runner and it worked).
3. Merge ai-fleet-coordinator PR #57 (no CI checks configured there).
4. `gh workflow run "Effort Issues Sync" --repo jaywedgeworth22/TopSpin` (workflow_dispatch)
   so the first board rows become GitHub issues.
5. `git -C ~/Code/TopSpin pull --ff-only` (integration tree fast-forward; code-main-keeper
   would also catch it).
6. Move rows to Completed on `~/apps/TOPSPIN-EFFORT-LOG.md` + repo mirror, and update the
   FLEET-INFRA claim row.
7. **Slack claim/closeout on #agent-sync** — NOT posted; this session had no Slack token.
   Post from a credentialed seat (`scripts/slack-sync.sh`).
8. Apple Notes `[TS, FLEET, <Agent>] onboard TopSpin` in folder Coding via
   `~/apps/apple-notes-coding.sh`; acronym table in AGENT-SYNC already includes `TS`.
9. Triage/merge Dependabot PRs #1–15 (note #4 bumps gitleaks-action v2→v3 — compatible
   with the GITHUB_TOKEN fix).

## Owner dashboard items (not started — need owner)

- Branch protection on TopSpin `main`: require PR + checks `web`, `apple`, `gitleaks`.
- `SENTRY_FLEET_DSN` repo secret → then add `sentry-ci-report.yml` + `scripts/sentry-ci-report.py`.
- Infisical project (prod env) before any deployed secret.
- App Store Connect records + bundle IDs before TestFlight (ios-fleet entry already staged).
- Optional: agent logo `agent-logos/app-ts.png` in ai-fleet-coordinator (fleet-apps.json
  row currently `hasAppIcon: false`).

## Invariants / traps

- TopSpin hard invariants (AGENTS.md): zero plaintext persistence; append-only hash-chained
  audit; 6-step pipeline; `docs/architecture.md` capability matrix is source of truth;
  FK columns `bigint unsigned` in Drizzle.
- Fleet rules: never edit in `~/Code/TopSpin` (use `~/apps/topspin-<seat>` lanes);
  board-first claim/closeout; light theme default — **note:** `TopSpinApp.swift` currently
  forces `.preferredColorScheme(.dark)` (iOS), which conflicts with the fleet light-default
  rule; flagged, not changed (product decision).
- `~/Code/TopSpin/_ref/` contains untracked reference copies made during onboarding —
  safe to delete; never commit it.
- xcodegen on this Mac needs `USER` set in stripped shells (`USER=jay xcodegen generate`).
