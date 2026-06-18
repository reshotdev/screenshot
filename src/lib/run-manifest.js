"use strict";

const fs = require("fs-extra");
const path = require("path");

const RUN_MANIFEST_DIR = path.join(
  process.cwd(),
  ".reshot",
  "manifests",
  "runs",
);
const LATEST_RUN_MANIFEST_PATH = path.join(RUN_MANIFEST_DIR, "run-latest.json");

function ensureRunManifestDir() {
  fs.ensureDirSync(RUN_MANIFEST_DIR);
  return RUN_MANIFEST_DIR;
}

function normalizeScenarioResults(results = []) {
  return results.map((result) => ({
    key: result.key || result.scenario || null,
    scenario: result.scenario || result.key || null,
    success: result.success !== false,
    timestamp: result.timestamp || null,
    outputDir: result.outputDir || null,
    variant: result.variant || null,
    assetCount: Array.isArray(result.assets) ? result.assets.length : 0,
  }));
}

function buildRunManifest(payload = {}) {
  const generatedAt = payload.generatedAt || new Date().toISOString();
  return {
    type: "ReshotRunManifest",
    runId: payload.runId || generatedAt.replace(/[:.]/g, "-"),
    generatedAt,
    success: payload.success !== false,
    outputBaseDir: payload.outputBaseDir || null,
    selectedScenarioKeys: payload.selectedScenarioKeys || [],
    diffEnabled: Boolean(payload.diffEnabled),
    scenarios: normalizeScenarioResults(payload.scenarios || []),
    preflight: payload.preflight || null,
  };
}

function writeRunManifest(payload = {}) {
  const manifest = buildRunManifest(payload);
  ensureRunManifestDir();
  const manifestPath = path.join(RUN_MANIFEST_DIR, `run-${manifest.runId}.json`);
  fs.writeJsonSync(manifestPath, manifest, { spaces: 2 });
  fs.writeJsonSync(LATEST_RUN_MANIFEST_PATH, manifest, { spaces: 2 });
  return { manifest, manifestPath, latestPath: LATEST_RUN_MANIFEST_PATH };
}

function readRunManifest(manifestPath) {
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    return null;
  }

  return fs.readJsonSync(manifestPath);
}

function listRunManifestPaths() {
  if (!fs.existsSync(RUN_MANIFEST_DIR)) {
    return [];
  }

  return fs
    .readdirSync(RUN_MANIFEST_DIR)
    .filter(
      (entry) =>
        /^run-.*\.json$/.test(entry) && entry !== path.basename(LATEST_RUN_MANIFEST_PATH),
    )
    .map((entry) => path.join(RUN_MANIFEST_DIR, entry))
    .sort((left, right) => right.localeCompare(left));
}

function getLatestSuccessfulRunManifest() {
  const latest = readRunManifest(LATEST_RUN_MANIFEST_PATH);
  if (latest?.success) {
    return latest;
  }

  for (const manifestPath of listRunManifestPaths()) {
    const manifest = readRunManifest(manifestPath);
    if (manifest?.success) {
      return manifest;
    }
  }

  return null;
}

/**
 * Returns the latest run manifest that has at least one successful scenario,
 * even if the overall run was not fully successful. This prevents falling back
 * to stale manifests when only some scenarios failed.
 *
 * Returns { manifest, isFallback, isPartialSuccess } where:
 * - isFallback: true if the returned manifest is NOT the latest run
 * - isPartialSuccess: true if the manifest has both succeeded and failed scenarios
 */
function getLatestUsableRunManifest() {
  const latest = readRunManifest(LATEST_RUN_MANIFEST_PATH);

  if (latest) {
    const successfulScenarios = (latest.scenarios || []).filter(
      (s) => s.success !== false,
    );
    if (successfulScenarios.length > 0) {
      return {
        manifest: latest,
        isFallback: false,
        isPartialSuccess: !latest.success,
      };
    }
  }

  // Latest has zero successful scenarios — search historical manifests
  for (const manifestPath of listRunManifestPaths()) {
    const manifest = readRunManifest(manifestPath);
    if (!manifest) continue;
    const successfulScenarios = (manifest.scenarios || []).filter(
      (s) => s.success !== false,
    );
    if (successfulScenarios.length > 0) {
      return {
        manifest,
        isFallback: true,
        isPartialSuccess: !manifest.success,
      };
    }
  }

  return null;
}

module.exports = {
  RUN_MANIFEST_DIR,
  LATEST_RUN_MANIFEST_PATH,
  buildRunManifest,
  writeRunManifest,
  readRunManifest,
  listRunManifestPaths,
  getLatestSuccessfulRunManifest,
  getLatestUsableRunManifest,
  normalizeScenarioResults,
};
