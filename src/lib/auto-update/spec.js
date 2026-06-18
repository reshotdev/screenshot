// Phase 5 auto-update — local per-composition state ("the stored spec").
//
// A composition's source screen (URL + viewport), the accepted baseline's
// structure signature + reference frame, and any outstanding flagged candidate
// live on disk so a CI `reshot refresh` is reproducible and idempotent. The
// reference frame is the prior ACCEPTED render's recapture; it advances only when
// a refresh publishes, so a flagged redesign leaves the old baseline (and the old
// live clip) untouched.

const fs = require("fs-extra");
const path = require("path");

function baseDir() {
  return (
    process.env.RESHOT_AUTO_UPDATE_DIR ||
    path.join(process.cwd(), ".reshot", "auto-update")
  );
}

function specDir(compositionId) {
  return path.join(baseDir(), compositionId);
}

function specPath(compositionId) {
  return path.join(specDir(compositionId), "spec.json");
}

function referencePngPath(compositionId) {
  return path.join(specDir(compositionId), "reference.png");
}

async function writeSpec(spec) {
  if (!spec || !spec.compositionId) {
    throw new Error("writeSpec requires spec.compositionId");
  }
  await fs.ensureDir(specDir(spec.compositionId));
  await fs.writeJson(specPath(spec.compositionId), spec, { spaces: 2 });
  return spec;
}

async function readSpec(compositionId) {
  const file = specPath(compositionId);
  if (!(await fs.pathExists(file))) {
    throw new Error(
      `No auto-update spec for composition ${compositionId} at ${file}. ` +
        "Register it with `reshot refresh --register` (or seed it) first.",
    );
  }
  return fs.readJson(file);
}

async function listSpecs(projectId) {
  const dir = baseDir();
  if (!(await fs.pathExists(dir))) return [];
  const entries = await fs.readdir(dir);
  const specs = [];
  for (const entry of entries) {
    const file = specPath(entry);
    if (!(await fs.pathExists(file))) continue;
    const spec = await fs.readJson(file);
    if (projectId && spec.projectId !== projectId) continue;
    specs.push(spec);
  }
  // Stable order so CI summaries and idempotence checks are deterministic.
  return specs.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
}

async function readReferencePng(compositionId) {
  const file = referencePngPath(compositionId);
  if (!(await fs.pathExists(file))) return null;
  return fs.readFile(file);
}

async function writeReferencePng(compositionId, buffer) {
  await fs.ensureDir(specDir(compositionId));
  await fs.writeFile(referencePngPath(compositionId), buffer);
}

module.exports = {
  baseDir,
  specDir,
  specPath,
  referencePngPath,
  writeSpec,
  readSpec,
  listSpecs,
  readReferencePng,
  writeReferencePng,
};
