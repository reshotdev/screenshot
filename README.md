# @reshotdev/screenshot

Product screenshots in documentation go stale within days of a UI change. Manually recapturing them across themes, viewports, and locales is tedious and error-prone. This CLI runs screenshot and video capture against a localhost build, comparing each run against the previous capture so teams can review diffs before docs change.

[![npm](https://img.shields.io/npm/v/@reshotdev/screenshot)](https://www.npmjs.com/package/@reshotdev/screenshot)
[![CI](https://github.com/reshotdev/screenshot/actions/workflows/ci.yml/badge.svg)](https://github.com/reshotdev/screenshot/actions/workflows/ci.yml)

**Status: Beta** (0.x). The API may change between minor versions.

## Install

```bash
npm install -g @reshotdev/screenshot
```

Requires Node.js >= 18. Playwright browsers are installed automatically on first run.

## Quick Start

```bash
# 1. Interactive setup wizard
reshot setup

# 2. Start your app with a production-like local server
npm run build
npm run start

# 3. Capture screenshots from your config
reshot run

# 4. Review captures in the web UI
reshot studio

# 5. Publish when you want hosted assets — pass --auto-approve on first run
reshot publish --auto-approve
```

For launch-grade reliability, do not treat `next dev` as the supported capture
runtime. Use a production-like local server and see the
[Supported Environments guide](https://reshot.dev/docs/cli/getting-started/supported-environments).

> **First-time setup tip:** pass `--auto-approve` to your first `reshot
> publish` so newly-captured visuals skip the review queue and become
> immediately available via `reshot pull`. Without it, every new visual
> lands in PENDING and is only visible in the studio.

> **OAuth / magic-link / Supabase apps:** skip `auth.loginSteps` and use
> `playwright codegen $YOUR_APP --save-storage=.reshot/auth-state.json`
> once, then set `"storageStatePath": ".reshot/auth-state.json"` in your
> config. See [Authentication](#authentication) below for details.

## Certified Targets

> **Most integrations should omit `target` entirely.** Certified targets
> are an opt-in contract for production-grade flows once basic capture is
> working — start without them and add `target` later if you need the
> stronger guarantees.

This release adds a **Certified Targets** contract for apps that need stronger guarantees than ad hoc capture. Certified targets declare their readiness selectors, localhost runtime, required routes, and expected published assets in `reshot.config.json`, then pass the full doctor/capture/publish/delivery pipeline before release.

## Configuration

Create `reshot.config.json` in your project root:

```json
{
  "baseUrl": "http://localhost:3000",
  "target": {
    "key": "docs-app",
    "displayName": "Docs App",
    "tier": "certified",
    "owner": "Docs Team",
    "baseUrl": "http://localhost:3000",
    "captureSafe": false,
    "supportedLocalCommand": "npm run build && npm run start",
    "defaultAuthMode": "fixture",
    "requiredEnv": ["PROJECT_ID"],
    "certificationScenarioKeys": ["dashboard"]
  },
  "assetDir": ".reshot/output",
  "concurrency": 2,
  "viewport": { "width": 1280, "height": 720 },
  "timeout": 30000,
  "headless": true,
  "scenarios": [
    {
      "key": "homepage",
      "name": "Homepage",
      "url": "/",
      "steps": [
        { "action": "wait", "ms": 1000 },
        { "action": "screenshot", "key": "hero", "description": "Hero section" }
      ]
    },
    {
      "key": "dashboard",
      "name": "Dashboard",
      "url": "/dashboard",
      "requiresAuth": true,
      "captureClass": "fixture-auth",
      "ready": {
        "selector": "[data-loaded='true']",
        "expression": "window.__APP_READY__ === true"
      },
      "requiredRoutes": ["/dashboard"],
      "requiredSelectors": ["[data-testid='dashboard-content']"],
      "expectedArtifacts": ["overview", "analytics"],
      "publishPolicy": "required",
      "readySelector": "[data-loaded='true']",
      "steps": [
        { "action": "screenshot", "key": "overview", "description": "Dashboard overview" },
        { "action": "click", "selector": "button[data-tab='analytics']" },
        { "action": "wait", "ms": 500 },
        { "action": "screenshot", "key": "analytics", "description": "Analytics tab" }
      ]
    }
  ]
}
```

## Commands

| Command | Description | Key Flags |
| --- | --- | --- |
| `reshot setup` | Interactive config wizard | `--offline`, `--force` |
| `reshot run` | Execute capture scenarios | `--scenarios`, `--diff`, `--all-variants`, `--concurrency`, `--no-headless` |
| `reshot record [title]` | Interactive recording via Chrome DevTools | `--browser`, `--url`, `--port` |
| `reshot sync` | Upload traces/docs to Reshot platform | `--trace-dir`, `--dry-run` |
| `reshot studio` | Launch web management UI | `--port`, `--no-open` |
| `reshot status` | View project status and sync history | `--jobs`, `--drifts`, `--json` |
| `reshot publish` | Upload assets with versioning | `--tag`, `--message`, `--dry-run` |
| `reshot pull` | Generate asset map for builds | `--format json\|ts\|csv`, `--output`, `--status` |
| `reshot doctor target` | Audit target routes, readiness, and auth contract | `--scenarios`, `--json` |
| `reshot verify publish` | Validate publish, pull/export, and hosted delivery | `--scenarios`, `--tag`, `--json` |
| `reshot certify` | Run the full certified-target pipeline | `--scenarios`, `--tag`, `--json` |
| `reshot drifts` | Manage visual drift notifications | `approve`, `reject`, `ignore`, `approve-all` |
| `reshot import-tests` | Import Playwright tests as scenarios | `--dry-run`, `--no-interactive` |

## Certification Workflow

Use these commands when a target app needs release-grade verification:

```bash
reshot doctor target
reshot run --scenarios dashboard
reshot verify publish --tag v1.0.0
reshot certify --tag v1.0.0
```

Certification reports are written to `.reshot/reports/certification.json`.

## Step Types

Steps define a sequence of browser actions within a scenario:

| Step | Description | Key Properties |
| --- | --- | --- |
| `wait` | Pause execution | `ms` |
| `screenshot` | Capture current viewport | `key`, `description` |
| `click` | Click a DOM element | `selector`, `optional` |
| `type` | Type text into an input | `selector`, `text` |
| `keyboard` | Send keyboard input | `key` (e.g., `"Meta+k"`, `"Enter"`) |
| `waitForSelector` | Wait for element to appear | `selector`, `timeout` |
| `navigate` | Go to a URL | `url` |
| `fillForm` | Fill multiple form fields | `fields` (selector-to-value map) |

## Variant System

Capture the same scenario across multiple dimensions (themes, locales, roles) without duplicating config:

```json
{
  "variants": {
    "dimensions": {
      "theme": {
        "label": "Color Theme",
        "options": {
          "light": {
            "name": "Light Mode",
            "inject": [
              { "method": "localStorage", "key": "theme", "value": "light" },
              { "method": "browser", "colorScheme": "light" }
            ]
          },
          "dark": {
            "name": "Dark Mode",
            "inject": [
              { "method": "localStorage", "key": "theme", "value": "dark" },
              { "method": "browser", "colorScheme": "dark" }
            ]
          }
        }
      },
      "locale": {
        "label": "Language",
        "options": {
          "en": {
            "name": "English",
            "inject": [
              { "method": "browser", "locale": "en-US" }
            ]
          },
          "de": {
            "name": "German",
            "inject": [
              { "method": "browser", "locale": "de-DE", "timezone": "Europe/Berlin" }
            ]
          }
        }
      }
    },
    "presets": {
      "all-themes": { "name": "All Themes", "dimensions": ["theme"] },
      "matrix": { "name": "Full Matrix", "dimensions": ["theme", "locale"] }
    }
  }
}
```

Run all variants:

```bash
reshot run --all-variants
# Captures: homepage/light/en, homepage/light/de, homepage/dark/en, homepage/dark/de
```

**Injection methods:** `localStorage`, `sessionStorage`, `browser` (colorScheme, locale, timezone), `cookie`, `queryParam`.

## Viewport Presets

Use preset names in your config or with the `--viewport` flag:

| Category | Preset | Resolution | Scale |
| --- | --- | --- | --- |
| Desktop | `desktop-hd` | 1920x1080 | 1x |
| Desktop | `desktop` | 1280x720 | 1x |
| Desktop | `desktop-retina` | 1280x720 | 2x |
| Tablet | `tablet-landscape` | 1024x768 | 2x |
| Tablet | `tablet-portrait` | 768x1024 | 2x |
| Mobile | `mobile` | 375x667 | 2x |
| Mobile | `mobile-large` | 414x896 | 3x |
| Docs | `docs-wide` | 1200x800 | 2x |
| Docs | `docs-standard` | 960x640 | 2x |
| Social | `social-og` | 1200x630 | 2x |
| Social | `social-twitter` | 1200x600 | 2x |

## Visual Diffing

Compare captures against baselines to detect changes:

```json
{
  "diffing": {
    "enabled": true,
    "threshold": 0.1,
    "antialiasing": true,
    "ignoreRegions": [
      { "x": 0, "y": 0, "width": 1280, "height": 50 }
    ]
  }
}
```

```bash
# Run with diffing enabled
reshot run --diff

# Compare against cloud baselines
reshot run --diff --cloud
```

Pixel-level comparison using pixelmatch. The `threshold` (0-1) controls sensitivity — 0.1 means 10% pixel difference tolerance. `antialiasing: true` compensates for font rendering differences across platforms. `ignoreRegions` excludes dynamic areas like timestamps or ads.

## Interactive Recording

Record scenarios by interacting with your app in a real browser:

```bash
# Launch Chrome and start recording
reshot record "Checkout Flow" --browser --url http://localhost:3000
```

During recording:
- Press **S** to capture a screenshot step
- Press **C** to start/stop a video clip
- Press **Q** to quit and save

The recorded scenario is appended to `reshot.config.json` automatically.

## Authentication

### Storage State (recommended)

For OAuth, magic-link, Supabase Auth, Clerk, Auth.js, and any other modern
auth flow that can't be scripted with form fields, capture a Playwright
storage state once and let reshot reuse it for every scenario:

```bash
npx playwright codegen http://localhost:3000 --save-storage=.reshot/auth-state.json
```

Then point your config at it:

```json
{
  "storageStatePath": ".reshot/auth-state.json"
}
```

`reshot record` does the same thing interactively and writes to
`~/.reshot/session-state.json` by default.

### Test backdoors

If your app has a dev/test backdoor that bypasses auth at the server layer
(for example a `/api/devtools` fixture endpoint, a header-based
impersonation hook, or a localhost-only cookie), you can point reshot at it
via `baseUrl` and skip storage state entirely. This is often the cleanest
option for first-party apps that already maintain such an endpoint for
testing.

### Login Steps (password forms only)

If your app still uses a traditional username/password form, you can
script the login directly:

```json
{
  "auth": {
    "loginUrl": "http://localhost:3000/login",
    "loginSteps": [
      { "action": "type", "selector": "input[name='email']", "text": "${EMAIL}" },
      { "action": "type", "selector": "input[name='password']", "text": "${PASSWORD}" },
      { "action": "click", "selector": "button[type='submit']" },
      { "action": "waitForSelector", "selector": "[data-authenticated='true']" }
    ]
  }
}
```

Environment variables (`${EMAIL}`, `${PASSWORD}`) are interpolated at runtime.
`loginSteps` cannot drive OAuth, magic-link, or any redirect-based flow —
use **Storage State** above for those.

## Output Formats

### Step-by-Step Images (default)

```
.reshot/output/dashboard/20260315-120000/theme-light/
  ├── step-0-overview.png
  └── step-1-analytics.png
```

### Video Recording

Set `"format": "summary-video"` in scenario output config to record the full browser session as MP4.

### Selective Capture (Crop)

```json
{
  "output": {
    "crop": {
      "enabled": true,
      "selector": ".modal-dialog",
      "padding": 16
    }
  }
}
```

Crops the screenshot to the bounding box of the selected element.

## Automation in Scripts

Use headless mode with environment variables to integrate into build scripts or local workflows:

```bash
# In your Makefile or build script
export RESHOT_API_KEY=$(cat .reshot/api-key)
reshot run --scenarios dashboard --no-headless false
reshot publish --tag v1.2.0
```

Set `RESHOT_API_KEY` and `RESHOT_PROJECT_ID` to run without interactive auth:

```bash
RESHOT_API_KEY=your-key RESHOT_PROJECT_ID=your-project reshot run
```

For headless execution, ensure:
- Your app is running on localhost (e.g., `npm run build && npm run start`)
- `headless: true` is set in `reshot.config.json`
- API credentials are available as environment variables

## Asset Map for Builds

Generate a manifest of captured assets for use in documentation sites or marketing pages:

```bash
reshot pull --format json --output assets.json
```

The output is keyed by scenario, visual, and context (variant). `meta` mirrors
the API response; `assets` is a 3-level nested object — `scenarioKey →
visualKey → context`:

```json
{
  "meta": {
    "projectId": "...",
    "exportedAt": "2026-04-30T12:00:00.000Z",
    "totalVisuals": 12
  },
  "assets": {
    "dashboard": {
      "overview": {
        "themeLight": {
          "type": "image/png",
          "alt": "Dashboard overview, light theme",
          "steps": [
            { "src": "https://cdn.reshot.dev/abc123/overview.png", "step": "overview" }
          ]
        },
        "themeDark": { "...": "..." }
      }
    }
  }
}
```

By default `pull` returns visuals in all states (approved + pending). Pass
`--status approved` to filter to released visuals only. Also supports
`--format ts` (TypeScript with full metadata) and `--format csv`.

## Drift Management

Visual drifts are flagged when captures differ from baselines:

```bash
# List pending drifts
reshot drifts

# Approve a specific drift (updates baseline)
reshot drifts approve drift-abc123

# Approve all pending drifts
reshot drifts approve-all

# Reject a drift (keeps old baseline)
reshot drifts reject drift-abc123
```

## Standalone Mode

Run without any cloud connection:

```bash
reshot setup --offline
```

All capture, recording, diffing, and studio features work locally. Cloud features (publish, sync, drifts, pull) are disabled.

## Limitations

- Beta release. The CLI interface and config format may change between minor versions.
- Playwright browsers are downloaded on first run (~200MB for Chromium).
- Video recording requires Chromium (Firefox and WebKit support screenshots only).
- Cloud features (publish, sync, drifts) require a Reshot account at [reshot.dev](https://reshot.dev).
- Privacy masking (automatic PII redaction) is best-effort and should not be relied on for compliance.

## Documentation

[reshot.dev/docs](https://reshot.dev/docs)

## License

MIT
