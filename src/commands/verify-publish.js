"use strict";

const chalk = require("chalk");
const { runVerifyPublish } = require("../lib/certification");

async function verifyPublishCommand(options = {}) {
  const scenarioKeys = options.scenarios
    ? String(options.scenarios)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : null;

  const report = await runVerifyPublish({
    scenarioKeys,
    tag: options.tag,
    message: options.message,
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(chalk.cyan("\n📦 Publish Verification\n"));
    console.log(
      report.ok
        ? chalk.green("  ✔ Publish, pull, and hosted delivery verified")
        : chalk.red("  ✖ Publish verification failed"),
    );
    console.log(chalk.gray(`  Published: ${report.publishResult.assetsProcessed || 0}`));
    console.log(chalk.gray(`  Pull repairs: ${report.pullResult.normalizationRepairs || 0}`));
    const failedChecks = (report.deliveryChecks || []).filter((check) => !check.ok);
    if (failedChecks.length > 0) {
      for (const check of failedChecks.slice(0, 10)) {
        console.log(chalk.red(`  ✖ ${check.scenario}/${check.assetKey}: ${check.reason}`));
      }
    }
  }

  if (!report.ok) {
    process.exitCode = 1;
  }

  return report;
}

module.exports = verifyPublishCommand;
