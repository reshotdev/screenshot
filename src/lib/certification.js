"use strict";

const fs = require("fs-extra");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const config = require("./config");
const apiClient = require("./api-client");
const { getDefaultSessionPath } = require("./record-cdp");
const { substituteUrlVariables } = require("./capture-script-runner");

const REPORT_DIR = path.join(process.cwd(), ".reshot", "reports");
const CERTIFICATION_REPORT_PATH = path.join(REPORT_DIR, "certification.json");

function createIssue(severity, code, message, details = null) {
  return {
    severity,
    code,
    message,
    ...(details ? { details } : {}),
  };
}

function buildSummary(blockingIssues = [], advisories = [], info = []) {
  return {
    overallSeverity:
      blockingIssues.length > 0
        ? "blocking"
        : advisories.length > 0
          ? "warning"
          : "info",
    blockingIssues,
    advisories,
    info,
  };
}

function toCamelCase(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[A-Z]/, (chr) => chr.toLowerCase());
}

function ensureReportDir() {
  fs.ensureDirSync(REPORT_DIR);
  return REPORT_DIR;
}

function getSelectedScenarios(docSyncConfig, scenarioKeys = null) {
  const selectedKeys = config.getCertifiedScenarioKeys(docSyncConfig, scenarioKeys);
  return (docSyncConfig.scenarios || []).filter((scenario) =>
    selectedKeys.includes(scenario.key),
  );
}

function hasDeterministicReadyContract(scenario) {
  return Boolean(
    scenario.ready?.selector ||
      scenario.ready?.expression ||
      (scenario.steps || []).some((step) => step.action === "waitForSelector"),
  );
}

function usesSleepOnlyReadiness(scenario) {
  const steps = scenario.steps || [];
  if (steps.length === 0) return true;
  const hasWait = steps.some((step) => step.action === "wait");
  const hasReadySignal = hasDeterministicReadyContract(scenario);
  return hasWait && !hasReadySignal;
}

function joinUrl(baseUrl, route) {
  if (!route) return baseUrl;
  if (route.startsWith("http://") || route.startsWith("https://")) {
    return route;
  }
  return new URL(route, `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

function resolveContractUrl(baseUrl, route) {
  return joinUrl(baseUrl, substituteUrlVariables(route));
}

function classifyDiagnostic(event) {
  const kind = event.kind || "unknown";
  if (kind === "pageerror" || kind === "requestfailed" || kind === "response_error") {
    return { blocking: true, reason: kind };
  }
  if (kind === "console" && event.severity === "error") {
    return { blocking: true, reason: event.cspViolation ? "csp_violation" : "console_error" };
  }
  return { blocking: false, reason: kind };
}

function hasBlockingDiagnostics(events) {
  return (events || []).some((event) => classifyDiagnostic(event).blocking);
}

async function withTimeout(task, timeoutMs, label) {
  let timeoutId = null;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function fetchRoute(routeUrl) {
  try {
    const response = await fetch(routeUrl, { redirect: "manual" });
    return {
      ok: response.status < 400,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      url: routeUrl,
      location: response.headers.get("location") || null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: "",
      url: routeUrl,
      error: error.message,
      location: null,
    };
  }
}

async function runShellCommand(command, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: "pipe",
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr,
        command,
      });
    });
  });
}

async function ensureFixturePrepared(target, scenarios) {
  const needsFixture = scenarios.some((scenario) => scenario.captureClass === "fixture-auth");
  if (!needsFixture || !target.fixture?.command) {
    return {
      ok: !needsFixture,
      skipped: !needsFixture,
      command: target.fixture?.command || null,
    };
  }

  const result = await runShellCommand(target.fixture.command, process.cwd());
  return {
    ...result,
    skipped: false,
  };
}

async function assertCaptureSafeRuntime(target) {
  if (!target.captureSafe) {
    return { ok: true, skipped: true };
  }

  const response = await fetch(target.baseUrl, { redirect: "manual" });
  const html = await response.text();
  return {
    ok: response.ok && html.includes('data-capture-safe-runtime="true"'),
    skipped: false,
    status: response.status,
  };
}

async function auditScenarioPage(target, scenario) {
  const sessionPath = getDefaultSessionPath();
  const storageState =
    scenario.captureClass !== "public" && fs.existsSync(sessionPath)
      ? sessionPath
      : undefined;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(
    storageState ? { storageState } : {},
  );
  const page = await context.newPage();
  const diagnostics = [];

  page.on("pageerror", (error) => {
    diagnostics.push({
      kind: "pageerror",
      severity: "error",
      message: error.message,
    });
  });
  page.on("console", (message) => {
    const severity =
      message.type() === "error"
        ? "error"
        : message.type() === "warning"
          ? "warning"
          : "info";
    if (severity !== "info") {
      diagnostics.push({
        kind: "console",
        severity,
        message: message.text(),
      });
    }
  });
  page.on("requestfailed", (request) => {
    diagnostics.push({
      kind: "requestfailed",
      severity: "error",
      url: request.url(),
      message: request.failure()?.errorText || "Request failed",
    });
  });

  try {
    const pageUrl = resolveContractUrl(target.baseUrl, scenario.url);
    const response = await page.goto(pageUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    const missingSelectors = [];
    for (const selector of scenario.requiredSelectors || []) {
      const count = await page.locator(selector).count();
      if (count === 0) {
        missingSelectors.push(selector);
      }
    }

    let ready = true;
    let readyFailure = null;
    if (scenario.ready?.selector) {
      try {
        await page.locator(scenario.ready.selector).first().waitFor({
          state: "attached",
          timeout: scenario.ready.timeout || 10_000,
        });
      } catch {
        ready = false;
        readyFailure = `Missing ready selector ${scenario.ready.selector}`;
      }
    }
    if (ready && scenario.ready?.expression) {
      try {
        await page.waitForFunction(scenario.ready.expression, {
          timeout: scenario.ready.timeout || 10_000,
        });
      } catch {
        ready = false;
        readyFailure = `Ready expression did not resolve for ${scenario.key}`;
      }
    }

    return {
      ok:
        Boolean(response?.status() && response.status() < 400) &&
        missingSelectors.length === 0 &&
        ready &&
        !hasBlockingDiagnostics(diagnostics),
      scenario: scenario.key,
      url: pageUrl,
      status: response?.status() || 0,
      missingSelectors,
      ready,
      readyFailure,
      diagnostics,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

function flattenAssetEntry(entry) {
  if (!entry) return [];
  if (Array.isArray(entry.steps)) {
    return entry.steps.map((step) => ({
      url: step.src,
      poster: step.poster || null,
      step: step.step,
    }));
  }

  return [
    {
      url: entry.src,
      poster: entry.poster || null,
      step: null,
    },
  ];
}

function getExpectedAssetChecks(assets, scenarios) {
  const checks = [];

  for (const scenario of scenarios) {
    const groupKey = toCamelCase(scenario.key);
    const visualGroup = assets?.[groupKey] || {};
    const artifacts = scenario.expectedArtifacts || [];
    for (const assetKey of artifacts) {
      const visualKey = toCamelCase(assetKey);
      const entry =
        visualGroup?.[visualKey]?.default ||
        visualGroup?.[visualKey]?.base ||
        Object.values(visualGroup?.[visualKey] || {})[0];
      checks.push({
        scenario: scenario.key,
        assetKey,
        urls: flattenAssetEntry(entry),
        found: Boolean(entry),
      });
    }
  }

  return checks;
}

async function verifyHostedUrl(url) {
  if (!url) {
    return {
      ok: false,
      status: 0,
      reason: "missing_url",
    };
  }

  const normalized = String(url);
  const response = await fetch(normalized, { redirect: "manual" });
  const contentType = response.headers.get("content-type") || "";

  return {
    ok: response.status === 307,
    status: response.status,
    contentType,
    location: response.headers.get("location") || null,
    htmlFallback: contentType.includes("text/html"),
  };
}

async function runDoctorTarget(options = {}) {
  ensureReportDir();
  const docSyncConfig = config.readConfig();
  const target = docSyncConfig.target;
  const scenarios = getSelectedScenarios(docSyncConfig, options.scenarioKeys);
  const timeoutMs = options.timeoutMs || 15_000;
  // Overall budget so the command fails fast instead of grinding through every
  // scenario at the full per-step timeout (which read as an indefinite hang).
  const overallTimeoutMs = options.overallTimeoutMs || Math.max(timeoutMs * 4, 60_000);
  const startedAt = Date.now();
  const overBudget = () => Date.now() - startedAt > overallTimeoutMs;
  const onProgress =
    typeof options.onProgress === "function" ? options.onProgress : null;

  onProgress?.(`Loaded ${scenarios.length} certified scenario(s) for ${target.displayName}.`);

  const requiredEnv = (target.requiredEnv || []).map((key) => ({
    key,
    present: Boolean(process.env[key]),
  }));

  onProgress?.("Preparing fixture state (if required)...");
  const fixture = await withTimeout(
    () => ensureFixturePrepared(target, scenarios),
    timeoutMs,
    "Fixture preparation",
  );
  onProgress?.("Checking capture-safe runtime marker...");
  const captureSafe = await withTimeout(
    () => assertCaptureSafeRuntime(target),
    timeoutMs,
    "Capture-safe runtime check",
  );

  const routeAudits = [];
  const readinessAudits = [];
  const blockingIssues = [];
  const advisories = [];
  const info = [];

  let budgetExceeded = false;
  for (const scenario of scenarios) {
    if (overBudget()) {
      budgetExceeded = true;
      onProgress?.(
        `Overall doctor budget (${overallTimeoutMs}ms) exceeded — stopping before "${scenario.key}".`,
      );
      blockingIssues.push(
        createIssue(
          "blocking",
          "doctor_timeout",
          `Target doctor exceeded its overall time budget of ${overallTimeoutMs}ms. Remaining scenarios were not audited.`,
          { auditedScenarios: readinessAudits.length, totalScenarios: scenarios.length },
        ),
      );
      break;
    }
    onProgress?.(`Auditing routes for ${scenario.key}...`);
    const routeResults = [];
    for (const route of scenario.requiredRoutes || []) {
      try {
        const resolvedUrl = resolveContractUrl(target.baseUrl, route);
        const routeResult = await withTimeout(
          () => fetchRoute(resolvedUrl),
          Math.min(timeoutMs, 10_000),
          `Route audit for ${scenario.key}`,
        );
        routeResult.resolvedUrl = resolvedUrl;
        routeResults.push(routeResult);
      } catch (error) {
        routeResults.push({
          ok: false,
          status: 0,
          contentType: "",
          url: route,
          resolvedUrl: null,
          location: null,
          error: error.message,
        });
      }
    }
    routeAudits.push({
      scenario: scenario.key,
      routes: routeResults,
      ok: routeResults.every((result) => result.ok),
    });
    if (!routeResults.every((result) => result.ok)) {
      blockingIssues.push(
        createIssue(
          "blocking",
          "route_mismatch",
          `Scenario "${scenario.key}" failed route audit.`,
          { scenario: scenario.key, routes: routeResults },
        ),
      );
    }

    let readyContractOk = hasDeterministicReadyContract(scenario);
    let contractFailure = null;
    if (target.tier === "certified" && !readyContractOk) {
      contractFailure = "Scenario is missing an app-owned readiness contract.";
    } else if (target.tier === "certified" && usesSleepOnlyReadiness(scenario)) {
      readyContractOk = false;
      contractFailure = "Scenario relies on waits without a deterministic ready contract.";
    }

    onProgress?.(`Auditing page readiness for ${scenario.key}...`);
    let pageAudit;
    try {
      pageAudit = await withTimeout(
        () => auditScenarioPage(target, scenario),
        timeoutMs,
        `Page readiness audit for ${scenario.key}`,
      );
    } catch (error) {
      pageAudit = {
        ok: false,
        scenario: scenario.key,
        url: resolveContractUrl(target.baseUrl, scenario.url),
        status: 0,
        missingSelectors: [],
        ready: false,
        readyFailure: error.message,
        diagnostics: [
          {
            kind: "timeout",
            severity: "error",
            message: error.message,
          },
        ],
      };
    }
    readinessAudits.push({
      scenario: scenario.key,
      ok: readyContractOk && pageAudit.ok,
      contractOk: readyContractOk,
      contractFailure,
      pageAudit,
    });
    if (contractFailure) {
      blockingIssues.push(
        createIssue("blocking", "target_readiness", contractFailure, {
          scenario: scenario.key,
        }),
      );
    } else if (!pageAudit.ok) {
      blockingIssues.push(
        createIssue(
          "blocking",
          "capture_runtime",
          `Scenario "${scenario.key}" failed page readiness audit.`,
          { scenario: scenario.key, diagnostics: pageAudit.diagnostics },
        ),
      );
    }
  }

  for (const item of requiredEnv.filter((entry) => !entry.present)) {
    blockingIssues.push(
      createIssue(
        "blocking",
        "auth_setup",
        `Required environment variable "${item.key}" is missing.`,
      ),
    );
  }

  if (!fixture.skipped && !fixture.ok) {
    blockingIssues.push(
      createIssue(
        "blocking",
        "auth_setup",
        "Fixture preparation failed.",
        { command: fixture.command, code: fixture.code },
      ),
    );
  }

  if (!captureSafe.ok) {
    advisories.push(
      createIssue(
        "warning",
        "capture_runtime",
        "Capture-safe runtime marker was not detected.",
        { status: captureSafe.status ?? null },
      ),
    );
  } else if (!captureSafe.skipped) {
    info.push(
      createIssue(
        "info",
        "capture_runtime",
        "Capture-safe runtime verified successfully.",
      ),
    );
  }

  const ok =
    !budgetExceeded &&
    requiredEnv.every((item) => item.present) &&
    (fixture.skipped || fixture.ok) &&
    captureSafe.ok &&
    routeAudits.every((audit) => audit.ok) &&
    readinessAudits.every((audit) => audit.ok);

  const report = {
    type: "TargetCertificationReport",
    stage: "doctor",
    generatedAt: new Date().toISOString(),
    target,
    requiredEnv,
    fixture,
    captureSafe,
    routeAudits,
    readinessAudits,
    summary: buildSummary(blockingIssues, advisories, info),
    ok,
  };

  await fs.writeJson(CERTIFICATION_REPORT_PATH, report, { spaces: 2 });
  onProgress?.(`Doctor target completed with status: ${ok ? "ok" : "failed"}.`);
  return report;
}

async function runVerifyPublish(options = {}) {
  ensureReportDir();
  const publishCommand = require("../commands/publish");
  const pullCommand = require("../commands/pull");
  const docSyncConfig = config.readConfig();
  const target = docSyncConfig.target;
  const scenarios = getSelectedScenarios(docSyncConfig, options.scenarioKeys);
  const projectId = docSyncConfig.projectId || docSyncConfig._metadata?.projectId;

  const publishResult = await publishCommand({
    tag: options.tag,
    message: options.message,
    force: true,
    outputJson: true,
    skipReleaseDoctor: true,
    noExit: true,
  });

  const pullOutputPath = path.join(REPORT_DIR, "certification-pull.json");
  const pullResult = await pullCommand({
    format: "json",
    output: pullOutputPath,
    status: "all",
    noExit: true,
  });

  let exportResult = null;
  try {
    exportResult = await apiClient.exportVisuals(projectId, {
      format: "json",
      status: "all",
    });
  } catch (error) {
    exportResult = { error: error.message, assets: null };
  }

  const exportChecks = getExpectedAssetChecks(exportResult.assets, scenarios);
  const deliveryChecks = [];
  const blockingIssues = [];
  const advisories = [];
  const info = [];
  for (const check of exportChecks) {
    if (!check.found) {
      deliveryChecks.push({
        scenario: check.scenario,
        assetKey: check.assetKey,
        ok: false,
        reason: "missing_export_asset",
      });
      continue;
    }

    for (const url of check.urls) {
      const hosted = await verifyHostedUrl(url.url);
      deliveryChecks.push({
        scenario: check.scenario,
        assetKey: check.assetKey,
        url: url.url,
        step: url.step,
        ok: hosted.ok,
        reason: hosted.ok
          ? null
          : hosted.htmlFallback
            ? "html_catch_all"
            : `status_${hosted.status}`,
        response: hosted,
      });
    }
  }

  const ok =
    Boolean(publishResult?.success) &&
    Boolean(pullResult?.success) &&
    (pullResult?.normalizationRepairs || 0) === 0 &&
    deliveryChecks.length > 0 &&
    deliveryChecks.every((check) => check.ok);

  if (!publishResult?.success) {
    blockingIssues.push(
      createIssue("blocking", "publish", "Publish did not complete successfully."),
    );
  }

  if (!pullResult?.success) {
    blockingIssues.push(
      createIssue("blocking", "publish", "Pull/export did not complete successfully."),
    );
  }

  if ((pullResult?.normalizationRepairs || 0) > 0) {
    blockingIssues.push(
      createIssue(
        "blocking",
        "publish",
        "Pull normalized newly generated URLs. Launch output must already be canonical.",
        { normalizationRepairs: pullResult.normalizationRepairs },
      ),
    );
  }

  if (exportResult?.error) {
    blockingIssues.push(
      createIssue("blocking", "hosted_delivery", "Visual export failed.", {
        error: exportResult.error,
      }),
    );
  }

  for (const check of deliveryChecks) {
    if (!check.ok) {
      const code =
        check.reason === "html_catch_all" ? "route_mismatch" : "hosted_delivery";
      blockingIssues.push(
        createIssue(
          "blocking",
          code,
          `Hosted delivery failed for ${check.assetKey}.`,
          check,
        ),
      );
    }
  }

  if (deliveryChecks.every((check) => check.ok) && deliveryChecks.length > 0) {
    info.push(
      createIssue(
        "info",
        "hosted_delivery",
        "Hosted delivery verified for all expected assets.",
      ),
    );
  }

  const report = {
    type: "DeliveryVerificationResult",
    stage: "verify-publish",
    generatedAt: new Date().toISOString(),
    target,
    publishResult,
    pullResult,
    exportError: exportResult?.error || null,
    deliveryChecks,
    summary: buildSummary(blockingIssues, advisories, info),
    ok,
  };

  await fs.writeJson(CERTIFICATION_REPORT_PATH, report, { spaces: 2 });
  return report;
}

async function runCertification(options = {}) {
  ensureReportDir();
  const runCommand = require("../commands/run");
  const { runReleaseDoctor } = require("./release-doctor");
  const docSyncConfig = config.readConfig();
  const target = docSyncConfig.target;
  const scenarios = getSelectedScenarios(docSyncConfig, options.scenarioKeys);
  const selectedScenarioKeys = scenarios.map((scenario) => scenario.key);

  const releaseDoctor = options.skipReleaseDoctor
    ? {
        skipped: true,
        ok: true,
        summary: {
          blockingIssues: [],
          advisories: [],
          info: [
            createIssue(
              "info",
              "release_doctor",
              "Release doctor skipped by operator request.",
            ),
          ],
        },
      }
    : await runReleaseDoctor({ scenarioKeys: selectedScenarioKeys });

  if (!releaseDoctor.ok) {
    const report = {
      type: "TargetCertificationReport",
      stage: "certify",
      generatedAt: new Date().toISOString(),
      target,
      scenarios: selectedScenarioKeys,
      releaseDoctor,
      doctor: {
        skipped: true,
        ok: false,
      },
      capture: {
        skipped: true,
        success: false,
        results: [],
        diagnostics: [],
      },
      publishVerification: {
        skipped: true,
        ok: false,
      },
      summary: buildSummary(
        [
          ...(releaseDoctor.summary?.blockingIssues || []),
        ],
        [...(releaseDoctor.summary?.advisories || [])],
        [],
      ),
      finalStatus: "failed",
      ok: false,
    };

    await fs.writeJson(CERTIFICATION_REPORT_PATH, report, { spaces: 2 });
    return report;
  }

  const doctor = await runDoctorTarget({ scenarioKeys: selectedScenarioKeys });
  const capture = await runCommand({
    scenarioKeys: selectedScenarioKeys,
    headless: true,
    noExit: true,
  });
  const verify = await runVerifyPublish({
    scenarioKeys: selectedScenarioKeys,
    tag: options.tag,
    message: options.message || `${target.displayName} certified target verification`,
  });

  const captureDiagnostics = (capture.results || []).map((result) => ({
    scenario: result.scenario,
    diagnostics: result.diagnostics || [],
    ok: !hasBlockingDiagnostics(result.diagnostics || []) && result.success,
  }));

  const ok =
    doctor.ok &&
    capture.success &&
    captureDiagnostics.every((result) => result.ok) &&
    verify.ok;

  const blockingIssues = [
    ...(releaseDoctor.summary?.blockingIssues || []),
    ...(doctor.summary?.blockingIssues || []),
    ...(verify.summary?.blockingIssues || []),
  ];
  const advisories = [
    ...(releaseDoctor.summary?.advisories || []),
    ...(doctor.summary?.advisories || []),
    ...(verify.summary?.advisories || []),
  ];
  const info = [
    ...(releaseDoctor.summary?.info || []),
    ...(doctor.summary?.info || []),
    ...(verify.summary?.info || []),
  ];

  for (const result of captureDiagnostics.filter((item) => !item.ok)) {
    blockingIssues.push(
      createIssue(
        "blocking",
        "capture_runtime",
        `Capture diagnostics failed for scenario "${result.scenario}".`,
        result,
      ),
    );
  }

  const report = {
    type: "TargetCertificationReport",
    stage: "certify",
    generatedAt: new Date().toISOString(),
    target,
    scenarios: selectedScenarioKeys,
    releaseDoctor,
    doctor,
    capture: {
      success: capture.success,
      results: capture.results,
      diagnostics: captureDiagnostics,
    },
    publishVerification: verify,
    summary: buildSummary(blockingIssues, advisories, info),
    finalStatus: ok ? "certified" : "failed",
    ok,
  };

  await fs.writeJson(CERTIFICATION_REPORT_PATH, report, { spaces: 2 });
  return report;
}

module.exports = {
  CERTIFICATION_REPORT_PATH,
  runDoctorTarget,
  runVerifyPublish,
  runCertification,
};
