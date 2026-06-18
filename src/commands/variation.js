// variation.js - Render variations from a captured DOM scene.
//
// Workflow:
//   1. Resolve the source MHTML — either from the local .reshot/output tree
//      or by downloading from the platform CDN (R2 public URL stored on
//      the VisualVersion as domSceneS3Path).
//   2. Open the MHTML in a fresh headless Chromium.
//   3. Apply the variation manifest (JS mutations + viewport).
//   4. Screenshot.
//
// This is the v1 marketing-operator entry point. The dashboard UI on top
// of it is the next deliverable; the CLI exists so the loop is usable
// the moment Phase 1 ships.
//
// Manifest format (JSON):
//
//   {
//     "viewport": { "width": 1440, "height": 900, "deviceScaleFactor": 2 },
//     "colorScheme": "light" | "dark",
//     "mutations": [
//       { "remove": "aside, nav" },                          // delete elements
//       { "replaceText": [
//           { "find": "ari@tempo.example", "with": "alice@acme.com" }
//       ]},
//       { "limit": { "selector": "tbody tr", "count": 5 } }, // keep first N
//       { "setText": { "selector": "[data-author]", "text": "alice@acme.com" } },
//       { "setAttr": { "selector": "img.logo", "name": "src", "value": "..." } },
//       { "evaluate": "/* arbitrary page.evaluate script */" }
//     ]
//   }

const fs = require("fs-extra");
const path = require("node:path");
const chalk = require("chalk");
const { chromium } = require("playwright");

/**
 * Runs in the browser context. Pure function — no closures over Node
 * state. `manifestJson` is the only input. Keep this synchronous; if
 * the page has React rehydration scripts, give them time before calling
 * by waiting in the caller, then apply mutations as the *last* DOM
 * write so they aren't immediately overwritten.
 */
function applyMutationsInBrowser(manifestJson) {
  const m = JSON.parse(manifestJson);
  for (const mut of m.mutations || []) {
    if (mut.remove) {
      document.querySelectorAll(mut.remove).forEach((el) => el.remove());
    }
    if (mut.replaceText) {
      for (const r of mut.replaceText) {
        document.body.innerHTML = document.body.innerHTML
          .split(r.find)
          .join(r.with);
      }
    }
    if (mut.limit) {
      const els = document.querySelectorAll(mut.limit.selector);
      els.forEach((el, i) => {
        if (i >= mut.limit.count) el.remove();
      });
    }
    if (mut.setText) {
      document.querySelectorAll(mut.setText.selector).forEach((el) => {
        el.textContent = mut.setText.text;
      });
    }
    if (mut.setAttr) {
      document.querySelectorAll(mut.setAttr.selector).forEach((el) => {
        el.setAttribute(mut.setAttr.name, mut.setAttr.value);
      });
    }
    if (mut.evaluate) {
      // eslint-disable-next-line no-new-func
      new Function(mut.evaluate)();
    }
  }
}

async function resolveSourceMhtml({ source, scenarioKey, captureKey, theme }) {
  // 1) Explicit HTTPS URL → download to tmp, return local path. The local
  // file MUST end in .mhtml — Chromium detects MHTML by extension, not by
  // sniffing magic bytes, and our CDN serves under .related (the extension
  // derived from multipart/related contentType).
  if (source && /^https?:\/\//.test(source)) {
    const tmpDir = path.join(require("os").tmpdir(), "reshot-variation");
    fs.ensureDirSync(tmpDir);
    const localPath = path.join(tmpDir, `${Date.now()}-variation.mhtml`);
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`Failed to fetch source MHTML: ${res.status} ${res.statusText}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(localPath, buf);
    return { kind: "remote", path: localPath };
  }

  // 2) Explicit local path
  if (source && fs.existsSync(source)) {
    return { kind: "local", path: source };
  }

  // 3) Look in .reshot/output tree
  if (scenarioKey && captureKey) {
    const root = path.join(process.cwd(), ".reshot", "output", scenarioKey);
    if (fs.existsSync(root)) {
      const runs = fs.readdirSync(root)
        .filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d))
        .sort()
        .reverse();
      for (const run of runs) {
        const candidate = path.join(
          root,
          run,
          theme ? `theme-${theme}` : "default",
          `${captureKey}.mhtml`,
        );
        if (fs.existsSync(candidate)) {
          return { kind: "local", path: candidate };
        }
      }
    }
  }

  return null;
}

async function variationCommand(options) {
  const {
    source,
    scenario,
    capture,
    theme = "light",
    manifest: manifestPath,
    output,
    headless = true,
  } = options;

  if (!manifestPath || !fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }
  if (!output) {
    throw new Error("--output <path.png> is required");
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const viewport = manifest.viewport || {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
  };

  console.log(chalk.cyan("🎨 Variation render"));
  console.log(chalk.gray(`   manifest: ${manifestPath}`));

  const sourceRef = await resolveSourceMhtml({
    source,
    scenarioKey: scenario,
    captureKey: capture,
    theme,
  });
  if (!sourceRef) {
    throw new Error(
      "Could not resolve source MHTML. Provide --source <path> or --scenario <key> --capture <key>.",
    );
  }
  console.log(chalk.gray(`   source: ${sourceRef.path}`));

  const browser = await chromium.launch({ headless });
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor || 2,
    colorScheme: manifest.colorScheme === "dark" ? "dark" : "light",
    javaScriptEnabled: true,
  });
  const page = await ctx.newPage();

  const fileUrl = `file://${path.resolve(sourceRef.path)}`;
  await page.goto(fileUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  await page.waitForTimeout(400);

  if (manifest.mutations?.length) {
    await page.evaluate(applyMutationsInBrowser, JSON.stringify(manifest));
    await page.waitForTimeout(200);
  }

  fs.ensureDirSync(path.dirname(output));
  await page.screenshot({ path: output });
  console.log(chalk.green(`✔ Rendered: ${output}`));
  await browser.close();
}

module.exports = variationCommand;
