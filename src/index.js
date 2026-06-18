#!/usr/bin/env node

// index.js - Reshot CLI entry point

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const { Command } = require("commander");
const chalk = require("chalk");
const fs = require("fs-extra");
const path = require("path");
const pkg = require("../package.json");

const program = new Command();

program
  .name("reshot")
  .description("Visual capture, publishing, and governance for your UI")
  .version(pkg.version);

// ============================================================================
// CORE COMMANDS (Primary workflow)
// ============================================================================

// Setup: Interactive wizard for initial configuration
program
  .command("setup")
  .description("Set up the local or hosted workflow from scratch")
  .option("--offline", "Stay local-only and skip hosted authentication")
  .option("--project <id>", "Connect setup to an existing Reshot project")
  .option("--token <token>", "Publish token for non-interactive project linking")
  .option("--no-studio", "Skip offering to launch Studio after setup")
  .option("--force", "Force re-initialization even if already set up")
  .action(async (options) => {
    try {
      const setupWizard = require("./commands/setup-wizard");
      await setupWizard(options);
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

program
  .command("record-clip [target]")
  .description("Record a scenario as a summary MP4 (alias for `reshot run --format summary-video`)")
  .option("-s, --scenarios <keys>", "Comma-separated scenario keys")
  .option("--out <dir>", "Copy the generated MP4 and metadata into this directory")
  .option("--no-headless", "Run browser in visible mode")
  .option("--debug", "Enable verbose debug logging")
  .action(async (target, options) => {
    if (options.debug) {
      process.env.RESHOT_DEBUG = "1";
    }
    try {
      const runCommand = require("./commands/run");
      const scenarioKeys = resolveRecordClipScenarioKeys(target, options);
      const result = await runCommand({
        scenarioKeys,
        headless: options.headless,
        format: "summary-video",
        noExit: true,
      });

      if (options.out && result?.success !== false) {
        await copyRecordClipOutputs(result, target, options.out);
      }

      if (result?.success === false) {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      if (options.debug && error.stack) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

program.addHelpText(
  "after",
  `
Primary workflow:
  reshot setup          Configure the project and choose local-only or hosted mode
  reshot run            Run configured scenarios with fail-fast preflight checks
  reshot publish        Upload captured assets to the Reshot platform
  reshot pull           Pull approved CDN-backed asset references into your repo
  reshot doctor target  Audit certified-target readiness before capture
`,
);

// Sync: Upload Playwright traces to platform
program
  .command("sync")
  .description("Upload Playwright traces to Reshot")
  .option("--trace-dir <path>", "Path to test-results directory")
  .option("--dry-run", "Preview what would be synced")
  .option("-v, --verbose", "Show detailed output")
  .action(async (options) => {
    try {
      const syncCommand = require("./commands/sync");
      await syncCommand({
        traceDir: options.traceDir,
        dryRun: options.dryRun,
        verbose: options.verbose,
      });
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// Status: View project status and drift summary
program
  .command("status")
  .description("View project status, sync history, and drift summary")
  .option("--jobs", "Show only sync job history")
  .option("--drifts", "Show only drift queue")
  .option("--config", "Show only configuration")
  .option("--limit <n>", "Limit number of items shown", parseInt)
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      const statusCommand = require("./commands/status");
      await statusCommand(options);
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// Studio: Launch visual management UI
program
  .command("studio")
  .description("Launch Reshot Studio (visual management UI)")
  .option("--port <port>", "Port for web UI", "4300")
  .option("--host <host>", "Host for web UI", "127.0.0.1")
  .option("--no-open", "Do not automatically open browser")
  .action(async (options) => {
    try {
      const uiCommand = require("./commands/ui");
      await uiCommand(options);
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// ============================================================================
// VISUAL CAPTURE COMMANDS
// ============================================================================

// Run: Execute scenarios from config (automated visual capture)
program
  .command("run [target]")
  .description("Execute visual capture scenarios from config")
  .option("-s, --scenarios <keys>", "Comma-separated list of scenario keys")
  .option("--no-headless", "Run browser in visible mode")
  .option("--variant <json>", "Override variant configuration as JSON")
  .option("--all-variants", "Run all configured variant combinations")
  .option("--no-variants", "Skip variant expansion")
  .option(
    "-f, --format <format>",
    "Output format: step-by-step-images | summary-video",
  )
  .option(
    "-c, --concurrency <n>",
    "Number of parallel browser workers",
    parseInt,
  )
  .option("--diff", "Enable baseline comparison")
  .option("--no-diff", "Disable baseline comparison")
  .option("--no-privacy", "Disable privacy masking")
  .option("--no-style", "Disable style processing")
  .option("--cloud", "Compare against cloud baselines")
  .option("--debug", "Enable verbose debug logging")
  .action(async (target, options) => {
    if (options.debug) {
      process.env.RESHOT_DEBUG = "1";
    }
    try {
      const runCommand = require("./commands/run");
      const scenarioKeys = resolveScenarioKeysFromTarget(target, options);
      await runCommand({
        scenarioKeys,
        headless: options.headless,
        variant: options.variant,
        allVariants: options.allVariants,
        noVariants: options.variants === false,
        noPrivacy: options.privacy === false,
        noStyle: options.style === false,
        format: options.format,
        diff: options.diff,
        cloud: options.cloud,
        concurrency: options.concurrency,
      });
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      if (options.debug && error.stack) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

// Capture: Compatibility alias for older docs and snippets
program
  .command("capture")
  .description("Compatibility alias for `reshot run` (prefer `reshot run` and `reshot publish`)")
  .option("-s, --scenarios <keys>", "Comma-separated list of scenario keys")
  .option("--mode <mode>", "Compatibility mode: preview | publish", "preview")
  .option("--config <path>", "Compatibility config path (defaults to reshot.config.json)")
  .option("--base-url <url>", "Temporary base URL override for compatibility flows")
  .option("--tag <tag>", "Version tag when mode=publish")
  .option("-m, --message <message>", "Publish message when mode=publish")
  .option("--no-headless", "Run browser in visible mode")
  .option("-c, --concurrency <n>", "Number of parallel browser workers", parseInt)
  .option("--debug", "Enable verbose debug logging")
  .action(async (options) => {
    if (options.debug) {
      process.env.RESHOT_DEBUG = "1";
    }
    if (options.config && options.config !== "reshot.config.json") {
      console.log(
        chalk.yellow(
          "Compatibility mode currently uses reshot.config.json from the working directory.",
        ),
      );
    }
    if (options.baseUrl) {
      process.env.RESHOT_BASE_URL = options.baseUrl;
      console.log(
        chalk.gray(
          `Using temporary base URL override for this run: ${options.baseUrl}`,
        ),
      );
    }
    try {
      const runCommand = require("./commands/run");
      const scenarioKeys = options.scenarios
        ? options.scenarios.split(",").map((s) => s.trim())
        : null;
      await runCommand({
        scenarioKeys,
        headless: options.headless,
        concurrency: options.concurrency,
      });

      if (String(options.mode || "preview").toLowerCase() === "publish") {
        const publishCommand = require("./commands/publish");
        await publishCommand({
          tag: options.tag,
          message: options.message,
        });
      }
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      if (options.debug && error.stack) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

// Record: Interactive visual recording from live browser
program
  .command("record [title]")
  .description("Interactively record visuals from a live browser session")
  .option("--name <title>", "Compatibility alias for the scenario title")
  .option("--browser", "Launch Chrome with remote debugging before recording")
  .option("-p, --port <port>", "Chrome debugging port (default: 9222)")
  .option("--url <url>", "URL to open when launching browser")
  .option("--refresh-session", "Only refresh the auth session (no recording prompts)")
  .option("--debug", "Enable verbose debug logging")
  .action(async (title, options) => {
    if (options.debug) {
      process.env.RESHOT_DEBUG = "1";
    }
    const resolvedTitle = title || options.name;
    try {
      // If --refresh-session, just sync the session and exit
      if (options.refreshSession) {
        const { autoSyncSessionFromCDP, getDefaultSessionPath } = require("./lib/record-cdp");
        const sessionPath = getDefaultSessionPath();
        console.log(chalk.gray("  Syncing session from active browser..."));
        const result = await autoSyncSessionFromCDP(sessionPath);
        if (result.synced) {
          console.log(chalk.green("  ✔ Session refreshed at " + sessionPath));
        } else {
          console.log(chalk.yellow("  ⚠ No active CDP browser found. Launch Chrome with remote debugging first:"));
          console.log(chalk.gray("    reshot record --browser --refresh-session"));
        }
        return;
      }

      // If --browser flag, launch Chrome first
      if (options.browser) {
        const chromeCommand = require("./commands/chrome");
        await chromeCommand({
          port: options.port || "9222",
          url: options.url || "about:blank",
        });
        // Give Chrome time to start
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      const recordCommand = require("./commands/record");
      await recordCommand(resolvedTitle);
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      if (options.debug && error.stack) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

// Import tests: Import existing Playwright tests into Reshot
program
  .command("import-tests")
  .description("Import existing Playwright tests and create journey mappings")
  .option("--dry-run", "Preview mappings without saving")
  .option("--no-interactive", "Run without prompts")
  .action(async (options) => {
    try {
      const importTestsCommand = require("./commands/import-tests");
      await importTestsCommand({
        dryRun: options.dryRun,
        interactive: options.interactive,
      });
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// Compose: Render a local JSX composition into a video pack
const { registerCompose } = require("./commands/compose");
registerCompose(program);

// Capture-DOM: Capture a self-contained DOM reconstruction artifact from a URL
const { registerCaptureDom } = require("./commands/capture-dom");
registerCaptureDom(program);

// Refresh: Phase 5 auto-update loop — recapture, drift-check, re-publish or flag
const { registerRefresh } = require("./commands/refresh");
registerRefresh(program);

// ============================================================================
// PUBLISHING & INTEGRATION COMMANDS
// ============================================================================

// Publish: Upload generated assets to platform with versioning
program
  .command("publish")
  .description("Publish visual assets to Reshot platform")
  .option("--tag <tag>", "Version tag (e.g., v1.2, release-2024-01)")
  .option("-m, --message <message>", "Commit message for this publish")
  .option("--video <path>", "Explicit video file to upload with this publish")
  .option("--dry-run", "Preview without uploading")
  .option("-f, --force", "Skip confirmation prompts")
  .option("--all-output", "Publish from the full .reshot/output tree instead of the latest successful run manifest")
  .option("--output-json", "Write structured result to .reshot/output/publish-result.json")
  .option("--auto-approve", "Automatically approve published visuals (skip review queue)")
  .option("--skip-release-doctor", "Skip the composed release gate precheck")
  .action(async (options) => {
    try {
      const publishCommand = require("./commands/publish");
      const result = await publishCommand({
        ...options,
        outputJson: options.outputJson,
        autoApprove: options.autoApprove,
        skipReleaseDoctor: options.skipReleaseDoctor,
      });
      if (result && result.success === false) {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// Variation: Render a variation from a captured DOM scene (MHTML).
// Beta — see docs/variation-pipeline.md.
program
  .command("variation")
  .description("Render a variation from a captured DOM scene (beta)")
  .option("-s, --source <path>", "Path to source .mhtml (overrides --scenario/--capture)")
  .option("--scenario <key>", "Scenario key under .reshot/output/")
  .option("--capture <key>", "Capture key (e.g., 'observation-detail')")
  .option("--theme <name>", "Theme variant: light | dark", "light")
  .option("-m, --manifest <path>", "Path to variation manifest (.json)")
  .option("-o, --output <path>", "Output PNG path")
  .option("--no-headless", "Run browser visibly for debugging")
  .action(async (options) => {
    try {
      const variationCommand = require("./commands/variation");
      await variationCommand(options);
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// Pull: Generate asset map for local workflows
program
  .command("pull")
  .description("Pull asset map for your capture workflow")
  .option("-f, --format <format>", "Output format: json, ts, csv", "json")
  .option("-o, --output <path>", "Output file path")
  .option("--full", "Include full metadata in TypeScript output")
  .option("--status <status>", "Filter: approved, pending, all", "all")
  .action(async (options) => {
    try {
      const pullCommand = require("./commands/pull");
      await pullCommand({
        format: options.format,
        output: options.output,
        full: options.full,
        status: options.status,
      });
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// Doctor: Validate target contract and readiness
const doctor = program.command("doctor").description("Validate target configuration and readiness");

doctor
  .command("target")
  .description("Audit the certified target contract before capture")
  .option("-s, --scenarios <keys>", "Comma-separated list of scenario keys")
  .option("--timeout <ms>", "Per-step timeout in milliseconds (default 15000)")
  .option("--json", "Output JSON report")
  .action(async (options) => {
    try {
      const doctorTargetCommand = require("./commands/doctor-target");
      await doctorTargetCommand(options);
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

doctor
  .command("release")
  .description("Run the combined release gate: preflight, target doctor, and docs assets")
  .option("-s, --scenarios <keys>", "Comma-separated list of scenario keys")
  .option("--json", "Output JSON report")
  .action(async (options) => {
    try {
      const doctorReleaseCommand = require("./commands/doctor-release");
      await doctorReleaseCommand(options);
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// Verify: Publish/pull/hosted delivery verification
const verify = program.command("verify").description("Verify publish and delivery flows");

verify
  .command("publish")
  .description("Verify publish, pull, and hosted asset delivery")
  .option("-s, --scenarios <keys>", "Comma-separated list of scenario keys")
  .option("--tag <tag>", "Version tag for verification publish")
  .option("-m, --message <message>", "Publish message override")
  .option("--json", "Output JSON report")
  .action(async (options) => {
    try {
      const verifyPublishCommand = require("./commands/verify-publish");
      await verifyPublishCommand(options);
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// Certify: full certified-target release gate
program
  .command("certify")
  .description("Run the full certified target pipeline")
  .option("-s, --scenarios <keys>", "Comma-separated list of scenario keys")
  .option("--tag <tag>", "Version tag for certification publish")
  .option("-m, --message <message>", "Publish message override")
  .option("--skip-release-doctor", "Skip the composed release gate precheck")
  .option("--json", "Output JSON report")
  .action(async (options) => {
    try {
      const certifyCommand = require("./commands/certify");
      await certifyCommand(options);
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });


// ============================================================================
// DRIFT MANAGEMENT COMMANDS
// ============================================================================

// Drifts: View and manage visual drifts
program
  .command("drifts [action] [id]")
  .description("View and manage visual drifts")
  .addHelpText(
    "after",
    `
Actions:
  list              List all drifts (default)
  show <id>         Show drift details
  approve <id>      Approve a drift
  reject <id>       Reject a drift
  ignore <id>       Mark drift as ignored
  sync <id>         Mark as manually synced (external_host)
  approve-all       Approve all pending drifts
  reject-all        Reject all pending drifts
`,
  )
  .option("--status <status>", "Filter: PENDING, APPROVED, REJECTED, IGNORED")
  .option("--journey <key>", "Filter by journey key")
  .option("-v, --verbose", "Show detailed information")
  .action(async (action, id, options) => {
    try {
      const driftsCommand = require("./commands/drifts");
      const subcommand = action || "list";
      const args = id ? [id] : [];
      await driftsCommand(subcommand, args, options);
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// ============================================================================
// UTILITY COMMANDS (Hidden from main help, but available)
// ============================================================================

// Auth: Standalone authentication (for re-auth scenarios)
const auth = program
  .command("auth")
  .description(
    "Link this CLI to a Reshot project. Opens a browser to approve the session and stores a project API key locally.",
  )
  .addHelpText(
    "after",
    `
Authentication paths:
  Interactive (default)   Opens your browser, you approve the session, and the
                          CLI saves a project API key to .reshot/settings.json.
  Non-interactive (CI)    Set RESHOT_API_KEY and RESHOT_PROJECT_ID and the CLI
                          links without any browser or prompt.

Examples:
  reshot auth                                  Browser-based login
  RESHOT_API_KEY=… RESHOT_PROJECT_ID=… reshot auth   Headless / CI login
`,
  )
  .action(async () => {
    try {
      const authCommand = require("./commands/auth");
      await authCommand();
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

auth
  .command("login")
  .description(
    "Alias for `reshot auth` — opens the browser approval flow (or uses RESHOT_API_KEY in CI).",
  )
  .action(async () => {
    try {
      const authCommand = require("./commands/auth");
      await authCommand();
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

program
  .command("login")
  .description(
    "Alias for `reshot auth` — link this CLI to a project via browser approval (or RESHOT_API_KEY in CI).",
  )
  .action(async () => {
    try {
      const authCommand = require("./commands/auth");
      await authCommand();
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// Init: Standalone initialization (for manual config)
program
  .command("init", { hidden: true })
  .description("Initialize Reshot configuration")
  .action(async () => {
    try {
      const initCommand = require("./commands/init");
      await initCommand();
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

// Chrome: Launch Chrome with debugging (absorbed into record --browser)
program
  .command("chrome", { hidden: true })
  .description("Launch Chrome with remote debugging")
  .option("-p, --port <port>", "Remote debugging port", "9222")
  .option("--url <url>", "URL to open after launch", "about:blank")
  .action(async (options) => {
    try {
      const chromeCommand = require("./commands/chrome");
      await chromeCommand(options);
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      process.exit(1);
    }
  });

function resolveRecordClipScenarioKeys(target, options = {}) {
  return resolveScenarioKeysFromTarget(target, options);
}

function resolveScenarioKeysFromTarget(target, options = {}) {
  if (options.scenarios) {
    return options.scenarios.split(",").map((value) => value.trim()).filter(Boolean);
  }

  if (!target) {
    return null;
  }

  const absoluteTarget = path.resolve(process.cwd(), target);
  if (!fs.existsSync(absoluteTarget)) {
    return [target];
  }

  const source = fs.readFileSync(absoluteTarget, "utf8");
  const config = require("./lib/config").readConfig();
  const scenarios = config.scenarios || [];
  const mentioned = scenarios.find((scenario) => source.includes(scenario.key));
  if (mentioned) {
    return [mentioned.key];
  }

  const basename = path.basename(target).replace(/\.(spec\.)?[cm]?[tj]sx?$/i, "");
  const byName = scenarios.find((scenario) => {
    const normalizedKey = String(scenario.key || "").replace(/^dogfood-/, "");
    return scenario.key === basename || normalizedKey === basename;
  });
  if (byName) {
    return [byName.key];
  }

  throw new Error(
    `Could not map ${target} to a configured scenario. Add the scenario key to the spec file or pass --scenarios <key>.`,
  );
}

async function copyRecordClipOutputs(result, target, outDir) {
  const firstScenario = (result.results || []).find((item) => item?.success !== false);
  const outputDir = firstScenario?.outputDir;
  if (!outputDir) {
    throw new Error("No summary-video output directory was produced.");
  }

  const slug = target
    ? path.basename(target).replace(/\.(spec\.)?[cm]?[tj]sx?$/i, "")
    : firstScenario.key || "summary-video";
  const destinationDir = path.resolve(process.cwd(), outDir);
  await fs.ensureDir(destinationDir);

  const copies = [
    ["summary-video.mp4", `${slug}.mp4`],
    ["summary-video.metadata.json", `${slug}.metadata.json`],
    ["sentinels.json", `${slug}.sentinels.json`],
  ];

  for (const [fromName, toName] of copies) {
    const sourcePath = path.join(outputDir, fromName);
    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, path.join(destinationDir, toName));
      console.log(chalk.gray(`  copied ${toName}`));
    }
  }
}

program.parse(process.argv);
