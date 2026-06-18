"use strict";

const chalk = require("chalk");
const { runCertification } = require("../lib/certification");

async function certifyCommand(options = {}) {
  const scenarioKeys = options.scenarios
    ? String(options.scenarios)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : null;

  const report = await runCertification({
    scenarioKeys,
    tag: options.tag,
    message: options.message,
    skipReleaseDoctor: options.skipReleaseDoctor,
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(chalk.cyan("\n🏅 Certified Target Verification\n"));
    console.log(chalk.gray(`Target: ${report.target.displayName}`));
    console.log(
      report.ok
        ? chalk.green(`  ✔ Final status: ${report.finalStatus}`)
        : chalk.red(`  ✖ Final status: ${report.finalStatus}`),
    );
    console.log(
      report.releaseDoctor?.skipped
        ? chalk.gray("  • Release doctor skipped")
        : report.releaseDoctor?.ok
          ? chalk.green("  ✔ Release doctor passed")
          : chalk.red("  ✖ Release doctor failed"),
    );
    console.log(
      report.doctor.ok
        ? chalk.green("  ✔ Doctor passed")
        : chalk.red("  ✖ Doctor failed"),
    );
    console.log(
      report.capture.success
        ? chalk.green("  ✔ Capture passed")
        : chalk.red("  ✖ Capture failed"),
    );
    console.log(
      report.publishVerification.ok
        ? chalk.green("  ✔ Publish verification passed")
        : chalk.red("  ✖ Publish verification failed"),
    );
  }

  if (!report.ok) {
    process.exitCode = 1;
  }

  return report;
}

module.exports = certifyCommand;
