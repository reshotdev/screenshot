#!/usr/bin/env node
/**
 * status - Check project status, sync jobs, and drift queue
 *
 * Displays:
 * - Current project configuration
 * - Recent sync jobs with status
 * - Drift queue summary
 *
 * Usage: reshot status [--jobs] [--drifts] [--config] [--json]
 */

const chalk = require("chalk");
const config = require("../lib/config");
const apiClient = require("../lib/api-client");

function createIssue(scope, level, message, details = {}) {
  return {
    scope,
    level,
    message,
    ...details,
  };
}

function summarizeConfig(reshotConfig) {
  return {
    baseUrl: reshotConfig.baseUrl || null,
    viewport: reshotConfig.viewport || null,
    assetDir: reshotConfig.assetDir || ".reshot/output",
    scenarioCount: reshotConfig.scenarios?.length || 0,
    traceDir: reshotConfig.visuals?.traceDir || null,
  };
}

function readSettingsSafe() {
  try {
    return config.readSettings();
  } catch (error) {
    return null;
  }
}

/**
 * Format timestamp for display
 */
function formatTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Format job status with color
 */
function formatJobStatus(status) {
  switch (status) {
    case "COMPLETED":
      return chalk.green("✓ Completed");
    case "PROCESSING":
      return chalk.blue("⟳ Processing");
    case "QUEUED":
      return chalk.yellow("◷ Queued");
    case "FAILED":
      return chalk.red("✗ Failed");
    default:
      return chalk.gray(status);
  }
}

/**
 * Format drift status with color
 */
function formatDriftStatus(status) {
  switch (status) {
    case "PENDING":
      return chalk.yellow("● Pending");
    case "APPROVED":
      return chalk.green("✓ Approved");
    case "REJECTED":
      return chalk.red("✗ Rejected");
    case "IGNORED":
      return chalk.gray("○ Ignored");
    default:
      return chalk.gray(status);
  }
}

/**
 * Format drift type with color
 */
function formatDriftType(type) {
  switch (type) {
    case "VISUAL":
      return chalk.cyan("🖼 Visual");
    case "SEMANTIC":
      return chalk.magenta("📝 Text");
    case "BOTH":
      return chalk.yellow("⚡ Both");
    default:
      return chalk.gray(type);
  }
}

/**
 * Display project configuration summary
 */
async function displayConfig(configSummary) {
  console.log(chalk.bold("\n📋 Project Configuration\n"));

  console.log(chalk.gray("  Base URL:  ") + chalk.white(configSummary.baseUrl || "(not set)"));
  console.log(chalk.gray("  Viewport:  ") + chalk.white(
    configSummary.viewport
      ? `${configSummary.viewport.width}×${configSummary.viewport.height}`
      : "(default)"
  ));
  console.log(chalk.gray("  Asset Dir: ") + chalk.white(configSummary.assetDir || ".reshot/output"));

  console.log(chalk.gray("  Scenarios: ") + chalk.white(`${configSummary.scenarioCount || 0} defined`));

  if (configSummary.traceDir) {
    console.log(chalk.gray("  Trace Dir: ") + chalk.white(configSummary.traceDir));
  }
}

function renderJobs(jobs) {
  if (jobs.length === 0) {
    console.log(chalk.gray("  No sync jobs found."));
    console.log(chalk.gray("  Run `reshot sync` to upload traces."));
    return;
  }

  for (const job of jobs) {
    console.log(
      `  ${formatJobStatus(job.status)} ` +
        chalk.gray(`${job.id.slice(0, 8)} `) +
        chalk.white(`${job.branch || "unknown"}@${(job.commitHash || "").slice(0, 7)} `) +
        chalk.gray(formatTime(job.createdAt)),
    );

    if (job.driftCount > 0) {
      console.log(chalk.gray(`      └─ ${job.driftCount} drift(s) detected`));
    }
    if (job.errorMessage) {
      console.log(chalk.red(`      └─ Error: ${job.errorMessage}`));
    }
  }
}

function renderDrifts(drifts, stats, projectId, limit = 10) {
  if (stats.total > 0) {
    console.log(
      chalk.gray("  Summary: ") +
        chalk.yellow(`${stats.pending || 0} pending`) + ", " +
        chalk.green(`${stats.approved || 0} approved`) + ", " +
        chalk.red(`${stats.rejected || 0} rejected`) + ", " +
        chalk.gray(`${stats.ignored || 0} ignored`),
    );
    console.log();
  }

  if (drifts.length === 0) {
    console.log(chalk.green("  ✓ No pending drifts!"));
    return;
  }

  const displayed = drifts.slice(0, limit);
  for (const drift of displayed) {
    console.log(
      `  ${formatDriftType(drift.driftType)} ` +
        chalk.white(drift.journeyKey) + " " +
        chalk.gray(`(${Math.round(drift.confidenceScore * 100)}% confidence)`),
    );
  }

  if (drifts.length > limit) {
    console.log(chalk.gray(`\n  ... and ${drifts.length - limit} more.`));
  }

  console.log();
  console.log(
    chalk.gray("  View in dashboard: ") +
      chalk.blue(`https://reshot.dev/app/projects/${projectId}/visuals`),
  );
}

async function fetchJobsData(apiKey, projectId, limit = 5) {
  try {
    const response = await apiClient.getSyncJobs(apiKey, projectId, { limit });
    return {
      jobs: response.jobs || response.data?.jobs || [],
      error: null,
    };
  } catch (error) {
    return {
      jobs: [],
      error: {
        message: error.message,
        kind: error.reshot?.kind || null,
        status: error.reshot?.status || error.response?.status || null,
      },
    };
  }
}

async function fetchDriftsData(apiKey, projectId) {
  try {
    const response = await apiClient.getDrifts(apiKey, projectId, {
      status: "pending",
    });
    return {
      drifts: response.drifts || [],
      stats: response.stats || {},
      error: null,
    };
  } catch (error) {
    return {
      drifts: [],
      stats: {},
      error: {
        message: error.message,
        kind: error.reshot?.kind || null,
        status: error.reshot?.status || error.response?.status || null,
      },
    };
  }
}

async function buildStatusReport(options = {}) {
  const report = {
    generatedAt: new Date().toISOString(),
    ok: true,
    projectId: null,
    mode: config.getModeInfo(),
    config: {
      exists: false,
      summary: null,
      validation: {
        valid: false,
        errors: [],
        warnings: [],
      },
    },
    auth: {
      hasApiKey: false,
      hasProjectId: false,
    },
    jobs: {
      items: [],
      error: null,
    },
    drifts: {
      items: [],
      stats: {},
      error: null,
    },
    issues: [],
  };

  let reshotConfig = null;
  try {
    reshotConfig = config.readConfigLenient();
    report.config.exists = true;
    report.config.summary = summarizeConfig(reshotConfig);
  } catch (error) {
    report.issues.push(
      createIssue(
        "config",
        "error",
        "reshot.config.json not found. Run `reshot init` or `reshot setup` first.",
        { detail: error.message },
      ),
    );
  }

  if (report.config.exists) {
    report.config.validation = config.validateConfig();
    for (const errorMessage of report.config.validation.errors) {
      report.issues.push(createIssue("config", "error", errorMessage));
    }
    for (const warningMessage of report.config.validation.warnings) {
      report.issues.push(createIssue("config", "warning", warningMessage));
    }
  }

  const settings = readSettingsSafe();
  const apiKey = process.env.RESHOT_API_KEY || settings?.apiKey || null;
  const projectId =
    process.env.RESHOT_PROJECT_ID ||
    settings?.projectId ||
    reshotConfig?._metadata?.projectId ||
    null;

  report.projectId = projectId;
  report.auth.hasApiKey = Boolean(apiKey);
  report.auth.hasProjectId = Boolean(projectId);

  // Loudly warn when the linked session (settings.json) and the committed
  // config (reshot.config.json) disagree on the project — settings.json wins,
  // so an edited/stale config projectId would otherwise be silently ignored.
  const configProjectId =
    reshotConfig?.projectId || reshotConfig?._metadata?.projectId || null;
  if (
    projectId &&
    configProjectId &&
    configProjectId !== projectId &&
    !process.env.RESHOT_PROJECT_ID
  ) {
    report.issues.push(
      createIssue(
        "config",
        "warning",
        `Project ID mismatch: using ${projectId} (from .reshot/settings.json) but reshot.config.json declares ${configProjectId}. Run \`reshot setup\` to reconcile.`,
      ),
    );
  }

  if (!apiKey) {
    report.issues.push(
      createIssue(
        "auth",
        "error",
        "API key not found. Set RESHOT_API_KEY or run `reshot auth`.",
      ),
    );
  }

  if (!projectId) {
    report.issues.push(
      createIssue(
        "auth",
        "error",
        "Project ID not found. Set RESHOT_PROJECT_ID or run `reshot setup`.",
      ),
    );
  }

  if (apiKey && projectId) {
    const [jobsResult, driftsResult] = await Promise.all([
      fetchJobsData(apiKey, projectId, options.limit || 5),
      fetchDriftsData(apiKey, projectId),
    ]);

    report.jobs.items = jobsResult.jobs;
    report.jobs.error = jobsResult.error;
    report.drifts.items = driftsResult.drifts;
    report.drifts.stats = driftsResult.stats;
    report.drifts.error = driftsResult.error;

    if (jobsResult.error) {
      report.issues.push(
        createIssue(
          "jobs",
          "warning",
          `Could not fetch sync jobs: ${jobsResult.error.message}`,
          jobsResult.error,
        ),
      );
    }

    if (driftsResult.error) {
      report.issues.push(
        createIssue(
          "drifts",
          "warning",
          `Could not fetch drifts: ${driftsResult.error.message}`,
          driftsResult.error,
        ),
      );
    }
  }

  report.ok = !report.issues.some((issue) => issue.level === "error");
  return report;
}

/**
 * Get and display sync job history
 */
async function displayJobs(apiKey, projectId, limit = 5) {
  console.log(chalk.bold("\n📦 Recent Sync Jobs\n"));

  try {
    const response = await apiClient.getSyncJobs(apiKey, projectId, { limit });
    const jobs = response.jobs || response.data?.jobs || [];
    renderJobs(jobs);
  } catch (error) {
    console.log(chalk.yellow("  Could not fetch sync jobs: " + error.message));
    console.log(chalk.gray("  This endpoint may not be available yet."));
  }
}

/**
 * Get and display drift queue
 */
async function displayDrifts(apiKey, projectId, limit = 10) {
  console.log(chalk.bold("\n🔄 Drift Queue\n"));

  try {
    const response = await apiClient.getDrifts(apiKey, projectId, { status: "pending" });
    const drifts = response.drifts || [];
    const stats = response.stats || {};
    renderDrifts(drifts, stats, projectId, limit);
  } catch (error) {
    console.log(chalk.yellow("  Could not fetch drifts: " + error.message));
  }
}

/**
 * Main status command
 */
async function statusCommand(options = {}) {
  const report = await buildStatusReport(options);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return report;
  }

  console.log(chalk.blue("\n📊 Reshot Status\n"));

  if (report.projectId) {
    console.log(chalk.gray(`  Project: ${report.projectId}`));
  }

  if (report.config.summary && (options.config || (!options.jobs && !options.drifts))) {
    await displayConfig(report.config.summary);
  }

  if (!options.config && (options.jobs || (!options.config && !options.drifts))) {
    console.log(chalk.bold("\n📦 Recent Sync Jobs\n"));
    if (report.jobs.error) {
      console.log(chalk.yellow("  Could not fetch sync jobs: " + report.jobs.error.message));
      console.log(chalk.gray("  This endpoint may not be available yet."));
    } else {
      renderJobs(report.jobs.items);
    }
  }

  if (!options.jobs && (options.drifts || (!options.config && !options.jobs))) {
    console.log(chalk.bold("\n🔄 Drift Queue\n"));
    if (report.drifts.error) {
      console.log(chalk.yellow("  Could not fetch drifts: " + report.drifts.error.message));
    } else {
      renderDrifts(
        report.drifts.items,
        report.drifts.stats,
        report.projectId,
        options.limit || 10,
      );
    }
  }

  if (report.issues.length > 0) {
    console.log(chalk.bold("\n⚠ Issues\n"));
    for (const issue of report.issues) {
      const prefix = issue.level === "error" ? chalk.red("  ✖") : chalk.yellow("  ⚠");
      console.log(`${prefix} [${issue.scope}] ${issue.message}`);
    }
  }

  if (!report.ok) {
    process.exitCode = 1;
  }

  console.log();
  return report;
}

module.exports = statusCommand;
module.exports.buildStatusReport = buildStatusReport;
