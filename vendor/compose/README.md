# @reshot/compose

Evidence-first JSX primitives for turning a real Reshot capture into a reviewable product film. Compose keeps the product UI as the subject, uses workflow metadata to focus on meaningful moments, and emits an MP4/WebM/WebP pack through the CLI.

## Quick Start

```bash
pnpm --dir packages/compose build
pnpm --dir packages/compose test

node applications/reshot-cli/src/index.js compose packages/compose/examples/LoginHero.compose.tsx
```

The CLI expects a sibling metadata file named `<slug>.metadata.json`. The canonical example uses:

- `examples/LoginHero.compose.tsx`
- `examples/LoginHero.metadata.json`
- `examples/login-capture.mp4`

## Product Film Shape

Compose is not a motion-graphics kit. Default output should look like a polished screen recording with evidence attached:

1. Wrap the tree in `<Composition workflow={workflow} slug="LoginHero">`.
2. Render the capture with `<ProductFilm steps={...} />`.
3. Attach labels only to real targets with `<Annotation>` or product-film step labels.
4. Use focus movement from workflow metadata instead of decorative cards, badges, glows, or free-floating headlines.

```tsx
import { Composition, ProductFilm } from "@reshot/compose";

export default function LoginHero() {
  return (
    <Composition workflow={workflow} slug="LoginHero">
      <ProductFilm
        url="app.reshot.dev/projects/northwind/review"
        steps={[
          { id: "wide", at: "queue_visible", until: "hero_nav", camera: "wide" },
          {
            id: "approve",
            at: "press_a_approve",
            until: "hero_reject",
            target: "diff_overlay_card",
            label: "Approval recorded",
            tone: "success",
          },
        ]}
      />
    </Composition>
  );
}
```

## Primitive Reference

`<Composition>`
: Root provider for workflow metadata. Props: `workflow`, `slug`, `capturePath`, `durationMs`, `children`.

`<Frame>`
: Product surface for a capture. Props: `chrome`, `url`, `src`, `fit`, `children`. Defaults to no chrome and a full-stage capture. Still images and videos are both supported.

`<ProductFilm>`
: Canonical high-level primitive. Props: `src`, `url`, `chrome`, `fit`, `steps`, `children`. It renders a `Frame`, emits a `FocusPath`, and converts step labels into anchored annotations.

`<Annotation>`
: Targeted annotation. Props: `at`, `until`, `target`, `edge`, `tone`, `label`, `children`. An annotation must have a `target` or explicit `edge`; centered floating captions are intentionally unsupported.

`<FocusPath>`
: Metadata-driven camera path. Props: `steps`, `className`. It converts step targets into deterministic camera keyframes using `@reshot/motion-core`.

## Step Shape

```ts
type ProductFilmStep = {
  id: string;
  at: string;
  until?: string;
  target?: string;
  label?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
  camera?: "auto" | "wide" | "hold";
};
```

Steps read timing from `workflow.timeline` and target boxes from `workflow.targets`. Missing timeline keys or target boxes throw during compilation so a bad product film fails before rendering.

## Source To Frame Coordinates

Element targets are resolved against the source capture and transformed into frame coordinates before rendering. The default mapping is:

```ts
source: 1440 x 900
frame video: 1280 x 800
frame bar: 36px when chrome is enabled
```

Use `sourceToFrame()` directly when debugging coordinates.

## Quality Bar

Canonical examples and dogfood artifacts must pass these checks:

- The product UI is the protagonist.
- No decorative floating elements.
- Every visible label is attached to the thing it explains.
- No overlay obscures the active interaction.
- Dead air is trimmed or held only when it clarifies the result.
- The viewer can understand action and result without reading source.

## Troubleshooting

### Chromium not found

Rendering requires Chromium. If the renderer cannot find a browser, it raises:

```text
Chromium browser not found. Required for rendering compositions.
Option 1 (recommended): npx playwright install chromium
Option 2: set CHROME_PATH to your system Chrome
```

### CORS and dashboard playback

Uploaded composition assets must use `https://cdn.reshot.dev/compositions/...`, not raw `https://files.reshot.dev/...` URLs. The dashboard video uses `crossorigin="anonymous"` and expects the CDN route to return `Access-Control-Allow-Origin: *`.

### Relative captures

Use sibling captures like `./login-capture.mp4` in examples. The renderer injects a file base URL for the composition directory so those relative paths resolve in Chromium.

## Dogfooding

Run the seed script against a local dashboard project. The script skips rows that already exist and otherwise calls `reshot compose push` for the seed compositions in `examples/_dogfood-seeds/`.

```bash
SEED_PROJECT_ID=<project-id> \
RESHOT_API_KEY=<local-api-key> \
RESHOT_API_BASE_URL=http://localhost:3000/api \
pnpm --dir packages/compose run seed-dogfood
```

Render and upload the canonical evidence-first example:

```bash
node applications/reshot-cli/src/index.js compose \
  packages/compose/examples/ComposeHero.compose.tsx \
  --out /tmp/compose-hero \
  --formats mp4,webm,poster

node applications/reshot-cli/src/index.js compose push \
  packages/compose/examples/ComposeHero.compose.tsx
```

Composition uploads are review-gated by default. Use
`reshot compose push <file> --auto-approve` when a CLI render should
immediately update the stable public embed and live MP4/WebM/poster URLs.
