# Firefox AMO Unlisted Signing

Use AMO unlisted signing for this fork. In AMO, choose **On your own**. Do not choose **On this site** unless intentionally publishing publicly.

## Critical Pages Setting

GitHub Pages Source must be **GitHub Actions**.

Do not use **Deploy from a branch** and do not select `/docs` as the Pages source. The `docs/` directory contains Liquid/Twig template examples such as `{% if %}` that Jekyll will try to parse, which can break Pages builds. The signing workflow deploys only the generated `public/` directory and writes `public/.nojekyll` before uploading the Pages artifact.

## Credentials

Create API credentials in the AMO Developer Hub API key page.

- JWT issuer/API key maps to GitHub secret `WEB_EXT_API_KEY`.
- JWT secret maps to GitHub secret `WEB_EXT_API_SECRET`.

GitHub secrets:

- `WEB_EXT_API_KEY`
- `WEB_EXT_API_SECRET`
- `AI_API_KEY`

GitHub variables:

- `AI_BASE_URL=https://api.fireworks.ai/inference/v1`
- `AI_MODEL=accounts/fireworks/routers/kimi-k2p5-turbo`
- `FIREFOX_CUSTOM_ADDON_ID=obsidian-clipper-vvoodley@vvoodley.github.io`
- `FIREFOX_CUSTOM_ADDON_NAME=Obsidian Web Clipper VVood`

Firefox update URL:

```text
https://vvoodley.github.io/obsidian-clipper/firefox/updates.json
```

## Custom Add-on Identity

This fork must not use the official Obsidian Web Clipper add-on ID:

```text
clipper@obsidian.md
```

The fork uses:

```text
obsidian-clipper-vvoodley@vvoodley.github.io
```

Using a custom ID prevents collisions with the official extension and keeps update channels separate.

## Signing Workflow

Run GitHub Actions → **Sign Firefox unlisted**.

The workflow:

1. Checks out `dev/interpreter-workflow`.
2. Runs `npm ci`.
3. Runs `npm test`.
4. Runs `npm run build:firefox`.
5. Patches `dist_firefox/manifest.json` with custom name, add-on ID, update URL, and AMO-safe version.
6. Signs using `web-ext sign --channel unlisted`.
7. Uploads the signed `.xpi` as a workflow artifact.
8. Creates or updates a GitHub Release with the signed `.xpi`.
9. Generates `public/firefox/updates.json`.
10. Deploys the update manifest to GitHub Pages.

Do not use GitHub Actions artifact URLs in `updates.json`; they expire and are not suitable update links. Use GitHub Release asset URLs for the signed XPI.

## GitHub Pages

The update manifest is a project Pages site:

```text
https://vvoodley.github.io/obsidian-clipper/firefox/updates.json
```

If Pages is not enabled:

1. Open repository Settings.
2. Go to Pages.
3. Set Source to **GitHub Actions**.

Do not select **Deploy from a branch / docs**.

No separate `vvoodley.github.io` repository is required.

## Installing and Updating

Install the signed `.xpi` from the GitHub Release asset in Firefox Stable. Firefox reads the custom manifest `update_url` and checks the GitHub Pages `updates.json` for future signed XPI versions.

If automatic update fails, manually install the newest signed `.xpi` from the latest `firefox-v<version>` GitHub Release.
