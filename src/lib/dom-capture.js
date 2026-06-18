// dom-capture.js — CLI integration layer for the Tier-3 DOM-capture engine.
//
// The capture techniques (m7 hybrid primary, m4 CDP DOMSnapshot fallback) live in
// @reshot/compose/capture so they can reuse the deterministic renderer + the
// calibrated verify evaluator and be gated under `pnpm --dir packages/compose
// test`. This module is the thin CLI-side wrapper: it loads that engine (with a
// monorepo dist fallback, mirroring commands/compose.js) and exposes the two
// entry points the CLI needs.

const path = require("path");
const fs = require("fs-extra");
const { composeDistDir } = require("./compose-runtime");

function loadCaptureEngine() {
  return require(path.join(composeDistDir(), "capture.cjs"));
}

/**
 * Capture a DOM artifact from an ALREADY-NAVIGATED live page and write it next to
 * the other capture outputs. Returns the metadata.domArtifact block (or null if
 * capture failed — capture is additive and must never break the video path).
 *
 * @param {object} args
 * @param {import('playwright').Page} args.page  live page (capture as-is)
 * @param {string} args.outputDir
 * @param {string} args.slug
 * @param {string|null} [args.csp]
 */
async function captureDomArtifact({ page, outputDir, slug, csp = null }) {
  try {
    const { captureDom, writeArtifact } = loadCaptureEngine();
    const snapshot = await captureDom(page, { csp });
    const base = path.join(outputDir, slug);
    const paths = await writeArtifact(snapshot, base);
    return { path: paths.html, method: snapshot.method, sidecars: snapshot.surfaces };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`  ⚠ DOM capture skipped: ${message}`);
    return null;
  }
}

/**
 * Standalone capture of a URL: navigates, captures, remounts, and writes the
 * artifact + remounted.png + live.png into outDir. Returns a result summary.
 */
async function captureDomFromUrl({ url, outDir, slug = "capture", settings }) {
  const { captureUrl, writeArtifact } = loadCaptureEngine();
  await fs.ensureDir(outDir);
  const result = await captureUrl(url, settings ? { settings } : {});
  const paths = await writeArtifact(result.snapshot, path.join(outDir, slug));
  await fs.writeFile(path.join(outDir, "remounted.png"), result.remountPng);
  await fs.writeFile(path.join(outDir, "live.png"), result.livePng);
  return {
    method: result.method,
    artifact: paths.html,
    meta: paths.meta,
    remounted: path.join(outDir, "remounted.png"),
    live: path.join(outDir, "live.png"),
    sidecars: result.snapshot.surfaces,
  };
}

module.exports = { loadCaptureEngine, captureDomArtifact, captureDomFromUrl };
