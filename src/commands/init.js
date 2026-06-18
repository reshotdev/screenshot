const inquirer = require("inquirer");
const chalk = require("chalk");
const fs = require("fs-extra");
const path = require("path");
const config = require("../lib/config");
const {
  validateStorageConfig,
  getStorageSetupHelp,
  isPlatformAvailable,
} = require("../lib/storage-providers");
const {
  initStandaloneMode,
  printModeStatus,
  getConfigDefaults,
} = require("../lib/standalone-mode");

async function initCommand() {
  console.log(chalk.cyan("🚀 Initializing Reshot...\n"));

  // Check if we already have a reshot.config.json with BYOS storage config
  let existingConfig = null;
  let isBYOSMode = false;

  if (config.configExists()) {
    try {
      existingConfig = config.readConfig();
      if (
        existingConfig.storage &&
        existingConfig.storage.type &&
        existingConfig.storage.type !== "reshot"
      ) {
        isBYOSMode = true;
      }
    } catch (error) {
      // Config exists but couldn't be read - we'll handle this later
    }
  }

  // Try to read CLI settings (from auth)
  let settings = null;
  try {
    settings = config.readSettings();
  } catch (readError) {
    // No settings file - that's okay if we're in BYOS mode
    settings = null;
  }

  const hasPlatformAuth = settings?.projectId && settings?.apiKey;

  // If no auth and no existing BYOS config, prompt user for their choice
  if (!hasPlatformAuth && !isBYOSMode) {
    console.log(
      chalk.yellow("⚠ No Reshot account linked. Choose how to proceed:\n")
    );

    const { mode } = await inquirer.prompt([
      {
        type: "list",
        name: "mode",
        message: "How would you like to use Reshot?",
        choices: [
          {
            name: `${chalk.cyan(
              "Platform Mode"
            )} - Full features: CDN, approval workflows, changelogs (requires auth)`,
            value: "platform",
          },
          {
            name: `${chalk.green(
              "Standalone Mode"
            )} - Local-only: capture, diff, and output templating - no account needed`,
            value: "standalone",
          },
          {
            name: `${chalk.blue(
              "BYOS Mode"
            )} - Bring Your Own Storage (S3, R2, or local) - works standalone`,
            value: "byos",
          },
        ],
      },
    ]);

    if (mode === "platform") {
      console.log(chalk.yellow("\n⚠ Platform mode requires authentication."));
      console.log(
        `Run ${chalk.bold("reshot auth")} first, then run ${chalk.bold(
          "reshot init"
        )} again.\n`
      );
      process.exit(1);
    }

    if (mode === "standalone") {
      // Initialize standalone mode with minimal prompts
      const { projectName } = await inquirer.prompt([
        {
          type: "input",
          name: "projectName",
          message: "Project name:",
          default: require("path").basename(process.cwd()),
        },
      ]);

      const { baseUrl } = await inquirer.prompt([
        {
          type: "input",
          name: "baseUrl",
          message: "Application URL to capture:",
          default: "http://localhost:3000",
        },
      ]);

      // Use standalone mode initialization
      const standaloneConfig = initStandaloneMode({ projectName, force: true });

      // Update baseUrl if different from default
      if (baseUrl !== standaloneConfig.baseUrl) {
        standaloneConfig.baseUrl = baseUrl;
        config.writeConfig(standaloneConfig);
      }

      printModeStatus();

      console.log(chalk.cyan("\nNext steps:"));
      console.log(
        `  1. Run ${chalk.bold("reshot ui")} to launch the Reshot Studio`
      );
      console.log(`  2. Record your first scenario using the recorder`);
      console.log(
        `  3. Run ${chalk.bold("reshot run")} to capture screenshots\n`
      );
      console.log(
        chalk.gray(
          "Tip: Configure output templates to control where files are saved."
        )
      );
      console.log(
        chalk.gray(
          '     Example: output.template = "./docs/{{locale}}/{{name}}.png"\n'
        )
      );
      return;
    }

    // BYOS mode - prompt for storage configuration
    const { storageType } = await inquirer.prompt([
      {
        type: "list",
        name: "storageType",
        message: "Select your storage provider:",
        choices: [
          { name: "AWS S3", value: "s3" },
          { name: "Cloudflare R2", value: "r2" },
          { name: "Local filesystem", value: "local" },
        ],
      },
    ]);

    // Create a basic BYOS config with sane defaults
    const byosConfig = {
      $schema: "https://reshot.dev/schemas/reshot-config.json",
      version: "2.0",
      baseUrl: "http://localhost:3000",
      assetDir: ".reshot/output",
      viewport: { width: 1280, height: 720 },
      timeout: 30000,
      headless: true,
      storage: {
        type: storageType,
      },
      scenarios: [],
    };

    if (storageType === "s3") {
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "bucket",
          message: "S3 bucket name:",
          validate: (input) => input.length > 0 || "Bucket name is required",
        },
        {
          type: "input",
          name: "region",
          message: "AWS region (e.g., us-east-1):",
          default: "us-east-1",
        },
        {
          type: "input",
          name: "pathPrefix",
          message: "Path prefix for assets (optional):",
          default: "reshot-assets/",
        },
      ]);
      byosConfig.storage = { type: "s3", ...answers };
    } else if (storageType === "r2") {
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "bucket",
          message: "R2 bucket name:",
          validate: (input) => input.length > 0 || "Bucket name is required",
        },
        {
          type: "input",
          name: "accountId",
          message: "Cloudflare Account ID:",
          validate: (input) => input.length > 0 || "Account ID is required",
        },
        {
          type: "input",
          name: "pathPrefix",
          message: "Path prefix for assets (optional):",
          default: "reshot-assets/",
        },
      ]);
      byosConfig.storage = { type: "r2", ...answers };
    } else if (storageType === "local") {
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "outputDir",
          message: "Local output directory:",
          default: "./.reshot/published",
        },
      ]);
      byosConfig.storage = { type: "local", ...answers };
    }

    // Validate the storage configuration
    const validation = validateStorageConfig(byosConfig.storage);
    if (!validation.valid) {
      console.log(chalk.red("\n❌ Storage configuration errors:"));
      validation.errors.forEach((e) => console.log(chalk.red(`  - ${e}`)));
      console.log(getStorageSetupHelp(storageType));
      process.exit(1);
    }
    if (validation.warnings.length > 0) {
      console.log(chalk.yellow("\n⚠ Warnings:"));
      validation.warnings.forEach((w) => console.log(chalk.yellow(`  - ${w}`)));
    }

    // Save the config
    config.writeConfig(byosConfig);

    console.log(
      chalk.green(
        "\n✔ Created reshot.config.json with BYOS storage configuration"
      )
    );
    console.log(chalk.cyan("\nNext steps:"));
    console.log(
      `  1. Set required environment variables for ${storageType.toUpperCase()} storage`
    );
    if (storageType === "s3") {
      console.log(chalk.gray('     export AWS_ACCESS_KEY_ID="..."'));
      console.log(chalk.gray('     export AWS_SECRET_ACCESS_KEY="..."'));
    } else if (storageType === "r2") {
      console.log(chalk.gray('     export R2_ACCESS_KEY_ID="..."'));
      console.log(chalk.gray('     export R2_SECRET_ACCESS_KEY="..."'));
    }
    console.log(
      `  2. Run ${chalk.bold(
        'reshot record "My Visual"'
      )} to capture your first flow`
    );
    console.log(
      `  3. Run ${chalk.bold("reshot publish")} to upload to your storage\n`
    );
    return;
  }

  // Platform mode with auth OR updating existing config
  if (hasPlatformAuth) {
    const { projectId, apiKey } = settings;

    let overwrite = false;
    if (config.configExists()) {
      const answer = await inquirer.prompt([
        {
          type: "confirm",
          name: "overwrite",
          default: false,
          message:
            "reshot.config.json already exists. Overwrite it with the latest blueprint?",
        },
      ]);
      overwrite = answer.overwrite;

      if (!overwrite) {
        console.log(chalk.yellow("⚠ Existing reshot.config.json preserved."));
        return;
      }
    }

    try {
      const blueprint = await config.initializeProject(projectId, apiKey, {
        overwrite,
      });

      if (blueprint._metadata?.projectName) {
        console.log(chalk.green("✔ Pulled reshot.config.json from Reshot"));
      } else {
        console.log(
          chalk.yellow(
            "⚠ Unable to fetch existing blueprint from Reshot. Using boilerplate template instead."
          )
        );
      }
      console.log(chalk.green("✔ Saved reshot.config.json"));

      const updatedSettings = config.readSettings();
      console.log("");
      console.log(
        chalk.cyan(
          `✨ Reshot initialized for ${
            updatedSettings.projectName || "your project"
          } (${projectId})`
        )
      );
      console.log("\nNext steps:");
      console.log(
        `  1. Review ${chalk.bold(
          "reshot.config.json"
        )} and commit it to your repo.`
      );
      console.log(
        `     ${chalk.gray(
          "Note: Only the JSON file is committed – binaries stream via CLI + API."
        )}`
      );

      console.log(
        `  2. Run ${chalk.bold(
          'reshot record "My Visual"'
        )} to capture your first flow.`
      );
      console.log(
        `  3. Push your branch and open a PR. Reshot will post visual changes as a PR comment.`
      );
      console.log("");
    } catch (error) {
      console.error(chalk.red("Failed to initialize:"), error.message);
      process.exit(1);
    }
  } else if (isBYOSMode) {
    // Existing BYOS config - just validate and show info
    console.log(chalk.green("✔ Found existing BYOS configuration"));
    const validation = validateStorageConfig(existingConfig.storage);
    if (!validation.valid) {
      console.log(chalk.red("\n❌ Storage configuration errors:"));
      validation.errors.forEach((e) => console.log(chalk.red(`  - ${e}`)));
      console.log(getStorageSetupHelp(existingConfig.storage.type));
    } else {
      console.log(chalk.cyan(`  Storage type: ${existingConfig.storage.type}`));
      if (existingConfig.storage.bucket) {
        console.log(chalk.cyan(`  Bucket: ${existingConfig.storage.bucket}`));
      }
      console.log(chalk.green("\n✔ Configuration is valid"));
      console.log(chalk.cyan("\nNext steps:"));
      console.log(
        `  1. Run ${chalk.bold('reshot record "My Visual"')} to capture a flow`
      );
      console.log(
        `  2. Run ${chalk.bold("reshot publish")} to upload to your storage\n`
      );
    }
  }
}

module.exports = initCommand;
