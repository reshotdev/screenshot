#!/usr/bin/env node
/**
 * drifts - View and resolve documentation drifts
 *
 * Commands:
 * - reshot drifts               List pending drifts
 * - reshot drifts list          List drifts with filters
 * - reshot drifts show <id>     Show drift details
 * - reshot drifts approve <id>  Approve a drift
 * - reshot drifts reject <id>   Reject a drift
 * - reshot drifts ignore <id>   Mark drift as ignored
 * - reshot drifts sync <id>     Mark as manually synced (external_host)
 * - reshot drifts approve-all   Approve all pending drifts
 * - reshot drifts reject-all    Reject all pending drifts
 * - reshot drifts approve-all   Approve all pending drifts
 */

const chalk = require("chalk");
const config = require("../lib/config");
const apiClient = require("../lib/api-client");

/**
 * Format drift for display
 */
function formatDrift(drift, verbose = false) {
  const typeIcon = {
    VISUAL: "🖼",
    SEMANTIC: "📝",
    BOTH: "⚡",
  }[drift.driftType] || "?";

  const statusColor = {
    PENDING: chalk.yellow,
    APPROVED: chalk.green,
    REJECTED: chalk.red,
    IGNORED: chalk.gray,
  }[drift.status] || chalk.white;

  let output = `${typeIcon} ${statusColor(drift.status.padEnd(8))} `;
  output += chalk.white(drift.journeyKey || drift.docPath || "Unknown");
  output += chalk.gray(` (${Math.round(drift.confidenceScore * 100)}%)`);

  if (verbose && drift.docPath) {
    output += `\n   ${chalk.gray("File:")} ${drift.docPath}`;
  }
  if (verbose && drift.id) {
    output += `\n   ${chalk.gray("ID:")} ${drift.id}`;
  }

  return output;
}

/**
 * List drifts with optional filters
 */
async function listDrifts(apiKey, projectId, options = {}) {
  console.log(chalk.blue("\n🔄 Documentation Drifts\n"));

  try {
    const response = await apiClient.getDrifts(apiKey, projectId, {
      status: options.status,
      journeyKey: options.journey,
    });

    const drifts = response.drifts || [];
    const stats = response.stats || {};

    // Show stats
    console.log(
      chalk.gray("Total: ") +
        chalk.white(stats.total || drifts.length) +
        chalk.gray(" │ ") +
        chalk.yellow(`Pending: ${stats.pending || 0}`) +
        chalk.gray(" │ ") +
        chalk.green(`Approved: ${stats.approved || 0}`) +
        chalk.gray(" │ ") +
        chalk.red(`Rejected: ${stats.rejected || 0}`)
    );
    console.log();

    if (drifts.length === 0) {
      if (options.status) {
        console.log(chalk.gray(`  No drifts with status: ${options.status}`));
      } else {
        console.log(chalk.green("  ✓ No pending drifts!"));
      }
      return;
    }

    // List drifts
    for (const drift of drifts) {
      console.log("  " + formatDrift(drift, options.verbose));
    }

    console.log();
    console.log(
      chalk.gray("  Use ") +
        chalk.white("reshot drifts show <id>") +
        chalk.gray(" to see details")
    );
    console.log(
      chalk.gray("  Use ") +
        chalk.white("reshot drifts approve <id>") +
        chalk.gray(" to approve changes")
    );
  } catch (error) {
    console.error(chalk.red("Error:"), error.message);
    process.exit(1);
  }
}

/**
 * Show drift details
 */
async function showDrift(apiKey, projectId, driftId) {
  console.log(chalk.blue("\n📋 Drift Details\n"));

  try {
    const response = await apiClient.post(
      `/v1/projects/${projectId}/drifts/${driftId}`,
      {},
      { headers: { Authorization: `Bearer ${apiKey}` } }
    ).catch(async () => {
      // Fallback: get from list
      const listResp = await apiClient.getDrifts(apiKey, projectId);
      const drift = listResp.drifts?.find((d) => d.id === driftId);
      if (drift) return { drift };
      throw new Error(`Drift ${driftId} not found`);
    });

    const drift = response.drift;
    if (!drift) {
      console.error(chalk.red("Error:"), `Drift ${driftId} not found`);
      process.exit(1);
    }

    // Display drift details
    console.log(chalk.gray("  ID:         ") + chalk.white(drift.id));
    console.log(chalk.gray("  Status:     ") + chalk.white(drift.status));
    console.log(chalk.gray("  Type:       ") + chalk.white(drift.driftType));
    console.log(chalk.gray("  Journey:    ") + chalk.white(drift.journeyKey || "N/A"));
    console.log(chalk.gray("  File:       ") + chalk.white(drift.docPath || "N/A"));
    console.log(chalk.gray("  Confidence: ") + chalk.white(`${Math.round(drift.confidenceScore * 100)}%`));

    // Visual diff info
    if (drift.hasVisualDrift) {
      console.log();
      console.log(chalk.cyan("  🖼 Visual Changes Detected"));
      if (drift.visualDiff?.diffPercentage) {
        console.log(chalk.gray(`     Diff: ${drift.visualDiff.diffPercentage.toFixed(2)}% changed`));
      }
      if (drift.newScreenshotUrl) {
        console.log(chalk.gray(`     New:  ${drift.newScreenshotUrl}`));
      }
    }

    // Semantic diff info
    if (drift.hasSemanticDrift) {
      console.log();
      console.log(chalk.magenta("  📝 Text Changes Detected"));
      
      if (drift.originalContent) {
        console.log(chalk.gray("\n  Current Content:"));
        console.log(chalk.red("  - " + drift.originalContent.slice(0, 200).replace(/\n/g, "\n  - ")));
      }
      
      if (drift.proposedContent) {
        console.log(chalk.gray("\n  Proposed Content:"));
        console.log(chalk.green("  + " + drift.proposedContent.slice(0, 200).replace(/\n/g, "\n  + ")));
      }
    }

    console.log();
    console.log(chalk.gray("  Actions:"));
    console.log(chalk.white(`    reshot drifts approve ${driftId}`));
    console.log(chalk.white(`    reshot drifts reject ${driftId}`));
    console.log(chalk.white(`    reshot drifts ignore ${driftId}`));
  } catch (error) {
    console.error(chalk.red("Error:"), error.message);
    process.exit(1);
  }
}

/**
 * Perform action on a drift
 */
async function performDriftAction(apiKey, projectId, driftId, action) {
  const actionMap = {
    approve: { label: "Approving", status: "APPROVED", emoji: "✓", apiAction: "approve" },
    reject: { label: "Rejecting", status: "REJECTED", emoji: "✗", apiAction: "reject" },
    ignore: { label: "Ignoring", status: "IGNORED", emoji: "○", apiAction: "ignore" },
    sync: { label: "Marking as synced", status: "APPROVED", emoji: "✓", apiAction: "mark_synced" },
  };

  const actionInfo = actionMap[action];
  if (!actionInfo) {
    console.error(chalk.red("Error:"), `Unknown action: ${action}`);
    process.exit(1);
  }

  console.log(chalk.blue(`\n${actionInfo.emoji} ${actionInfo.label} drift...\n`));

  try {
    const response = await apiClient.driftAction(apiKey, projectId, driftId, actionInfo.apiAction);

    if (response.success) {
      console.log(chalk.green(`  ✓ Drift ${driftId} ${action}ed successfully`));
      
      if (response.prUrl) {
        console.log(chalk.gray("\n  Pull Request created:"));
        console.log(chalk.blue(`  ${response.prUrl}`));
      }
      
      if (action === "sync") {
        console.log(chalk.gray("\n  The visual assets have been promoted to 'approved' status."));
      }
    } else {
      console.log(chalk.yellow(`  ⚠ Action completed with warnings: ${response.message || "Unknown"}`));
    }
  } catch (error) {
    console.error(chalk.red("Error:"), error.message);
    process.exit(1);
  }
}

/**
 * Batch approve or reject all pending drifts
 */
async function batchDriftAction(apiKey, projectId, action, options = {}) {
  const actionLabel = action === "approve" ? "Approving" : "Rejecting";
  const actionVerb = action === "approve" ? "approved" : "rejected";
  
  console.log(chalk.blue(`\n🔄 ${actionLabel} all pending drifts...\n`));

  try {
    // Fetch all pending drifts
    const response = await apiClient.getDrifts(apiKey, projectId, { status: "pending" });
    const drifts = response.drifts || [];

    if (drifts.length === 0) {
      console.log(chalk.green("  ✓ No pending drifts to process"));
      return;
    }

    console.log(chalk.gray(`  Found ${drifts.length} pending drift(s)\n`));

    let succeeded = 0;
    let failed = 0;
    const errors = [];

    for (const drift of drifts) {
      try {
        const apiAction = action === "approve" ? "approve" : "reject";
        await apiClient.driftAction(apiKey, projectId, drift.id, apiAction);
        succeeded++;
        console.log(chalk.green(`  ✓ ${drift.journeyKey || drift.id} ${actionVerb}`));
      } catch (err) {
        failed++;
        errors.push({ drift, error: err.message });
        console.log(chalk.red(`  ✗ ${drift.journeyKey || drift.id} failed: ${err.message}`));
      }
    }

    console.log();
    console.log(chalk.gray("─".repeat(40)));
    console.log(chalk.green(`  ${succeeded} drift(s) ${actionVerb}`));
    if (failed > 0) {
      console.log(chalk.red(`  ${failed} drift(s) failed`));
    }
  } catch (error) {
    const status = error.reshot?.status ?? error.response?.status;
    if (status === 400 || status === 404) {
      console.log(chalk.green("  ✓ No pending drifts to approve."));
      console.log(
        chalk.gray(
          "    Drifts only exist when a capture differs from a baseline. New captures\n" +
          "    with no prior version go to the review queue — use `reshot publish\n" +
          "    --auto-approve` or approve them in the studio."
        )
      );
      return;
    }
    console.error(chalk.red("Error:"), error.message);
    process.exit(1);
  }
}

/**
 * Main drifts command handler
 */
async function driftsCommand(subcommand, args = [], options = {}) {
  // Read configuration
  let reshotConfig;
  try {
    reshotConfig = config.readConfigLenient();
  } catch (error) {
    console.error(chalk.red("Error:"), "reshot.config.json not found. Run `reshot init` first.");
    process.exit(1);
  }

  // Get API key and project ID
  const settings = config.readSettings();
  const apiKey = process.env.RESHOT_API_KEY || settings?.apiKey;
  const projectId =
    process.env.RESHOT_PROJECT_ID ||
    settings?.projectId ||
    reshotConfig._metadata?.projectId;

  if (!apiKey) {
    console.error(chalk.red("Error:"), "API key not found. Set RESHOT_API_KEY or run `reshot auth`.");
    process.exit(1);
  }

  if (!projectId) {
    console.error(chalk.red("Error:"), "Project ID not found. Set RESHOT_PROJECT_ID or run `reshot init`.");
    process.exit(1);
  }

  // Route to appropriate handler
  switch (subcommand) {
    case undefined:
    case "list":
      await listDrifts(apiKey, projectId, options);
      break;

    case "show":
      if (!args[0]) {
        console.error(chalk.red("Error:"), "Drift ID required. Usage: reshot drifts show <id>");
        process.exit(1);
      }
      await showDrift(apiKey, projectId, args[0]);
      break;

    case "approve":
    case "reject":
    case "ignore":
    case "sync":
      if (!args[0]) {
        console.error(chalk.red("Error:"), `Drift ID required. Usage: reshot drifts ${subcommand} <id>`);
        process.exit(1);
      }
      await performDriftAction(apiKey, projectId, args[0], subcommand);
      break;

    case "approve-all":
      await batchDriftAction(apiKey, projectId, "approve", options);
      break;

    case "reject-all":
      await batchDriftAction(apiKey, projectId, "reject", options);
      break;

    default:
      console.error(chalk.red("Error:"), `Unknown subcommand: ${subcommand}`);
      console.log(chalk.gray("\nAvailable subcommands:"));
      console.log(chalk.white("  list        ") + chalk.gray("List drifts (default)"));
      console.log(chalk.white("  show        ") + chalk.gray("Show drift details"));
      console.log(chalk.white("  approve     ") + chalk.gray("Approve a drift"));
      console.log(chalk.white("  reject      ") + chalk.gray("Reject a drift"));
      console.log(chalk.white("  ignore      ") + chalk.gray("Ignore a drift"));
      console.log(chalk.white("  sync        ") + chalk.gray("Mark as manually synced"));
      console.log(chalk.white("  approve-all ") + chalk.gray("Approve all pending drifts"));
      console.log(chalk.white("  reject-all  ") + chalk.gray("Reject all pending drifts"));
      process.exit(1);
  }

  console.log();
}

module.exports = driftsCommand;
