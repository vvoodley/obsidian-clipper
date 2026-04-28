Obsidian Web Clipper helps you highlight and capture the web in your favorite browser. Anything you save is stored as durable Markdown files that you can read offline, and preserve for the long term.

- **[Download Web Clipper](https://obsidian.md/clipper)**
- **[Documentation](https://help.obsidian.md/web-clipper)**
- **[Troubleshooting](https://help.obsidian.md/web-clipper/troubleshoot)**

## Get started

Install the extension by downloading it from the official directory for your browser:

- **[Chrome Web Store](https://chromewebstore.google.com/detail/obsidian-web-clipper/cnjifjpddelmedmihgijeibhnjfabmlf)** for Chrome, Brave, Arc, Orion, and other Chromium-based browsers.
- **[Firefox Add-Ons](https://addons.mozilla.org/en-US/firefox/addon/web-clipper-obsidian/)** for Firefox and Firefox Mobile.
- **[Safari Extensions](https://apps.apple.com/us/app/obsidian-web-clipper/id6720708363)** for macOS, iOS, and iPadOS.
- **[Edge Add-Ons](https://microsoftedge.microsoft.com/addons/detail/obsidian-web-clipper/eigdjhmgnaaeaonimdklocfekkaanfme)** for Microsoft Edge.

## Use the extension

Documentation is available on the [Obsidian Help site](https://help.obsidian.md/web-clipper), which covers how to use [highlighting](https://help.obsidian.md/web-clipper/highlight), [templates](https://help.obsidian.md/web-clipper/templates), [variables](https://help.obsidian.md/web-clipper/variables), [filters](https://help.obsidian.md/web-clipper/filters), and more.

## Interpreter setup

Interpreter lets you use AI to summarize, extract, and transform web page content before saving it to Obsidian. See the [Interpreter documentation](https://help.obsidian.md/web-clipper/interpreter) for full details.

### Adding a provider

Go to **Settings → Interpreter → Add provider**. For OpenAI-compatible providers (e.g. Fireworks AI, OpenRouter, xAI), set the **Base URL** to the full chat completions endpoint — it should end with `/chat/completions`, for example:

```
https://api.fireworks.ai/inference/v1/chat/completions
```

### Adding a model

Go to **Settings → Interpreter → Add model**. Set the **Model ID** to the exact model identifier your provider expects. For example, to use Kimi K2P5 Turbo on Fireworks AI:

- **Provider:** Fireworks AI (your custom provider)
- **Display name:** Kimi K2P5 Turbo *(customizable)*
- **Model ID:** `accounts/fireworks/routers/kimi-k2p5-turbo`

The model ID must match exactly what the provider expects. Use the `routers/` path for the auto-routing variant or `models/` for a pinned version (e.g. `accounts/fireworks/models/kimi-k2p5`).

### Recommended settings for summarization

For summarization, extraction, and tagging tasks we recommend the following **Extra API parameters JSON** in model settings. Low temperature produces more consistent and factual outputs. Disabling reasoning/thinking avoids unnecessary overhead since these tasks don't require it.

**For providers that use `thinking` (e.g. Fireworks AI with Kimi K2):**

```json
{
  "temperature": 0.2,
  "thinking": {
    "type": "disabled"
  }
}
```

**For providers that use `reasoning_effort` (e.g. OpenAI o-series):**

```json
{
  "temperature": 0.2,
  "max_tokens": 2048,
  "reasoning_effort": "none"
}
```

`temperature: 0.2` — keeps output deterministic and factual (range 0–1; lower = more focused).
`max_tokens: 2048` — sufficient for most summaries; increase if outputs are being truncated.

### Optimizing the interpreter context

By default, Interpreter sends the full page HTML to the model, which can be slow and costly. You can limit the context per template using the **Default interpreter context** field in your template's advanced settings. For example, to target only the main content area:

```
{{selectorHtml:#main}}
```

You can also trim the context with a filter, e.g. `{{content|strip_tags|slice:0,5000}}`. Smaller context means faster and cheaper requests.

### Vision batching

This fork supports opt-in vision batching for templates that expose image candidate URLs. Vision batching currently runs in the background **Interpret and Add** job path; the manual **interpret** button still uses the one-shot path.

In batch mode, `maxVisionImages` is treated as the per-request cap. `visionBatchSize` defaults to `5` and is clamped to that per-request limit. The implemented image transport is URL-based OpenAI-compatible `image_url` content blocks. Non-vision or unsupported providers fall back to text-only, or mark image batches as skipped / `media/vision-not-run` for later review.

### Troubleshooting Interpreter errors

**Where to find logs**

There is no log file — all diagnostic output goes to the browser's extension console:

- **Firefox:** Go to `about:debugging#/runtime/this-firefox` → click **Inspect** next to Obsidian Web Clipper → open the **Console** tab. Errors from the background page (where the API call runs) appear here.
- **Chrome / Chromium:** Go to `chrome://extensions` → click the **service worker** link under the extension → **Console** tab.

**"NetworkError when attempting to fetch resource"**

This typically means the fetch to the AI provider failed before a response was received. Common causes:

- **Wrong Base URL** — ensure the URL ends with `/chat/completions`, e.g. `https://api.fireworks.ai/inference/v1/chat/completions`. A missing or incorrect path suffix is the most common mistake.
- **Firefox CORS error (CORS header 'Access-Control-Allow-Origin' missing)** — Firefox enforces CORS for extension pages even when `host_permissions` covers the URL. If the AI provider does not return `Access-Control-Allow-Origin` response headers, Firefox will block the response with status 200. This extension injects the missing header automatically via `webRequest.onHeadersReceived`. If you see this error, make sure you are running a build from source (see [Developers](#developers)) rather than the published version if it predates this fix.
- **Background page suspended (Firefox)** — Firefox may suspend the background event page mid-request on long runs. Check the extension console for the actual error.
- **API key missing or invalid** — verify your API key is set correctly in provider settings.
- **Provider CORS policy** — if you see a CORS error in the console alongside the NetworkError, the provider may not accept requests from browser extension origins.

## Contribute

### Translations

You can help translate Web Clipper into your language. Submit your translation via pull request using the format found in the [/_locales](/src/_locales) folder.

### Features and bug fixes

See the [help wanted](https://github.com/obsidianmd/obsidian-clipper/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) tag for issues where contributions are welcome.

## Roadmap

In no particular order:

- [ ] A separate icon for Web Clipper
- [ ] Annotate highlights
- [ ] Template directory
- [x] Template validation
- [x] Template logic (if/for)
- [x] Save images locally, [added in Obsidian 1.8.0](https://obsidian.md/changelog/2024-12-18-desktop-v1.8.0/)
- [x] Translate UI into more languages — help is welcomed

## Developers

To build the extension:

```
npm run build
```

This will create three directories:
- `dist/` for the Chromium version
- `dist_firefox/` for the Firefox version
- `dist_safari/` for the Safari version

### Install the extension locally

For Chromium browsers, such as Chrome, Brave, Edge, and Arc:

1. Open your browser and navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist` directory

For Firefox:

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Navigate to the `dist_firefox` directory and select the `manifest.json` file

If you want to run the extension permanently you can do so with the Nightly or Developer versions of Firefox.

1. Type `about:config` in the URL bar
2. In the Search box type `xpinstall.signatures.required`
3. Double-click the preference, or right-click and select "Toggle", to set it to `false`.
4. Go to `about:addons` > gear icon > **Install Add-on From File…**

For iOS Simulator testing on macOS:

1. Run `npm run build` to build the extension
2. Open `xcode/Obsidian Web Clipper/Obsidian Web Clipper.xcodeproj` in Xcode
3. Select the **Obsidian Web Clipper (iOS)** scheme from the scheme selector
4. Choose an iOS Simulator device and click **Run** to build and launch the app
5. Once the app is running on the simulator, open **Safari**
6. Navigate to a webpage and tap the **Extensions** button in Safari to access the Web Clipper extension

### Run tests

```
npm test
```

Or run in watch mode during development:

```
npm run test:watch
```

## Third-party libraries

- [webextension-polyfill](https://github.com/mozilla/webextension-polyfill) for browser compatibility
- [defuddle](https://github.com/kepano/defuddle) for content extraction and Markdown conversion
- [dayjs](https://github.com/iamkun/dayjs) for date parsing and formatting
- [lz-string](https://github.com/pieroxy/lz-string) to compress templates to reduce storage space
- [lucide](https://github.com/lucide-icons/lucide) for icons
- [dompurify](https://github.com/cure53/DOMPurify) for sanitizing HTML

## License

Obsidian Web Clipper source code is open source under the MIT License. All trademarks, icons, marketing copy, and other marketing assets are excluded from that license.
