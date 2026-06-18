"use strict";

const chalk = require("chalk");
const { runReleaseDoctor } = require("../lib/release-doctor");

async function doctorReleaseCommand(options = {}) {
  const report = await runReleaseDoctor(options);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(chalk.cyan("\n🧪 Release Doctor\n"));
    console.log(
      report.ok
        ? chalk.green("  ✔ Release gate checks passed")
        : chalk.red("  ✖ Release gate checks failed"),
    );

    console.log(
      report.runPreflight.ok
        ? chalk.green("  ✔ Run preflight healthy")
        : chalk.red("  ✖ Run preflight failed"),
    );

    if (report.targetDoctor.skipped) {
      console.log(chalk.gray("  • Target doctor skipped (non-certified target)"));
    } else {
      console.log(
        report.targetDoctor.ok
          ? chalk.green("  ✔ Target doctor healthy")
          : chalk.red("  ✖ Target doctor failed"),
      );
    }

    if (report.docsAssetMap.skipped) {
      console.log(chalk.gray("  • Docs asset map skipped"));
    } else {
      console.log(
        report.docsAssetMap.ok
          ? chalk.green("  ✔ Docs asset map healthy")
          : chalk.red("  ✖ Docs asset map failed"),
      );
      if (report.docsAssetMap.path) {
        console.log(chalk.gray(`    ${report.docsAssetMap.path}`));
      }
    }

    const blockingIssues = report.summary?.blockingIssues || [];
    if (blockingIssues.length > 0) {
      for (const issue of blockingIssues.slice(0, 10)) {
        console.log(chalk.red(`  ✖ ${issue.scope}: ${issue.message}`));
      }
    }

    if (report.reportPath) {
      console.log(chalk.gray(`\n  Report: ${report.reportPath}`));
    }
  }

  if (!report.ok) {
    process.exitCode = 1;
  }

  return report;
}

module.exports = doctorReleaseCommand;