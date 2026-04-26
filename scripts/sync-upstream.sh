#!/usr/bin/env bash
set -euo pipefail

UPSTREAM_URL="https://github.com/obsidianmd/obsidian-clipper.git"

on_error() {
  echo "[sync] Stopped. If this was a rebase conflict:"
  echo "[sync]   1. Resolve conflicts"
  echo "[sync]   2. git add <resolved files>"
  echo "[sync]   3. git rebase --continue"
  echo "[sync]   4. Rerun npm test and npm run build"
  echo "[sync]   5. Rerun this script or continue manually"
}
trap on_error ERR

echo "[sync] Checking working tree..."
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[sync] Working tree has uncommitted changes. Commit or stash them first."
  exit 1
fi

if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "[sync] Adding upstream remote..."
  git remote add upstream "$UPSTREAM_URL"
fi

echo "[sync] Fetching remotes..."
git fetch upstream
git fetch origin

echo "[sync] Syncing main..."
git checkout main
git merge --ff-only upstream/main
git push origin main

echo "[sync] Rebasing extra API params branch..."
git checkout feature/interpreter-extra-api-params
git rebase main
npm test
npm run build
git push --force-with-lease origin feature/interpreter-extra-api-params

echo "[sync] Rebasing background jobs branch..."
git checkout feature/interpreter-background-jobs
git rebase feature/interpreter-extra-api-params
npm test
npm run build
git push --force-with-lease origin feature/interpreter-background-jobs

echo "[sync] Done."
