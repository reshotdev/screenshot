"use strict";

const fs = require("fs-extra");
const path = require("path");
const config = require("./config");
const { buildRunPreflightReport } = require("../commands/run");
const { runDoctorTarget } = require("./certification");

const REPORT_DIR = path.join(process.cwd(), ".reshot", "reports");
const RELEASE_DOCTOR_REPORT_PATH = path.join(REPORT_DIR, "release-doctor.json");
const DEFAULT_DOCS_ASSET_MAP_MAX_AGE_DAYS = 30;
const RESHOT_CDN_ORIGIN = "https://cdn.reshot.dev/";

function ensureReportDir() {
  fs.ensureDirSync(REPORT_DIR);
  return REPORT_DIR;
}

function parseScenarioKeys(value) {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }

  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveDocsAssetMapMaxAgeDays() {
  const parsed = Number.parseInt(
    process.env.RESHOT_DOCS_ASSET_MAP_MAX_AGE_DAYS || String(DEFAULT_DOCS_ASSET_MAP_MAX_AGE_DAYS),
    10,
  );

  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_DOCS_ASSET_MAP_MAX_AGE_DAYS;
}

function createDocsHealth(options = {}) {
  return {
    checked: false,
    skipped: false,
    ok: false,
    path: null,
    exportedAt: null,
    ageDays: null,
    maxAgeDays: resolveDocsAssetMapMaxAgeDays(),
    summary: {
      visuals: 0,
      assets: 0,
      steps: 0,
    },
    issues: [],
    ...options,
  };
}

function createDocsIssueCollector(summary, issues, groupKey, visualKey, contextKey) {
  return {
    checkEntry(entry) {
      summary.assets += 1;

      if (!entry || typeof entry !== "object") {
        issues.push(`Asset map entry \"${groupKey}/${visualKey}/${contextKey}\" is invalid.`);
        return;
      }

      if (!entry.type) {
        issues.push(`Asset map entry \"${groupKey}/${visualKey}/${contextKey}\" is missing type.`);
      }

      if (!entry.alt) {
        issues.push(`Asset map entry \"${groupKey}/${visualKey}/${contextKey}\" is missing alt text.`);
      }

      if (entry.src && !String(entry.src).startsWith(RESHOT_CDN_ORIGIN)) {
        issues.push(
          `Asset map entry \"${groupKey}/${visualKey}/${contextKey}\" does not use a direct cdn.reshot.dev URL.`,
        );
      }

      if (entry.poster && !String(entry.poster).startsWith(RESHOT_CDN_ORIGIN)) {
        issues.push(
          `Asset map poster \"${groupKey}/${visualKey}/${contextKey}\" does not use a direct cdn.reshot.dev URL.`,
        );
      }

      for (const step of entry.steps || []) {
        summary.steps += 1;
        if (!step?.src || !String(step.src).startsWith(RESHOT_CDN_ORIGIN)) {
          issues.push(
            `Asset map step \"${groupKey}/${visualKey}/${contextKey}/${step?.step || "unknown"}\" does not use a direct cdn.reshot.dev URL.`,
          );
        }
      }
    },
  };
}

function inspectDocsAssetMap(assetMap, options = {}) {
  const maxAgeDays = Number.isFinite(options.maxAgeDays)
    ? options.maxAgeDays
    : resolveDocsAssetMapMaxAgeDays();
  const now = options.now || new Date();
  const issues = [];
  const summary = {
    visuals: 0,
    assets: 0,
    steps: 0,
  };

  if (!assetMap || typeof assetMap !== "object") {
    return createDocsHealth({
      checked: true,
      ok: false,
      maxAgeDays,
      issues: ["Asset map is missing or invalid."],
    });
  }

  const exportedAt = typeof assetMap.meta?.exportedAt === "string"
    ? assetMap.meta.exportedAt
    : null;
  const exportedAtMs = exportedAt ? Date.parse(exportedAt) : Number.NaN;
  let ageDays = null;

  if (!assetMap.meta?.projectId) {
    issues.push("Asset map meta.projectId is missing.");
  }

  if (!exportedAt || Number.isNaN(exportedAtMs)) {
    issues.push("Asset map meta.exportedAt is missing or invalid.");
  } else {
    ageDays = Math.max(0, Math.floor((now.getTime() - exportedAtMs) / 86_400_000));
    if (ageDays > maxAgeDays) {
      issues.push(`Asset map is stale: exported ${ageDays} day(s) ago (max ${maxAgeDays}).`);
    }
  }

  const groups = assetMap.assets && typeof assetMap.assets === "object"
    ? Object.entries(assetMap.assets)
    : [];
  if (groups.length === 0) {
    issues.push("Asset map has no assets.");
  }

  for (const [groupKey, visuals] of groups) {
    if (!visuals || typeof visuals !== "object") {
      issues.push(`Asset map group \"${groupKey}\" is invalid.`);
      continue;
    }

    for (const [visualKey, contexts] of Object.entries(visuals)) {
      summary.visuals += 1;

      if (!contexts || typeof contexts !== "object") {
        issues.push(`Asset map visual \"${groupKey}/${visualKey}\" is invalid.`);
        continue;
      }

      for (const [contextKey, entry] of Object.entries(contexts)) {
        createDocsIssueCollector(summary, issues, groupKey, visualKey, contextKey)
          .checkEntry(entry);
      }
    }
  }

  if (
    typeof assetMap.meta?.totalVisuals === "number" &&
    assetMap.meta.totalVisuals !== summary.visuals
  ) {
    issues.push(`Asset map meta.totalVisuals=${assetMap.meta.totalVisuals} but counted ${summary.visuals}.`);
  }

  if (
    typeof assetMap.meta?.totalAssets === "number" &&
    assetMap.meta.totalAssets !== summary.assets
  ) {
    issues.push(`Asset map meta.totalAssets=${assetMap.meta.totalAssets} but counted ${summary.assets}.`);
  }

  if (
    typeof assetMap.meta?.totalSteps === "number" &&
    assetMap.meta.totalSteps !== summary.steps
  ) {
    issues.push(`Asset map meta.totalSteps=${assetMap.meta.totalSteps} but counted ${summary.steps}.`);
  }

  return createDocsHealth({
    checked: true,
    ok: issues.length === 0,
    exportedAt,
    ageDays,
    maxAgeDays,
    summary,
    issues,
  });
}

function resolveDocsAssetMapCandidates(cwd = process.cwd()) {
  return [
    path.join(cwd, "src", "data", "reshot-assets.json"),
    path.join(cwd, "app", "src", "data", "reshot-assets.json"),
  ];
}

function inspectDocsAssetMapFile(options = {}) {
  const cwd = options.cwd || process.cwd();
  const candidates = resolveDocsAssetMapCandidates(cwd);
  const assetMapPath = candidates.find((candidate) => fs.existsSync(candidate));

  if (!assetMapPath) {
    return createDocsHealth({
      checked: false,
      skipped: true,
      ok: true,
      issues: ["No docs asset map found; skipping docs asset verification."],
    });
  }

  try {
    const assetMap = fs.readJsonSync(assetMapPath);
    return {
      ...inspectDocsAssetMap(assetMap, options),
      path: assetMapPath,
    };
  } catch (error) {
    return createDocsHealth({
      checked: true,
      ok: false,
      path: assetMapPath,
      issues: [`Failed to read docs asset map: ${error.message}`],
    });
  }
}

async function runReleaseDoctor(options = {}) {
  ensureReportDir();
  const scenarioKeys = parseScenarioKeys(options.scenarioKeys || options.scenarios);
  const docSyncConfig = config.readConfig();
  const preflight = await buildRunPreflightReport(docSyncConfig, { scenarioKeys });
  const targetDoctor = docSyncConfig.target?.tier === "certified"
    ? await runDoctorTarget({ scenarioKeys })
    : {
        skipped: true,
        ok: true,
        target: docSyncConfig.target,
        summary: {
          overallSeverity: "info",
          blockingIssues: [],
          advisories: [],
          info: [{ message: "Target doctor skipped for non-certified target." }],
        },
      };
  const docsAssetMap = inspectDocsAssetMapFile({ cwd: process.cwd() });

  const blockingIssues = [];
  const advisories = [];

  for (const error of preflight.errors || []) {
    blockingIssues.push({ scope: "run-preflight", message: error });
  }
  for (const warning of preflight.warnings || []) {
    advisories.push({ scope: "run-preflight", message: warning });
  }
  for (const issue of targetDoctor.summary?.blockingIssues || []) {
    blockingIssues.push({ scope: "target-doctor", ...issue });
  }
  for (const issue of targetDoctor.summary?.advisories || []) {
    advisories.push({ scope: "target-doctor", ...issue });
  }
  if (!docsAssetMap.skipped) {
    for (const issue of docsAssetMap.issues) {
      blockingIssues.push({ scope: "docs-asset-map", message: issue });
    }
  }

  const ok = preflight.ok && targetDoctor.ok && (docsAssetMap.skipped || docsAssetMap.ok);
  const report = {
    type: "ReleaseDoctorReport",
    stage: "doctor-release",
    generatedAt: new Date().toISOString(),
    ok,
    scenarioKeys: scenarioKeys || null,
    target: docSyncConfig.target || null,
    runPreflight: preflight,
    targetDoctor,
    docsAssetMap,
    summary: {
      blockingIssues,
      advisories,
    },
  };

  await fs.writeJson(RELEASE_DOCTOR_REPORT_PATH, report, { spaces: 2 });
  report.reportPath = RELEASE_DOCTOR_REPORT_PATH;
  return report;
}

module.exports = {
  RELEASE_DOCTOR_REPORT_PATH,
  parseScenarioKeys,
  resolveDocsAssetMapCandidates,
  inspectDocsAssetMap,
  inspectDocsAssetMapFile,
  runReleaseDoctor,
};