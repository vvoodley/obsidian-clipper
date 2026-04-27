# Upstream Sync Strategy

This fork keeps upstream tracking and custom work separate so rebases stay reviewable.

## Branch Model

- `main` mirrors `upstream/main`. Do not commit custom fork features here.
- `feature/interpreter-extra-api-params` contains focused advanced API parameter support.
- `dev/interpreter-workflow` is the canonical daily-driver branch for the custom Interpreter workflow.

Custom work stays outside `main` so upstream can be fast-forwarded cleanly and custom changes remain easy to review.

## Default Branch Requirement

GitHub scheduled workflows run from the repository default branch. Because this fork keeps workflow automation on `dev/interpreter-workflow`, set the repository default branch to `dev/interpreter-workflow`.

`main` still remains the clean upstream mirror branch even when it is not the GitHub default branch. Do not use `main` for custom feature work.

## Deterministic Sync Flow

The automated workflow and `scripts/sync-upstream-ci.sh` use this stack:

1. Fetch `origin` and `upstream`.
2. Fast-forward `main` from `upstream/main`.
3. Rebase `feature/interpreter-extra-api-params` onto `main`.
4. Rebase `dev/interpreter-workflow` onto `feature/interpreter-extra-api-params`.
5. Run `npm ci`, `npm test`, and `npm run build:firefox`.
6. Push `main` normally.
7. Push rebased custom branches with `--force-with-lease`.

If `upstream/main` is already contained in `origin/main`, the workflow exits without modifying branches.

## Test Timezone

Template fixture tests include `{{date}}` and `{{time}}` values. `buildVariables()` uses `dayjs().format('YYYY-MM-DDTHH:mm:ssZ')`, which formats in the process local timezone.

The fixture baseline is pinned to `America/Los_Angeles`, including outputs such as `2025-01-15T04:00:00-08:00`. Vitest setup and GitHub Actions set `TZ=America/Los_Angeles` so snapshots are deterministic across local machines and CI. This is only a test determinism setting; it does not change production runtime behavior or template output behavior in the extension.

## AI-Assisted Conflict Flow

If deterministic rebase fails, canonical branches are not updated. The script records the failed phase in `.sync-state/rebase_phase.txt` as `feature` or `dev`.

The workflow attempts AI-assisted conflict resolution, then runs:

```bash
scripts/sync-upstream-ci.sh --continue-after-ai --no-push
```

If the feature branch failed, this finishes rebasing `feature/interpreter-extra-api-params` and then rebases `dev/interpreter-workflow` onto the resolved feature branch. If the dev branch failed, it finishes the dev rebase. Only after the remaining branch stack is complete does the workflow create an `ai/reintegrate-upstream-YYYYMMDD-HHMMSS` branch, run tests/build, push that branch, and open a draft PR against `dev/interpreter-workflow`.

AI-resolved code must never be auto-merged or auto-pushed to canonical branches. Manual review is required.

If AI refuses a file outside its allowlist or fails before recovery completes, the workflow uploads `.sync-state` as an artifact and opens a manual recovery issue with conflicted files, sync summary, refusal details, and recovery instructions.

## AI Allowlist

The AI conflict resolver may only edit conflicts in the Interpreter, media, template storage, and Firefox identity surface:

- `src/utils/interpreter.ts`
- `src/utils/interpreter-job-manager.ts`
- `src/utils/llm/`
- `src/utils/media/`
- `src/managers/interpreter-settings.ts`
- `src/core/popup.ts`
- `src/background.ts`
- `src/types/types.ts`
- `src/utils/obsidian-note-creator.ts`
- `src/settings.html`
- `src/popup.html`
- `src/styles/interpreter.scss`
- `src/manifest.firefox.json`
- `src/utils/import-export.ts`
- `src/managers/template-manager.ts`
- tests directly related to those files

The AI resolver must not edit workflows, `package.json`, `package-lock.json`, signing scripts, or deployment scripts.

## Preservation Rules

Future agents must preserve:

- custom Interpreter workflow
- advanced provider/model API parameters
- background Interpreter job persistence
- image/media attachment behavior
- template import/export custom fields
- Firefox custom add-on ID
- Firefox update URL

Prefer adapting custom code to upstream APIs instead of reverting upstream changes.

## High-Risk Files

- `src/utils/interpreter.ts`
- `src/managers/interpreter-settings.ts`
- `src/core/popup.ts`
- `src/background.ts`
- `src/types/types.ts`
- `src/utils/obsidian-note-creator.ts`
- `src/manifest.firefox.json`
- `src/utils/import-export.ts`
- `src/managers/template-manager.ts`

## Local Use

Run a safe no-push sync check:

```bash
scripts/sync-upstream-ci.sh --no-push
```

Run and push deterministic results:

```bash
scripts/sync-upstream-ci.sh --push
```

If a rebase fails:

```bash
git diff --name-only --diff-filter=U
git status
# resolve conflicts
git add <files>
git rebase --continue
npm test
npm run build:firefox
```

To abort:

```bash
git rebase --abort
```

## Promoting an AI Branch

Review the draft PR carefully, inspect the AI summary, run tests/build locally if needed, then merge manually. After merge, rerun the sync workflow or rebase local branches from origin.

## Rerun Workflow

Use GitHub Actions → Sync upstream → Run workflow. The workflow is also scheduled every six hours.

Scheduled runs require `dev/interpreter-workflow` to be the repository default branch.
