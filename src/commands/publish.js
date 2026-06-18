// publish.js - Upload generated assets to platform or BYOS (Bring Your Own Storage)
const chalk = require("chalk");
const crypto = require("crypto");
const fs = require("fs-extra");
const path = require("path");
const { execSync } = require("child_process");
const config = require("../lib/config");
const apiClient = require("../lib/api-client");
const { mergeContexts } = require("../lib/matrix");
const { hashFile, getMimeType } = require("../lib/hash");
const {
  validateStorageConfig,
  getStorageSetupHelp,
  createStorageProvider,
  getStorageMode,
  isPlatformAvailable,
} = require("../lib/storage-providers");
const {
  getLatestSuccessfulRunManifest,
  getLatestUsableRunManifest,
} = require("../lib/run-manifest");
const pkg = require("../../package.json");

// Check if transactional flow should be used (R2 configured on server)
const USE_TRANSACTIONAL_FLOW =
  process.env.RESHOT_USE_TRANSACTIONAL !== "false";

/**
 * Load all diff manifests from the output directory
 * Returns a map of "scenarioKey/timestamp" -> manifest data
 */
function loadDiffManifests(outputBaseDir) {
  const manifests = new Map();

  if (!fs.existsSync(outputBaseDir)) {
    return manifests;
  }

  try {
    const scenarios = fs.readdirSync(outputBaseDir).filter((item) => {
      const fullPath = path.join(outputBaseDir, item);
      return fs.statSync(fullPath).isDirectory();
    });

    for (const scenarioKey of scenarios) {
      const scenarioDir = path.join(outputBaseDir, scenarioKey);
      const versions = fs.readdirSync(scenarioDir).filter((item) => {
        const fullPath = path.join(scenarioDir, item);
        return (
          fs.statSync(fullPath).isDirectory() &&
          /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(item)
        );
      });

      // Get the latest version (sorted desc)
      const latestVersion = versions.sort().reverse()[0];
      if (!latestVersion) continue;

      const manifestPath = path.join(
        scenarioDir,
        latestVersion,
        "diff-manifest.json",
      );

      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = fs.readJSONSync(manifestPath);
          manifests.set(`${scenarioKey}/${latestVersion}`, manifest);
        } catch (e) {
          // Skip malformed manifests
        }
      }
    }
  } catch (e) {
    // Return empty if directory structure is unexpected
  }

  return manifests;
}

/**
 * Get diff data for a specific asset from loaded manifests
 * @param {Map} manifests - Loaded diff manifests
 * @param {string} scenarioKey - Scenario key
 * @param {string} captureKey - Asset capture key
 * @returns {Object|null} Diff data { diffPercentage, diffStatus, previousVersion }
 */
function getDiffDataForAsset(manifests, scenarioKey, captureKey) {
  // Find the manifest for this scenario (latest version)
  for (const [key, manifest] of manifests.entries()) {
    if (key.startsWith(`${scenarioKey}/`)) {
      const assetData = manifest.assets?.[captureKey];
      if (assetData) {
        return {
          diffPercentage:
            assetData.score != null ? assetData.score * 100 : null,
          diffStatus: assetData.status || null,
          previousVersion: manifest.comparedAgainst || null,
        };
      }
      // Also check with variant prefix patterns
      for (const [assetKey, data] of Object.entries(manifest.assets || {})) {
        if (assetKey.endsWith(`/${captureKey}`) || assetKey === captureKey) {
          return {
            diffPercentage: data.score != null ? data.score * 100 : null,
            diffStatus: data.status || null,
            previousVersion: manifest.comparedAgainst || null,
          };
        }
      }
    }
  }
  return null;
}

/**
 * Recursively find all asset files in a directory
 * Filters out debug artifacts and diff images that shouldn't be published
 */
function findAssetFiles(
  dir,
  extensions = [".png", ".gif", ".mp4", ".jpg", ".jpeg"],
) {
  const files = [];

  // Patterns to exclude from publishing
  const EXCLUDED_FILENAMES = ["debug-failure.png", "debug-failure.jpg"];
  const EXCLUDED_DIRS = ["diffs"];
  const EXCLUDED_SUFFIXES = [".diff.png", ".diff.jpg"];

  function shouldExcludeFile(filename, filePath) {
    // Check exact filename matches
    if (EXCLUDED_FILENAMES.includes(filename)) {
      return true;
    }
    // Check suffix patterns (e.g., .diff.png)
    for (const suffix of EXCLUDED_SUFFIXES) {
      if (filename.endsWith(suffix)) {
        return true;
      }
    }
    // Check if file is in an excluded directory
    for (const dir of EXCLUDED_DIRS) {
      if (
        filePath.includes(path.sep + dir + path.sep) ||
        filePath.includes("/" + dir + "/")
      ) {
        return true;
      }
    }
    return false;
  }

  function walk(currentDir) {
    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip excluded directories entirely
        if (EXCLUDED_DIRS.includes(item)) {
          continue;
        }
        walk(fullPath);
      } else {
        const ext = path.extname(item).toLowerCase();
        if (extensions.includes(ext) && !shouldExcludeFile(item, fullPath)) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * Find exported video files in common export directories.
 * Includes:
 * - ./exports
 * - ./.reshot/exports
 */
function collectExportVideoFiles(projectRoot) {
  const exportDirs = [
    path.join(projectRoot, "exports"),
    path.join(projectRoot, ".reshot", "exports"),
  ];
  const videoExts = new Set([".mp4", ".webm", ".mov"]);
  const results = [];

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        const ext = path.extname(item).toLowerCase();
        if (videoExts.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  for (const dir of exportDirs) {
    walk(dir);
  }

  return results;
}

function resolveVideoPath(projectRoot, candidatePath) {
  const trimmed = String(candidatePath || "").trim();
  if (!trimmed) return null;
  const resolved = path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(projectRoot, trimmed);
  if (!fs.existsSync(resolved)) return null;
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) return null;
  const ext = path.extname(resolved).toLowerCase();
  if (![".mp4", ".webm", ".mov"].includes(ext)) return null;
  return resolved;
}

function sanitizeScenarioHint(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function readVideoTargetMarker(projectRoot) {
  const markerFiles = [
    path.join(projectRoot, "exports", ".reshot-last-render.json"),
    path.join(projectRoot, ".reshot", "exports", ".reshot-last-render.json"),
  ];

  for (const markerPath of markerFiles) {
    if (!fs.existsSync(markerPath)) continue;
    try {
      const raw = fs.readJSONSync(markerPath);
      const resolved = resolveVideoPath(projectRoot, raw?.videoPath);
      if (resolved) return resolved;
    } catch {
      // ignore malformed marker files
    }
  }
  return null;
}

function findExportVideoFiles(
  projectRoot,
  { explicitVideoPath, scenarioHints = [] } = {},
) {
  const explicit = resolveVideoPath(projectRoot, explicitVideoPath);
  if (explicitVideoPath) {
    if (!explicit) {
      throw new Error(
        `Requested video target was not found or is not a supported video: ${explicitVideoPath}`,
      );
    }
    return { files: [explicit] };
  }

  const envExplicit = resolveVideoPath(
    projectRoot,
    process.env.RESHOT_PUBLISH_VIDEO_PATH,
  );
  if (process.env.RESHOT_PUBLISH_VIDEO_PATH && !envExplicit) {
    throw new Error(
      `RESHOT_PUBLISH_VIDEO_PATH was set but invalid: ${process.env.RESHOT_PUBLISH_VIDEO_PATH}`,
    );
  }
  if (envExplicit) {
    return { files: [envExplicit] };
  }

  const markerTarget = readVideoTargetMarker(projectRoot);
  if (markerTarget) {
    return { files: [markerTarget] };
  }

  const candidates = collectExportVideoFiles(projectRoot);
  if (candidates.length <= 1) {
    return { files: candidates };
  }

  const normalizedHints = scenarioHints
    .map((hint) => sanitizeScenarioHint(hint))
    .filter(Boolean);
  if (normalizedHints.length > 0) {
    const matched = candidates.filter((filePath) => {
      const base = sanitizeScenarioHint(path.basename(filePath, path.extname(filePath)));
      return normalizedHints.some(
        (hint) =>
          base === hint || base.startsWith(`${hint}-`) || base.includes(`-${hint}-`) || base.includes(hint),
      );
    });
    if (matched.length === 1) {
      return { files: [matched[0]] };
    }
  }

  return {
    files: [],
    warning:
      "Multiple exported videos found. Skipping video upload to avoid uploading the wrong target. Set RESHOT_PUBLISH_VIDEO_PATH or run a fresh export.",
  };
}

function sanitizeCaptureKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildVideoAssetGroups(videoFiles) {
  if (!videoFiles || videoFiles.length === 0) return [];

  const usedKeys = new Set();
  const assets = [];

  for (const filePath of videoFiles) {
    const base = path.basename(filePath, path.extname(filePath));
    const rawKey = sanitizeCaptureKey(base) || "video-export";
    let captureKey = rawKey;
    let n = 2;
    while (usedKeys.has(captureKey)) {
      captureKey = `${rawKey}-${n++}`;
    }
    usedKeys.add(captureKey);

    assets.push({
      captureKey,
      path: filePath,
      filename: path.basename(filePath),
    });
  }

  return [
    {
      scenarioKey: "video-exports",
      variationSlug: "default",
      timestamp: new Date().toISOString().slice(0, 19).replace(/:/g, "-"),
      assets,
    },
  ];
}

/**
 * Extract metadata from file path
 * Convention: .reshot/output/<scenarioKey>/<variationSlug>/<filename>
 */
function readSettingsSafe() {
  try {
    return config.readSettings();
  } catch (error) {
    return null;
  }
}

function resolveProjectContext({ settings, docSyncConfig, storageMode }) {
  const envApiKey = process.env.RESHOT_API_KEY?.trim();
  const envProjectId = process.env.RESHOT_PROJECT_ID?.trim();

  const apiKey = envApiKey || settings?.apiKey;
  const projectId =
    envProjectId || settings?.projectId || docSyncConfig?._metadata?.projectId;

  // For BYOS mode, we don't require API key or project ID
  if (storageMode === "byos") {
    return {
      apiKey: null,
      projectId: projectId || "local",
      storageMode: "byos",
    };
  }

  if (!apiKey) {
    throw new Error(
      "No API key found. Set RESHOT_API_KEY in your environment or run `reshot auth` locally to create .reshot/settings.json.\n" +
        "Alternatively, configure BYOS (Bring Your Own Storage) in reshot.config.json to publish without authentication.",
    );
  }

  if (!projectId) {
    throw new Error(
      "No project ID found. Set RESHOT_PROJECT_ID in your environment or ensure reshot.config.json contains _metadata.projectId.",
    );
  }

  return { apiKey, projectId, storageMode: "platform" };
}

function extractMetadata(filePath, outputBaseDir) {
  const relativePath = path.relative(outputBaseDir, filePath);
  const parts = relativePath.split(path.sep);

  // Structure: <scenarioKey>/<timestamp>/<contextKey>/<filename>
  // Example: visuals-review-queue/2026-01-08_10-34-55/theme-light/step-0-initial.png
  const scenarioKey = parts[0];
  const timestamp = parts[1]; // Keep timestamp as metadata but not as variation slug

  // Context key is the folder after timestamp (e.g., "theme-light", "theme-dark")
  // The remaining path after context is the filename
  const contextKey = parts.length > 2 ? parts[2] : "default";
  const filename = parts.slice(3).join("/") || parts[2] || "";

  // Extract capture key from filename (remove extension)
  const captureKey =
    path.basename(filename, path.extname(filename)) || contextKey;

  return {
    scenarioKey,
    variationSlug: contextKey, // Use context key as variation slug for semantic URLs
    timestamp,
    contextKey,
    captureKey,
    filename,
  };
}

function groupAssetsByScenario(assetFiles, outputBaseDir) {
  const groups = new Map();
  // Track the latest timestamp per group for deduplication
  const latestTimestamps = new Map();

  for (const assetPath of assetFiles) {
    const metadata = extractMetadata(assetPath, outputBaseDir);
    const { scenarioKey, variationSlug, captureKey, timestamp } = metadata;

    if (!scenarioKey || !variationSlug || !captureKey) {
      console.warn(
        chalk.yellow(`  ⚠ Skipping asset with unrecognized path: ${assetPath}`),
      );
      continue;
    }

    const groupKey = `${scenarioKey}::${variationSlug}`;
    const currentLatest = latestTimestamps.get(groupKey);

    // Only process if this is from the latest timestamp for this scenario+context
    if (currentLatest && timestamp < currentLatest) {
      // Skip older timestamped versions
      continue;
    }

    // If this is a newer timestamp, clear the old assets
    if (currentLatest && timestamp > currentLatest) {
      groups.set(groupKey, {
        scenarioKey,
        variationSlug,
        timestamp,
        assets: [],
      });
    }

    latestTimestamps.set(groupKey, timestamp);

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        scenarioKey,
        variationSlug,
        timestamp,
        assets: [],
      });
    }

    groups.get(groupKey).assets.push({
      captureKey,
      path: assetPath,
      filename: metadata.filename,
    });
  }

  return Array.from(groups.values());
}

function collectAssetFilesFromDirectories(directories) {
  const deduped = new Set();
  const files = [];

  for (const directory of directories) {
    if (!directory || !fs.existsSync(directory)) continue;
    for (const filePath of findAssetFiles(directory)) {
      if (deduped.has(filePath)) continue;
      deduped.add(filePath);
      files.push(filePath);
    }
  }

  return files;
}

function resolveManifestScopedScreenshotFiles(outputBaseDir, latestRunManifest) {
  if (!latestRunManifest) {
    throw new Error(
      "No run manifest is available. Run `reshot run` first or use `reshot publish --all-output` to publish from the full output tree.",
    );
  }

  const scenarioDirs = (latestRunManifest.scenarios || [])
    .filter((scenario) => scenario.success !== false)
    .map((scenario) => scenario.outputDir)
    .filter(Boolean);

  if (scenarioDirs.length === 0) {
    throw new Error(
      "The run manifest does not contain any successful scenario output directories.",
    );
  }

  const screenshotFiles = collectAssetFilesFromDirectories(scenarioDirs);
  return {
    screenshotFiles,
    mode: "latest-run",
    scenarioCount: scenarioDirs.length,
  };
}

function buildContextForVariation(scenario, variationSlug) {
  const safeVariation = variationSlug || "default";
  if (!scenario || !scenario.contexts) {
    return { variation: safeVariation };
  }

  const baseContext = scenario.contexts.base || {};
  const variationKeys =
    safeVariation === "default" ? [] : safeVariation.split("_").filter(Boolean);

  const mergedContext = mergeContexts(
    baseContext,
    variationKeys,
    scenario.contexts,
  );
  return {
    ...mergedContext,
    variation: safeVariation,
  };
}

function buildScenarioDefinition(scenario) {
  if (!scenario) {
    return undefined;
  }

  const steps = (scenario.steps || []).map((step, index) => ({
    order: typeof step.order === "number" ? step.order : index,
    action: step.action,
    key:
      step.key ||
      step.captureKey ||
      path.basename(step.path || `step-${index}`),
    id: step.id || step.stepId || null,
    selector: step.selector || null,
    clip: step.clip,
    selectorPadding: step.selectorPadding,
    deviceScaleFactor: step.deviceScaleFactor || null,
  }));

  return {
    name: scenario.name,
    targetUrl: scenario.url,
    outputType: "screenshot",
    contexts: Object.keys(scenario.contexts || {}),
    steps,
  };
}

function buildPublishMetadata({
  projectId,
  publishSessionId,
  tag,
  scenarioKey,
  scenarioConfig,
  variationSlug,
  contextData,
  gitInfo,
  autoApprove = false,
}) {
  const scenarioDefinition = buildScenarioDefinition(scenarioConfig);

  return {
    projectId,
    publishSessionId, // Unique ID for this CLI publish run
    tag: tag || undefined,
    scenarioName: scenarioConfig?.name || scenarioKey,
    scenario: scenarioDefinition,
    context: {
      name: variationSlug || "default",
      data: contextData,
    },
    autoCreateVisuals: true,
    publish: {
      autoApprove,
    },
    git: {
      commitHash: gitInfo.commitHash,
      commitMessage: gitInfo.commitMessage,
    },
    cli: {
      version: pkg.version,
      captureTimestamp: new Date().toISOString(),
    },
  };
}

/**
 * Publish using transactional flow (direct R2 upload with presigned URLs)
 */
async function publishWithTransactionalFlow(
  apiKey,
  projectId,
  groupedAssets,
  docSyncConfig,
  gitInfo,
  diffManifests = null,
  { autoApprove = false } = {},
) {
  console.log(
    chalk.cyan("  🚀 Using transactional upload (direct to R2)...\n"),
  );

  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;
  let viewUrl = null;

  // Flatten all assets with metadata
  const allFiles = [];
  for (const group of groupedAssets) {
    const scenarioConfig = docSyncConfig?.scenarios?.find(
      (s) => s.key === group.scenarioKey,
    );

    for (const asset of group.assets) {
      // Use semantic key: scenarioKey/captureKey to match ReshotSteps URL expectations
      // e.g., "visuals-rollback/step-0-initial" for multi-step scenarios
      // This allows the CDN to serve URLs like: /{projectId}/visuals-rollback/step-0-initial?context=theme-light
      const visualKey = `${group.scenarioKey}/${asset.captureKey}`;
      const fileStat = fs.statSync(asset.path);

      // Look up diff data for this asset
      const diffData = diffManifests
        ? getDiffDataForAsset(
            diffManifests,
            group.scenarioKey,
            asset.captureKey,
          )
        : null;

      allFiles.push({
        group,
        asset,
        scenarioConfig,
        key: asset.captureKey,
        visualKey,
        path: asset.path,
        size: fileStat.size,
        contentType: getMimeType(asset.path),
        hash: null, // Will be calculated
        diffData, // Attach diff data from manifest
        thumbnailPath: null, // Will be set for video files
      });
    }
  }

  // ── DOM scene sidecars (MHTML bundles next to each PNG) ─────────────
  // The CLI emits an .mhtml alongside each PNG when scenario.domScene !==
  // false. We upload them as sidecar assets linked to the parent PNG's
  // visual version via _parentVisualKey, so the server can persist the
  // sidecar's s3Path on the same VisualVersion row.
  const domSceneSidecars = [];
  for (const f of allFiles) {
    // Only attach MHTML to PNG screenshots (not videos, not other sidecars).
    if (path.extname(f.path).toLowerCase() !== ".png") continue;
    if (f._isThumbnail || f._isDomScene) continue;

    const candidate =
      (f.asset && f.asset.domScenePath) ||
      f.path.replace(/\.png$/i, ".mhtml");
    if (!fs.existsSync(candidate)) continue;

    const sidecarStat = fs.statSync(candidate);
    domSceneSidecars.push({
      group: f.group,
      asset: {
        captureKey: f.asset.captureKey,
        path: candidate,
        filename: path.basename(candidate),
      },
      scenarioConfig: f.scenarioConfig,
      key: f.key,
      visualKey: f.visualKey,
      path: candidate,
      size: sidecarStat.size,
      contentType: "multipart/related",
      hash: null,
      diffData: null,
      thumbnailPath: null,
      _isDomScene: true,
      _parentVisualKey: f.visualKey,
    });
  }
  if (domSceneSidecars.length > 0) {
    console.log(
      chalk.gray(
        `  Attaching ${domSceneSidecars.length} DOM scene sidecar(s)...`,
      ),
    );
    allFiles.push(...domSceneSidecars);
  }

  // Generate thumbnails for video files (first frame as PNG)
  const videoExts = new Set([".mp4", ".webm", ".mov"]);
  const videoFiles = allFiles.filter((f) =>
    videoExts.has(path.extname(f.path).toLowerCase()),
  );
  if (videoFiles.length > 0) {
    let ffmpegAvailable = false;
    try {
      execSync("ffmpeg -version", { stdio: "ignore" });
      ffmpegAvailable = true;
    } catch {
      // ffmpeg not installed
    }

    if (ffmpegAvailable) {
      console.log(
        chalk.gray(
          `  Generating thumbnails for ${videoFiles.length} video(s)...`,
        ),
      );
      for (const file of videoFiles) {
        try {
          const thumbPath = file.path.replace(
            path.extname(file.path),
            "-thumb.png",
          );
          execSync(
            `ffmpeg -y -i "${file.path}" -vframes 1 -vf "scale=640:-2" "${thumbPath}"`,
            { stdio: "ignore", timeout: 15000 },
          );
          if (fs.existsSync(thumbPath)) {
            file.thumbnailPath = thumbPath;
            const thumbStat = fs.statSync(thumbPath);
            // Add thumbnail as a separate file to upload
            allFiles.push({
              group: file.group,
              asset: {
                captureKey: `${file.asset.captureKey}-thumb`,
                path: thumbPath,
                filename: path.basename(thumbPath),
              },
              scenarioConfig: file.scenarioConfig,
              key: `${file.asset.captureKey}-thumb`,
              visualKey: `${file.visualKey}-thumb`,
              path: thumbPath,
              size: thumbStat.size,
              contentType: "image/png",
              hash: null,
              diffData: null,
              thumbnailPath: null,
              _isThumbnail: true,
              _parentVisualKey: file.visualKey,
            });
            console.log(
              chalk.green(`     ✔ Thumbnail: ${path.basename(thumbPath)}`),
            );
          }
        } catch (err) {
          console.log(
            chalk.yellow(
              `     ⚠ Thumbnail generation failed for ${path.basename(file.path)}: ${err.message}`,
            ),
          );
        }
      }
    }
  }

  // Step 1: Calculate hashes in parallel (with progress)
  console.log(
    chalk.gray(`  Calculating hashes for ${allFiles.length} files...`),
  );
  const hashResults = await Promise.all(
    allFiles.map(async (file) => {
      const hash = await hashFile(file.path);
      return { file, hash };
    }),
  );
  for (const { file, hash } of hashResults) {
    file.hash = hash;
  }

  // Step 2: Get presigned URLs
  console.log(chalk.gray("  Requesting presigned URLs..."));
  const signPayload = {
    files: allFiles.map((f) => ({
      key: f.key,
      contentType: f.contentType,
      size: f.size,
      hash: f.hash,
      visualKey: f.visualKey,
    })),
  };

  const signResponse = await apiClient.signAssets(apiKey, signPayload);
  const { urls } = signResponse;

  // Step 3: Upload files directly to R2 (parallel with concurrency limit)
  console.log(chalk.gray("  Uploading files directly to R2..."));
  const CONCURRENCY = Math.min(
    Math.max(parseInt(process.env.RESHOT_UPLOAD_CONCURRENCY || "10", 10), 1),
    20,
  );
  const uploadQueue = [...allFiles];
  const uploadResults = [];

  while (uploadQueue.length > 0) {
    const batch = uploadQueue.splice(0, CONCURRENCY);
    const batchPromises = batch.map(async (file) => {
      // Look up by visualKey:hash (unique per file), fall back to visualKey, then key for backwards compatibility
      const compositeKey = `${file.visualKey}:${file.hash}`;
      const urlInfo =
        urls[compositeKey] || urls[file.visualKey] || urls[file.key];
      if (!urlInfo) {
        throw new Error(
          `No presigned URL for ${file.visualKey} (key: ${file.key}, hash: ${file.hash})`,
        );
      }

      try {
        const fileBuffer = fs.readFileSync(file.path);
        await apiClient.uploadToPresignedUrl(urlInfo.uploadUrl, fileBuffer, {
          contentType: file.contentType,
        });

        console.log(chalk.green(`     ✔ Uploaded ${file.visualKey}`));
        return { success: true, file, s3Path: urlInfo.path };
      } catch (err) {
        console.log(
          chalk.red(`     ✖ Failed ${file.visualKey}: ${err.message}`),
        );
        return { success: false, file, error: err.message };
      }
    });

    const results = await Promise.all(batchPromises);
    uploadResults.push(...results);
  }

  // Step 4: Commit metadata (grouped by scenario/variant)
  console.log(chalk.gray("\n  Committing metadata to platform..."));

  // Build a map of thumbnail s3Paths keyed by parent visualKey
  const thumbnailS3Paths = new Map();
  // Build a map of DOM-scene MHTML s3Paths keyed by parent visualKey.
  // The server attaches these to the parent VisualVersion as a sidecar.
  const domSceneS3Paths = new Map();
  const domSceneSizes = new Map();
  for (const result of uploadResults) {
    if (!result.success) continue;
    if (result.file._isThumbnail) {
      thumbnailS3Paths.set(result.file._parentVisualKey, result.s3Path);
    } else if (result.file._isDomScene) {
      domSceneS3Paths.set(result.file._parentVisualKey, result.s3Path);
      domSceneSizes.set(result.file._parentVisualKey, result.file.size);
    }
  }

  // Group successful uploads by scenario/variant (skip thumbnails + DOM
  // sidecars — they're metadata attached to their parent asset).
  const failedUploadKeys = [];
  const groupMap = new Map();
  for (const result of uploadResults) {
    if (!result.success) {
      if (!result.file._isThumbnail && !result.file._isDomScene) {
        failCount++;
        failedUploadKeys.push(result.file.visualKey);
      }
      continue;
    }
    if (result.file._isThumbnail || result.file._isDomScene) continue;

    const groupKey = `${result.file.group.scenarioKey}::${result.file.group.variationSlug}`;
    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        group: result.file.group,
        scenarioConfig: result.file.scenarioConfig,
        assets: [],
      });
    }
    groupMap.get(groupKey).assets.push({
      key: result.file.key,
      s3Path: result.s3Path,
      hash: result.file.hash,
      visualKey: result.file.visualKey,
      size: result.file.size,
      contentType: result.file.contentType,
      // Include diff data from CLI analysis
      diffPercentage: result.file.diffData?.diffPercentage ?? null,
      diffStatus: result.file.diffData?.diffStatus ?? null,
      // Attach thumbnail for video assets
      thumbnailS3Path: thumbnailS3Paths.get(result.file.visualKey) ?? null,
      // Attach DOM scene sidecar (MHTML) — the source of truth for
      // marketing-team variations.
      domSceneS3Path: domSceneS3Paths.get(result.file.visualKey) ?? null,
      domSceneSize: domSceneSizes.get(result.file.visualKey) ?? null,
    });
  }

  // Build all commits for batch request
  // Vercel serverless functions have ~60s timeout; keep batches small enough to complete
  const MAX_BATCH_SIZE = 25;
  const commits = [];

  for (const { group, scenarioConfig, assets } of groupMap.values()) {
    const contextObj = buildContextForVariation(
      scenarioConfig,
      group.variationSlug,
    );
    const metadata = buildPublishMetadata({
      projectId,
      publishSessionId: gitInfo.publishSessionId,
      tag: gitInfo.tag,
      scenarioKey: group.scenarioKey,
      scenarioConfig,
      variationSlug: group.variationSlug,
      contextData: contextObj,
      gitInfo,
      autoApprove,
    });

    if (metadata.cli) {
      metadata.cli.features = ["steps", "transactional", "batch"];
    }

    commits.push({ metadata, assets });
  }

  // Send in batches
  console.log(
    chalk.gray(`  Committing ${commits.length} scenario(s) to platform...`),
  );

  const totalBatches = Math.ceil(commits.length / MAX_BATCH_SIZE);
  for (let i = 0; i < commits.length; i += MAX_BATCH_SIZE) {
    const chunk = commits.slice(i, i + MAX_BATCH_SIZE);
    const batchNum = Math.floor(i / MAX_BATCH_SIZE) + 1;
    if (totalBatches > 1) {
      console.log(chalk.gray(`  Batch ${batchNum}/${totalBatches}...`));
    }

    try {
      const rawBatchResult = await apiClient.publishBatch(apiKey, {
        commits: chunk,
        autoApprove: autoApprove || false,
      });
      // Unwrap API envelope: response may be { data: { results, ... } } or { results, ... }
      const batchResult = rawBatchResult.data || rawBatchResult;

      for (const r of batchResult.results || []) {
        if (r.status === "ok") {
          const count = r.assetsProcessed || 0;
          console.log(
            chalk.green(
              `     ✔ Committed "${r.scenario}" (${r.context}): ${count} asset(s)`,
            ),
          );
          successCount += count;

          if (r.skippedAssets?.length > 0) {
            for (const key of r.skippedAssets) {
              console.log(chalk.yellow(`     ⚠ Skipped "${key}" (plan limit reached)`));
            }
            skippedCount += r.skippedAssets.length;
          }
        } else {
          console.log(
            chalk.red(
              `     ✖ "${r.scenario}" (${r.context}): ${r.error || "Unknown error"}`,
            ),
          );
          failCount++;
        }
      }

      if (!viewUrl && batchResult.viewUrl) {
        viewUrl = batchResult.viewUrl;
      }
    } catch (error) {
      console.log(chalk.red(`     ✖ Batch request failed: ${error.message}`));
      failCount += chunk.length;
    }
  }

  return { successCount, failCount, skippedCount, viewUrl, failedUploadKeys };
}

/**
 * Publish using legacy flow (multipart form upload through serverless)
 */
async function publishWithLegacyFlow(
  apiKey,
  projectId,
  groupedAssets,
  docSyncConfig,
  gitInfo,
  { autoApprove = false } = {},
) {
  let successCount = 0;
  let failCount = 0;

  for (const group of groupedAssets) {
    const scenarioConfig = docSyncConfig
      ? docSyncConfig.scenarios.find((s) => s.key === group.scenarioKey)
      : null;

    const contextObj = buildContextForVariation(
      scenarioConfig,
      group.variationSlug,
    );
    const metadata = buildPublishMetadata({
      projectId,
      publishSessionId: gitInfo.publishSessionId,
      tag: gitInfo.tag,
      scenarioKey: group.scenarioKey,
      scenarioConfig,
      variationSlug: group.variationSlug,
      contextData: contextObj,
      gitInfo,
      autoApprove,
    });

    if (metadata.cli) {
      metadata.cli.features = ["steps"];
    }

    const assetsPayload = {};
    group.assets.forEach((asset) => {
      assetsPayload[asset.captureKey] = asset.path;
    });

    console.log(
      chalk.cyan(
        `  📦 Uploading scenario "${group.scenarioKey}" (${group.variationSlug}) with ${group.assets.length} asset(s)`,
      ),
    );

    try {
      const result = await apiClient.publishAssetsV1(
        apiKey,
        metadata,
        assetsPayload,
      );
      const processedCount = result?.assetsProcessed ?? group.assets.length;
      console.log(
        chalk.green(
          `     ✔ Uploaded ${processedCount} asset(s); review items: ${
            result?.reviewQueueItems ?? "n/a"
          }`,
        ),
      );
      successCount += processedCount;
    } catch (error) {
      console.log(chalk.red(`     ✖ Failed: ${error.message}`));
      failCount += group.assets.length;
    }
  }

  return { successCount, failCount };
}

/**
 * Publish using BYOS (Bring Your Own Storage)
 * Uploads directly to S3/R2/local without platform involvement
 */
async function publishWithBYOS(
  storageConfig,
  groupedAssets,
  docSyncConfig,
  gitInfo,
) {
  const storageProvider = createStorageProvider(storageConfig);

  if (!storageProvider) {
    throw new Error("Failed to create storage provider");
  }

  console.log(
    chalk.cyan(`  🚀 Using BYOS (${storageConfig.type}) storage...\n`),
  );

  let successCount = 0;
  let failCount = 0;
  const uploadResults = [];

  // Build variation context from config for grouping visuals
  const variantDimensions = docSyncConfig?.variants?.dimensions || {};

  for (const group of groupedAssets) {
    const { scenarioKey, variationSlug, assets } = group;

    // Parse variation dimensions for manifest metadata
    const parsedVariation = parseVariationForManifest(
      variationSlug,
      variantDimensions,
    );

    for (const asset of assets) {
      const contentType = getMimeType(asset.path);
      // Key format: scenarioKey/variationSlug/captureKey.ext
      const ext = path.extname(asset.path);
      const assetKey = `${scenarioKey}/${variationSlug}/${asset.captureKey}${ext}`;

      console.log(chalk.gray(`  Uploading: ${assetKey}`));

      try {
        const result = await storageProvider.upload(
          asset.path,
          assetKey,
          contentType,
        );

        uploadResults.push({
          key: assetKey,
          scenarioKey,
          variationSlug,
          captureKey: asset.captureKey,
          path: result.path,
          publicUrl: result.publicUrl,
          hash: result.hash,
          contentType,
          variation: parsedVariation,
        });

        console.log(chalk.green(`     ✔ ${assetKey}`));
        successCount++;
      } catch (error) {
        console.log(chalk.red(`     ✖ ${assetKey}: ${error.message}`));
        failCount++;
      }
    }
  }

  // Generate manifest for BYOS uploads
  let manifestPath = null;
  if (uploadResults.length > 0) {
    try {
      const manifestResult =
        await storageProvider.generateManifest(uploadResults);
      manifestPath = manifestResult.manifestPath;

      // Also save a visual-grouped manifest for easier consumption
      const groupedManifest = buildGroupedManifest(
        uploadResults,
        gitInfo,
        storageConfig,
      );
      const groupedManifestPath = manifestResult.manifestPath.replace(
        "manifest-latest.json",
        "visual-groups.json",
      );
      await fs.writeJSON(groupedManifestPath, groupedManifest, { spaces: 2 });
    } catch (error) {
      console.warn(
        chalk.yellow(`  ⚠ Failed to generate manifest: ${error.message}`),
      );
    }
  }

  return { successCount, failCount, manifestPath };
}

/**
 * Parse variation slug into structured dimensions for manifest
 */
function parseVariationForManifest(slug, dimensionConfig) {
  if (slug === "default" || !slug) {
    return { isDefault: true, dimensions: {} };
  }

  const parts = slug.split("_");
  const dimensions = {};

  // Try to match parts to known dimension values
  if (dimensionConfig && Object.keys(dimensionConfig).length > 0) {
    const remainingParts = [...parts];

    for (const [dimName, dimConfig] of Object.entries(dimensionConfig)) {
      const options = Object.keys(dimConfig.options || {});
      const matchedPartIndex = remainingParts.findIndex((part) =>
        options.includes(part),
      );

      if (matchedPartIndex !== -1) {
        dimensions[dimName] = remainingParts[matchedPartIndex];
        remainingParts.splice(matchedPartIndex, 1);
      }
    }

    // Any remaining parts become indexed dimensions
    remainingParts.forEach((part, idx) => {
      dimensions[`custom_${idx}`] = part;
    });
  } else {
    // Without config, use positional naming
    const dimNames = ["locale", "role", "theme", "variant"];
    parts.forEach((part, idx) => {
      dimensions[dimNames[idx] || `dim_${idx}`] = part;
    });
  }

  return { isDefault: false, dimensions };
}

/**
 * Build a grouped manifest that organizes assets by visual key with variations
 */
function buildGroupedManifest(uploadResults, gitInfo, storageConfig) {
  const groups = new Map();

  for (const result of uploadResults) {
    const { scenarioKey, variationSlug, captureKey } = result;

    // Group by scenarioKey (visual group)
    if (!groups.has(scenarioKey)) {
      groups.set(scenarioKey, {
        visualKey: scenarioKey,
        variations: {},
      });
    }

    const group = groups.get(scenarioKey);

    // Group captures by variation
    if (!group.variations[variationSlug]) {
      group.variations[variationSlug] = {
        slug: variationSlug,
        ...result.variation,
        captures: {},
      };
    }

    group.variations[variationSlug].captures[captureKey] = {
      url: result.publicUrl,
      hash: result.hash,
      storagePath: result.path,
    };
  }

  return {
    generated: new Date().toISOString(),
    provider: storageConfig.type,
    git: {
      commitHash: gitInfo.commitHash || null,
      commitMessage: gitInfo.commitMessage || null,
    },
    visualGroups: Object.fromEntries(groups),
    // Flat asset map for quick lookups
    assets: Object.fromEntries(uploadResults.map((r) => [r.key, r.publicUrl])),
  };
}

/**
 * Get git commit information
 */
function getGitInfo() {
  try {
    const commitHash = execSync("git rev-parse HEAD", {
      encoding: "utf-8",
    }).trim();
    const commitMessage = execSync("git log -1 --pretty=%B", {
      encoding: "utf-8",
    }).trim();
    return { commitHash, commitMessage };
  } catch (error) {
    console.warn(chalk.yellow("  ⚠ Could not read git information"));
    return { commitHash: "", commitMessage: "" };
  }
}

/**
 * Get recent commit messages since last publish
 */
function getRecentCommits(lastCommitHash) {
  try {
    if (!lastCommitHash) {
      // Get last 5 commits if no previous hash
      const commits = execSync("git log -5 --pretty=%B", { encoding: "utf-8" })
        .split("\n")
        .filter((line) => line.trim());
      return commits;
    }

    const commits = execSync(`git log ${lastCommitHash}..HEAD --pretty=%B`, {
      encoding: "utf-8",
    })
      .split("\n")
      .filter((line) => line.trim());
    return commits;
  } catch (error) {
    console.warn(chalk.yellow("  ⚠ Could not read git commit history"));
    return [];
  }
}

/**
 * Parse frontmatter from markdown content
 */
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (match) {
    try {
      // Simple YAML parsing (basic key-value pairs)
      const frontmatter = {};
      const lines = match[1].split("\n");
      for (const line of lines) {
        const colonIndex = line.indexOf(":");
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line
            .substring(colonIndex + 1)
            .trim()
            .replace(/^["']|["']$/g, "");
          frontmatter[key] = value;
        }
      }
      return {
        frontmatter,
        content: match[2],
      };
    } catch (error) {
      // If parsing fails, return content as-is
      return { frontmatter: {}, content };
    }
  }

  return { frontmatter: {}, content };
}

async function publishCommand(options = {}) {
  const {
    tag,
    message,
    dryRun,
    force,
    video,
    allOutput = false,
    outputJson,
    autoApprove,
    skipReleaseDoctor = false,
    noExit = false,
  } = options;

  // Result tracking for --output-json and programmatic callers
  const publishResult = {
    assetsProcessed: 0,
    assetsFailed: 0,
    assetsSkipped: 0,
    reviewQueueItems: 0,
    viewUrl: null,
    releaseDoctor: null,
    tag: tag || null,
    dryRun: !!dryRun,
    timestamp: new Date().toISOString(),
  };

  console.log(chalk.cyan("📤 Publishing assets...\n"));

  // If tagging, show the tag
  if (tag) {
    console.log(chalk.cyan(`🏷️  Tagging release: ${tag}\n`));
  }

  // Dry run mode
  if (dryRun) {
    console.log(chalk.yellow("🔍 DRY RUN MODE - No assets will be uploaded\n"));
  }

  if (autoApprove) {
    console.log(chalk.cyan("  ✅ Auto-approve enabled: visuals will be approved immediately\n"));
  }

  // Read config + settings (if available)
  const settings = readSettingsSafe();
  let docSyncConfig = null;
  try {
    docSyncConfig = config.readConfig();
  } catch (error) {
    console.warn(
      chalk.yellow("  ⚠ Could not read config file, using minimal context"),
    );
  }

  if (skipReleaseDoctor) {
    publishResult.releaseDoctor = {
      skipped: true,
      success: true,
    };
  } else if (docSyncConfig) {
    console.log(chalk.cyan("🧪 Running release doctor before publish...\n"));
    const { runReleaseDoctor } = require("../lib/release-doctor");
    const releaseDoctor = await runReleaseDoctor({});
    publishResult.releaseDoctor = {
      skipped: false,
      success: releaseDoctor.ok,
      reportPath: releaseDoctor.reportPath || null,
    };

    if (!releaseDoctor.ok) {
      console.log(chalk.red("  ✖ Release doctor failed. Fix the reported issues before publishing."));
      if (releaseDoctor.reportPath) {
        console.log(chalk.gray(`    Report: ${releaseDoctor.reportPath}`));
      }
      if (!noExit) process.exit(1);
      return {
        ...publishResult,
        success: false,
        error: "Release doctor failed",
      };
    }

    console.log(chalk.green("  ✔ Release doctor passed\n"));
  } else {
    publishResult.releaseDoctor = {
      skipped: true,
      success: true,
      reason: "config-unavailable",
    };
  }

  // Determine storage mode and validate configuration
  const storageConfig = docSyncConfig?.storage;
  const storageMode = getStorageMode(docSyncConfig);

  // Validate storage configuration
  const validation = validateStorageConfig(storageConfig);

  // Print warnings
  for (const warning of validation.warnings) {
    console.log(chalk.yellow(`  ⚠ ${warning}`));
  }

  // Print errors and exit if invalid
  if (!validation.valid) {
    console.log(chalk.red("\n❌ Storage configuration errors:"));
    for (const error of validation.errors) {
      console.log(chalk.red(`  • ${error}`));
    }
    console.log(getStorageSetupHelp(storageConfig?.type || "reshot"));
    if (!noExit) process.exit(1);
    return { ...publishResult, success: false, error: "Invalid storage configuration" };
  }

  // Resolve project context based on storage mode
  let projectContext;
  try {
    projectContext = resolveProjectContext({
      settings,
      docSyncConfig,
      storageMode,
    });
  } catch (error) {
    console.log(chalk.red(`\n❌ ${error.message}`));
    if (storageMode !== "byos") {
      console.log(
        chalk.gray("\nTip: Configure BYOS to publish without authentication:"),
      );
      console.log(getStorageSetupHelp("s3"));
    }
    if (!noExit) process.exit(1);
    return { ...publishResult, success: false, error: error.message };
  }

  const { apiKey, projectId, storageMode: resolvedMode } = projectContext;
  const projectName =
    docSyncConfig?._metadata?.projectName ||
    settings?.projectName ||
    "Local Project";

  if (resolvedMode === "byos") {
    console.log(
      chalk.cyan(`📦 BYOS Mode: Publishing to ${storageConfig.type} storage`),
    );
    console.log(chalk.gray(`   Bucket: ${storageConfig.bucket || "N/A"}`));
    console.log(
      chalk.gray(`   Path Prefix: ${storageConfig.pathPrefix || "/"}\n`),
    );
  } else {
    console.log(chalk.gray(`Project: ${projectName} (${projectId})`));
    console.log(chalk.gray(`API Key: ****${apiKey.slice(-4)}`));
  }

  // Get feature toggles
  const features = docSyncConfig?._metadata?.features || {
    visuals: true,
  };

  // Get git information
  const { commitHash, commitMessage } = getGitInfo();

  // Generate unique session ID for this publish run
  const publishSessionId = crypto.randomUUID();

  // Handle version tagging
  if (tag && !dryRun) {
    try {
      const tagData = config.addVersionTag(tag, {
        commitHash,
        commitMessage: message || commitMessage,
        publishSessionId,
      });
      console.log(chalk.green(`  ✔ Version tag "${tag}" created`));
      console.log(
        chalk.gray(`    Pinned URL: cdn.reshot.dev/v1/assets/{projectId}/{visualKey}?tag=${tag}\n`),
      );
    } catch (tagError) {
      console.log(
        chalk.yellow(`  ⚠ Failed to save tag locally: ${tagError.message}`),
      );
    }
  }

  // Stream A: Visual Assets
  if (features.visuals === true) {
    const projectRoot = process.cwd();
    const outputBaseDir = path.join(projectRoot, ".reshot", "output");
    let screenshotFiles = [];
    let screenshotScopeLabel = "all-output";
    if (fs.existsSync(outputBaseDir)) {
      if (allOutput) {
        screenshotFiles = findAssetFiles(outputBaseDir);
      } else {
        const usable = getLatestUsableRunManifest();
        if (!usable) {
          throw new Error(
            "No run manifest with successful scenarios found. Run `reshot run` first or use `reshot publish --all-output` to publish from the full output tree.",
          );
        }
        const { manifest: latestRunManifest, isFallback, isPartialSuccess } = usable;

        if (isFallback) {
          const age = latestRunManifest.generatedAt
            ? `generated ${latestRunManifest.generatedAt}`
            : "unknown age";
          console.log(
            chalk.yellow(
              `\n  WARNING: Latest run has no successful scenarios. Falling back to older manifest (${age}).` +
                `\n  The published screenshots may be STALE. Run \`reshot run\` to capture fresh screenshots.\n`,
            ),
          );
        } else if (isPartialSuccess) {
          const allScenarios = latestRunManifest.scenarios || [];
          const failed = allScenarios.filter((s) => s.success === false);
          const succeeded = allScenarios.filter((s) => s.success !== false);
          console.log(
            chalk.yellow(
              `\n  WARNING: Latest run had partial failures (${succeeded.length} passed, ${failed.length} failed).` +
                `\n  Publishing only the ${succeeded.length} successful scenario(s).` +
                `\n  Failed: ${failed.map((s) => s.key).join(", ")}\n`,
            ),
          );
        }

        const manifestScoped = resolveManifestScopedScreenshotFiles(
          outputBaseDir,
          latestRunManifest,
        );
        screenshotFiles = manifestScoped.screenshotFiles;
        screenshotScopeLabel = `${manifestScoped.mode}:${manifestScoped.scenarioCount}`;
      }
    }
    const screenshotGroups =
      screenshotFiles.length > 0
        ? groupAssetsByScenario(screenshotFiles, outputBaseDir)
        : [];

    const { files: exportVideoFiles, warning: exportVideoWarning } =
      findExportVideoFiles(projectRoot, {
        explicitVideoPath: video,
        scenarioHints: screenshotGroups.map((g) => g.scenarioKey),
      });
    if (exportVideoWarning) {
      console.log(chalk.yellow(`  ⚠ ${exportVideoWarning}`));
    }
    const videoGroups = buildVideoAssetGroups(exportVideoFiles);

    const groupedAssets = [...screenshotGroups, ...videoGroups];

    if (!fs.existsSync(outputBaseDir) && videoGroups.length === 0) {
      console.log(
        chalk.yellow("No output directory found. Run `reshot run` first."),
      );
    } else if (groupedAssets.length === 0) {
      console.log(chalk.yellow("No asset files found to publish."));
    } else {
      console.log(
        chalk.cyan(
          `\nFound ${screenshotFiles.length + exportVideoFiles.length} asset(s) to publish` +
            ` (${screenshotFiles.length} screenshots, ${exportVideoFiles.length} videos)\n`,
        ),
      );
      console.log(
        chalk.gray(
          `  Screenshot scope: ${allOutput ? "all historical output (--all-output)" : `latest successful run (${screenshotScopeLabel})`}\n`,
        ),
      );

      let successCount = 0;
      let failCount = 0;
      let skippedCount = 0;
      let viewUrl = null;

      // Load diff manifests for attaching diff data to screenshot assets
      const diffManifests = fs.existsSync(outputBaseDir)
        ? loadDiffManifests(outputBaseDir)
        : new Map();
      if (diffManifests.size > 0) {
        console.log(
          chalk.gray(
            `  Loaded diff data from ${diffManifests.size} scenario(s)\n`,
          ),
        );
      }

      // Use BYOS or Platform flow based on mode
      if (resolvedMode === "byos") {
        const result = await publishWithBYOS(
          storageConfig,
          groupedAssets,
          docSyncConfig,
          { commitHash, commitMessage },
        );
        successCount = result.successCount;
        failCount = result.failCount;

        if (result.manifestPath) {
          console.log(
            chalk.cyan(`\n📄 Manifest generated: ${result.manifestPath}`),
          );
        }
      } else {
        // Try transactional flow first (direct R2 upload)
        if (USE_TRANSACTIONAL_FLOW) {
          try {
            const result = await publishWithTransactionalFlow(
              apiKey,
              projectId,
              groupedAssets,
              docSyncConfig,
              { commitHash, commitMessage, publishSessionId, tag },
              diffManifests,
              { autoApprove },
            );
            successCount = result.successCount;
            failCount = result.failCount;
            skippedCount = result.skippedCount || 0;
            viewUrl = result.viewUrl || null;
          } catch (txError) {
            // Fall back to legacy flow if transactional fails
            console.log(
              chalk.yellow(
                `\n  ⚠ Transactional flow unavailable (${txError.message}), using legacy upload...\n`,
              ),
            );
            const result = await publishWithLegacyFlow(
              apiKey,
              projectId,
              groupedAssets,
              docSyncConfig,
              { commitHash, commitMessage, publishSessionId, tag },
              { autoApprove },
            );
            successCount = result.successCount;
            failCount = result.failCount;
          }
        } else {
          // Use legacy flow directly
          const result = await publishWithLegacyFlow(
            apiKey,
            projectId,
            groupedAssets,
            docSyncConfig,
            { commitHash, commitMessage, publishSessionId, tag },
            { autoApprove },
          );
          successCount = result.successCount;
          failCount = result.failCount;
        }
      }

      // Update result tracking
      publishResult.assetsProcessed = successCount;
      publishResult.assetsFailed = failCount;
      publishResult.assetsSkipped = skippedCount;
      publishResult.viewUrl = viewUrl;

      console.log(chalk.cyan("\n📊 Visual Assets Summary:"));
      console.log(chalk.green(`  ✔ Successfully published: ${successCount}`));
      if (skippedCount > 0) {
        console.log(chalk.yellow(`  ⚠ Skipped (plan limit): ${skippedCount}`));
        const platformUrl = apiClient.getApiBaseUrl().replace(/\/api\/?$/, "");
        console.log(
          chalk.yellow(`    Upgrade: ${platformUrl}/app/settings/billing`),
        );
      }
      if (failCount > 0) {
        console.log(chalk.red(`  ✖ Failed: ${failCount}`));
        const failedKeys = viewUrl ? [] : (publishResult.failedUploadKeys || []);
        if (failedKeys.length > 0) {
          for (const key of failedKeys.slice(0, 5)) {
            console.log(chalk.red(`    - ${key}`));
          }
          if (failedKeys.length > 5) {
            console.log(chalk.red(`    ... and ${failedKeys.length - 5} more`));
          }
        }
      }
      if (viewUrl) {
        console.log(chalk.cyan(`\n  🔗 View in platform: ${viewUrl}`));
      }

      if (!autoApprove && successCount > 0) {
        console.log(
          chalk.cyan(
            `\n  ℹ ${successCount} visual${successCount === 1 ? "" : "s"} awaiting review (PENDING)`,
          ),
        );
        console.log(
          chalk.gray(
            "    To skip review for first-time captures, re-run with `reshot publish --auto-approve`",
          ),
        );
        console.log(
          chalk.gray(
            "    or approve them in the studio link above.",
          ),
        );
      }

      // Helpful guidance about diff percentages
      if (diffManifests && diffManifests.size > 0) {
        console.log(
          chalk.gray(
            "\n  💡 Diff data included! View change percentages in the platform.",
          ),
        );
      } else {
        console.log(
          chalk.gray(
            "\n  💡 Tip: Run 'reshot run' before publish to see change percentages.",
          ),
        );
      }
    }
  } else {
    console.log(
      chalk.yellow("  ⚠ Visual asset publishing is disabled for this project."),
    );
  }

  // Print upgrade path for BYOS users
  if (resolvedMode === "byos") {
    console.log(chalk.cyan("\n💡 Upgrade to Reshot Platform for:"));
    console.log(chalk.gray("   • Visual review queue with approval workflow"));
    console.log(chalk.gray("   • Unbreakable URLs that never change"));
    console.log(chalk.gray("   • Version history and rollback"));
    console.log(chalk.gray("   • Team collaboration and RBAC"));
    console.log(chalk.gray("   • Drift detection and notifications"));
    console.log(chalk.gray("\n   Run 'reshot auth' to connect your project."));
  }

  // Write structured JSON output if requested
  if (outputJson) {
    const outputDir = path.join(process.cwd(), ".reshot", "output");
    fs.ensureDirSync(outputDir);
    const outputPath = path.join(outputDir, "publish-result.json");
    fs.writeJsonSync(outputPath, publishResult, { spaces: 2 });
    console.log(chalk.gray(`  📄 JSON result written to: ${outputPath}`));
  }

  console.log();

  return {
    ...publishResult,
    success: publishResult.assetsFailed === 0 && publishResult.assetsProcessed > 0,
  };
}

module.exports = publishCommand;
module.exports.groupAssetsByScenario = groupAssetsByScenario;
module.exports.resolveManifestScopedScreenshotFiles =
  resolveManifestScopedScreenshotFiles;
module.exports.collectAssetFilesFromDirectories = collectAssetFilesFromDirectories;
