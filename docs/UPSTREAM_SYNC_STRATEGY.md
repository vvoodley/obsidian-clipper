# Upstream Sync Strategy

This fork keeps upstream tracking and custom work separate so rebases stay reviewable.

## Branch Model

- `main` mirrors `upstream/main`. Do not commit custom fork features here.
- `feature/interpreter-extra-api-params` contains focused advanced API parameter support.
- `dev/interpreter-workflow` is the canonical daily-driver branch for the custom Interpreter workflow.

Custom work stays outside `main` so upstream can be fast-forwarded cleanly and custom changes remain easy to review.

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

## AI-Assisted Conflict Flow

If deterministic rebase fails, canonical branches are not updated. The workflow creates an `ai/reintegrate-upstream-YYYYMMDD-HHMMSS` branch, attempts AI-assisted conflict resolution, runs tests/build, pushes that AI branch, and opens a draft PR against `dev/interpreter-workflow`.

AI-resolved code must never be auto-merged or auto-pushed to canonical branches. Manual review is required.

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
