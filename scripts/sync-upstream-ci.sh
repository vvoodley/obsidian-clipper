#!/usr/bin/env bash
set -euo pipefail

UPSTREAM_URL="https://github.com/obsidianmd/obsidian-clipper.git"
TARGET="upstream/main"
PUSH=0
AI_ON_CONFLICT=0
CONTINUE_AFTER_AI=0
STATE_DIR=".sync-state"
FEATURE_BRANCH="feature/interpreter-extra-api-params"
DEV_BRANCH="dev/interpreter-workflow"

usage() {
  cat <<'EOF'
Usage: scripts/sync-upstream-ci.sh [--push|--no-push] [--ai-on-conflict] [--continue-after-ai] [--target <ref>]

Defaults:
  --no-push
  --target upstream/main
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --push) PUSH=1; shift ;;
    --no-push) PUSH=0; shift ;;
    --ai-on-conflict) AI_ON_CONFLICT=1; shift ;;
    --continue-after-ai) CONTINUE_AFTER_AI=1; shift ;;
    --target) TARGET="${2:?--target requires a ref}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "[sync] Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

mkdir -p "$STATE_DIR"
if [[ "$CONTINUE_AFTER_AI" != "1" ]]; then
  rm -f "$STATE_DIR"/upstream_changed "$STATE_DIR"/upstream_unchanged "$STATE_DIR"/rebase_failed "$STATE_DIR"/rebase_phase.txt "$STATE_DIR"/continue_after_ai_complete
fi

write_summary() {
  {
    echo "# Upstream sync summary"
    echo
    echo "- Target: $TARGET"
    echo "- Push enabled: $PUSH"
    [[ -f "$STATE_DIR/main_before_sha.txt" ]] && echo "- main before: $(cat "$STATE_DIR/main_before_sha.txt")"
    [[ -f "$STATE_DIR/upstream_sha.txt" ]] && echo "- upstream target: $(cat "$STATE_DIR/upstream_sha.txt")"
    [[ -f "$STATE_DIR/custom_branch_before_sha.txt" ]] && echo "- dev branch before: $(cat "$STATE_DIR/custom_branch_before_sha.txt")"
    [[ -f "$STATE_DIR/upstream_unchanged" ]] && echo "- Result: upstream unchanged"
    [[ -f "$STATE_DIR/upstream_changed" ]] && echo "- Result: upstream changed"
    [[ -f "$STATE_DIR/rebase_failed" ]] && echo "- Rebase: failed"
    [[ -f "$STATE_DIR/rebase_phase.txt" ]] && echo "- Rebase phase: $(cat "$STATE_DIR/rebase_phase.txt")"
    [[ -f "$STATE_DIR/continue_after_ai_complete" ]] && echo "- Continue after AI: complete"
    if [[ -f "$STATE_DIR/conflicted_files.txt" ]]; then
      echo
      echo "## Conflicted files"
      sed 's/^/- /' "$STATE_DIR/conflicted_files.txt"
    fi
  } > "$STATE_DIR/sync-summary.md"
}

on_error() {
  local status=$?
  git diff --name-only --diff-filter=U > "$STATE_DIR/conflicted_files.txt" || true
  if [[ -s "$STATE_DIR/conflicted_files.txt" ]]; then
    touch "$STATE_DIR/rebase_failed"
    echo "[sync] Rebase conflict detected. Conflicted files:"
    cat "$STATE_DIR/conflicted_files.txt"
    echo "[sync] Recovery:"
    echo "[sync]   - Resolve conflicts, git add files, git rebase --continue"
    echo "[sync]   - Or abort with git rebase --abort"
    if [[ "$AI_ON_CONFLICT" == "1" ]]; then
      echo "[sync] AI conflict resolution can run from this state."
    fi
  fi
  write_summary || true
  exit "$status"
}
trap on_error ERR

if [[ "$CONTINUE_AFTER_AI" == "1" ]]; then
  echo "[sync] Continuing branch stack after AI resolution..."
  if [[ ! -f "$STATE_DIR/rebase_phase.txt" ]]; then
    echo "[sync] Missing $STATE_DIR/rebase_phase.txt; cannot continue safely." >&2
    exit 1
  fi
  phase="$(cat "$STATE_DIR/rebase_phase.txt")"
  case "$phase" in
    feature)
      if [[ -d .git/rebase-merge || -d .git/rebase-apply ]]; then
        git rebase --continue
      fi
      echo "[sync] Rebasing $DEV_BRANCH onto AI-resolved $FEATURE_BRANCH..."
      git checkout -B "$DEV_BRANCH" "origin/$DEV_BRANCH"
      echo "dev" > "$STATE_DIR/rebase_phase.txt"
      git rebase "$FEATURE_BRANCH"
      ;;
    dev)
      if [[ -d .git/rebase-merge || -d .git/rebase-apply ]]; then
        git rebase --continue
      fi
      ;;
    *)
      echo "[sync] Unknown rebase phase: $phase" >&2
      exit 1
      ;;
  esac
  rm -f "$STATE_DIR/rebase_failed"
  touch "$STATE_DIR/continue_after_ai_complete"
  write_summary
  echo "[sync] Continue after AI complete."
  exit 0
fi

echo "[sync] Checking working tree..."
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[sync] Working tree has uncommitted changes. Commit or stash them first." >&2
  exit 1
fi

if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "[sync] Adding upstream remote..."
  git remote add upstream "$UPSTREAM_URL"
fi

echo "[sync] Fetching remotes..."
git fetch upstream --tags
git fetch origin --tags

git rev-parse origin/main > "$STATE_DIR/main_before_sha.txt"
git rev-parse "$TARGET" > "$STATE_DIR/upstream_sha.txt"
git rev-parse "origin/$DEV_BRANCH" > "$STATE_DIR/custom_branch_before_sha.txt"
git merge-base origin/main "$TARGET" > "$STATE_DIR/base_sha.txt"

if git merge-base --is-ancestor "$TARGET" origin/main; then
  echo "[sync] Upstream target is already contained in origin/main."
  touch "$STATE_DIR/upstream_unchanged"
  write_summary
  exit 0
fi

touch "$STATE_DIR/upstream_changed"

echo "[sync] Fast-forwarding main to $TARGET..."
git checkout -B main origin/main
git merge --ff-only "$TARGET"

echo "[sync] Rebasing $FEATURE_BRANCH onto main..."
git checkout -B "$FEATURE_BRANCH" "origin/$FEATURE_BRANCH"
echo "feature" > "$STATE_DIR/rebase_phase.txt"
git rebase main

echo "[sync] Rebasing $DEV_BRANCH onto $FEATURE_BRANCH..."
git checkout -B "$DEV_BRANCH" "origin/$DEV_BRANCH"
echo "dev" > "$STATE_DIR/rebase_phase.txt"
git rebase "$FEATURE_BRANCH"

write_summary

if [[ "$PUSH" == "1" ]]; then
  echo "[sync] Running test/build gates before push..."
  npm test
  npm run build:firefox

  echo "[sync] Pushing deterministic sync results..."
  git push origin main
  git push --force-with-lease origin "$FEATURE_BRANCH"
  git push --force-with-lease origin "$DEV_BRANCH"
else
  echo "[sync] --no-push selected; leaving local rebased branches only."
fi

echo "[sync] Done."
