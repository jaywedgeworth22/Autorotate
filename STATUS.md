# TopSpin — Status

## Current Handoff

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

First Xcode 26 scheme builds are done (local + CI). Remaining onboard closeout:
merge PR #16 when web is green, `workflow_dispatch` Effort Issues Sync, Slack
+ Apple Notes closeout. Architecture and invariants: `docs/architecture.md`.
Fleet protocol: `AGENTS.md` § Inter-agent coordination.
