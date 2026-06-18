// sync.js - Upload Playwright traces to Reshot platform

const chalk = require("chalk");
const crypto = require("crypto");
const fs = require("fs-extra");
const path = require("path");
const { execSync } = require("child_process");
const config = require("../lib/config");
const apiClient = require("../lib/api-client");
const pkg = require("../../package.json");

// File extension allowlists
const TRACE_EXTENSIONS = [".zip"];
const MAX_TRACE_SIZE = 100 * 1024 * 1024; // 100MB per trace

/**
 * Extract journey key from Playwright test-results directory name
 * Playwright creates directories like: "test-name-chromium" or "describe-test-name-chromium"
 * Playwright truncates names and adds hashes (e.g., "s-83f3d-" instead of "should-")
 * We do fuzzy matching against configured journey mappings
 */
function extractJourneyKey(dirName, journeyMappings = {}) {
  // Remove browser suffix (chromium, firefox, webkit, etc.)
  const browserSuffixes = [
    "-chromium",
    "-firefox",
    "-webkit",
    "-chromium-light",
    "-chromium-dark",
  ];
  let cleanName = dirName;

  for (const suffix of browserSuffixes) {
    if (cleanName.endsWith(suffix)) {
      cleanName = cleanName.slice(0, -suffix.length);
      break;
    }
  }

  // Normalize: lowercase, remove file number prefix, expand truncated patterns
  let normalized = cleanName.toLowerCase();

  // Remove leading file number like "01-"
  normalized = normalized.replace(/^\d+-/, "");

  // Remove hash segments (patterns like "-s-83f3d-" or "-9a1be-")
  // These are Playwright's truncation hashes
  normalized = normalized.replace(/-[a-z0-9]{5,6}-/g, "-");

  // Common Playwright truncations
  normalized = normalized.replace(/-s-/g, "-should-");

  // Extract key parts for matching
  const normalizedParts = normalized.split("-").filter((p) => p.length > 0);

  // Check against configured journey mappings
  for (const [pattern, journeyKey] of Object.entries(journeyMappings)) {
    const patternParts = pattern.toLowerCase().split("-");

    // Check if the normalized name contains significant parts of the pattern
    // At least 3 consecutive words matching
    for (let i = 0; i <= normalizedParts.length - 3; i++) {
      const slice = normalizedParts.slice(i, i + 4).join("-");
      for (let j = 0; j <= patternParts.length - 3; j++) {
        const patternSlice = patternParts.slice(j, j + 4).join("-");
        if (
          slice === patternSlice ||
          slice.includes(patternSlice) ||
          patternSlice.includes(slice)
        ) {
          return journeyKey;
        }
      }
    }

    // Check if the key parts of the test name appear in both
    const meaningfulFromPattern = patternParts.filter((p) => p.length >= 4);
    const meaningfulFromDir = normalizedParts.filter((p) => p.length >= 4);

    const matchingWords = meaningfulFromPattern.filter((word) =>
      meaningfulFromDir.some(
        (dirWord) => dirWord.includes(word) || word.includes(dirWord),
      ),
    );

    // If >50% of meaningful words match, use this journey
    if (
      matchingWords.length >= Math.ceil(meaningfulFromPattern.length * 0.5) &&
      matchingWords.length >= 2
    ) {
      return journeyKey;
    }
  }

  // Fall back to deriving a journey key from the directory name
  const parts = normalized.split("-").filter((p) => p.length > 0);

  if (parts.length > 2) {
    // Look for "should" to find the test name boundary
    const shouldIndex = parts.findIndex((p) => p === "should");
    if (shouldIndex > 0) {
      const prefix = parts.slice(0, shouldIndex).join("-");
      const suffix = parts.slice(shouldIndex + 1).join("-");
      return `${prefix}/${suffix}`;
    }

    // Otherwise split into prefix/suffix
    const prefix = parts.slice(0, 2).join("-");
    const suffix = parts.slice(2).join("-");
    return `${prefix}/${suffix}`;
  }

  return parts.join("-");
}

/**
 * Discover Playwright trace files
 */
async function discoverTraces(traceDir, journeyMappings = {}) {
  const traces = [];

  if (!fs.existsSync(traceDir)) {
    return traces;
  }

  function walkDir(dir) {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else {
        const ext = path.extname(item).toLowerCase();
        if (TRACE_EXTENSIONS.includes(ext) && item.includes("trace")) {
          const fileSize = stat.size;

          if (fileSize > MAX_TRACE_SIZE) {
            console.log(
              chalk.yellow(`  ⚠ Skipping ${item}: exceeds size limit`),
            );
            continue;
          }

          // Extract journey key from parent directory name
          const relativePath = path.relative(traceDir, fullPath);
          const parts = relativePath.split(path.sep);
          const parentDir =
            parts.length > 1 ? parts[0] : path.basename(item, ".zip");
          const journeyKey = extractJourneyKey(parentDir, journeyMappings);

          // Read file and compute hash synchronously
          const fileContent = fs.readFileSync(fullPath);
          const contentHash = crypto
            .createHash("sha256")
            .update(fileContent)
            .digest("hex");

          traces.push({
            path: fullPath,
            filename: path.basename(fullPath),
            relativePath,
            journeyKey,
            parentDir,
            contentHash,
            size: fileSize,
          });
        }
      }
    }
  }

  walkDir(traceDir);
  return traces;
}

/**
 * Get git metadata for the current repository
 */
function getGitMetadata() {
  try {
    const commitHash = execSync("git rev-parse HEAD", {
      encoding: "utf8",
    }).trim();
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
    }).trim();
    const commitMessage = execSync("git log -1 --pretty=%B", {
      encoding: "utf8",
    }).trim();

    return { commitHash, branch, commitMessage };
  } catch (error) {
    return { commitHash: "unknown", branch: "unknown", commitMessage: "" };
  }
}

/**
 * Main sync command
 * @param {Object} options - Command options
 * @param {string} options.traceDir - Override trace directory
 * @param {boolean} options.dryRun - Preview without uploading
 * @param {boolean} options.verbose - Show detailed output
 */
async function syncCommand(options = {}) {
  const {
    traceDir: traceDirOverride,
    dryRun = false,
    verbose = false,
  } = options;

  console.log(chalk.cyan.bold("\n🔄 Reshot Sync\n"));

  // Load configuration
  let reshotConfig;
  try {
    reshotConfig = config.readConfigLenient();
  } catch (error) {
    console.error(chalk.red("✖ No reshot.config.json found."));
    console.log(
      chalk.gray("  Run"),
      chalk.cyan("reshot setup"),
      chalk.gray("to initialize.\n"),
    );
    process.exit(1);
  }

  // Load settings for API access
  let settings;
  try {
    settings = config.readSettings();
  } catch {
    settings = null;
  }

  const projectId = reshotConfig.projectId || settings?.projectId;
  const apiKey = settings?.apiKey;

  if (!projectId || !apiKey) {
    console.error(chalk.red("✖ Not authenticated with Reshot Cloud."));
    console.log(
      chalk.gray("  Run"),
      chalk.cyan("reshot setup"),
      chalk.gray("to connect.\n"),
    );
    process.exit(1);
  }

  const projectRoot = process.cwd();

  if (dryRun) {
    console.log(chalk.yellow("DRY RUN - No files will be uploaded\n"));
  }

  // ========================================
  // PHASE 1: Discover Traces
  // ========================================
  const traceDir =
    traceDirOverride || reshotConfig.visuals?.traceDir || "./test-results";
  const resolvedTraceDir = path.resolve(projectRoot, traceDir);
  const journeyMappings = reshotConfig.visuals?.journeyMappings || {};

  console.log(chalk.gray(`Scanning traces: ${traceDir}`));
  const traceFiles = await discoverTraces(resolvedTraceDir, journeyMappings);

  if (traceFiles.length === 0) {
    console.log(chalk.yellow("  No trace files found"));
    if (!fs.existsSync(resolvedTraceDir)) {
      console.log(
        chalk.gray("  Run your Playwright tests first: npx playwright test"),
      );
    }
    console.log();
  } else {
    console.log(chalk.green(`  Found ${traceFiles.length} trace file(s)`));
    if (verbose) {
      for (const trace of traceFiles) {
        console.log(
          chalk.gray(`    → ${trace.parentDir || trace.relativePath}`),
        );
        console.log(chalk.gray(`      journey: ${trace.journeyKey}`));
      }
    }
    console.log();
  }

  // ========================================
  // PHASE 2: Upload to Platform
  // ========================================
  if (dryRun) {
    console.log(chalk.cyan("━━━ Dry Run Summary ━━━\n"));
    console.log(chalk.gray(`  Traces: ${traceFiles.length} files`));
    console.log(chalk.yellow("\nNo files uploaded (dry run).\n"));
    return;
  }

  if (traceFiles.length === 0) {
    console.log(chalk.yellow("Nothing to sync.\n"));
    return;
  }

  console.log(chalk.cyan("━━━ Uploading ━━━\n"));

  try {
    // Initialize sync job with manifest
    const manifest = {
      traces: traceFiles.map((t) => ({
        filename: t.filename,
        journeyKey: t.journeyKey,
        contentHash: t.contentHash,
        size: t.size,
      })),
    };

    const initResponse = await apiClient.post(
      "/v1/ingest/init",
      {
        projectId,
        manifest,
      },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    );

    const presignedUrls = initResponse.presignedUrls || {};
    const skippedFiles = initResponse.skippedFiles || [];

    if (verbose) {
      console.log(chalk.gray(`  Manifest acknowledged`));
      console.log(
        chalk.gray(`  Presigned URLs: ${Object.keys(presignedUrls).length}`),
      );
      console.log(chalk.gray(`  Skipped files: ${skippedFiles.length}`));
      if (skippedFiles.length > 0) {
        console.log(
          chalk.gray(`  ${skippedFiles.length} file(s) unchanged (cached)`),
        );
      }
    }

    // Upload traces to presigned URLs
    let tracesUploaded = 0;
    for (const trace of traceFiles) {
      if (skippedFiles.includes(trace.contentHash)) {
        if (verbose) {
          console.log(chalk.gray(`    ⊘ ${trace.journeyKey} (cached)`));
        }
        tracesUploaded++;
        continue;
      }

      const presigned = presignedUrls[trace.contentHash];
      if (presigned) {
        if (verbose) {
          console.log(chalk.gray(`    → uploading to: ${presigned.url}`));
        }
        const content = fs.readFileSync(trace.path);
        await apiClient.uploadToPresignedUrl(presigned.url, content, {
          contentType: presigned.contentType || "application/zip",
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        tracesUploaded++;
        if (verbose) {
          console.log(chalk.gray(`    ✔ ${trace.journeyKey}`));
        }
      }
    }

    // Get git metadata
    const git = getGitMetadata();

    // Commit the sync job
    await apiClient.post(
      "/v1/ingest/commit",
      {
        projectId,
        uploadResults: {
          traces: traceFiles.map((t) => ({
            filename: t.filename,
            journeyKey: t.journeyKey,
            storageKey:
              presignedUrls[t.contentHash]?.storageKey || t.contentHash,
          })),
        },
        git,
        cli: {
          version: pkg.version,
          timestamp: new Date().toISOString(),
        },
      },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    );

    console.log(chalk.green(`\n✔ Sync complete!`));
    console.log(chalk.gray(`  Traces: ${tracesUploaded} uploaded`));
    console.log();
    console.log(chalk.gray("  View status:"), chalk.cyan("reshot status"));
    console.log(chalk.gray("  Check drifts:"), chalk.cyan("reshot drifts\n"));
  } catch (error) {
    console.error(chalk.red("\n✖ Sync failed:"), error.message);
    if (verbose && error.stack) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

module.exports = syncCommand;
