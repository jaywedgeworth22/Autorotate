#!/usr/bin/env bash
# onboard-new-app.sh — join a GitHub repo to the fleet.
#
# Mechanical half of docs/ONBOARDING-NEW-APP.md. Does not touch Infisical,
# Coolify, ASC, or any secret value.
#
# Usage:
#   ./scripts/onboard-new-app.sh --repo DealDex --acronym DD \
#       --code-dir DealDex --worktree-prefix dealdex \
#       --board DEALDEX-EFFORT-LOG.md --slack-repo DealDex
#
# Safe to re-run: skips existing clone / board / worktree / JSON row.

set -euo pipefail

REPO=""
ACRONYM=""
CODE_DIR=""
WORKTREE_PREFIX=""
BOARD=""
SLACK_REPO=""
VISIBILITY="private"
DESCRIPTION=""
OWNER="${FLEET_OWNER:-jaywedgeworth22}"
CODE_ROOT="${CODE_ROOT:-$HOME/Code}"
APPS_ROOT="${APPS_ROOT:-$HOME/apps}"
DRY_RUN=0
CREATE_REPO=0

here="$(cd "$(dirname "$0")/.." && pwd)"

usage() {
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="${2:-}"; shift 2 ;;
    --acronym) ACRONYM="${2:-}"; shift 2 ;;
    --code-dir) CODE_DIR="${2:-}"; shift 2 ;;
    --worktree-prefix) WORKTREE_PREFIX="${2:-}"; shift 2 ;;
    --board) BOARD="${2:-}"; shift 2 ;;
    --slack-repo) SLACK_REPO="${2:-}"; shift 2 ;;
    --visibility) VISIBILITY="${2:-}"; shift 2 ;;
    --description) DESCRIPTION="${2:-}"; shift 2 ;;
    --owner) OWNER="${2:-}"; shift 2 ;;
    --create-repo) CREATE_REPO=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "unknown arg: $1" >&2; usage 1 ;;
  esac
done

if [ -z "$REPO" ] || [ -z "$ACRONYM" ]; then
  echo "required: --repo and --acronym" >&2
  usage 1
fi
CODE_DIR="${CODE_DIR:-$REPO}"
WORKTREE_PREFIX="${WORKTREE_PREFIX:-$(echo "$REPO" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9' | cut -c1-16)}"
BOARD="${BOARD:-$(echo "$REPO" | tr '[:lower:]' '[:upper:]' | tr -c 'A-Z0-9' '-')-EFFORT-LOG.md}"
SLACK_REPO="${SLACK_REPO:-$REPO}"

CODE_PATH="$CODE_ROOT/$CODE_DIR"
LIVE_BOARD="$APPS_ROOT/$BOARD"
LANE="$APPS_ROOT/${WORKTREE_PREFIX}-grok"
TODAY="$(date '+%Y-%m-%d')"

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf 'DRY:'; printf ' %q' "$@"; printf '\n'
  else
    "$@"
  fi
}

echo "== fleet onboard: $OWNER/$REPO  acronym=$ACRONYM  code=$CODE_PATH"

# --- GitHub repo ---
if ! gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  if [ "$CREATE_REPO" -eq 1 ]; then
    echo "creating GitHub repo $OWNER/$REPO ($VISIBILITY)"
    run gh repo create "$OWNER/$REPO" "--$VISIBILITY" \
      ${DESCRIPTION:+--description "$DESCRIPTION"}
  else
    echo "GitHub repo $OWNER/$REPO not found. Pass --create-repo or create it first." >&2
    exit 1
  fi
else
  echo "GitHub repo $OWNER/$REPO exists"
fi

# --- clone integration tree ---
if [ -d "$CODE_PATH/.git" ]; then
  echo "integration tree already a git repo: $CODE_PATH"
elif [ -d "$CODE_PATH" ] && [ -n "$(ls -A "$CODE_PATH" 2>/dev/null || true)" ]; then
  echo "ERROR: $CODE_PATH exists, is not a git repo, and is not empty." >&2
  echo "Move or commit that work before onboarding." >&2
  exit 1
else
  echo "cloning into $CODE_PATH"
  run mkdir -p "$CODE_ROOT"
  run git clone "https://github.com/$OWNER/$REPO.git" "$CODE_PATH"
fi

run mkdir -p "$CODE_ROOT/copilot-worktrees/$CODE_DIR"

# --- grok worktree ---
if [ -d "$LANE" ]; then
  echo "lane exists: $LANE"
else
  echo "creating grok lane $LANE"
  run git -C "$CODE_PATH" worktree add -b "grok/fleet-onboard" "$LANE"
fi

# --- live board ---
if [ -f "$LIVE_BOARD" ]; then
  echo "live board exists: $LIVE_BOARD"
else
  echo "writing live board $LIVE_BOARD"
  if [ "$DRY_RUN" -eq 0 ]; then
    cat > "$LIVE_BOARD" <<EOF
# ${REPO} Effort Log — cross-agent board
Protocol: /Users/jay/apps/EFFORT-LOG-PROTOCOL.md (canonical). Live board: this file
(mirror: docs/EFFORT-LOG.md in the repo). As of ${TODAY}.

## Deployed
- (none)

## Completed
- (none)

## In Progress
- (none)

## Planned / Reserved
- (none)

## Changelog of this log
- ${TODAY} — bootstrapped by onboard-new-app.sh.
EOF
  fi
fi

# --- fleet-apps.json row ---
python3 - "$here/fleet-apps.json" "$REPO" "$ACRONYM" "$CODE_DIR" "$WORKTREE_PREFIX" "$BOARD" "$SLACK_REPO" <<'PY'
import json, sys
from pathlib import Path
path = Path(sys.argv[1])
repo, acronym, code_dir, prefix, board, slack = sys.argv[2:8]
data = json.loads(path.read_text())
if any(a.get("repo") == repo for a in data.get("apps", [])):
    print(f"fleet-apps.json already has {repo}")
    raise SystemExit(0)
data.setdefault("apps", []).append({
    "repo": repo,
    "acronym": acronym,
    "displayName": repo,
    "slackRepo": slack,
    "codeDir": code_dir,
    "liveBoard": board,
    "worktreePrefix": prefix,
    "badgeClass": "repo-" + acronym.lower(),
    "digestColor": "#64748b",
    "hasAppIcon": False,
    "kind": "product",
})
path.write_text(json.dumps(data, indent=2) + "\n")
print(f"appended {repo} to fleet-apps.json")
PY

echo
echo "Next (this script does not finish these):"
echo "  1. In the lane ($LANE): add AGENTS.md, docs/EFFORT-LOG.md, CI, effort-issues-sync"
echo "     (copy from DealDex or Usage-Monitor; see docs/ONBOARDING-NEW-APP.md Phase 3)."
echo "  2. Patch registries listed in docs/ONBOARDING-NEW-APP.md Phase 4."
echo "  3. python3 $here/scripts/check-fleet-registry.py"
echo "  4. PR the app + this coordinator repo. Slack claim/closeout."
echo "  5. Owner dashboards (Infisical / Coolify / ASC) stay on the checklist."
