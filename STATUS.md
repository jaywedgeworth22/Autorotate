# TopSpin — Status

## Current Handoff

### 2026-08-22 GROK — Apple IDs codes.autorotate

Owner registered `autorotate.codes`.  Display name **Autorotate**.  iOS
`codes.autorotate`, macOS `codes.autorotate.macos`, Keychain
`codes.autorotate.shared`, BGTask `codes.autorotate.refresh`.  Repo/Slack
name is still TopSpin until a rename lane.  Need owner: Apple Developer
App IDs + Keychain Sharing before device/TestFlight.  Branch
`grok/autorotate-ids`.  Board `56b80706`.

### 2026-08-21 CURSOR — Apache-2.0 + Kimi dump backup + catalog fold-in

Relicensed to Apache License 2.0 (© Jay).  Backed up the Kimi dump at
`backups/kimi-agent-topspin/` and dump `app/` at `backups/secret-rotator/`
(Secret Rotator is not a standalone app).  Folded Grok's extra platform
catalog into the live web registry and TopSpinCore.  Branch
`cursor/kimi-apache-merge`.  See `MERGE.md` and `NOTICE`.

### 2026-08-21 GROK — merge Grok App Builder PWA with this monorepo

Merged the App Builder TopSpin (encrypted vault, 40+ platforms, live rotators,
Mac agent) with this repo. Backups of both trees: `backups/`. Live web engine
gained Resend / Slack / Hugging Face / Neon / Vercel rotators, `global-api-keys`
parser, and `apps/agent`. Native Apple apps untouched. Tag
`backup/pre-grok-merge-2026-08-21`. See `MERGE.md`.

### 2026-08-20 KIMI — fleet onboarding + GitHub push

Repo is **public**: https://github.com/jaywedgeworth22/TopSpin (pushed from
the integration tree; `origin` is GitHub, the old bundle remote is kept as
`bundle`). Joined the ai-fleet-coordinator fleet as app **TopSpin**, acronym
**TS**, Slack `repo:` name `TopSpin`, live board
`/Users/jay/apps/TOPSPIN-EFFORT-LOG.md`, worktree prefix `topspin`.
Bootstrap files (this commit): `docs/EFFORT-LOG.md`, this file,
`scripts/sync-effort-issues.py` + `.github/workflows/effort-issues-sync.yml`
(verbatim fleet standard, cron `41 5 * * *`), `scripts/slack-sync.sh`,
`auto-update-prs.yml`, `CLAUDE.md` → `AGENTS.md` symlink, Claude Xcode
write-block hook, fleet stanza in `AGENTS.md`.

## Status

| Component | State |
|---|---|
| Web control center (`apps/web/`) | Local `npm ci` + `check` + `build` + 9/9 tests green (2026-08-21 CURSOR). CI web job was failing on `npm ci` Exit-handler crash because the lockfile mixed `npmmirror.com` / `npm.mirrors.msh.team`; lockfile + `.npmrc` now pin `registry.npmjs.org`, CI pins npm 11. |
| TopSpinCore (`apple/TopSpinCore/`) | `swift test` — 22/22 passing locally and on CI |
| iOS app (`apple/TopSpin-iOS/`) | Local `xcodebuild` **BUILD SUCCEEDED** (generic iOS Simulator, unsigned) + CI apple job green |
| macOS app (`apple/TopSpin-macOS/`) | Local `xcodebuild` **BUILD SUCCEEDED** (platform=macOS, unsigned) + CI apple job green |
| CI | `web` (ubuntu, Node 22 + npm 11) + `apple` (macos-26) + gitleaks secret scan |
| Branch protection | **Not yet configured** — owner dashboard item |

PR #16 merged to `main` (`c1f12a5`). Effort Issues Sync run 32458648310
succeeded. Remaining: Dependabot #1–15 rebase/merge; owner dashboard
(branch protection, Infisical, ASC, SENTRY_FLEET_DSN). Architecture and
invariants: `docs/architecture.md`. Fleet protocol: `AGENTS.md` §
Inter-agent coordination.
