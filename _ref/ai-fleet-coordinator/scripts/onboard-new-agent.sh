#!/usr/bin/env bash
# onboard-new-agent.sh — create per-app worktrees for a new seat.
#
# Mechanical half of docs/ONBOARDING-NEW-AGENT.md. Does not configure
# Slack tokens, MCP, or platform global rules files.
#
# Usage:
#   ./scripts/onboard-new-agent.sh --tag GROK --notes-name Grok \
#       --worktree-suffix grok --branch-prefix grok/
#   ./scripts/onboard-new-agent.sh --tag KIMI --apps DealDex,Socratic.Trade

set -euo pipefail

TAG=""
NOTES_NAME=""
SUFFIX=""
PREFIX=""
APPS_FILTER=""
INCLUDE_FLEET=0
DRY_RUN=0
CODE_ROOT="${CODE_ROOT:-$HOME/Code}"
APPS_ROOT="${APPS_ROOT:-$HOME/apps}"
here="$(cd "$(dirname "$0")/.." && pwd)"

usage() {
  sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --tag) TAG="${2:-}"; shift 2 ;;
    --notes-name) NOTES_NAME="${2:-}"; shift 2 ;;
    --worktree-suffix) SUFFIX="${2:-}"; shift 2 ;;
    --branch-prefix) PREFIX="${2:-}"; shift 2 ;;
    --apps) APPS_FILTER="${2:-}"; shift 2 ;;
    --include-fleet) INCLUDE_FLEET=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "unknown arg: $1" >&2; usage 1 ;;
  esac
done

if [ -z "$TAG" ]; then
  echo "required: --tag" >&2
  usage 1
fi
NOTES_NAME="${NOTES_NAME:-$TAG}"
SUFFIX="${SUFFIX:-$(echo "$TAG" | tr '[:upper:]' '[:lower:]')}"
PREFIX="${PREFIX:-$SUFFIX/}"

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf 'DRY:'; printf ' %q' "$@"; printf '\n'
  else
    "$@"
  fi
}

echo "== seat onboard: tag=$TAG notes=$NOTES_NAME suffix=$SUFFIX prefix=$PREFIX"

# Record the seat in fleet-apps.json if missing.
python3 - "$here/fleet-apps.json" "$TAG" "$NOTES_NAME" "$SUFFIX" "$PREFIX" <<'PY'
import json, sys
from pathlib import Path
path = Path(sys.argv[1])
tag, notes, suffix, prefix = sys.argv[2:6]
data = json.loads(path.read_text())
seats = data.setdefault("seats", [])
if any(s.get("tag") == tag for s in seats):
    print(f"fleet-apps.json already has seat {tag}")
else:
    seats.append({
        "tag": tag,
        "notesName": notes,
        "worktreeSuffix": suffix,
        "branchPrefixes": [prefix],
    })
    path.write_text(json.dumps(data, indent=2) + "\n")
    print(f"appended seat {tag} to fleet-apps.json")
PY

# Create worktrees.
python3 - "$here/fleet-apps.json" "$SUFFIX" "$PREFIX" "$CODE_ROOT" "$APPS_ROOT" "$APPS_FILTER" "$INCLUDE_FLEET" "$DRY_RUN" <<'PY'
import json, os, subprocess, sys
from pathlib import Path

path = Path(sys.argv[1])
suffix, prefix, code_root, apps_root, apps_filter, include_fleet, dry = sys.argv[2:9]
include_fleet = include_fleet == "1"
dry = dry == "1"
wanted = {x.strip() for x in apps_filter.split(",") if x.strip()}
data = json.loads(path.read_text())

def sh(args):
    print("  $", " ".join(args))
    if not dry:
        subprocess.check_call(args)

for app in data.get("apps", []):
    repo = app["repo"]
    kind = app.get("kind", "product")
    if kind == "infra" and not include_fleet:
        continue
    if wanted and repo not in wanted and app.get("codeDir") not in wanted:
        continue
    code = Path(code_root) / app["codeDir"]
    lane = Path(apps_root) / f"{app['worktreePrefix']}-{suffix}"
    if not (code / ".git").exists() and not (code / ".git").is_file():
        # worktree gitdir is a file; integration tree is a dir
        if not code.exists():
            print(f"SKIP {repo}: no integration tree at {code}")
            continue
    if lane.exists():
        print(f"EXISTS {lane}")
        continue
    if not code.exists():
        print(f"SKIP {repo}: {code} missing")
        continue
    branch = f"{prefix.rstrip('/')}/lane"
    print(f"CREATE {lane} from {code} branch {branch}")
    # Prefer a dedicated lane branch; fall back if it already exists remotely.
    try:
        sh(["git", "-C", str(code), "worktree", "add", "-b", branch, str(lane)])
    except subprocess.CalledProcessError:
        sh(["git", "-C", str(code), "worktree", "add", str(lane), "main"])
PY

echo
echo "Seat $TAG worktrees considered. Still do by hand:"
echo "  - Global rules file for this platform -> ~/apps/AGENT-SYNC.md"
echo "  - AGENT_SEAT=$TAG if the platform shares an account"
echo "  - Intro + first claim on #agent-sync"
echo "  - Add a row to AGENT-SYNC.md Agent Seat table if this is a standing seat"
echo "  - See docs/ONBOARDING-NEW-AGENT.md"
echo
echo "Poll:  AGENT_TAG=$TAG /usr/bin/python3 $APPS_ROOT/agent-sync-poll.py"
echo "Post:  AGENT_TAG=$TAG $APPS_ROOT/agent-sync-websocket.py --post \"[$TAG] intro\\nrepo: fleet-infra\\nseat: $TAG\""
