// setup-wizard.js - Interactive setup wizard
// Streamlined flow: choose lane, create config, optional Studio launch

const inquirer = require("inquirer");
const chalk = require("chalk");
const fs = require("fs-extra");
const path = require("path");
const config = require("../lib/config");
const { normalizeConfigContract } = require("../lib/target-contract");

/**
 * Detect if this is a Git repository and if it's GitHub
 */
function detectGitInfo() {
  const isGitRepo = fs.existsSync(path.join(process.cwd(), ".git"));
  let isGitHub = false;
  let remoteUrl = null;

  if (isGitRepo) {
    try {
      const { execSync } = require("child_process");
      remoteUrl = execSync("git remote get-url origin", {
        encoding: "utf-8",
      }).trim();
      isGitHub = remoteUrl.includes("github.com");
    } catch {
      // No remote configured
    }
  }

  return { isGitRepo, isGitHub, remoteUrl };
}

/**
 * Detect Playwright configuration
 */
function detectPlaywright() {
  const configFiles = [
    "playwright.config.ts",
    "playwright.config.js",
    "playwright.config.mjs",
  ];

  for (const file of configFiles) {
    if (fs.existsSync(path.join(process.cwd(), file))) {
      return { hasPlaywright: true, configFile: file };
    }
  }

  // Check package.json for playwright dependency
  try {
    const pkg = fs.readJsonSync(path.join(process.cwd(), "package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["@playwright/test"] || deps["playwright"]) {
      return { hasPlaywright: true, configFile: null };
    }
  } catch {
    // No package.json
  }

  return { hasPlaywright: false, configFile: null };
}

function detectSetupMode(projectConfig, useCloud) {
  const normalizedConfig =
    projectConfig && typeof projectConfig === "object"
      ? normalizeConfigContract(projectConfig)
      : null;
  const targetTier = normalizedConfig?.target?.tier || null;

  if (targetTier === "certified") {
    return "certified-target";
  }

  if (targetTier === "candidate") {
    return "candidate-target";
  }

  return useCloud ? "cloud-connected" : "local-only";
}

function getRecommendedLocalServerCommand(normalizedConfig) {
  const explicitCommand = normalizedConfig?.target?.supportedLocalCommand;
  if (explicitCommand) {
    return explicitCommand;
  }

  if (normalizedConfig?.target?.tier === "certified") {
    return "npm run build && npm run start";
  }

  return null;
}

function getNextRecommendedCommand(mode, useCloud) {
  if (mode === "certified-target" || mode === "candidate-target") {
    return "reshot doctor target";
  }

  return useCloud ? "reshot publish" : "reshot run";
}

function writeSetupReport({
  mode,
  useCloud,
  projectId,
  projectName,
  configCreated,
  playwrightDetected,
  supportedLocalCommand,
}) {
  const reportPath = path.join(
    process.cwd(),
    ".reshot",
    "reports",
    "self-serve-setup.json",
  );

  fs.ensureDirSync(path.dirname(reportPath));
  fs.writeJSONSync(
    reportPath,
    {
      generatedAt: new Date().toISOString(),
      mode,
      nextRecommendedCommand: getNextRecommendedCommand(mode, useCloud),
      useCloud,
      projectId: projectId || null,
      projectName: projectName || null,
      configCreated,
      playwrightDetected,
      supportedEnvironment: {
        launchSupported: "production-like localhost",
        launchUnsupported: ["next dev"],
        supportedLocalCommand: supportedLocalCommand || null,
      },
      blockingIssues: [],
      advisories: [
        "Run your target app with a production-like local server for launch-grade captures.",
      ],
      nextMilestones: [
        "reshot setup",
        "reshot run",
        ...(useCloud ? ["reshot publish"] : []),
      ],
    },
    { spaces: 2 },
  );

  return reportPath;
}

/**
 * Main setup wizard
 */
async function setupWizard(options = {}) {
  const {
    offline = false,
    force = false,
    noStudio = false,
    project: linkedProjectId,
    token: linkedToken,
  } = options;

  console.log(chalk.cyan.bold("\n🚀 Reshot Setup\n"));

  // Detect project context
  const playwrightInfo = detectPlaywright();

  // Check existing setup
  let existingSettings = null;
  let existingConfig = null;
  let isAlreadyAuthed = false;

  try {
    existingSettings = config.readSettings();
    isAlreadyAuthed = !!(
      existingSettings?.apiKey && existingSettings?.projectId
    );
  } catch {
    // No existing settings
  }

  try {
    if (config.configExists()) {
      existingConfig = config.readConfig();
    }
  } catch {
    // No existing config
  }

  let didLinkFromOptions = false;
  if (linkedProjectId && linkedToken && !offline) {
    const authCommand = require("./auth");
    const authResult = await authCommand({
      projectId: linkedProjectId,
      apiKey: linkedToken,
    });
    existingSettings = config.readSettings();
    isAlreadyAuthed = !!(
      existingSettings?.apiKey && existingSettings?.projectId
    );
    didLinkFromOptions = true;
    console.log(
      chalk.green("\n✔ Connected to"),
      chalk.cyan(existingSettings.projectName || existingSettings.projectId),
    );
    if (authResult?.mode) {
      console.log(chalk.gray(`  Mode: ${authResult.mode}`));
    }
  } else if (linkedProjectId && !linkedToken && !offline) {
    console.log(
      chalk.gray(
        `Setup will target project ${linkedProjectId}. Complete browser authentication when prompted.`,
      ),
    );
  }

  // If already set up and not forcing, show status and offer options
  if ((isAlreadyAuthed || existingConfig) && !force && !didLinkFromOptions) {
    console.log(
      chalk.yellow("⚠ Reshot is already configured in this project.\n"),
    );

    if (isAlreadyAuthed) {
      console.log(
        chalk.green("  ✔ Authenticated:"),
        chalk.cyan(existingSettings.projectName || existingSettings.projectId),
      );
    }
    if (existingConfig) {
      console.log(
        chalk.green("  ✔ Config found:"),
        chalk.cyan("reshot.config.json"),
      );
    }

    const choices = [];

    if (isAlreadyAuthed) {
      choices.push({
        name: "Re-authenticate (connect to a different project)",
        value: "reauth",
      });
    }

    choices.push({
      name: "Reconfigure (regenerate reshot.config.json)",
      value: "reconfig",
    });

    choices.push({
      name: "Exit",
      value: "exit",
    });

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices,
      },
    ]);

    if (action === "exit") {
      console.log(
        chalk.gray("\nRun"),
        chalk.cyan("reshot studio"),
        chalk.gray("to manage your visuals.\n"),
      );
      return;
    }

    if (action === "reauth") {
      console.log(chalk.gray("\nOpening browser for authentication...\n"));
      const authCommand = require("./auth");
      const authResult = await authCommand();

      // Re-read settings after auth
      try {
        existingSettings = config.readSettings();
        isAlreadyAuthed = !!(
          existingSettings?.apiKey && existingSettings?.projectId
        );
      } catch {
        throw new Error("Authentication failed. Please try again.");
      }

      if (!isAlreadyAuthed) {
        throw new Error("Authentication was not completed.");
      }

      console.log(
        chalk.green("\n✔ Connected to"),
        chalk.cyan(existingSettings.projectName || existingSettings.projectId),
      );
      if (authResult?.mode) {
        console.log(chalk.gray(`  Mode: ${authResult.mode}`));
      }
      console.log(
        chalk.gray("\nRun"),
        chalk.cyan("reshot studio"),
        chalk.gray("to manage your visuals.\n"),
      );
      return;
    }

    // action === "reconfig" — fall through to config generation below
  }

  // ========================================
  // STEP 1: Platform Connection
  // ========================================
  if (!isAlreadyAuthed && !offline) {
  console.log(chalk.cyan("\n━━━ Step 1: Choose Your Lane ━━━\n"));

    const { connectToCloud } = await inquirer.prompt([
      {
        type: "list",
        name: "connectToCloud",
        message: "How would you like to use Reshot?",
        choices: [
          {
            name: `${chalk.cyan("Set up hosted pipeline")} - Connect to Reshot Cloud for hosted assets, review workflows, and team collaboration`,
            value: true,
          },
          {
            name: `${chalk.gray("Start locally")} - Get a first capture working on your machine before you add hosted delivery`,
            value: false,
          },
        ],
      },
    ]);

    if (connectToCloud) {
      console.log(chalk.gray("\nOpening browser for authentication...\n"));

      const authCommand = require("./auth");
      const authResult = await authCommand();

      // Re-read settings after auth
      try {
        existingSettings = config.readSettings();
        isAlreadyAuthed = !!(
          existingSettings?.apiKey && existingSettings?.projectId
        );
      } catch {
        throw new Error("Authentication failed. Please try again.");
      }

      if (!isAlreadyAuthed) {
        throw new Error("Authentication was not completed.");
      }

      console.log(
        chalk.green("\n✔ Connected to"),
        chalk.cyan(existingSettings.projectName || existingSettings.projectId),
      );
      if (authResult?.mode) {
        console.log(chalk.gray(`  Mode: ${authResult.mode}`));
      }
    } else {
      console.log(
        chalk.gray(
          "Running in local-only mode — hosted publish and pull stay unavailable until you run `reshot auth`.",
        ),
      );
    }
  } else if (offline) {
    console.log(
      chalk.gray(
        "Running in local-only mode — hosted publish and pull stay unavailable until you run `reshot auth`.",
      ),
    );
  }

  const useCloud = isAlreadyAuthed;
  const projectId = existingSettings?.projectId;
  const normalizedSetupConfig = normalizeConfigContract(
    existingConfig && typeof existingConfig === "object" ? existingConfig : {},
  );
  const supportedLocalCommand =
    getRecommendedLocalServerCommand(normalizedSetupConfig);

  // ========================================
  // STEP 2: Project Defaults
  // ========================================
  console.log(chalk.cyan("\n━━━ Step 2: Project Defaults ━━━\n"));

  let traceDir = "./test-results";

  if (playwrightInfo.hasPlaywright) {
    console.log(chalk.green("✔ Playwright detected"));
    if (playwrightInfo.configFile) {
      console.log(chalk.gray(`  Config: ${playwrightInfo.configFile}`));
    }
    const { customTraceDir } = await inquirer.prompt([
      {
        type: "input",
        name: "customTraceDir",
        message: "Playwright test-results directory:",
        default: "./test-results",
      },
    ]);

    traceDir = customTraceDir;
  } else {
    console.log(chalk.green("✔ No Playwright setup detected"));
    console.log(
      chalk.gray(
        "  That is okay for the local-first workflow. You can define or record scenarios and run them directly.",
      ),
    );
  }

  // ========================================
  // Generate Configuration
  // ========================================
  console.log(chalk.cyan("\n━━━ Generating Configuration ━━━\n"));

  const newConfig = {
    $schema: "https://reshot.dev/schemas/reshot-config.json",
    version: "2.0",
    baseUrl: existingConfig?.baseUrl || "http://localhost:3000",
    viewport: existingConfig?.viewport || { width: 1280, height: 720 },
  };

  if (useCloud && projectId) {
    newConfig.projectId = projectId;
  }

  newConfig.visuals = {
    traceDir,
  };

  if (!useCloud) {
    const { customAssetDir } = await inquirer.prompt([
      {
        type: "input",
        name: "customAssetDir",
        message: "Where should screenshots be saved?",
        default: ".reshot/output",
      },
    ]);
    newConfig.assetDir = customAssetDir;
  } else {
    newConfig.assetDir = ".reshot/output";
  }

  newConfig.scenarios = existingConfig?.scenarios || [];

  // Write configuration
  config.writeConfig(newConfig);
  console.log(chalk.green("✔ Created reshot.config.json"));

  const combinedConfig =
    existingConfig && typeof existingConfig === "object"
      ? { ...existingConfig, ...newConfig }
      : newConfig;
  const normalizedCombinedConfig = normalizeConfigContract(combinedConfig);
  const setupMode = detectSetupMode(combinedConfig, useCloud);
  const finalSupportedLocalCommand =
    getRecommendedLocalServerCommand(normalizedCombinedConfig) ||
    supportedLocalCommand;
  const reportPath = writeSetupReport({
    mode: setupMode,
    useCloud,
    projectId,
    projectName: existingSettings?.projectName,
    configCreated: true,
    playwrightDetected: playwrightInfo.hasPlaywright,
    supportedLocalCommand: finalSupportedLocalCommand,
  });

  // ========================================
  // Success & Next Steps
  // ========================================
  console.log(chalk.green("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log(chalk.green.bold("✔ Reshot setup complete!"));
  console.log(chalk.green("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));

  console.log(chalk.cyan("Supported launch path:\n"));
  console.log(
    `  ${chalk.gray("Run your target app with a production-like local server before capture.")}`,
  );
  console.log(
    `     ${chalk.cyan(finalSupportedLocalCommand || "npm run build && npm run start")}`,
  );
  console.log(
    `  ${chalk.gray("Unsupported for launch reliability:")} ${chalk.yellow("next dev")}\n`,
  );

  console.log(chalk.cyan("Setup mode:\n"));
  console.log(`  ${chalk.green(setupMode)}\n`);

  console.log(chalk.cyan("Next steps:\n"));
  console.log(
    `  1. ${chalk.gray("Review")} ${chalk.cyan("reshot.config.json")} ${chalk.gray("and add your first scenario or recording")}`,
  );
  console.log(
    `  2. ${chalk.gray("Start your app in the supported environment:")}`,
  );
  console.log(
    `     ${chalk.cyan(finalSupportedLocalCommand || "npm run build && npm run start")}`,
  );
  console.log(`  3. ${chalk.gray("Generate your first local capture:")}`);
  console.log(`     ${chalk.cyan("reshot run")}`);

  if (useCloud) {
    console.log(
      `\n  4. ${chalk.gray("Upgrade to hosted assets when you are ready:")}`,
    );
    console.log(`     ${chalk.cyan("reshot publish")}`);
  } else {
    console.log(
      `\n  4. ${chalk.gray("Connect hosted delivery later when you are ready:")}`,
    );
    console.log(`     ${chalk.cyan("reshot auth")}`);
  }

  if (setupMode === "certified-target" || setupMode === "candidate-target") {
    console.log(
      `\n  5. ${chalk.gray("Use advanced target checks when you need them:")}`,
    );
    console.log(`     ${chalk.cyan("reshot doctor target")}`);
    console.log(`     ${chalk.cyan("reshot verify publish")}`);
    if (setupMode === "certified-target") {
      console.log(`     ${chalk.cyan("reshot certify")}`);
    }
  }

  console.log(`\n  ${chalk.gray("Open Studio to inspect output locally:")}`);
  console.log(`     ${chalk.cyan("reshot studio")}`);
  console.log(
    `\n  ${chalk.gray("Supported environments guide:")} ${chalk.cyan("https://reshot.dev/docs/cli/getting-started/supported-environments")}`,
  );
  console.log(
    `\n  ${chalk.gray("Setup report written to:")} ${chalk.cyan(path.relative(process.cwd(), reportPath))}\n`,
  );

  if (noStudio) {
    console.log(
      chalk.gray("Studio launch skipped. Run `reshot studio` when you want the local UI.\n"),
    );
    return;
  }

  // Offer to launch studio
  const { launchStudio } = await inquirer.prompt([
    {
      type: "confirm",
      name: "launchStudio",
      message: "Launch Reshot Studio now?",
      default: false,
    },
  ]);

  if (launchStudio) {
    console.log(chalk.cyan("\n🎬 Launching Reshot Studio...\n"));
    const uiCommand = require("./ui");
    await uiCommand({ open: true });
  }
}

module.exports = setupWizard;
