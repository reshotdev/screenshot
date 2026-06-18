// ui-assets.js - Asset file utilities for UI
const fs = require("fs-extra");
const path = require("path");

/**
 * Find all asset files in output directory structure
 *
 * Handles multiple output structures:
 * 1. .reshot/output/<scenarioKey>/latest/<files>  (latest version)
 * 2. .reshot/output/<scenarioKey>/default/<files>  (default variation)
 * 3. .reshot/output/<scenarioKey>/<timestamp>/<files>  (timestamped version)
 * 4. .reshot/output/<scenarioKey>/<timestamp>/<variantSlug>/<files>  (variant within timestamp)
 *
 * Default behavior:
 * - Shows named folders (latest, default, etc.)
 * - For timestamped folders, shows the MOST RECENT one
 * - If timestamp contains variant subfolders, shows all variants from most recent timestamp
 *
 * @param {string} dir - Output base directory
 * @param {string[]} extensions - File extensions to include
 * @param {Object} options - Additional options
 * @param {boolean} options.includeAllVersions - Include all timestamped versions (default: false)
 * @param {boolean} options.latestJobOnly - Only include the most recent timestamp folder, exclude named folders (default: false)
 * @returns {string[]} Array of absolute file paths
 */
function findAssetFiles(
  dir,
  extensions = [".png", ".gif", ".mp4", ".jpg", ".jpeg", ".webm"],
  options = {}
) {
  const { includeAllVersions = false, latestJobOnly = false } = options;
  const files = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  // Patterns to exclude from asset collection (debug artifacts, diff images)
  const EXCLUDED_FILENAMES = ['debug-failure.png', 'debug-failure.jpg'];
  const EXCLUDED_DIRS = ['diffs'];
  const EXCLUDED_SUFFIXES = ['.diff.png', '.diff.jpg'];

  function shouldExcludeFile(filename, filePath) {
    if (EXCLUDED_FILENAMES.includes(filename)) return true;
    for (const suffix of EXCLUDED_SUFFIXES) {
      if (filename.endsWith(suffix)) return true;
    }
    for (const dir of EXCLUDED_DIRS) {
      if (filePath.includes(path.sep + dir + path.sep) || filePath.includes('/' + dir + '/')) return true;
    }
    return false;
  }

  // Helper to recursively collect asset files from a folder
  function collectAssets(folder) {
    const collected = [];
    if (!fs.existsSync(folder)) return collected;

    function walk(currentDir) {
      try {
        const items = fs.readdirSync(currentDir);
        for (const item of items) {
          const fullPath = path.join(currentDir, item);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            // Skip excluded directories
            if (EXCLUDED_DIRS.includes(item)) continue;
            walk(fullPath);
          } else {
            const ext = path.extname(item).toLowerCase();
            if (extensions.includes(ext) && !shouldExcludeFile(item, fullPath)) {
              collected.push(fullPath);
            }
          }
        }
      } catch (e) {
        // Ignore permission errors
      }
    }

    walk(folder);
    return collected;
  }

  // Check if a folder is a timestamp
  function isTimestamp(name) {
    return /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(name);
  }

  // Get scenario-level folders
  const scenarioFolders = fs.readdirSync(dir).filter((item) => {
    const fullPath = path.join(dir, item);
    try {
      return fs.statSync(fullPath).isDirectory();
    } catch {
      return false;
    }
  });

  for (const scenarioFolder of scenarioFolders) {
    const scenarioPath = path.join(dir, scenarioFolder);

    let subFolders = [];
    try {
      subFolders = fs.readdirSync(scenarioPath).filter((item) => {
        const fullPath = path.join(scenarioPath, item);
        try {
          return fs.statSync(fullPath).isDirectory();
        } catch {
          return false;
        }
      });
    } catch {
      continue;
    }

    // Categorize subfolders
    const timestampedFolders = subFolders
      .filter((f) => isTimestamp(f))
      .sort()
      .reverse();
    const namedFolders = subFolders.filter((f) => !isTimestamp(f)); // 'latest', 'default', etc.

    if (includeAllVersions) {
      // Include everything
      for (const folder of subFolders) {
        const folderPath = path.join(scenarioPath, folder);
        files.push(...collectAssets(folderPath));
      }
    } else if (latestJobOnly) {
      // Only include the most recent timestamp folder (for publish preview)
      // This excludes named folders like "latest" to avoid showing ALL historical assets
      if (timestampedFolders.length > 0) {
        let foundImages = false;

        for (const timestamp of timestampedFolders) {
          const timestampPath = path.join(scenarioPath, timestamp);
          const timestampAssets = collectAssets(timestampPath);
          const hasImages = timestampAssets.some((f) =>
            /\.(png|jpg|jpeg|gif)$/i.test(f)
          );

          if (hasImages) {
            files.push(...timestampAssets);
            foundImages = true;
            break; // Use only the most recent timestamp with images
          }
        }

        // If no timestamp has images, use the most recent one (might have video)
        if (!foundImages) {
          const mostRecentTimestamp = timestampedFolders[0];
          const timestampPath = path.join(scenarioPath, mostRecentTimestamp);
          files.push(...collectAssets(timestampPath));
        }
      }
    } else {
      // Smart selection (default behavior for /assets page)

      // Always include named folders
      for (const folder of namedFolders) {
        const folderPath = path.join(scenarioPath, folder);
        files.push(...collectAssets(folderPath));
      }

      // For timestamped folders, find the most recent one that has IMAGE assets
      // (not just video files)
      if (timestampedFolders.length > 0) {
        let foundImages = false;

        for (const timestamp of timestampedFolders) {
          const timestampPath = path.join(scenarioPath, timestamp);
          const timestampAssets = collectAssets(timestampPath);
          const hasImages = timestampAssets.some((f) =>
            /\.(png|jpg|jpeg|gif)$/i.test(f)
          );

          if (hasImages) {
            files.push(...timestampAssets);
            foundImages = true;
            break; // Use only the most recent timestamp with images
          }
        }

        // If no timestamp has images, use the most recent one (might have video)
        if (!foundImages) {
          const mostRecentTimestamp = timestampedFolders[0];
          const timestampPath = path.join(scenarioPath, mostRecentTimestamp);
          files.push(...collectAssets(timestampPath));
        }
      }
    }
  }

  return files;
}

/**
 * Extract metadata from file path
 *
 * Handles multiple path structures:
 * 1. .reshot/output/<scenarioKey>/<variationSlug>/<filename>
 * 2. .reshot/output/<scenarioKey>/<timestamp>/<filename>
 * 3. .reshot/output/<scenarioKey>/<timestamp>/<variantSlug>/<filename>
 *
 * @param {string} filePath - Absolute file path
 * @param {string} outputBaseDir - Base output directory
 * @returns {Object} Metadata object
 */
function extractMetadata(filePath, outputBaseDir) {
  const relativePath = path.relative(outputBaseDir, filePath);
  const parts = relativePath.split(path.sep);

  // parts[0] = scenarioKey
  const scenarioKey = parts[0];

  // Check if parts[1] is a timestamp
  const isTimestamp = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(parts[1]);

  let variationSlug;
  let filename;

  if (isTimestamp && parts.length > 3) {
    // Structure: scenarioKey/timestamp/variantSlug/filename
    // Use variantSlug as variation, not the timestamp
    variationSlug = parts[2];
    filename = parts.slice(3).join("/");
  } else if (isTimestamp) {
    // Structure: scenarioKey/timestamp/filename (no variant)
    // Normalize timestamp to 'latest' for better UX
    variationSlug = "latest";
    filename = parts.slice(2).join("/");
  } else {
    // Structure: scenarioKey/variationSlug/filename
    variationSlug = parts[1];
    filename = parts.slice(2).join("/");
  }

  // Extract visual key from filename (remove extension)
  const captureKey = path.basename(filename, path.extname(filename));

  return {
    scenarioKey,
    variationSlug,
    captureKey,
    filename,
    // Include raw path info for debugging
    rawParts: parts,
  };
}

/**
 * Group assets by scenario and variation
 * @param {string[]} assetFiles - Array of absolute file paths
 * @param {string} outputBaseDir - Base output directory
 * @returns {Array} Array of grouped asset objects
 */
function groupAssetsByScenario(assetFiles, outputBaseDir) {
  const groups = new Map();

  for (const assetPath of assetFiles) {
    const metadata = extractMetadata(assetPath, outputBaseDir);
    const { scenarioKey, variationSlug, captureKey } = metadata;

    if (!scenarioKey || !variationSlug || !captureKey) {
      continue;
    }

    const groupKey = `${scenarioKey}::${variationSlug}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        scenarioKey,
        variationSlug,
        assets: [],
      });
    }

    const stat = fs.statSync(assetPath);
    groups.get(groupKey).assets.push({
      captureKey,
      path: assetPath,
      filename: metadata.filename,
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      url: `/assets/${path
        .relative(outputBaseDir, assetPath)
        .replace(/\\/g, "/")}`,
    });
  }

  return Array.from(groups.values());
}

/**
 * Get all version timestamps per scenario
 * @param {string} outputBaseDir - Base output directory
 * @returns {Object} Map of scenarioKey -> array of version timestamps (sorted newest first)
 */
function getVersionsPerScenario(outputBaseDir) {
  const versions = {};

  if (!fs.existsSync(outputBaseDir)) {
    return versions;
  }

  // Check if a folder name is a timestamp
  function isTimestamp(name) {
    return /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(name);
  }

  // Get scenario-level folders
  const scenarioFolders = fs.readdirSync(outputBaseDir).filter((item) => {
    const fullPath = path.join(outputBaseDir, item);
    try {
      return fs.statSync(fullPath).isDirectory();
    } catch {
      return false;
    }
  });

  for (const scenarioFolder of scenarioFolders) {
    const scenarioPath = path.join(outputBaseDir, scenarioFolder);

    try {
      const subFolders = fs.readdirSync(scenarioPath).filter((item) => {
        const fullPath = path.join(scenarioPath, item);
        try {
          return fs.statSync(fullPath).isDirectory();
        } catch {
          return false;
        }
      });

      // Get only timestamp folders, sorted newest first
      const timestampedFolders = subFolders
        .filter((f) => isTimestamp(f))
        .sort()
        .reverse();

      if (timestampedFolders.length > 0) {
        versions[scenarioFolder] = timestampedFolders.map((ts) => {
          // Parse timestamp to human-readable format
          const parts = ts.match(
            /(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/
          );
          if (parts) {
            const date = new Date(
              `${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}`
            );
            return {
              timestamp: ts,
              label: date.toLocaleString(),
              date: date.toISOString(),
            };
          }
          return { timestamp: ts, label: ts, date: ts };
        });
      }
    } catch {
      // Skip if can't read
    }
  }

  return versions;
}

module.exports = {
  findAssetFiles,
  extractMetadata,
  groupAssetsByScenario,
  getVersionsPerScenario,
};
