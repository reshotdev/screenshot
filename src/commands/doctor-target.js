"use strict";

const chalk = require("chalk");
const { runDoctorTarget } = require("../lib/certification");

async function doctorTargetCommand(options = {}) {
  const scenarioKeys = options.scenarios
    ? String(options.scenarios)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : null;

  // Emit an immediate banner BEFORE any async work so the command is never
  // silent — previously it produced zero output while preparing fixtures and
  // launching a browser, which read as a hang.
  if (!options.json) {
    console.log(chalk.cyan("🩺 Running target doctor…"));
    console.log(
      chalk.gray(
        scenarioKeys
          ? `  scenarios: ${scenarioKeys.join(", ")}`
          : "  scenarios: all certified",
      ),
    );
  }

  const progressLogger = options.json
    ? null
    : (message) => console.log(chalk.gray(`  → ${message}`));

  let report;
  try {
    report = await runDoctorTarget({
      scenarioKeys,
      onProgress: progressLogger,
      timeoutMs: options.timeout ? Number(options.timeout) : undefined,
    });
  } catch (error) {
    // Fail fast with an actionable message + report path rather than hanging.
    if (!options.json) {
      console.error(chalk.red(`\n  ✖ Target doctor aborted: ${error.message}`));
      console.error(
        chalk.gray(
          "  Confirm the dev server is reachable and the target is configured (see .reshot/reports).",
        ),
      );
    } else {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
    }
    process.exitCode = 1;
    return { ok: false, error: error.message };
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(chalk.cyan("\n🩺 Certified Target Doctor\n"));
    console.log(chalk.gray(`Target: ${report.target.displayName} (${report.target.tier})`));
    console.log(
      report.ok
        ? chalk.green("  ✔ Target contract is healthy")
        : chalk.red("  ✖ Target contract check failed"),
    );
    for (const audit of report.readinessAudits) {
      console.log(
        audit.ok
          ? chalk.green(`  ✔ ${audit.scenario}`)
          : chalk.red(`  ✖ ${audit.scenario}${audit.contractFailure ? ` — ${audit.contractFailure}` : ""}`),
      );
    }
  }

  if (!report.ok) {
    process.exitCode = 1;
  }

  return report;
}

module.exports = doctorTargetCommand;
