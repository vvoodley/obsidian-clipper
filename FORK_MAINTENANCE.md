# Fork Maintenance

This fork keeps custom Interpreter work isolated from upstream Obsidian Web Clipper so future updates can be rebased with minimal churn.

## Branch Stack

- `main`
  Tracks/syncs with `upstream/main` in this fork.
- `feature/interpreter-extra-api-params`
  Generic advanced per-model API parameter support.
- `feature/interpreter-background-jobs`
  Background Interpret & Add, job/session/rerun workflow.

## Golden Rule

Do not make custom feature changes directly on `main`.

Keep custom work isolated in feature branches, rebase those branches after syncing upstream, and push rebased feature branches with `--force-with-lease`, not plain `--force`.

## Manual Sync Flow

```bash
git remote -v
git remote add upstream https://github.com/obsidianmd/obsidian-clipper.git  # only if missing
git fetch upstream
git fetch origin

git checkout main
git merge --ff-only upstream/main
git push origin main

git checkout feature/interpreter-extra-api-params
git rebase main
npm test
npm run build
git push --force-with-lease origin feature/interpreter-extra-api-params

git checkout feature/interpreter-background-jobs
git rebase feature/interpreter-extra-api-params
npm test
npm run build
git push --force-with-lease origin feature/interpreter-background-jobs
```

## Conflict Resolution

Resolve upstream changes first in the lowest branch in the stack. Re-run tests and build after each branch.

Pay special attention to:

- `src/utils/interpreter.ts`
- `src/managers/interpreter-settings.ts`
- `src/core/popup.ts`
- `src/background.ts`
- `src/types/types.ts`
- `src/utils/obsidian-note-creator.ts`

Keep changes generic where possible to ease future upstream PRs.

## Upstreamable

- Advanced per-model API parameters.
- Background Interpreter session persistence.
- Long-running Interpreter UX improvements.

## Personal Fork Behavior

- AI ingestion workflow.
- Timestamped inbox naming conventions, such as `{{title}} - {{time|date:"YYYYMMDD-HHmmss"}}`.
- Future site-specific ingestion adapters or opinionated summaries.

Duplicate filenames and new copies should be controlled by template `noteNameFormat` and behavior. The extension should not append numeric suffixes like `(1)`, `(2)`, or `(3)`.

## Future-Agent Instructions

- Always inspect current branch state first.
- Always fetch upstream before rebasing.
- Never assume the branch is up to date.
- Never overwrite local uncommitted changes.
- Summarize conflicts and resolutions.
- Do not open an upstream PR unless explicitly asked.

## Browser Notes

Background Interpret & Add uses the existing `silentOpen` setting via `buildObsidianUrl(...)`, which appends `silent=true` when enabled. Browser or OS protocol-handler behavior may still focus Obsidian even when `silent=true` is present.

Multiple tabs can run Interpreter jobs in parallel because jobs are keyed by session. Providers may still return rate-limit errors. A future improvement could add provider-level max concurrency.
