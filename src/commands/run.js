// run.js - Execute all scenarios from config using the robust capture engine
const axios = require("axios");
const chalk = require("chalk");
const fs = require("fs-extra");
const path = require("path");
const config = require("../lib/config");
const {
  runAllScenarios,
  generateVersionTimestamp,
  detectOptimalConcurrency,
  resolveAuthPreflightTargets,
} = require("../lib/capture-script-runner");
const { getBaselines } = require("../lib/api-client");
const {
  downloadBaselines,
  compareImages,
  writeManifest,
  compareWithPreviousVersion,
  compareWithCloudBaselines,
  writeLocalDiffManifest,
  CACHE_DIR,
} = require("../lib/diff-engine");
const {
  checkCdpEndpoint,
  getDefaultSessionPath,
  assessSessionHealth,
} = require("../lib/record-cdp");
const { writeRunManifest, normalizeScenarioResults } = require("../lib/run-manifest");

/**
 * Generate all variant combinations from dimensions config
 * @param {Object} dimensions - Dimensions configuration
 * @param {string[]} dimensionKeys - Which dimensions to expand (default: all)
 * @returns {Object[]} Array of variant objects
 */
function generateVariantCombinations(dimensions, dimensionKeys = null) {
  if (!dimensions || Object.keys(dimensions).length === 0) {
    return [];
  }

  // Use provided dimension keys or all available
  const keysToUse = dimensionKeys || Object.keys(dimensions);
  
  // Filter to only dimensions that have options
  const validKeys = keysToUse.filter(key => {
    const dim = dimensions[key];
    return dim?.options && Object.keys(dim.options).length > 0;
  });

  if (validKeys.length === 0) {
    return [];
  }

  // Get options for each dimension
  const dimensionOptions = validKeys.map((key) => {
    const dim = dimensions[key];
    return Object.keys(dim.options).map((optKey) => ({
      dimension: key,
      option: optKey,
    }));
  });

  // Generate cartesian product of all dimension options
  const cartesian = (...arrays) => {
    return arrays.reduce(
      (acc, arr) => acc.flatMap((combo) => arr.map((item) => [...combo, item])),
      [[]]
    );
  };

  const combinations = cartesian(...dimensionOptions);

  // Convert to variant objects
  return combinations.map((combo) => {
    const variant = {};
    for (const { dimension, option } of combo) {
      variant[dimension] = option;
    }
    return variant;
  });
}

async function probeBaseUrl(baseUrl) {
  if (!baseUrl) {
    return {
      ok: false,
      status: null,
      message: "baseUrl is not configured.",
    };
  }

  try {
    const response = await axios.get(baseUrl, {
      timeout: 8000,
      maxRedirects: 0,
      validateStatus: () => true,
    });

    if (response.status >= 500) {
      return {
        ok: false,
        status: response.status,
        message: `baseUrl responded with ${response.status}. Fix the app before running capture.`,
      };
    }

    return {
      ok: true,
      status: response.status,
      message: `baseUrl responded with ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      message:
        `Could not reach baseUrl ${baseUrl}. ` +
        `Make sure the app is running and reachable before capture. (${error.message})`,
    };
  }
}

function formatSessionAge(minutes) {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.round(hours / 24)}d`;
}

function writeRunPreflightReport(report) {
  const diagnosticsPath = path.join(
    process.cwd(),
    ".reshot",
    "diagnostics",
    "run-preflight.json",
  );

  try {
    fs.ensureDirSync(path.dirname(diagnosticsPath));
    fs.writeJsonSync(diagnosticsPath, report, { spaces: 2 });
  } catch (error) {
    report.diagnosticsWriteError = error.message;
  }

  return diagnosticsPath;
}

async function buildRunPreflightReport(docSyncConfig, options = {}) {
  const { scenarioKeys = null } = options;
  const validation = config.validateConfig({
    scenarioKeys,
    requireReadyContract: docSyncConfig.target?.tier === "certified",
  });
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];
  const report = {
    generatedAt: new Date().toISOString(),
    ok: false,
    baseUrl: docSyncConfig.baseUrl || null,
    selectedScenarioKeys: validation.details?.selectedScenarioKeys || [],
    configValidation: validation,
    checks: [],
    auth: {
      required: Boolean(validation.details?.liveAuthScenarioCount),
      sessionPath: null,
      hasCachedSession: false,
      sessionAgeMinutes: null,
      sessionCompatible: null,
      sessionSourceOrigin: null,
      sessionStale: null,
      preflightTargets: [],
      cdpAvailable: null,
    },
    errors,
    warnings,
  };

  if (validation.details?.baseUrl) {
    const baseUrlCheck = await probeBaseUrl(validation.details.baseUrl);
    report.checks.push({ name: "baseUrl", ...baseUrlCheck });
    if (!baseUrlCheck.ok) {
      errors.push(baseUrlCheck.message);
    }
  }

  if (report.auth.required) {
    report.auth.preflightTargets = resolveAuthPreflightTargets(docSyncConfig, {
      scenarioKeys,
    }).targets;
    const sessionPath = getDefaultSessionPath();
    report.auth.sessionPath = sessionPath;
    report.auth.hasCachedSession = fs.existsSync(sessionPath);

    if (report.auth.hasCachedSession) {
      const sessionHealth = assessSessionHealth(
        sessionPath,
        validation.details?.baseUrl || docSyncConfig.baseUrl || null,
      );
      report.auth.sessionAgeMinutes = sessionHealth.ageMinutes;
      report.auth.sessionCompatible = sessionHealth.compatible;
      report.auth.sessionSourceOrigin = sessionHealth.evidence.sourceOrigin;
      report.auth.sessionStale = sessionHealth.stale;
      report.checks.push({
        name: "authSession",
        ok: sessionHealth.compatible,
        status: sessionHealth.stale ? "stale" : "ready",
        message: sessionHealth.compatible
          ? sessionHealth.evidence.sourceOrigin
            ? `Cached auth session matches ${sessionHealth.evidence.sourceOrigin}`
            : "Cached auth session is present"
          : sessionHealth.issues[0],
      });

      warnings.push(...sessionHealth.warnings);

      if (!sessionHealth.compatible) {
        const cdpCheck = await checkCdpEndpoint();
        report.auth.cdpAvailable = cdpCheck.available;
        report.checks.push({
          name: "cdp",
          ok: cdpCheck.available,
          status: null,
          message: cdpCheck.available
            ? "Chrome CDP endpoint is available and can refresh the cached session."
            : `Chrome CDP endpoint is unavailable: ${cdpCheck.error}`,
        });

        if (cdpCheck.available) {
          warnings.push(
            `Cached auth session does not match ${validation.details?.baseUrl || docSyncConfig.baseUrl}. Chrome CDP is available, so Reshot will try to refresh it from the live browser before capture.`,
          );
        } else {
          errors.push(sessionHealth.issues[0]);
          errors.push(
            "Chrome CDP is unavailable, so Reshot cannot automatically replace the mismatched auth session.",
          );
        }
      }

      if (sessionHealth.stale) {
        warnings.push(
          `Cached auth session is ${formatSessionAge(sessionHealth.ageMinutes)} old. ` +
            `Refresh it with 'reshot record --refresh-session' if captures start redirecting to login.`,
        );
      }
    } else {
      const cdpCheck = await checkCdpEndpoint();
      report.auth.cdpAvailable = cdpCheck.available;
      report.checks.push({
        name: "cdp",
        ok: cdpCheck.available,
        status: null,
        message: cdpCheck.available
          ? "Chrome CDP endpoint is available for live session sync."
          : `Chrome CDP endpoint is unavailable: ${cdpCheck.error}`,
      });

      if (!cdpCheck.available) {
        errors.push(
          "Authenticated scenarios need either a cached .reshot session or a Chrome browser running with remote debugging enabled.",
        );
      }
    }
  }

  report.ok = errors.length === 0;
  report.diagnosticsPath = writeRunPreflightReport(report);
  return report;
}

function printRunPreflightReport(report) {
  console.log(chalk.cyan("🧪 Run Preflight\n"));

  for (const check of report.checks) {
    const prefix = check.ok ? chalk.green("  ✔") : chalk.red("  ✖");
    const statusSuffix = check.status ? ` (${check.status})` : "";
    console.log(`${prefix} ${check.name}${statusSuffix}: ${check.message}`);
  }

  for (const warning of report.warnings) {
    console.log(chalk.yellow(`  ⚠ ${warning}`));
  }

  for (const error of report.errors) {
    console.log(chalk.red(`  ✖ ${error}`));
  }

  if (report.diagnosticsPath) {
    console.log(chalk.gray(`\n  Diagnostics: ${report.diagnosticsPath}`));
  }

  console.log();
}

/**
 * Run scenarios from config
 * @param {Object} options - Run options
 * @param {string[]} options.scenarioKeys - Filter to specific scenario keys (optional)
 * @param {boolean} options.headless - Run in headless mode (default: true)
 * @param {Object} options.variant - Override variant for all scenarios (e.g., { locale: 'ko', role: 'admin' })
 * @param {boolean} options.allVariants - Run all configured variant combinations
 * @param {boolean} options.noVariants - Skip variant expansion entirely
 * @param {string} options.format - Override output format: 'step-by-step-images' | 'summary-video'
 * @param {boolean} options.diff - Enable baseline diffing (default: use config)
 * @param {boolean} options.cloud - Enable cloud baseline sync (default: false, use local)
 * @param {number} options.concurrency - Number of parallel browser workers (optional)
 */
async function runCommand(options = {}) {
  const {
    scenarioKeys,
    headless = true,
    variant,
    allVariants = false,
    noVariants = false,
    noPrivacy = false,
    noStyle = false,
    format,
    diff,
    cloud = false,
    concurrency,
    noExit = false,
  } = options;

  const docSyncConfig = config.readConfig();
  const diffingConfig = config.getDiffingConfig();

  // Check feature toggles
  const features = docSyncConfig._metadata?.features || { visuals: true };
  if (features.visuals !== true) {
    console.log(
      chalk.yellow(
        "⚠ Visual generation is disabled for this project. Skipping scenario execution."
      )
    );
    return;
  }

  const preflightReport = await buildRunPreflightReport(docSyncConfig, {
    scenarioKeys,
  });
  printRunPreflightReport(preflightReport);

  if (!preflightReport.ok) {
    writeRunManifest({
      success: false,
      selectedScenarioKeys: preflightReport.selectedScenarioKeys || scenarioKeys || [],
      outputBaseDir: path.join(
        process.cwd(),
        docSyncConfig.assetDir || ".reshot/output",
      ),
      scenarios: [],
      preflight: preflightReport,
      diffEnabled: false,
    });
    process.exitCode = 1;
    if (!noExit) {
      setImmediate(() => process.exit(process.exitCode || 1));
    }
    return { success: false, results: [], preflight: preflightReport };
  }

  // Determine if diffing is enabled
  // CLI flag takes precedence, then config, default is TRUE (always diff locally)
  const shouldDiff =
    diff !== undefined ? diff : diffingConfig.enabled !== false;

  // Parse variant if passed as JSON string
  let variantOverride = variant;
  if (typeof variant === "string") {
    try {
      variantOverride = JSON.parse(variant);
    } catch (e) {
      console.error(chalk.red(`Invalid variant JSON: ${variant}`));
      process.exitCode = 1;
      return;
    }
  }

  // If format is specified, override scenarios' output format
  let configToUse = docSyncConfig;
  if (format) {
    console.log(chalk.cyan(`📷 Using capture format: ${format}\n`));
    configToUse = {
      ...docSyncConfig,
      scenarios: (docSyncConfig.scenarios || []).map((scenario) => ({
        ...scenario,
        output: {
          ...scenario.output,
          format,
        },
      })),
    };
  }

  // Determine concurrency: CLI flag > config > auto-detect
  const autoConcurrency = detectOptimalConcurrency();
  const effectiveConcurrency = concurrency || docSyncConfig.concurrency || autoConcurrency;
  if (!concurrency && !docSyncConfig.concurrency) {
    console.log(chalk.gray(`  Auto-detected concurrency: ${effectiveConcurrency} (${require("os").cpus().length} CPUs, ${Math.round(require("os").freemem() / 1024 / 1024)}MB free)\n`));
  }

  // ============================================
  // VARIANT EXPANSION: Run all variant combinations if configured
  // ============================================
  const variantsConfig = docSyncConfig.variants || {};
  const dimensions = variantsConfig.dimensions || {};
  const hasVariants = Object.keys(dimensions).length > 0;

  // Determine if we should expand variants:
  // - If specific variant is provided: use it only
  // - If --no-variants: skip expansion, run without variants
  // - If --all-variants or variants are configured: expand all combinations
  const shouldExpandVariants = !noVariants && !variantOverride && hasVariants;

  const outputBaseDir = path.join(
    process.cwd(),
    docSyncConfig.assetDir || ".reshot/output"
  );

  function persistRunManifest(success, scenarios) {
    return writeRunManifest({
      success,
      selectedScenarioKeys:
        preflightReport.selectedScenarioKeys || scenarioKeys || [],
      outputBaseDir,
      scenarios: normalizeScenarioResults(scenarios),
      preflight: preflightReport,
      diffEnabled: shouldDiff,
    });
  }

  if (shouldExpandVariants) {
    const combinations = generateVariantCombinations(dimensions);
    
    if (combinations.length > 0) {
      console.log(chalk.cyan(`🎨 Expanding ${combinations.length} variant combination(s):\n`));
      
      // Show variant combinations
      for (const combo of combinations) {
        const label = Object.entries(combo)
          .map(([dim, opt]) => {
            const dimension = dimensions[dim];
            const option = dimension?.options?.[opt];
            return option?.name || opt;
          })
          .join(' • ');
        console.log(chalk.gray(`   → ${label}`));
      }
      console.log();

      // Generate a shared timestamp for all variant runs
      const sharedTimestamp = generateVersionTimestamp();
      console.log(chalk.gray(`📁 Shared timestamp: ${sharedTimestamp}\n`));

      // Run scenarios for each variant combination
      const allResults = [];
      let allSuccess = true;

      for (const variantCombo of combinations) {
        const variantLabel = Object.entries(variantCombo)
          .map(([dim, opt]) => {
            const dimension = dimensions[dim];
            const option = dimension?.options?.[opt];
            return option?.name || opt;
          })
          .join(' • ');
        
        console.log(chalk.cyan(`\n━━━ Variant: ${variantLabel} ━━━\n`));

        const result = await runAllScenarios(configToUse, {
          scenarioKeys,
          headless,
          variantOverride: variantCombo,
          concurrency: effectiveConcurrency,
          sharedTimestamp,
          noPrivacy,
          noStyle,
        });

        allResults.push({ variant: variantCombo, ...result });
        if (!result.success) {
          allSuccess = false;
        }
      }

      // Summary
      console.log(chalk.cyan(`\n━━━ Variant Capture Summary ━━━\n`));
      for (const result of allResults) {
        const variantLabel = Object.entries(result.variant)
          .map(([dim, opt]) => {
            const dimension = dimensions[dim];
            const option = dimension?.options?.[opt];
            return option?.name || opt;
          })
          .join(' • ');
        const statusIcon = result.success ? '✔' : '✖';
        const statusColor = result.success ? chalk.green : chalk.red;
        const assetCount = result.results?.reduce((sum, r) => sum + (r.assets?.length || 0), 0) || 0;
        console.log(statusColor(`  ${statusIcon} ${variantLabel}: ${assetCount} assets`));
      }

      if (!allSuccess) {
        process.exitCode = 1;
      }

      const flattenedScenarioResults = allResults.flatMap(
        (runResult) => runResult.results || [],
      );
      const persisted = persistRunManifest(allSuccess, flattenedScenarioResults);
      console.log(chalk.gray(`\nRun manifest saved to: ${persisted.manifestPath}`));

      // Exit after variant expansion completes unless called programmatically
      if (!noExit) {
        process.exit(allSuccess ? 0 : 1);
      }
      return { success: allSuccess, results: allResults, runManifest: persisted.manifest };
    }
  }

  // Single variant or no variants - use original logic
  const result = await runAllScenarios(configToUse, {
    scenarioKeys,
    headless,
    variantOverride,
    concurrency: effectiveConcurrency,
    noPrivacy,
    noStyle,
  });

  // ============================================
  // POST-PROCESSING: Local Version-to-Version Diffing
  // ============================================
  // ============================================
  // CLOUD BASELINE SYNC: Download approved baselines from platform
  // ============================================
  let cloudBaselines = null;
  if (cloud && shouldDiff) {
    console.log(chalk.cyan("\n☁️  Syncing cloud baselines...\n"));

    try {
      const settings = config.readSettings();
      const projectId =
        settings?.projectId || docSyncConfig._metadata?.projectId;
      const apiKey = process.env.RESHOT_API_KEY || settings?.apiKey;

      if (projectId && apiKey) {
        const baselineUrls = await getBaselines(projectId, apiKey);
        const baselineCount = Object.keys(baselineUrls).length;

        if (baselineCount > 0) {
          console.log(
            chalk.gray(`  Found ${baselineCount} approved baseline(s) in cloud`)
          );
          cloudBaselines = await downloadBaselines(baselineUrls);
          console.log(
            chalk.green(
              `  ✔ Downloaded ${
                Object.keys(cloudBaselines).length
              } baseline(s)\n`
            )
          );
        } else {
          console.log(
            chalk.gray(
              "  No approved baselines found in cloud (first publish?)\n"
            )
          );
        }
      } else {
        console.log(
          chalk.yellow(
            "  ⚠ Cloud sync requires authentication. Run 'reshot auth' first.\n"
          )
        );
      }
    } catch (error) {
      console.log(
        chalk.yellow(`  ⚠ Cloud baseline sync failed: ${error.message}`)
      );
      console.log(
        chalk.gray("    Falling back to local version-to-version diffing.\n")
      );
    }
  }

  if (shouldDiff && result.results) {
    const diffMode = cloudBaselines
      ? "cloud baselines"
      : "previous local versions";
    console.log(
      chalk.cyan(`\n🔍 Computing visual diffs against ${diffMode}...\n`)
    );

    let totalScenarios = 0;
    let totalDiffs = 0;
    let totalCompared = 0;
    let totalNew = 0;

    for (const scenarioResult of result.results) {
      if (!scenarioResult.success) continue;

      const scenarioKey = scenarioResult.key;
      const currentTimestamp = scenarioResult.timestamp;
      const currentOutputDir = scenarioResult.outputDir; // Full path including variant

      if (!currentTimestamp || !currentOutputDir) {
        console.log(
          chalk.gray(
            `  → ${scenarioKey}: No timestamp/outputDir found, skipping diff`
          )
        );
        continue;
      }

      totalScenarios++;
      console.log(chalk.white(`  📁 ${scenarioKey}:`));

      let diffData;

      if (cloudBaselines && Object.keys(cloudBaselines).length > 0) {
        // Use cloud baselines for comparison
        diffData = await compareWithCloudBaselines(
          currentOutputDir,
          scenarioKey,
          cloudBaselines,
          diffingConfig
        );
        console.log(chalk.gray(`     ↳ Comparing against cloud baselines`));
      } else {
        // Fall back to local version-to-version comparison
        diffData = await compareWithPreviousVersion(
          outputBaseDir,
          scenarioKey,
          currentTimestamp,
          diffingConfig
        );

        if (!diffData.previousVersion) {
          console.log(
            chalk.gray(`     ↳ First version - no previous version to compare`)
          );
          console.log(
            chalk.gray(
              `       (Diff percentages will appear after your next run)\n`
            )
          );
          continue;
        }

        console.log(
          chalk.gray(`     ↳ Comparing against ${diffData.previousVersion}`)
        );
      }

      // Log individual results
      for (const [assetKey, assetResult] of Object.entries(diffData.results)) {
        if (assetResult.status === "new") {
          console.log(chalk.blue(`     ✚ New: ${assetKey}`));
          totalNew++;
        } else if (assetResult.hasDiff) {
          const percentage = (assetResult.score * 100).toFixed(2);
          const reason = assetResult.reason ? ` (${assetResult.reason})` : "";
          console.log(
            chalk.yellow(
              `     ⚠ Changed: ${assetKey} - ${percentage}%${reason}`
            )
          );
          totalDiffs++;
        } else {
          console.log(chalk.green(`     ✔ Unchanged: ${assetKey}`));
        }
        totalCompared++;
      }

      // Write diff manifest to the ACTUAL output directory (includes variant)
      await writeLocalDiffManifest(currentOutputDir, diffData);

      console.log(""); // Blank line between scenarios
    }

    // Summary
    console.log(chalk.cyan("📊 Diff Summary:"));
    console.log(chalk.white(`   Scenarios: ${totalScenarios}`));
    console.log(chalk.white(`   Assets compared: ${totalCompared}`));
    if (totalNew > 0) {
      console.log(chalk.blue(`   New assets: ${totalNew}`));
    }
    if (totalDiffs > 0) {
      console.log(chalk.yellow(`   Changed: ${totalDiffs}`));
    }
    console.log(
      chalk.green(`   Unchanged: ${totalCompared - totalDiffs - totalNew}`)
    );
    console.log("");

    // Helpful guidance about diff percentages
    if (totalNew > 0 && totalCompared === totalNew) {
      console.log(
        chalk.gray(
          "💡 Tip: All assets are new (first capture). Diff percentages will"
        )
      );
      console.log(
        chalk.gray(
          "   appear in the platform after your next run & publish cycle."
        )
      );
      console.log("");
    } else if (totalDiffs > 0) {
      console.log(
        chalk.gray(
          "💡 Tip: Changed assets will show diff percentages in the platform"
        )
      );
      console.log(chalk.gray("   after you run 'reshot publish'."));
      console.log("");
    }
  }

  if (!result.success) {
    const failed = result.results.filter((r) => !r.success);
    console.error(chalk.red(`\n❌ ${failed.length} scenario(s) failed`));
    process.exitCode = 1;
  } else {
    console.log(chalk.green("\n✨ All scenarios completed successfully!"));
  }

  console.log(chalk.gray(`\nOutput saved to: ${outputBaseDir}`));
  const persisted = persistRunManifest(result.success, result.results || []);
  console.log(chalk.gray(`Run manifest saved to: ${persisted.manifestPath}`));

  // Offer to open Studio for review (interactive TTY only, on success)
  if (result.success && process.stdin.isTTY && !noExit) {
    const inquirer = require("inquirer");
    const { openStudio } = await inquirer.prompt([
      {
        type: "confirm",
        name: "openStudio",
        message: "Open Reshot Studio to review captures?",
        default: true,
      },
    ]);

    if (openStudio) {
      console.log(chalk.cyan("\n🎬 Launching Reshot Studio...\n"));
      const uiCommand = require("./ui");
      await uiCommand({ open: true });
      return {
        success: result.success,
        results: result.results,
        runManifest: persisted.manifest,
      };
    }
  }

  // Ensure process exits cleanly (Playwright CDP connections can keep event loop alive)
  if (!noExit) {
    setImmediate(() => process.exit(process.exitCode || 0));
  }

  return {
    success: result.success,
    results: result.results,
    runManifest: persisted.manifest,
  };
}

module.exports = runCommand;
module.exports.buildRunPreflightReport = buildRunPreflightReport;
module.exports.probeBaseUrl = probeBaseUrl;
