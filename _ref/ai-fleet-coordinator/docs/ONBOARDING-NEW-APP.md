# Onboarding a new app

Policy + steps for joining an existing or brand-new GitHub repo to this fleet
so agents can work the way we already work on Socratic.Trade, Congress.Trade,
Usage-Monitor, and DealDex.

**GitHub:** https://github.com/jaywedgeworth22/ai-fleet-coordinator/blob/main/docs/ONBOARDING-NEW-APP.md  
**Sibling (new seat):** [ONBOARDING-NEW-AGENT.md](ONBOARDING-NEW-AGENT.md) · https://github.com/jaywedgeworth22/ai-fleet-coordinator/blob/main/docs/ONBOARDING-NEW-AGENT.md  
**Protocol:** `/Users/jay/apps/AGENT-SYNC.md` · https://github.com/jaywedgeworth22/ai-fleet-coordinator/blob/main/AGENT-SYNC.md  
Copy `TEMPLATE-AGENTS.md` into the new repo (includes Delegation & model economics + this start-here table).

**Run the script first, then finish the checklist.** The script does the
mechanical clone / board / AGENTS / CI / registry edits. Owner-only dashboard
steps stay in the checklist.

```bash
# from an ai-fleet-coordinator worktree (never ~/Code/ai-fleet-coordinator)
./scripts/onboard-new-app.sh \
  --repo DealDex \
  --acronym DD \
  --code-dir DealDex \
  --worktree-prefix dealdex \
  --board DEALDEX-EFFORT-LOG.md \
  --slack-repo DealDex
```

`--help` lists every flag. After the script: `python3 scripts/check-fleet-registry.py`.

Canonical inventory: [`../fleet-apps.json`](../fleet-apps.json).

---

## Why this exists

A new folder under `~/Code` is **not** a fleet app yet. Peers will not see it
on the effort board, the daily digest, Slack skim-match, Apple Notes acronyms,
or iOS ship tooling. Agents will also work in `~/Code/<App>` and collide with
the integration tree. This procedure is the self-propagation rule from
`AGENT-SYNC.md`, expanded so the next app is not a scavenger hunt.

---

## Hard rules

1. **`~/Code/<App>` is the human integration tree.**  It stays on `origin/main`.
   Agents work in `~/apps/<worktreePrefix>-<seat>`.
2. **THE BOARD, then the effort board, then code.**  Create the live board +
   repo mirror in the first commit.  Claim on `https://mac.jays.services/board`
   and move the effort row to In Progress before substantial edits.
3. **Triple claim / triple closeout:** THE BOARD + live effort board + GitHub
   issue (via effort-issues-sync after the mirror lands) + `#agent-sync`.
   Do **not** add a per-app Grok Bot seat for the new app.  `GROK-BOT` is
   fleet-wide (Cursor cloud), not a lane in `fleet-apps.json`.
4. **Do not wait for the owner to say commit.** Feature branch → PR → merge
   when CI is green.
5. **Never paste secrets.** Handoff files live in `~/.secrets/` (`chmod 600`).
   Runtime secrets go to Infisical (the app's own project, prod env).
   Never `grep` / `rg` a handoff file without `-o` — `grep '^[A-Z0-9_]+='`
   prints **values**.  Names only: `grep -oE '^[A-Z][A-Z0-9_]*'`.  Never
   `cat` or Read `~/.secrets/global-api-keys`.
6. **Light theme is the product default.** Dark is opt-in.
7. **Two spaces between sentences** in every human-facing string, including
   App Store listing and review notes.  See `AGENT-SYNC.md` § Two spaces and
   `FLEET-UI-COPY.md`.

---

## Phase 0 — name the app (2 minutes)

Pick and write these down. They never change casually.

| Field | Example | Notes |
|-------|---------|--------|
| GitHub repo | `DealDex` | `jaywedgeworth22/<repo>` |
| `~/Code` folder | `DealDex` | Same spelling as the repo when possible |
| Slack `repo:` | `DealDex` | First body field in every #agent-sync post |
| Acronym | `DD` | Apple Notes `[DD, Grok] …` |
| Live board file | `DEALDEX-EFFORT-LOG.md` | Lives in `/Users/jay/apps/` |
| Worktree prefix | `dealdex` | `~/apps/dealdex-grok` |
| Visibility | private / public | Match the product |

Post a Planned row on **fleet-infra** (`FLEET-INFRA-EFFORT-LOG.md`) *and* on
the new app board before you start.

---

## Phase 1 — GitHub + local integration tree

1. If the GitHub repo does not exist:
   `gh repo create jaywedgeworth22/<repo> --private --description "…"`.
2. If `~/Code/<App>` is empty or missing:
   `git clone https://github.com/jaywedgeworth22/<repo>.git ~/Code/<App>`.
3. If `~/Code/<App>` already has uncommitted product work, **do not**
   `git init` on top of it. Commit or move that work first.
4. `code-main-keeper` auto-discovers new `~/Code/*` git repos. No edit needed
   unless the folder should be denylisted (`code-main-keeper.sh` `SKIP_NAMES`).
5. Create `~/Code/copilot-worktrees/<App>/` so Copilot has a parent for its
   isolated worktrees.

---

## Phase 2 — agent lane + first branch

Never edit in `~/Code/<App>` after the clone.

```bash
git -C ~/Code/<App> worktree add -b grok/<slug> ~/apps/<prefix>-grok
cd ~/apps/<prefix>-grok
```

Other seats: `claude`, `codex`, `antigravity`, `cursor`, `monet`. Create a
lane when that seat starts — do not pre-create six `node_modules` trees.

`scripts/setup-agent-lanes.sh` from the app checkout creates the four classic
lanes (claude/codex/antigravity/cursor).

---

## Phase 3 — repo files (first commit on the feature branch)

Copy from any already-bootstrapped app (Usage-Monitor and DealDex are the
smallest references) **or** let `onboard-new-app.sh` drop the stubs.

Required:

| Path | What |
|------|------|
| `AGENTS.md` | Worktree keepout, Slack stanza, effort board path, verify commands, product traps |
| `CLAUDE.md` | Symlink to `AGENTS.md` |
| `docs/EFFORT-LOG.md` | Board mirror (template in `EFFORT-LOG-PROTOCOL.md`) |
| `/Users/jay/apps/<BOARD>.md` | Live board, same content |
| `STATUS.md` | Snapshot |
| `docs/rollouts/YYYY-MM-DD-fleet-onboard.md` | This join |
| `scripts/sync-effort-issues.py` | **Verbatim** from an existing app |
| `.github/workflows/effort-issues-sync.yml` | **Verbatim** except cron minute |
| `.github/workflows/ci.yml` | At least lint/typecheck/test on `ubuntu-latest` |
| `scripts/slack-sync.sh` | From this repo, so cloud seats can post |

If the repo's `.gitignore` ignores `AGENTS.md` (Grok / Replit leftover),
**remove that line**. The fleet pointer must be tracked.

`AGENTS.md` must include the Inter-agent coordination stanza from
`AGENT-SYNC.md` § "Onboarding a new app/repo", plus the DealDex-style
keepout table with **this** app's paths.

Optional but expected before the app is "done" as a fleet citizen:

- `sentry-ci-report.yml` + `scripts/sentry-ci-report.py` once a `CI` workflow
  exists and `SENTRY_FLEET_DSN` is on the repo.
- `auto-update-prs.yml` from `github-workflows-template/`.
- `scripts/infisical-secrets-safe.sh` if the app will use Infisical.
- iOS entry in `/Users/jay/apps/ios-fleet/apps.json` if there is a native app.
- Native iOS onboarding file (`ios/CLAUDE.md`, `clients/ios/CLAUDE.md`, or
  `native/ios/CLAUDE.md`) with bundle ID, scheme, annotated file tree, and a
  pointer to AGENT-SYNC § iOS agent build loop (`xcodebuild` via bash is
  pre-approved; do not stand up Xcode MCP).
- Claude iOS write-block hook: copy
  `scripts/block-xcode-project-writes.py` → `.claude/hooks/` and merge
  `github-workflows-template/claude-ios-settings.json` into
  `.claude/settings.json`.

---

## Phase 4 — registries (the list every agent must update)

`onboard-new-app.sh` patches these. If you do it by hand, miss none:

### Live machine (`/Users/jay/apps` — not a git repo)

- `EFFORT-LOG-PROTOCOL.md` — Board registry table
- `AGENT-SYNC.md` — intro app list, Apple Notes acronym table, Slack
  `repo:` canonical names
- `AGENT-COORDINATION-QUICKSTART.md` — effort-log table
- `FLEET-UI-COPY.md` — binding apps + theme paragraph
- `TEMPLATE-AGENTS.md` — only if you are changing the template itself
- `FLEET-INFRA-EFFORT-LOG.md` — claim / closeout row
- `/Users/jay/apps/<BOARD>.md` — new live board
- `ios-fleet/apps.json` + `ios-fleet/README.md` — if native iOS

### This repo (`ai-fleet-coordinator`)

- `fleet-apps.json` — **add the row first**
- `EFFORT-LOG-PROTOCOL.md`, `AGENT-SYNC.md`, `FLEET-UI-COPY.md`,
  `TEMPLATE-AGENTS.md` (keep in lockstep with `~/apps`)
- `scripts/build-fleet-daily-digest.py` — `DEFAULT_REPOS`,
  `LIVE_EFFORT_FILES`, `REPO_BADGE`, `REPO_APP_ICON`, `REPO_STRIP_ALIASES`,
  CSS color, HTML legend
- `scripts/build-agent-calendar.py` — `DEFAULT_REPOS`
- `scripts/slack-sync.sh` — comment listing canonical topic tags
- `agent-logos/app-<acronym>.png` + `agent-logos/README.md` (product apps)
- `README.md` if the new app changes setup instructions

### Per-app `AGENTS.md` on **other** repos

Only if they hardcode the sibling-app list (rare). Prefer pointing at
`fleet-apps.json` / this doc.

Run `python3 scripts/check-fleet-registry.py` until it is clean.

---

## Phase 5 — Slack + Notes

1. Poll `#agent-sync`, then post a claim:

   ```
   [GROK] sync-N
   repo: <slackRepo>, ai-fleet-coordinator, fleet-infra
   claim: <branch>
   state: WIP
   work: onboard <App> as a fleet app
   ```

2. After merge: closeout on Slack, move both boards to Completed, write /
   update Apple Notes `[<ACRONYM>, FLEET, Grok] onboard <App>` in folder
   **Coding** via `/Users/jay/apps/apple-notes-coding.sh`.

---

## Phase 6 — owner dashboard (script cannot do these)

Do **not** invent these. Ask the owner or stop after listing them.

| Surface | When |
|---------|------|
| Infisical project (prod env) | Before any deployed secret |
| Coolify app + domain | Before production web |
| `SENTRY_FLEET_DSN` repo secret | Before sentry-ci-report is useful |
| `FLEET_GITHUB_TOKEN` if the repo is private | So digest/calendar see it |
| App Store Connect record + bundle id | Before TestFlight |
| UptimeRobot / PagerDuty | When there is a prod URL to watch |
| Usage-Monitor producer wiring | Only if this app will push telemetry |

Coolify token split still applies: never put `COOLIFY_AGENTS` into Infisical
as app `COOLIFY_API_TOKEN`. See `AGENT-SYNC.md`.

---

## Phase 7 — land

1. PR on the **new app** (bootstrap files).
2. PR on **ai-fleet-coordinator** (registries + this doc if you changed it).
3. Merge both when CI is green.
4. `workflow_dispatch` Effort Issues Sync on the new app so the first board
   row becomes a GitHub issue.
5. Confirm `~/Code/<App>` fast-forwards to `main` (code-main-keeper or
   `git -C ~/Code/<App> pull --ff-only`).

---

## Definition of done

- [ ] `~/Code/<App>` is a git checkout of `jaywedgeworth22/<repo>` on `main`
- [ ] At least one seat worktree exists under `~/apps/`
- [ ] `AGENTS.md` is tracked and forbids working in `~/Code/<App>`
- [ ] Live board + `docs/EFFORT-LOG.md` exist and are in the Board registry
- [ ] Effort Issues Sync workflow is on `main`
- [ ] `fleet-apps.json` has the row
- [ ] Digest + calendar `DEFAULT_REPOS` include the repo
- [ ] Apple Notes acronym table includes the acronym
- [ ] Slack `repo:` name is in `AGENT-SYNC.md`
- [ ] `check-fleet-registry.py` exits 0
- [ ] Slack claim + closeout posted
- [ ] Remaining owner dashboard items are listed, not silently skipped
