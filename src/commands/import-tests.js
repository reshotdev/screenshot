// import-tests.js - Import existing Playwright tests into Reshot configuration
// This command scans Playwright tests and creates journey mappings

const chalk = require("chalk");
const fs = require("fs-extra");
const path = require("path");
const inquirer = require("inquirer");
const config = require("../lib/config");

/**
 * Parse Playwright test file to extract test structure
 */
function parsePlaywrightTestFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const tests = [];

  // Extract journey key from file header comment if present
  const journeyMatch = content.match(/Journey\s*Key:\s*["']?([^"'\n]+)["']?/i);
  const fileJourneyKey = journeyMatch ? journeyMatch[1].trim() : null;

  // Extract test.describe blocks
  const describeRegex = /test\.describe\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let describeMatch;
  while ((describeMatch = describeRegex.exec(content)) !== null) {
    tests.push({
      type: "describe",
      name: describeMatch[1],
      index: describeMatch.index,
    });
  }

  // Extract individual tests
  const testRegex = /(?<!\.describe\s*\()test\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let testMatch;
  while ((testMatch = testRegex.exec(content)) !== null) {
    tests.push({
      type: "test",
      name: testMatch[1],
      index: testMatch.index,
    });
  }

  // Sort by position in file
  tests.sort((a, b) => a.index - b.index);

  return {
    filePath,
    fileJourneyKey,
    tests,
  };
}

/**
 * Generate a journey key from test/describe name
 */
function generateJourneyKey(fileName, testName, describeName = null) {
  // Clean up the file name to get a prefix
  const filePrefix = fileName
    .replace(/^\d+-/, "") // Remove leading numbers like "01-"
    .replace(/\.spec\.(ts|js)$/, "")
    .replace(/\.test\.(ts|js)$/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase();

  // Clean up test name
  const testSuffix = testName
    .replace(/^should\s+/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()
    .slice(0, 30);

  return `${filePrefix}/${testSuffix}`
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Discover all Playwright test files
 */
function discoverTestFiles(testDir) {
  const testFiles = [];

  if (!fs.existsSync(testDir)) {
    return testFiles;
  }

  function walkDir(dir) {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (item !== "node_modules" && !item.startsWith(".")) {
          walkDir(fullPath);
        }
      } else if (
        item.endsWith(".spec.ts") ||
        item.endsWith(".spec.js") ||
        item.endsWith(".test.ts") ||
        item.endsWith(".test.js")
      ) {
        testFiles.push(fullPath);
      }
    }
  }

  walkDir(testDir);
  return testFiles;
}

/**
 * Find Playwright config and extract test directory
 */
function findPlaywrightConfig() {
  const configFiles = [
    "playwright.config.ts",
    "playwright.config.js",
    "playwright.config.mjs",
  ];

  for (const file of configFiles) {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");

      // Try to extract testDir
      const testDirMatch = content.match(/testDir:\s*["'`]([^"'`]+)["'`]/);
      const testDir = testDirMatch ? testDirMatch[1] : "./tests";

      // Try to extract output directory
      const outputDirMatch = content.match(/outputDir:\s*["'`]([^"'`]+)["'`]/);
      const outputDir = outputDirMatch ? outputDirMatch[1] : "./test-results";

      return {
        configFile: file,
        testDir,
        outputDir,
      };
    }
  }

  return null;
}

/**
 * Main import-tests command
 */
async function importTestsCommand(options = {}) {
  const { interactive = true, dryRun = false } = options;

  console.log(chalk.cyan.bold("\n📋 Import Playwright Tests\n"));

  // Find Playwright configuration
  const pwConfig = findPlaywrightConfig();

  if (!pwConfig) {
    console.error(chalk.red("✖ No Playwright configuration found."));
    console.log(
      chalk.gray(
        "  Make sure you have a playwright.config.ts or playwright.config.js file.",
      ),
    );
    process.exit(1);
  }

  console.log(chalk.gray(`Found: ${pwConfig.configFile}`));
  console.log(chalk.gray(`Test directory: ${pwConfig.testDir}`));
  console.log(chalk.gray(`Output directory: ${pwConfig.outputDir}\n`));

  // Discover test files
  const testDir = path.resolve(process.cwd(), pwConfig.testDir);
  const testFiles = discoverTestFiles(testDir);

  if (testFiles.length === 0) {
    console.log(
      chalk.yellow("⚠ No test files found in"),
      chalk.cyan(pwConfig.testDir),
    );
    process.exit(0);
  }

  console.log(chalk.green(`Found ${testFiles.length} test file(s):\n`));

  // Parse all test files
  const allTests = [];
  for (const filePath of testFiles) {
    const relativePath = path.relative(process.cwd(), filePath);
    const parsed = parsePlaywrightTestFile(filePath);

    console.log(chalk.white(`  ${relativePath}`));
    if (parsed.fileJourneyKey) {
      console.log(chalk.gray(`    └─ Journey Key: ${parsed.fileJourneyKey}`));
    }

    for (const test of parsed.tests) {
      if (test.type === "describe") {
        console.log(chalk.gray(`    ├─ describe: "${test.name}"`));
      } else {
        console.log(chalk.gray(`    │  └─ test: "${test.name}"`));

        allTests.push({
          file: relativePath,
          fileName: path.basename(filePath),
          describeName: null, // TODO: Track describe context
          testName: test.name,
          fileJourneyKey: parsed.fileJourneyKey,
        });
      }
    }
  }

  console.log();

  // Generate journey mappings
  const journeyMappings = {};

  for (const test of allTests) {
    // Use file-level journey key if available, otherwise generate
    const journeyKey =
      test.fileJourneyKey || generateJourneyKey(test.fileName, test.testName);

    // Create a test-results path pattern for this test
    // Playwright creates folders like: test-results/test-name-chromium/
    const testResultPattern = test.testName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 50);

    journeyMappings[testResultPattern] = journeyKey;
  }

  // Show proposed mappings
  console.log(chalk.cyan("━━━ Proposed Journey Mappings ━━━\n"));

  for (const [pattern, journeyKey] of Object.entries(journeyMappings)) {
    console.log(chalk.white(`  ${pattern}`));
    console.log(chalk.gray(`    → ${journeyKey}\n`));
  }

  if (dryRun) {
    console.log(chalk.yellow("\n✓ Dry run complete. No changes made.\n"));
    return { journeyMappings };
  }

  // Confirm save
  if (interactive) {
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: "Save these mappings to reshot.config.json?",
        default: true,
      },
    ]);

    if (!confirm) {
      console.log(chalk.gray("\nCancelled."));
      return;
    }
  }

  // Update reshot.config.json
  let reshotConfig;
  try {
    // Try to read existing config (use readConfigLenient which is less strict)
    reshotConfig = config.readConfigLenient();
  } catch {
    // Create new config with minimal required fields
    reshotConfig = {
      $schema: "https://reshot.dev/schemas/reshot-config.json",
      version: "2.0",
      scenarios: [],
    };
  }

  // Add visuals section with trace mappings
  reshotConfig.visuals = {
    ...reshotConfig.visuals,
    traceDir: pwConfig.outputDir,
    journeyMappings,
  };

  // Ensure scenarios array exists for config.readConfig() compatibility
  if (!reshotConfig.scenarios) {
    reshotConfig.scenarios = [];
  }

  config.writeConfig(reshotConfig);

  console.log(
    chalk.green("\n✓ Updated reshot.config.json with journey mappings"),
  );
  console.log(chalk.gray("\nNext steps:"));
  console.log(
    chalk.gray("  1. Run your Playwright tests:"),
    chalk.cyan("npx playwright test"),
  );
  console.log(
    chalk.gray("  2. Sync traces to Reshot:"),
    chalk.cyan("reshot sync"),
  );
  console.log(chalk.gray("  3. View results:"), chalk.cyan("reshot status\n"));

  return { journeyMappings };
}

module.exports = importTestsCommand;
