const fs = require("fs-extra");
const path = require("path");

const TIMESTAMP_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;
const ASSET_EXTENSIONS = new Set([".png", ".gif", ".mp4", ".jpg", ".jpeg", ".webm"]);

function isTimestampFolder(name) {
  return TIMESTAMP_DIR_PATTERN.test(name);
}

function countAssets(dir) {
  let count = 0;

  function walk(currentDir) {
    try {
      const items = fs.readdirSync(currentDir);
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (ASSET_EXTENSIONS.has(path.extname(item).toLowerCase())) {
          count++;
        }
      }
    } catch {
      return;
    }
  }

  walk(dir);
  return count;
}

function detectVariants(dir) {
  try {
    return fs
      .readdirSync(dir)
      .map((item) => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (!stat.isDirectory()) {
          return null;
        }

        const assetCount = countAssets(fullPath);
        return assetCount > 0 ? { name: item, assetCount } : null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function formatTimestampFolder(timestamp) {
  const parts = timestamp.match(
    /(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/,
  );

  if (!parts) {
    return { label: timestamp, date: timestamp };
  }

  const date = new Date(
    `${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}`,
  );

  if (Number.isNaN(date.getTime())) {
    return { label: timestamp, date: timestamp };
  }

  return {
    label: date.toLocaleString(),
    date: date.toISOString(),
  };
}

function readVersionManifestMetadata(versionDir) {
  try {
    const manifestPath = path.join(versionDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      return {};
    }

    const manifest = fs.readJSONSync(manifestPath);
    const metadata = {};
    if (manifest.privacy) metadata.privacy = manifest.privacy;
    if (manifest.style) metadata.style = manifest.style;

    return metadata;
  } catch {
    return {};
  }
}

function listScenarioVersions(scenarioDir, now = new Date()) {
  if (!fs.existsSync(scenarioDir)) {
    return [];
  }

  const subFolders = fs.readdirSync(scenarioDir).filter((item) => {
    const fullPath = path.join(scenarioDir, item);
    try {
      return fs.statSync(fullPath).isDirectory();
    } catch {
      return false;
    }
  });

  const versions = subFolders
    .filter(isTimestampFolder)
    .sort()
    .reverse()
    .map((timestamp, index) => {
      const versionDir = path.join(scenarioDir, timestamp);
      const variants = detectVariants(versionDir);
      const formatted = formatTimestampFolder(timestamp);

      return {
        timestamp,
        label: formatted.label,
        date: formatted.date,
        assetCount: countAssets(versionDir),
        isLatest: index === 0,
        variants,
        hasVariants: variants.length > 0,
        ...readVersionManifestMetadata(versionDir),
      };
    });

  const specialVersions = subFolders
    .filter((folder) => folder === "latest" || folder === "default")
    .map((folder) => {
      const folderPath = path.join(scenarioDir, folder);
      const assetCount = countAssets(folderPath);
      const variants = detectVariants(folderPath);

      if (assetCount === 0) {
        return null;
      }

      return {
        timestamp: folder,
        label: folder === "latest" ? "Latest" : "Default",
        date: now.toISOString(),
        assetCount,
        isLatest: folder === "latest" && versions.length === 0,
        variants,
        hasVariants: variants.length > 0,
      };
    })
    .filter(Boolean);

  return [...versions, ...specialVersions];
}

module.exports = {
  countAssets,
  detectVariants,
  formatTimestampFolder,
  isTimestampFolder,
  listScenarioVersions,
};
