#!/usr/bin/env bash
# =============================================================================
# push-to-github.sh — create the public "TopSpin" repo on GitHub and push main.
#
# Usage:
#   GITHUB_TOKEN=ghp_xxx GITHUB_USER=yourname ./scripts/push-to-github.sh
#   ./scripts/push-to-github.sh ghp_xxx yourname
#
# GITHUB_TOKEN needs the "repo" scope (classic) or repo administration
# (fine-grained). This script is idempotent: if the repo already exists it
# just sets the remote and pushes.
# =============================================================================
set -euo pipefail

GITHUB_TOKEN="${1:-${GITHUB_TOKEN:-}}"
GITHUB_USER="${2:-${GITHUB_USER:-jaywedgeworth22}}"   # default owner: jaywedgeworth22
REPO_NAME="TopSpin"   # public repo

if [ -z "$GITHUB_TOKEN" ] || [ -z "$GITHUB_USER" ]; then
  echo "error: provide GITHUB_TOKEN and GITHUB_USER (env vars or args)." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Creating repository '${GITHUB_USER}/${REPO_NAME}' (public)..."
HTTP_CODE=$(curl -sS -o /tmp/topspin_repo_resp.json -w '%{http_code}' \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/user/repos \
  -d "{\"name\":\"${REPO_NAME}\",\"private\":false,\"description\":\"Multi-platform secret rotation: web control center + iOS/macOS companions (LOCK-ROTATE-PUSH-VERIFY-COMMIT-AUDIT, zero-plaintext)\",\"has_issues\":true,\"has_projects\":false,\"has_wiki\":false}")

if [ "$HTTP_CODE" = "201" ]; then
  echo "==> Repository created."
elif [ "$HTTP_CODE" = "422" ]; then
  echo "==> Repository already exists (HTTP 422) — continuing with push."
else
  echo "error: repo creation failed (HTTP ${HTTP_CODE}):" >&2
  cat /tmp/topspin_repo_resp.json >&2
  exit 1
fi

REMOTE_URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO_NAME}.git"

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

echo "==> Pushing 'main'..."
git push -u origin main

# Scrub the token from the stored remote URL.
git remote set-url origin "https://github.com/${GITHUB_USER}/${REPO_NAME}.git"

echo ""
echo "Done: https://github.com/${GITHUB_USER}/${REPO_NAME}"
