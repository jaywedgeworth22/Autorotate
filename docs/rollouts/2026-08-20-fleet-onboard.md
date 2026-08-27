# 2026-08-20 — Autorotate joins the fleet

**Agent:** KIMI · **Branches:** `kimi/fleet-onboard` (this repo) ·
`kimi/autorotate-onboard` (ai-fleet-coordinator)

## What happened

Autorotate was built by a Kimi orchestration swarm (see `HANDOFF.md`) but was
not yet on GitHub or registered with the fleet.  This rollout lands both.

1. **GitHub** — mandatory secret sweep first: `gitleaks git` over full
   history = 0 leaks; manual grep hits are placeholders/format docs only;
   `apps/web/.env` is not tracked.  Created **public**
   `jaywedgeworth22/Autorotate` via `gh repo create --source . --push`.
   `origin` now points at GitHub; the old local bundle remote kept as
   `bundle`.
2. **Fleet script** — ran `scripts/onboard-new-app.sh --repo Autorotate
   --acronym TS --code-dir Autorotate --worktree-prefix autorotate --board
   AUTOROTATE-EFFORT-LOG.md --slack-repo Autorotate` from the fleet worktree
   `~/apps/fleet-kimi`.  It created the live board
   `~/apps/AUTOROTATE-EFFORT-LOG.md`, the grok lane `~/apps/autorotate-grok`,
   `~/Code/copilot-worktrees/Autorotate`, and the `fleet-apps.json` row.
3. **Bootstrap files (this commit)** — per ONBOARDING-NEW-APP.md Phase 3:
   - `AGENTS.md`: fleet identity header, worktree keepout table, verbatim
     Inter-agent coordination stanza.
   - `CLAUDE.md` → symlink to `AGENTS.md`.
   - `docs/EFFORT-LOG.md` (mirror of the live board) + `STATUS.md`.
   - `scripts/sync-effort-issues.py` + `.github/workflows/
     effort-issues-sync.yml` — verbatim fleet standard; only the cron minute
     differs (`41 5 * * *`).
   - `scripts/slack-sync.sh` (verbatim), `auto-update-prs.yml`,
     `.claude/hooks/block-xcode-project-writes.py` + `.claude/settings.json`.
   - README CI badge URL fixed (`autorotate-systems` → `jaywedgeworth22`).
4. **Coordinator registries** — patched in the `kimi/autorotate-onboard`
   branch: `fleet-apps.json` (script), `EFFORT-LOG-PROTOCOL.md` board
   registry, `AGENT-SYNC.md` app list + acronym table + Slack `repo:` names,
   `AGENT-COORDINATION-QUICKSTART.md`, `FLEET-UI-COPY.md`,
   digest/calendar `DEFAULT_REPOS` and related maps,
   `scripts/slack-sync.sh` topic-tag comment.  Verified with
   `check-fleet-registry.py`.

## Identity (never change casually)

| Field | Value |
|-------|-------|
| GitHub repo | `jaywedgeworth22/Autorotate` (public) |
| `~/Code` folder | `Autorotate` (integration tree — agents keep out) |
| Slack `repo:` | `Autorotate` |
| Acronym | `TS` |
| Live board | `/Users/jay/apps/AUTOROTATE-EFFORT-LOG.md` |
| Worktree prefix | `autorotate` (`~/apps/autorotate-<seat>`) |

## Owner dashboard items (not done — need the owner)

- Branch protection on `main`: require PR + status checks `web`, `apple`,
  `gitleaks`.
- `SENTRY_FLEET_DSN` repo secret → then add `sentry-ci-report.yml`.
- Infisical project (prod env) before any deployed secret.
- App Store Connect records + bundle IDs before TestFlight.
- Apple Notes acronym-table entry + Slack claim/closeout posted by a seat
  with Slack credentials (this session had no Slack token).

## Follow-ups

- First Xcode 26 build of both app schemes (`HANDOFF.md` Task 2).
- `workflow_dispatch` Effort Issues Sync once this lands on `main`.
- If the `macos-26` runner label is unavailable, switch the `apple` job to
  `macos-latest` per `HANDOFF.md`.
