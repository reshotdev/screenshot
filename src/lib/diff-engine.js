// diff-engine.js - Client-side visual diffing engine
const fs = require("fs-extra");
const path = require("path");
const { PNG } = require("pngjs");
const pixelmatch = require("pixelmatch");
const axios = require("axios");
const chalk = require("chalk");

const CACHE_DIR = path.join(process.cwd(), ".reshot", "cache", "baselines");

/**
 * Ensure the cache directory exists
 */
function ensureCacheDir() {
  fs.ensureDirSync(CACHE_DIR);
}

/**
 * Download baseline image from CDN
 * @param {string} url - CDN URL
 * @param {string} savePath - Local path to save
 * @returns {Promise<string>} Path to downloaded file
 */
async function downloadBaseline(url, savePath) {
  try {
    fs.ensureDirSync(path.dirname(savePath));
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 30000,
    });
    await fs.writeFile(savePath, response.data);
    return savePath;
  } catch (error) {
    throw new Error(
      `Failed to download baseline from ${url}: ${error.message}`
    );
  }
}

/**
 * Download multiple baselines in parallel with offline fallback
 * When downloads fail, falls back to cached versions if available
 * @param {Object} baselines - Map of keys to URLs
 * @returns {Promise<Object>} Map of keys to local paths
 */
async function downloadBaselines(baselines) {
  ensureCacheDir();
  const localPaths = {};
  const downloads = [];
  let networkFailures = 0;
  let cacheHits = 0;

  for (const [key, url] of Object.entries(baselines)) {
    const safeName = key.replace(/[^a-zA-Z0-9-_]/g, "_");
    const localPath = path.join(CACHE_DIR, `${safeName}.png`);

    downloads.push(
      downloadBaseline(url, localPath)
        .then(() => {
          localPaths[key] = localPath;
        })
        .catch((err) => {
          networkFailures++;
          // Check if we have a cached version to fall back to
          if (fs.existsSync(localPath)) {
            cacheHits++;
            console.log(
              chalk.yellow(
                `  ⚠ Network error for ${key}, using cached baseline`
              )
            );
            localPaths[key] = localPath;
          } else {
            console.log(
              chalk.yellow(
                `  ⚠ Failed to download baseline for ${key}: ${err.message}`
              )
            );
          }
        })
    );
  }

  await Promise.all(downloads);

  // Warn if we're in offline mode
  if (networkFailures > 0 && cacheHits > 0) {
    console.log(
      chalk.yellow(
        `\n  ⚠ Offline mode: ${cacheHits}/${networkFailures} baselines loaded from cache`
      )
    );
  }

  return localPaths;
}

/**
 * Compare two images and generate diff
 * @param {string} newPath - Path to new image
 * @param {string} baselinePath - Path to baseline image
 * @param {string} diffPath - Path to save diff output
 * @param {Object} options - Comparison options
 * @returns {Promise<Object>} { score, hasDiff, numDiffPixels, totalPixels, reason? }
 */
async function compareImages(newPath, baselinePath, diffPath, options = {}) {
  const { threshold = 0.1, includeAA = false } = options;

  // Check if files exist
  if (!fs.existsSync(newPath)) {
    return {
      hasDiff: true,
      score: 1.0,
      reason: "new_image_missing",
      error: `New image not found: ${newPath}`,
    };
  }

  if (!fs.existsSync(baselinePath)) {
    return {
      hasDiff: true,
      score: 1.0,
      reason: "baseline_missing",
      error: `Baseline not found: ${baselinePath}`,
    };
  }

  try {
    const img1Data = await fs.readFile(newPath);
    const img2Data = await fs.readFile(baselinePath);

    const img1 = PNG.sync.read(img1Data);
    const img2 = PNG.sync.read(img2Data);

    // Dimension mismatch - fail fast
    if (img1.width !== img2.width || img1.height !== img2.height) {
      return {
        hasDiff: true,
        score: 1.0,
        reason: "dimension_mismatch",
        dimensions: {
          new: { width: img1.width, height: img1.height },
          baseline: { width: img2.width, height: img2.height },
        },
      };
    }

    const { width, height } = img1;
    const diff = new PNG({ width, height });

    const numDiffPixels = pixelmatch(
      img1.data,
      img2.data,
      diff.data,
      width,
      height,
      { threshold, includeAA }
    );

    const totalPixels = width * height;
    const score = numDiffPixels / totalPixels;
    const hasDiff = numDiffPixels > 0;

    if (hasDiff && diffPath) {
      fs.ensureDirSync(path.dirname(diffPath));
      await fs.writeFile(diffPath, PNG.sync.write(diff));
    }

    return { score, hasDiff, numDiffPixels, totalPixels };
  } catch (error) {
    return {
      hasDiff: true,
      score: 1.0,
      reason: "comparison_error",
      error: error.message,
    };
  }
}

/**
 * Generate manifest for an asset bundle
 * @param {string} assetDir - Asset output directory
 * @param {Object} diffResults - Map of step to diff results
 */
async function writeManifest(assetDir, diffResults) {
  const manifestPath = path.join(assetDir, "manifest.json");
  const manifest = {
    generatedAt: new Date().toISOString(),
    cliVersion: require("../../package.json").version,
    sentinels: [],
    diffs: [],
    summary: {
      total: 0,
      changed: 0,
      unchanged: 0,
      errors: 0,
    },
  };

  for (const [step, result] of Object.entries(diffResults)) {
    manifest.summary.total++;

    manifest.sentinels.push({
      step,
      path: `sentinels/${step}.png`,
    });

    if (result.error) {
      manifest.summary.errors++;
      manifest.diffs.push({
        step,
        error: result.error,
        reason: result.reason,
      });
    } else if (result.hasDiff) {
      manifest.summary.changed++;
      manifest.diffs.push({
        step,
        path: `diffs/${step}.diff.png`,
        score: result.score,
        numDiffPixels: result.numDiffPixels,
        reason: result.reason,
      });
    } else {
      manifest.summary.unchanged++;
    }
  }

  await fs.writeJSON(manifestPath, manifest, { spaces: 2 });
  return manifest;
}

/**
 * Clear the baseline cache
 */
async function clearCache() {
  if (fs.existsSync(CACHE_DIR)) {
    await fs.remove(CACHE_DIR);
  }
}

/**
 * Get cache stats
 * @returns {Object} { files, size }
 */
function getCacheStats() {
  if (!fs.existsSync(CACHE_DIR)) {
    return { files: 0, size: 0 };
  }

  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".png"));
  let size = 0;

  for (const file of files) {
    const stat = fs.statSync(path.join(CACHE_DIR, file));
    size += stat.size;
  }

  return { files: files.length, size };
}

// ============================================
// LOCAL VERSION-TO-VERSION DIFFING
// ============================================

/**
 * Check if a folder name is a valid timestamp folder
 * @param {string} name - Folder name
 * @returns {boolean}
 */
function isTimestampFolder(name) {
  return /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(name);
}

/**
 * Get all version timestamps for a scenario, sorted newest first
 * @param {string} outputDir - Base output directory (e.g., .reshot/output)
 * @param {string} scenarioKey - Scenario key
 * @returns {string[]} Array of timestamp folder names, sorted newest first
 */
function getVersionsForScenario(outputDir, scenarioKey) {
  const scenarioDir = path.join(outputDir, scenarioKey);

  if (!fs.existsSync(scenarioDir)) {
    return [];
  }

  try {
    const subFolders = fs.readdirSync(scenarioDir).filter((item) => {
      const fullPath = path.join(scenarioDir, item);
      try {
        return fs.statSync(fullPath).isDirectory();
      } catch {
        return false;
      }
    });

    return subFolders
      .filter((f) => isTimestampFolder(f))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Get the previous version timestamp for a scenario (excluding the current one)
 * @param {string} outputDir - Base output directory
 * @param {string} scenarioKey - Scenario key
 * @param {string} currentTimestamp - Current timestamp to exclude
 * @returns {string|null} Previous timestamp or null if none
 */
function getPreviousVersion(outputDir, scenarioKey, currentTimestamp) {
  const versions = getVersionsForScenario(outputDir, scenarioKey);

  // Filter out current version and get the next most recent
  const previousVersions = versions.filter((v) => v !== currentTimestamp);

  return previousVersions.length > 0 ? previousVersions[0] : null;
}

/**
 * Find all visual assets in a version folder (recursively, handles variant subfolders)
 * Prioritizes sentinel images in sentinels/ folder for diffing
 * @param {string} versionDir - Version directory path
 * @returns {Object} Map of asset key -> { path, relativePath, filename, isVideo, isSentinel }
 */
function findAssetsInVersion(versionDir) {
  const assets = {};
  const imageExtensions = [".png", ".jpg", ".jpeg", ".webp"];
  const videoExtensions = [".mp4", ".webm"];
  const allExtensions = [...imageExtensions, ...videoExtensions];

  function walk(dir, relativePath = "") {
    if (!fs.existsSync(dir)) return;

    // Skip 'diffs' subdirectory to avoid picking up diff images
    if (path.basename(dir) === "diffs") return;

    const isSentinelDir = path.basename(dir) === "sentinels";

    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relPath = relativePath ? path.join(relativePath, item) : item;

        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            walk(fullPath, relPath);
          } else {
            const ext = path.extname(item).toLowerCase();
            if (allExtensions.includes(ext)) {
              const isVideo = videoExtensions.includes(ext);

              // For videos, skip - we compare sentinels instead
              if (isVideo) {
                continue;
              }

              // Use relative path as key to properly namespace by variant
              // e.g., "locale-en/sentinels/step-0-initial"
              const key = relPath.replace(/\.[^/.]+$/, ""); // Remove extension
              assets[key] = {
                path: fullPath,
                relativePath: relPath,
                filename: item,
                isVideo: false,
                isSentinel: isSentinelDir,
                size: stat.size,
              };
            }
          }
        } catch {
          // Skip files we can't stat
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  walk(versionDir);
  return assets;
}

/**
 * Compare current version against previous version locally
 * @param {string} outputDir - Base output directory (e.g., .reshot/output)
 * @param {string} scenarioKey - Scenario key
 * @param {string} currentTimestamp - Current version timestamp
 * @param {Object} options - Comparison options (threshold, includeAA)
 * @returns {Promise<Object>} { results, previousVersion, summary }
 */
async function compareWithPreviousVersion(
  outputDir,
  scenarioKey,
  currentTimestamp,
  options = {}
) {
  const previousTimestamp = getPreviousVersion(
    outputDir,
    scenarioKey,
    currentTimestamp
  );

  if (!previousTimestamp) {
    return {
      results: {},
      previousVersion: null,
      summary: {
        total: 0,
        compared: 0,
        changed: 0,
        unchanged: 0,
        newAssets: 0,
        errors: 0,
        message: "No previous version to compare against (first run)",
      },
    };
  }

  const currentDir = path.join(outputDir, scenarioKey, currentTimestamp);
  const previousDir = path.join(outputDir, scenarioKey, previousTimestamp);

  const currentAssets = findAssetsInVersion(currentDir);
  const previousAssets = findAssetsInVersion(previousDir);

  const results = {};
  const summary = {
    total: Object.keys(currentAssets).length,
    compared: 0,
    changed: 0,
    unchanged: 0,
    newAssets: 0,
    errors: 0,
  };

  // Compare each current asset against its previous version
  for (const [assetKey, currentAsset] of Object.entries(currentAssets)) {
    const previousAsset = previousAssets[assetKey];

    if (!previousAsset) {
      // New asset, no previous version
      results[assetKey] = {
        status: "new",
        hasDiff: true,
        score: 1.0,
        reason: "new_asset",
        currentPath: currentAsset.path,
      };
      summary.newAssets++;
      continue;
    }

    // Create diff output path - use just the filename, not the full assetKey which includes variant path
    const diffDir = path.join(path.dirname(currentAsset.path), "diffs");
    const baseFilename = path.basename(assetKey); // Just "step-0-initial", not "locale-en/step-0-initial"
    const diffPath = path.join(diffDir, `${baseFilename}.diff.png`);

    const diffResult = await compareImages(
      currentAsset.path,
      previousAsset.path,
      diffPath,
      options
    );

    results[assetKey] = {
      ...diffResult,
      status: diffResult.hasDiff ? "changed" : "unchanged",
      currentPath: currentAsset.path,
      previousPath: previousAsset.path,
      diffPath: diffResult.hasDiff ? diffPath : null,
    };

    summary.compared++;

    if (diffResult.error) {
      summary.errors++;
    } else if (diffResult.hasDiff) {
      summary.changed++;
    } else {
      summary.unchanged++;
    }
  }

  return {
    results,
    previousVersion: previousTimestamp,
    currentVersion: currentTimestamp,
    summary,
  };
}

/**
 * Write local diff manifest for a version
 * @param {string} versionDir - Version directory
 * @param {Object} diffData - Result from compareWithPreviousVersion
 */
async function writeLocalDiffManifest(versionDir, diffData) {
  const manifestPath = path.join(versionDir, "diff-manifest.json");

  const manifest = {
    generatedAt: new Date().toISOString(),
    cliVersion: require("../../package.json").version,
    comparedAgainst: diffData.previousVersion || diffData.baselineSource,
    currentVersion: diffData.currentVersion,
    baselineSource: diffData.baselineSource || "local",
    summary: diffData.summary,
    assets: {},
  };

  for (const [key, result] of Object.entries(diffData.results)) {
    manifest.assets[key] = {
      status: result.status,
      hasDiff: result.hasDiff,
      score: result.score,
      reason: result.reason,
      diffPath: result.diffPath
        ? path.relative(versionDir, result.diffPath)
        : null,
    };
  }

  await fs.writeJSON(manifestPath, manifest, { spaces: 2 });
  return manifest;
}

/**
 * Compare current assets against cloud baselines (approved visuals from platform)
 * @param {string} currentVersionDir - Full path to current version output directory
 * @param {string} scenarioKey - Scenario key
 * @param {Object} cloudBaselines - Map of "scenarioKey/captureKey" to local baseline paths
 * @param {Object} options - Diff options
 * @returns {Object} { baselineSource, results, summary }
 */
async function compareWithCloudBaselines(currentVersionDir, scenarioKey, cloudBaselines, options = {}) {
  const diffConfig = {
    threshold: options.threshold || 0.1,
    includeAA: options.includeAA || false,
    generateDiffImages: options.generateDiffImages !== false,
  };

  const results = {};
  const summary = { total: 0, new: 0, changed: 0, unchanged: 0, errors: 0 };

  // Find all assets in current version (returns Object of assetKey -> asset info)
  const currentAssets = findAssetsInVersion(currentVersionDir);

  for (const [assetKey, currentAsset] of Object.entries(currentAssets)) {
    const assetPath = currentAsset.path;
    const baseFilename = path.basename(assetKey);
    const fullAssetKey = `${scenarioKey}/${assetKey}`;
    summary.total++;

    // Check if we have a cloud baseline for this asset
    const baselinePath = cloudBaselines[fullAssetKey];

    if (!baselinePath) {
      // New asset - no baseline exists
      results[assetKey] = {
        status: "new",
        hasDiff: true,
        score: 1.0,
        reason: "no_cloud_baseline",
      };
      summary.new++;
      continue;
    }

    // Compare with cloud baseline
    const diffDir = path.join(path.dirname(assetPath), "diffs");
    fs.ensureDirSync(diffDir);
    const diffPath = path.join(diffDir, `${baseFilename}.diff.png`);

    const diffResult = await compareImages(
      assetPath,
      baselinePath,
      diffConfig.generateDiffImages ? diffPath : null,
      diffConfig
    );

    if (diffResult.error) {
      results[assetKey] = {
        status: "error",
        hasDiff: true,
        score: 1.0,
        reason: diffResult.reason,
        error: diffResult.error,
      };
      summary.errors++;
    } else if (diffResult.hasDiff) {
      results[assetKey] = {
        status: "changed",
        hasDiff: true,
        score: diffResult.score,
        numDiffPixels: diffResult.numDiffPixels,
        diffPath: diffConfig.generateDiffImages ? diffPath : null,
      };
      summary.changed++;
    } else {
      results[assetKey] = {
        status: "unchanged",
        hasDiff: false,
        score: 0,
      };
      summary.unchanged++;
      // Remove empty diff file if no diff
      if (fs.existsSync(diffPath)) {
        fs.removeSync(diffPath);
      }
    }
  }

  return {
    baselineSource: "cloud",
    currentVersion: path.basename(currentVersionDir),
    results,
    summary,
  };
}

module.exports = {
  downloadBaseline,
  downloadBaselines,
  compareImages,
  writeManifest,
  clearCache,
  getCacheStats,
  CACHE_DIR,
  // Local diffing functions
  getVersionsForScenario,
  getPreviousVersion,
  findAssetsInVersion,
  compareWithPreviousVersion,
  writeLocalDiffManifest,
  isTimestampFolder,
  // Cloud baseline diffing
  compareWithCloudBaselines,
};
