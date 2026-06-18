// compose-runtime.js — locate the @reshot/compose build the CLI ships with.
//
// The compose engine is vendored (self-contained: motion-core and the pure-JS
// image deps are inlined; only esbuild + playwright-core stay external and are
// declared as CLI dependencies). The published package ships vendor/compose/dist;
// when developing inside the monorepo we fall back to the live package build.

const path = require("path");
const fs = require("fs-extra");

let cached;

/** Absolute path to the compose dist directory (capture.cjs, render.mjs, …). */
function composeDistDir() {
  if (cached) return cached;
  const candidates = [
    // Shipped with the published CLI (also present in the standalone repo).
    path.resolve(__dirname, "../../vendor/compose/dist"),
    // Monorepo development: packages/compose/dist.
    path.resolve(__dirname, "../../../../packages/compose/dist"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      cached = dir;
      return dir;
    }
  }
  throw new Error(
    "@reshot/compose build not found. Expected vendor/compose/dist " +
      "(shipped with the CLI) or packages/compose/dist (monorepo dev).",
  );
}

module.exports = { composeDistDir };
