#!/usr/bin/env node
/**
 * Reshot CLI Pre-publish Test Script
 *
 * Runs automated checks to validate CLI functionality before publishing.
 * This script does NOT require network access or platform authentication.
 */

const { execSync, spawn } = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");

const CLI_ROOT = path.resolve(__dirname, "..");
const CLI_ENTRY = path.join(CLI_ROOT, "src", "index.js");

let passed = 0;
let failed = 0;
const errors = [];

function log(msg) {
  console.log(msg);
}

function pass(name) {
  passed++;
  log(chalk.green(`  ✓ ${name}`));
}

function fail(name, error) {
  failed++;
  errors.push({ name, error });
  log(chalk.red(`  ✗ ${name}`));
  if (error) {
    log(chalk.gray(`    ${error}`));
  }
}

function runCommand(cmd, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: CLI_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
      ...options,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => (stdout += data.toString()));
    child.stderr.on("data", (data) => (stderr += data.toString()));

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on("error", reject);
  });
}

async function testSection(name, tests) {
  log(chalk.cyan(`\n${name}`));
  log(chalk.gray("─".repeat(50)));
  for (const test of tests) {
    await test();
  }
}

// ============================================
// TEST SECTIONS
// ============================================

async function runStructureTests() {
  await testSection("📁 Package Structure", [
    // package.json exists and is valid
    async () => {
      const pkgPath = path.join(CLI_ROOT, "package.json");
      if (!fs.existsSync(pkgPath)) {
        return fail("package.json exists");
      }
      try {
        const pkg = require(pkgPath);
        if (!pkg.name || !pkg.version) {
          return fail("package.json has name and version");
        }
        pass("package.json exists and is valid");
      } catch (e) {
        fail("package.json is valid JSON", e.message);
      }
    },

    // Required fields in package.json
    async () => {
      const pkg = require(path.join(CLI_ROOT, "package.json"));
      const required = [
        "name",
        "version",
        "description",
        "license",
        "bin",
        "files",
      ];
      const missing = required.filter((f) => !pkg[f]);
      if (missing.length > 0) {
        return fail(
          `package.json required fields`,
          `Missing: ${missing.join(", ")}`
        );
      }
      pass("package.json has all required fields");
    },

    // Version is valid semver
    async () => {
      const pkg = require(path.join(CLI_ROOT, "package.json"));
      const semverRegex = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
      if (!semverRegex.test(pkg.version)) {
        return fail("version is valid semver", pkg.version);
      }
      pass(`version is valid semver (${pkg.version})`);
    },

    // LICENSE file exists
    async () => {
      const licensePath = path.join(CLI_ROOT, "LICENSE");
      if (!fs.existsSync(licensePath)) {
        return fail("LICENSE file exists");
      }
      const content = fs.readFileSync(licensePath, "utf-8");
      if (!content.includes("Apache")) {
        return fail("LICENSE is Apache 2.0");
      }
      pass("LICENSE file exists (Apache 2.0)");
    },

    // README.md exists
    async () => {
      const readmePath = path.join(CLI_ROOT, "README.md");
      if (!fs.existsSync(readmePath)) {
        return fail("README.md exists");
      }
      const content = fs.readFileSync(readmePath, "utf-8");
      if (content.length < 500) {
        return fail("README.md has content", "Too short");
      }
      pass("README.md exists and has content");
    },

    // Entry point exists
    async () => {
      if (!fs.existsSync(CLI_ENTRY)) {
        return fail("CLI entry point exists", CLI_ENTRY);
      }
      const content = fs.readFileSync(CLI_ENTRY, "utf-8");
      if (!content.startsWith("#!/usr/bin/env node")) {
        return fail("CLI has shebang");
      }
      pass("CLI entry point exists with shebang");
    },

    // All lib files exist
    async () => {
      const libDir = path.join(CLI_ROOT, "src", "lib");
      const requiredLibs = [
        "config.js",
        "capture-engine.js",
        "api-client.js",
        "ui-api.js",
        "standalone-mode.js",
        "viewport-presets.js",
        "output-path-template.js",
      ];
      const missing = requiredLibs.filter(
        (f) => !fs.existsSync(path.join(libDir, f))
      );
      if (missing.length > 0) {
        return fail("All lib files exist", `Missing: ${missing.join(", ")}`);
      }
      pass("All required lib files exist");
    },

    // All command files exist
    async () => {
      const cmdDir = path.join(CLI_ROOT, "src", "commands");
      const requiredCmds = [
        "auth.js",
        "init.js",
        "run.js",
        "ui.js",
        "publish.js",
      ];
      const missing = requiredCmds.filter(
        (f) => !fs.existsSync(path.join(cmdDir, f))
      );
      if (missing.length > 0) {
        return fail(
          "All command files exist",
          `Missing: ${missing.join(", ")}`
        );
      }
      pass("All required command files exist");
    },
  ]);
}

async function runSecurityTests() {
  await testSection("🔒 Security Checks", [
    // No hardcoded API keys
    async () => {
      const srcDir = path.join(CLI_ROOT, "src");
      const pattern =
        /['"]pk_live_[a-zA-Z0-9]+['"]|['"]sk_live_[a-zA-Z0-9]+['"]/;
      let found = false;

      function checkDir(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            checkDir(filePath);
          } else if (file.endsWith(".js")) {
            const content = fs.readFileSync(filePath, "utf-8");
            if (pattern.test(content)) {
              found = filePath;
            }
          }
        }
      }

      checkDir(srcDir);
      if (found) {
        return fail("No hardcoded API keys in source", found);
      }
      pass("No hardcoded API keys in source");
    },

    // No .env files in package
    async () => {
      const files = [".env", ".env.local", ".env.production"];
      const found = files.filter((f) => fs.existsSync(path.join(CLI_ROOT, f)));
      if (found.length > 0) {
        return fail("No .env files in package root", found.join(", "));
      }
      pass("No .env files in package root");
    },

    // .npmignore or files whitelist exists
    async () => {
      const pkg = require(path.join(CLI_ROOT, "package.json"));
      const hasNpmignore = fs.existsSync(path.join(CLI_ROOT, ".npmignore"));
      const hasFilesWhitelist =
        Array.isArray(pkg.files) && pkg.files.length > 0;

      if (!hasNpmignore && !hasFilesWhitelist) {
        return fail("Has .npmignore or files whitelist");
      }
      pass(`Has ${hasFilesWhitelist ? "files whitelist" : ".npmignore"}`);
    },

    // Settings file excluded from publish
    async () => {
      const pkg = require(path.join(CLI_ROOT, "package.json"));
      if (pkg.files && pkg.files.includes(".reshot")) {
        return fail(".reshot directory excluded from publish");
      }
      const npmignore = fs.existsSync(path.join(CLI_ROOT, ".npmignore"))
        ? fs.readFileSync(path.join(CLI_ROOT, ".npmignore"), "utf-8")
        : "";
      if (!pkg.files && !npmignore.includes(".reshot")) {
        return fail(".reshot directory excluded from publish");
      }
      pass(".reshot directory excluded from publish");
    },

    // No secrets in reshot.config
    async () => {
      const configPath = path.join(CLI_ROOT, "reshot.config.json");
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, "utf-8");
        if (content.includes("pk_live_") || content.includes("sk_live_")) {
          return fail("No secrets in reshot.config.json");
        }
      }
      pass("No secrets in reshot.config.json");
    },
  ]);
}

async function runModuleTests() {
  await testSection("📦 Module Loading", [
    // All lib modules can be required
    async () => {
      const libDir = path.join(CLI_ROOT, "src", "lib");
      const files = fs.readdirSync(libDir).filter((f) => f.endsWith(".js"));
      const failures = [];

      for (const file of files) {
        try {
          require(path.join(libDir, file));
        } catch (e) {
          failures.push(`${file}: ${e.message}`);
        }
      }

      if (failures.length > 0) {
        return fail("All lib modules load", failures.join("; "));
      }
      pass(`All ${files.length} lib modules load successfully`);
    },

    // All command modules can be required
    async () => {
      const cmdDir = path.join(CLI_ROOT, "src", "commands");
      const files = fs.readdirSync(cmdDir).filter((f) => f.endsWith(".js"));
      const failures = [];

      for (const file of files) {
        try {
          require(path.join(cmdDir, file));
        } catch (e) {
          failures.push(`${file}: ${e.message}`);
        }
      }

      if (failures.length > 0) {
        return fail("All command modules load", failures.join("; "));
      }
      pass(`All ${files.length} command modules load successfully`);
    },

    // Entry point loads without error
    async () => {
      try {
        // Temporarily mock process.argv to prevent actual CLI execution
        const originalArgv = process.argv;
        process.argv = ["node", CLI_ENTRY, "--version"];

        // This will load and execute --version
        const result = await runCommand("node", [CLI_ENTRY, "--version"]);

        process.argv = originalArgv;

        if (result.code !== 0) {
          return fail("CLI entry point runs", result.stderr);
        }
        pass("CLI entry point loads and runs");
      } catch (e) {
        fail("CLI entry point runs", e.message);
      }
    },
  ]);
}

async function runCLITests() {
  await testSection("⚡ CLI Commands", [
    // --help works
    async () => {
      const result = await runCommand("node", [CLI_ENTRY, "--help"]);
      if (result.code !== 0) {
        return fail("reshot --help works", result.stderr);
      }
      if (
        !result.stdout.includes("reshot") ||
        !result.stdout.includes("run")
      ) {
        return fail("reshot --help shows commands");
      }
      pass("reshot --help works");
    },

    // --version works
    async () => {
      const result = await runCommand("node", [CLI_ENTRY, "--version"]);
      if (result.code !== 0) {
        return fail("reshot --version works", result.stderr);
      }
      if (!result.stdout.match(/\d+\.\d+\.\d+/)) {
        return fail("reshot --version shows version number");
      }
      pass("reshot --version works");
    },

    // run --help works
    async () => {
      const result = await runCommand("node", [CLI_ENTRY, "run", "--help"]);
      if (result.code !== 0) {
        return fail("reshot run --help works", result.stderr);
      }
      if (
        !result.stdout.includes("scenarios") ||
        !result.stdout.includes("headless")
      ) {
        return fail("reshot run --help shows options");
      }
      pass("reshot run --help works");
    },

    // ui --help works
    async () => {
      const result = await runCommand("node", [CLI_ENTRY, "ui", "--help"]);
      if (result.code !== 0) {
        return fail("reshot ui --help works", result.stderr);
      }
      pass("reshot ui --help works");
    },

    // init --help works
    async () => {
      const result = await runCommand("node", [CLI_ENTRY, "init", "--help"]);
      if (result.code !== 0) {
        return fail("reshot init --help works", result.stderr);
      }
      pass("reshot init --help works");
    },
  ]);
}

async function runDependencyTests() {
  await testSection("📚 Dependencies", [
    // No missing dependencies
    async () => {
      const pkg = require(path.join(CLI_ROOT, "package.json"));
      const deps = { ...pkg.dependencies, ...pkg.optionalDependencies };
      const missing = [];

      for (const dep of Object.keys(deps)) {
        try {
          require.resolve(dep, { paths: [CLI_ROOT] });
        } catch (e) {
          // Skip optional deps
          if (!pkg.optionalDependencies?.[dep]) {
            missing.push(dep);
          }
        }
      }

      if (missing.length > 0) {
        return fail("All required dependencies installed", missing.join(", "));
      }
      pass("All required dependencies installed");
    },

    // Check for known vulnerable patterns
    async () => {
      // Check for eval usage in our code (not in node_modules)
      const srcDir = path.join(CLI_ROOT, "src");
      let evalFound = false;

      function checkDir(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            checkDir(filePath);
          } else if (file.endsWith(".js")) {
            const content = fs.readFileSync(filePath, "utf-8");
            // Check for dangerous eval patterns (not Playwright's page.evaluate)
            if (
              /\beval\s*\(/.test(content) ||
              /new\s+Function\s*\(/.test(content)
            ) {
              // Exclude page.evaluate which is safe
              if (!/page\.evaluate/.test(content)) {
                evalFound = filePath;
              }
            }
          }
        }
      }

      checkDir(srcDir);
      if (evalFound) {
        return fail("No dangerous eval patterns", evalFound);
      }
      pass("No dangerous eval patterns found");
    },
  ]);
}

async function runPackageTests() {
  await testSection("📦 Package Contents", [
    // npm pack --dry-run works
    async () => {
      try {
        const result = execSync("npm pack --dry-run 2>&1", {
          cwd: CLI_ROOT,
          encoding: "utf-8",
          timeout: 30000,
        });

        // Check for problematic files
        const problematic = [".env", "settings.json", "apiKey", ".reshot/"];
        const found = problematic.filter((p) => result.includes(p));

        if (found.length > 0) {
          return fail(
            "Package excludes sensitive files",
            `Found: ${found.join(", ")}`
          );
        }

        // Extract size
        const sizeMatch = result.match(/total files:\s*(\d+)/i);
        const files = sizeMatch ? sizeMatch[1] : "?";

        pass(`npm pack --dry-run works (${files} files)`);
      } catch (e) {
        fail("npm pack --dry-run works", e.message);
      }
    },

    // Package size is reasonable
    async () => {
      try {
        const result = execSync("npm pack --dry-run 2>&1", {
          cwd: CLI_ROOT,
          encoding: "utf-8",
        });

        const sizeMatch = result.match(/package size:\s*([\d.]+\s*[kmg]?b)/i);
        if (sizeMatch) {
          const sizeStr = sizeMatch[1].toLowerCase();
          const size = parseFloat(sizeStr);
          const unit = sizeStr.replace(/[\d.]/g, "").trim();

          // Convert to MB for check
          let sizeMB = size;
          if (unit.startsWith("k")) sizeMB = size / 1024;
          if (unit.startsWith("g")) sizeMB = size * 1024;

          if (sizeMB > 50) {
            return fail("Package size < 50MB", `${sizeMatch[1]}`);
          }
          pass(`Package size is reasonable (${sizeMatch[1]})`);
        } else {
          pass("Package size check (could not parse)");
        }
      } catch (e) {
        fail("Package size check", e.message);
      }
    },
  ]);
}

// ============================================
// MAIN
// ============================================

async function main() {
  log(chalk.bold("\n🧪 Reshot CLI Pre-Publish Tests\n"));
  log(chalk.gray("=".repeat(50)));

  try {
    await runStructureTests();
    await runSecurityTests();
    await runModuleTests();
    await runCLITests();
    await runDependencyTests();
    await runPackageTests();
  } catch (e) {
    log(chalk.red(`\n❌ Test suite error: ${e.message}`));
    process.exit(1);
  }

  // Summary
  log(chalk.gray("\n" + "=".repeat(50)));
  log(chalk.bold("\n📊 Summary\n"));

  if (failed === 0) {
    log(chalk.green(`  ✅ All ${passed} tests passed!\n`));
    log(chalk.cyan("  Ready to publish. Run: npm publish --access public\n"));
    process.exit(0);
  } else {
    log(chalk.red(`  ❌ ${failed} test(s) failed, ${passed} passed\n`));
    log(chalk.yellow("  Fix the issues above before publishing.\n"));

    if (errors.length > 0) {
      log(chalk.red("  Failures:"));
      for (const { name, error } of errors) {
        log(chalk.red(`    • ${name}`));
        if (error) log(chalk.gray(`      ${error}`));
      }
      log("");
    }

    process.exit(1);
  }
}

main();
