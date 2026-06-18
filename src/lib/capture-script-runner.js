// capture-script-runner.js - Run capture scripts with the new robust engine
const { CaptureEngine, isAuthRedirectUrl } = require("./capture-engine");

/**
 * Capture a self-contained MHTML bundle of the page at the same moment as
 * a screenshot. The bundle re-renders in any Chromium browser without
 * network access and is the source of truth for variations — marketing
 * can mutate the captured DOM (swap copy, hide chrome, recrop, rebrand)
 * and render new outputs without re-running Playwright against the live
 * app.
 *
 * Best-effort: failures are logged via `logger` but never bubble up.
 * Returns `{ path, bytes }` on success, `null` otherwise.
 *
 * Opt out per-call via `enabled=false` (typically driven from scenario
 * config). Defaults ON.
 */
async function captureDomScene(page, pngOutputPath, { enabled = true, logger = () => {} } = {}) {
  if (!enabled) return null;
  try {
    const cdp = await page.context().newCDPSession(page);
    const { data: mhtml } = await cdp.send("Page.captureSnapshot", {
      format: "mhtml",
    });
    const mhtmlPath = pngOutputPath.replace(/\.png$/i, ".mhtml");
    const fsmod = require("fs-extra");
    await fsmod.writeFile(mhtmlPath, mhtml);
    return { path: mhtmlPath, bytes: Buffer.byteLength(mhtml, "utf8") };
  } catch (err) {
    logger(`  ⚠ DOM scene capture skipped: ${err && err.message ? err.message : err}`);
    return null;
  }
}
const { buildLaunchOptions } = require("./ci-detect");
const {
  resolveVariantConfig,
  applyVariantToPage,
  applyStorageAndReload,
  setupHeaderInterception,
  applyUrlParams,
  getBrowserOptions,
  logVariantSummary,
} = require("./variant-injector");
const {
  cropImageBuffer,
  mergeCropConfigs,
  isSharpAvailable,
} = require("./image-crop");
const {
  resolveOutputPath,
  buildTemplateContext,
  ensureOutputDirectory,
  DEFAULT_OUTPUT_TEMPLATE,
} = require("./output-path-template");
const {
  resolveViewport,
  parseViewportMatrix,
  resolveCropRegion,
} = require("./viewport-presets");
const {
  getDefaultSessionPath,
  autoSyncSessionFromCDP,
  sanitizeStorageState,
  assessSessionHealth,
  writeSessionArtifacts,
} = require("./record-cdp");
const config = require("./config");
const {
  injectPrivacyMasking,
  removePrivacyMasking,
  mergePrivacyConfig,
  generatePrivacyInitScript,
  generatePrivacyCSS,
  pausePrivacyReinjection,
  resumePrivacyReinjection,
} = require("./privacy-engine");
const { applyStyle, isStyleAvailable, mergeStyleConfig } = require("./style-engine");
const { WorkerPool } = require("./worker-pool");
const { ProgressTracker, formatDuration } = require("./progress-tracker");
const chalk = require("chalk");
const path = require("path");
const fs = require("fs-extra");
const crypto = require("crypto");
const os = require("os");

// Debug mode - set RESHOT_DEBUG=1 or RESHOT_DEBUG=video to enable verbose logging
const DEBUG =
  process.env.RESHOT_DEBUG === "1" || process.env.RESHOT_DEBUG === "video";

/**
 * Substitute URL variables using user-configured mappings from settings
 *
 * Users can configure custom variable mappings in .reshot/settings.json:
 * {
 *   "urlVariables": {
 *     "PROJECT_ID": "cmj5eoyxr...",
 *     "API_HOST": "https://api.example.com",
 *     "CUSTOM_VAR": "my-value"
 *   }
 * }
 *
 * Supports formats:
 * - {{VAR_NAME}} - Mustache-style (recommended)
 * - ${VAR_NAME} - Shell-style
 * - Bare VAR_NAME - Direct token replacement
 *
 * Falls back to environment variables if not found in settings.
 */
function substituteUrlVariables(url) {
  if (!url) return url;

  // Get user-configured variables from settings
  let settings = {};
  try {
    settings = config.readSettings() || {};
  } catch (e) {
    // Settings may not exist, continue with empty
  }

  // User-defined variable mappings take priority
  const userVariables = settings.urlVariables || {};

  // Build substitution map: user variables + env variables
  // User settings override environment variables
  const substitutions = { ...userVariables };

  // Auto-populate PROJECT_ID from settings.projectId (set during `reshot link`)
  // This mirrors the fallback chain in capture-engine.js _injectActiveProjectId()
  if (!substitutions.PROJECT_ID && settings.projectId) {
    substitutions.PROJECT_ID = settings.projectId;
  }

  let result = url;

  // Replace {{VAR_NAME}} format (mustache-style, recommended)
  result = result.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return substitutions[varName] || process.env[varName] || match;
  });

  // Replace ${VAR_NAME} format (shell-style)
  result = result.replace(/\$\{(\w+)\}/g, (match, varName) => {
    return substitutions[varName] || process.env[varName] || match;
  });

  // Replace bare tokens (only if explicitly defined in user settings)
  // This avoids accidentally replacing common words
  for (const [token, value] of Object.entries(userVariables)) {
    if (value && result.includes(token)) {
      result = result.replace(new RegExp(token, "g"), value);
    }
  }

  // Detect unresolved {{...}} tokens — hard error to prevent useless captures
  const unresolvedMatches = result.match(/\{\{(\w+)\}\}/g);
  if (unresolvedMatches) {
    const unresolvedVars = unresolvedMatches.map(m => m.replace(/[{}]/g, ''));
    throw new Error(`Unresolved URL variables: ${unresolvedVars.join(', ')}. Set these in .reshot/settings.json urlVariables or as environment variables.`);
  }

  return result;
}

const { getCaptureConfig } = require("./config");

function debug(...args) {
  if (DEBUG) {
    console.log(chalk.gray("[DEBUG]"), ...args);
  }
}

function normalizeVideoTargetName(selector) {
  return String(selector || "")
    .replace(/^\[data-testid=['"]?([^'"\]]+)['"]?\]$/, "$1")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function buildVideoMetadata(events, sentinels, viewport, frameRate) {
  const targets = {};
  const timeline = events.map((event, index) => {
    const targetName = event.target ? normalizeVideoTargetName(event.target) : null;
    if (targetName && event.elementBox) {
      targets[targetName] = event.elementBox;
    }
    return {
      type: event.action,
      tMs: Math.round(event.timestamp * 1000),
      label: event.subtitle || event.action,
      target: targetName || undefined,
      elementBox: event.elementBox || undefined,
      index,
    };
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    frameRate,
    viewport,
    timeline,
    targets,
    sentinels: sentinels.map((sentinel) => ({
      index: sentinel.index,
      label: sentinel.label,
      filename: path.basename(sentinel.path),
    })),
  };
}

async function installVisibleCursor(page) {
  await page.addInitScript(() => {
    const install = () => {
      if (document.querySelector("[data-reshot-cursor]")) return;
      const cursor = document.createElement("div");
      cursor.setAttribute("data-reshot-cursor", "true");
      cursor.style.cssText = [
        "position:fixed",
        "left:0",
        "top:0",
        "width:18px",
        "height:18px",
        "z-index:2147483647",
        "pointer-events:none",
        "transform:translate(-100px,-100px)",
        "filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))",
      ].join(";");
      cursor.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 3.5 19.5 14l-7.2 1.1 4.2 5.3-2.7 2.1-4.1-5.3-3.2 6.8L4 3.5Z" fill="white" stroke="rgba(15,23,42,.9)" stroke-width="1.4"/></svg>';
      document.documentElement.appendChild(cursor);
      window.addEventListener("mousemove", (event) => {
        cursor.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
      }, { passive: true });
      window.addEventListener("mousedown", () => {
        cursor.style.scale = "0.82";
      }, { passive: true });
      window.addEventListener("mouseup", () => {
        cursor.style.scale = "1";
      }, { passive: true });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", install, { once: true });
    } else {
      install();
    }
  });
}

function normalizeVisibleText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function collectForbiddenText(globalQuality = null, scenario = {}) {
  const merged = [
    ...(globalQuality?.forbidText || []),
    ...(scenario.quality?.forbidText || []),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return [
    ...new Map(
      merged.map((value) => [normalizeVisibleText(value), value]),
    ).values(),
  ];
}

async function assertForbiddenTextAbsent(page, forbidText = []) {
  if (!Array.isArray(forbidText) || forbidText.length === 0) {
    return null;
  }

  const visibleText = normalizeVisibleText(
    await page.evaluate(() => {
      const isElementVisibleInViewport = (element) => {
        if (!(element instanceof Element)) {
          return false;
        }

        const style = window.getComputedStyle(element);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity || "1") === 0
        ) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          return false;
        }

        return (
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth
        );
      };

      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            const text = node.textContent?.replace(/\s+/g, " ").trim();
            if (!text) {
              return NodeFilter.FILTER_REJECT;
            }

            const parent = node.parentElement;
            if (!parent || !isElementVisibleInViewport(parent)) {
              return NodeFilter.FILTER_REJECT;
            }

            return NodeFilter.FILTER_ACCEPT;
          },
        },
      );

      const textParts = [];
      while (walker.nextNode()) {
        textParts.push(walker.currentNode.textContent || "");
      }

      return textParts.join(" ");
    }),
  );
  const matched = forbidText.find((candidate) =>
    visibleText.includes(normalizeVisibleText(candidate)),
  );

  if (!matched) {
    return null;
  }

  throw new Error(`Forbidden visible text detected during capture: "${matched}"`);
}

/**
 * Execute a page load with retry logic on error/timeout
 * Uses the capture engine's error detection to identify failures and retry
 *
 * @param {Object} engine - CaptureEngine instance
 * @param {string} readySelector - Selector indicating page is ready
 * @param {Object} options - Retry options
 * @param {number} options.retryOnError - Number of retries (default: 2)
 * @param {number} options.retryDelay - Base delay between retries in ms (default: 1000)
 * @param {number} options.readyTimeout - Timeout for ready check (default: 15000)
 * @param {string[]} options.errorSelectors - Custom error selectors
 * @param {boolean} options.errorHeuristics - Enable heuristic detection
 * @returns {Promise<{status: string, attempts: number, errorDetails?: Object}>}
 */
async function executeWithRetry(engine, readySelector, options = {}) {
  const captureConfig = getCaptureConfig(options);
  const {
    retryOnError = captureConfig.retryOnError,
    retryDelay = captureConfig.retryDelay,
    readyTimeout = captureConfig.readyTimeout,
    errorSelectors = captureConfig.errorSelectors,
    errorHeuristics = captureConfig.errorHeuristics,
  } = options;

  let lastResult = null;
  const maxAttempts = 1 + retryOnError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Check ready/error state
    const result = await engine.waitForReadyOrError(readySelector, {
      timeout: readyTimeout,
      errorSelectors,
      errorHeuristics,
    });

    lastResult = result;

    if (result.status === "ready") {
      return { status: "ready", attempts: attempt };
    }

    // If this is the last attempt, don't retry
    if (attempt === maxAttempts) {
      break;
    }

    // Determine backoff delay
    let delay = retryDelay * Math.pow(2, attempt - 1); // Exponential: 1s, 2s, 4s

    // Rate-limit detection: use longer backoff
    if (result.status === "error" && result.errorDetails) {
      const msg = (result.errorDetails.errorMessage || "").toLowerCase();
      if (
        msg.includes("too many requests") ||
        msg.includes("rate limit") ||
        msg.includes("429")
      ) {
        delay = Math.max(delay, 5000);
        console.log(
          chalk.yellow(
            `  ⚠ Rate limit detected, using longer backoff (${delay}ms)`
          )
        );
      }
    }

    const statusLabel =
      result.status === "error"
        ? `error: ${result.errorDetails?.errorMessage?.slice(0, 80) || "unknown"}`
        : "timeout";
    console.log(
      chalk.yellow(
        `  ⚠ Attempt ${attempt}/${maxAttempts} failed (${statusLabel}). Retrying in ${delay}ms...`
      )
    );

    // Wait and reload
    await engine.page.waitForTimeout(delay);
    await engine.page.reload({ waitUntil: "domcontentloaded" });
    await engine._waitForStability();
  }

  // All attempts exhausted
  if (lastResult?.status === "error") {
    // Capture debug screenshot
    try {
      const debugPath = path.join(
        engine.outputDir,
        "debug-error-state.png"
      );
      fs.ensureDirSync(path.dirname(debugPath));
      await engine.page.screenshot({ path: debugPath, fullPage: true });
      console.log(chalk.yellow(`  → Debug screenshot: ${debugPath}`));
    } catch (e) {
      // Ignore screenshot errors
    }
  }

  return {
    status: lastResult?.status || "timeout",
    attempts: maxAttempts,
    errorDetails: lastResult?.errorDetails,
  };
}

/**
 * Run an auth pre-flight check before executing scenarios
 * Navigates to a known page and verifies auth + data loading work
 *
 * @param {string} baseUrl - Base URL of the application
 * @param {Object} options - Pre-flight options
 * @param {string} options.storageStatePath - Path to auth state file
 * @param {Object} options.viewport - Viewport configuration
 * @returns {Promise<{ok: boolean, message?: string}>}
 */
async function preflightAuthCheck(baseUrl, options = {}) {
  const {
    storageStatePath,
    viewport = { width: 1280, height: 720 },
    authCheckUrl = "/app/projects",
  } = options;

  if (!storageStatePath || !fs.existsSync(storageStatePath)) {
    return { ok: true }; // No session to verify
  }

  const sessionHealth = assessSessionHealth(storageStatePath, baseUrl);
  if (!sessionHealth.compatible) {
    const mismatchSummary =
      sessionHealth.evidence.sourceOrigin ||
      sessionHealth.evidence.storageOrigins[0] ||
      sessionHealth.evidence.cookieDomains[0] ||
      "another environment";
    return {
      ok: false,
      message:
        `Cached auth session does not match this environment (${mismatchSummary} -> ${sessionHealth.expectedOrigin || baseUrl}). ` +
        "Run `reshot record` against this target to capture a fresh session.",
    };
  }

  console.log(chalk.gray("  → Running auth pre-flight check..."));
  if (sessionHealth.stale) {
    console.log(
      chalk.yellow(
        `  ⚠ Cached auth session is ${sessionHealth.ageMinutes}m old; verifying it before capture...`,
      ),
    );
  }
  for (const warning of sessionHealth.warnings) {
    console.log(chalk.gray(`    ${warning}`));
  }

  const engine = new CaptureEngine({
    baseUrl,
    viewport,
    headless: true,
    storageStatePath,
    hideDevtools: true,
    outputDir: path.join(".reshot", "tmp", "preflight"),
    logger: () => {}, // Silent
  });

  try {
    await engine.init();

    const authCheckTargets = Array.isArray(authCheckUrl)
      ? authCheckUrl
      : [authCheckUrl];

    for (const authTarget of authCheckTargets) {
      const preflightPath = authTarget.startsWith("http")
        ? authTarget
        : `${baseUrl}${authTarget}`;

      // Navigate to a known authenticated page and validate session/data loading.
      await engine.page.goto(preflightPath, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      // Check for auth redirect using shared utility
      const currentUrl = engine.page.url();
      const isAuthRedirect = isAuthRedirectUrl(currentUrl);

      if (isAuthRedirect) {
        return {
          ok: false,
          message:
            "Auth session expired. Run `reshot record` to capture a fresh session.",
        };
      }

      // Also detect login page via DOM (catches SPA redirects where URL hasn't changed)
      const hasLoginForm = await engine.page.evaluate(() => {
        const h = document.querySelector("h1, h2");
        return h && /sign\s*in|log\s*in/i.test(h.textContent);
      }).catch(() => false);
      if (hasLoginForm) {
        return {
          ok: false,
          message:
            "Auth session expired (login form detected). Run `reshot record` to refresh.",
        };
      }

      // Wait for data to settle
      await engine.page.waitForTimeout(3000);
      await engine._waitForStability();

      // Post-stability auth redirect check: catches SPA redirects that
      // complete after JS has finished executing (client-side routing)
      const postStabilityUrl = engine.page.url();
      if (isAuthRedirectUrl(postStabilityUrl)) {
        return {
          ok: false,
          message:
            "Auth session expired (redirect detected after page load). Run `reshot record` to capture a fresh session.",
        };
      }
      const hasLoginFormPostStability = await engine.page.evaluate(() => {
        const h = document.querySelector("h1, h2");
        return h && /sign\s*in|log\s*in/i.test(h.textContent);
      }).catch(() => false);
      if (hasLoginFormPostStability) {
        return {
          ok: false,
          message:
            "Auth session expired (login form detected after page load). Run `reshot record` to refresh.",
        };
      }

      // Check for error state
      const errorState = await engine._detectErrorState();
      if (errorState.hasError) {
        return {
          ok: false,
          message: `Auth session appears valid but data fetching failed (${errorState.errorType}). This usually means your JWT has expired. Run \`reshot record\` to refresh.`,
        };
      }
    }

    // Save refreshed session back so scenarios use fresh cookies
    if (storageStatePath && engine.context) {
      try {
        const refreshedState = await engine.context.storageState();
        writeSessionArtifacts(storageStatePath, refreshedState, {
          baseUrl,
          pageUrl: engine.page?.url?.() || baseUrl,
        });
        console.log(chalk.green("  ✔ Auth pre-flight check passed (session refreshed)"));
      } catch (_saveErr) {
        console.log(chalk.green("  ✔ Auth pre-flight check passed"));
      }
    } else {
      console.log(chalk.green("  ✔ Auth pre-flight check passed"));
    }
    return { ok: true };
  } catch (e) {
    // If the error is an auth redirect thrown by the engine, handle gracefully
    if (e.message?.includes("Auth redirect")) {
      return {
        ok: false,
        message:
          "Auth session expired. Run `reshot record` to capture a fresh session.",
      };
    }
    // Other errors - don't block, just warn
    console.log(
      chalk.yellow(`  ⚠ Pre-flight check error: ${e.message}. Continuing...`)
    );
    return { ok: true };
  } finally {
    await engine.close();
  }
}

/**
 * Retry a single interactive step (click/type/hover) with page reload recovery.
 *
 * 1. Attempts the step once.
 * 2. On failure of a non-optional step: reloads the page, re-navigates to
 *    lastGotoUrl (which triggers auth detection + stability checks), and retries.
 * 3. On second failure: returns { success: false } — caller continues to next step.
 *
 * @param {CaptureEngine} engine
 * @param {string} action - "click" | "type" | "hover"
 * @param {Object} params - Step params (target, text, etc.)
 * @param {Object} context
 * @param {string|null} context.lastGotoUrl - Last goto URL for page restoration
 * @param {Object|null} context.variantConfig - Variant config for URL params
 * @param {Function} context.logger - Logging function
 * @returns {Promise<{success: boolean, retried: boolean, error?: string}>}
 */
async function retryInteractiveStep(engine, action, params, context) {
  const { lastGotoUrl, variantConfig, logger } = context;

  async function attemptStep() {
    // Check element visibility (5s timeout)
    const element = await engine.page.locator(params.target).first();
    const visible = await element
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (!visible) {
      throw new Error(`Element not visible: ${params.target}`);
    }

    // Execute the action
    switch (action) {
      case "click":
        await engine.click(params.target, params);
        break;
      case "type":
        await engine.type(params.target, params.text, params);
        break;
      case "hover":
        await engine.hover(params.target, params);
        break;
    }
  }

  // First attempt
  try {
    await attemptStep();
    return { success: true, retried: false };
  } catch (firstError) {
    logger(
      chalk.yellow(
        `  ⚠ Step failed: ${firstError.message}. Retrying after reload...`
      )
    );
  }

  // Retry: reload + re-navigate to last goto URL
  if (!lastGotoUrl) {
    return {
      success: false,
      retried: true,
      error: "No goto URL available for page restoration",
    };
  }

  try {
    await engine.page.reload({ waitUntil: "domcontentloaded" });
    await engine._waitForStability();

    // Re-navigate via engine.goto() so auth detection + stability run
    let url = lastGotoUrl;
    if (variantConfig?.urlParams) {
      url = applyUrlParams(url, variantConfig.urlParams);
    }
    await engine.goto(url);

    await attemptStep();
    return { success: true, retried: true };
  } catch (retryError) {
    return { success: false, retried: true, error: retryError.message };
  }
}

function promoteLastGotoUrl(lastGotoUrl, currentUrl) {
  if (!currentUrl || currentUrl === "about:blank") {
    return lastGotoUrl;
  }

  return currentUrl !== lastGotoUrl ? currentUrl : lastGotoUrl;
}

/**
 * Calculate a perceptual hash for an image buffer
 * This is a simple hash based on resizing the image to a small grid
 * For now we use a simple pixel-based comparison via buffer hash
 */
function calculateImageHash(buffer) {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

/**
 * Check if two image buffers are visually similar
 * Uses hash comparison - if hashes match, images are identical
 */
function imagesAreIdentical(buffer1, buffer2) {
  if (!buffer1 || !buffer2) return false;
  return calculateImageHash(buffer1) === calculateImageHash(buffer2);
}

/**
 * Convert old-style steps to new capture script format
 * This provides backward compatibility
 * Also passes through crop configuration for individual steps
 */
function convertLegacySteps(scenario) {
  const script = [];

  // Start with navigation - apply URL variable substitution
  if (scenario.url) {
    script.push({ action: "goto", url: substituteUrlVariables(scenario.url) });
  }

  for (const step of scenario.steps || []) {
    switch (step.action) {
      case "click":
        script.push({
          action: "click",
          target: step.selector,
          // Add description if available
          description: step.description,
          // Preserve optional flag for shorter timeouts
          optional: step.optional,
        });
        break;

      case "type":
      case "input":
        script.push({
          action: "type",
          target: step.selector,
          text: step.text || "",
          description: step.description,
          optional: step.optional,
        });
        break;

      case "hover":
        script.push({
          action: "hover",
          target: step.selector,
          description: step.description,
          optional: step.optional,
        });
        break;

      case "wait":
        script.push({ action: "wait", ms: step.ms || step.duration || 1000 });
        break;

      case "waitForSelector":
        script.push({
          action: "waitFor",
          target: step.selector,
          optional: step.optional,
          timeout: step.timeout,
        });
        break;

      case "screenshot":
        script.push({
          action: "capture",
          name:
            step.key ||
            step.path?.replace(".png", "") ||
            `screenshot-${Date.now()}`,
          selector: step.selector,
          fullPage: step.fullPage,
          clip: step.clip,
          description: step.description,
          // Pass through step-level crop configuration
          cropConfig: step.crop || step.cropConfig,
          // Pass through step-level privacy and style overrides
          privacy: step.privacy,
          style: step.style,
        });
        break;

      case "keyboard":
        script.push({
          action: "keyboard",
          key: step.key,
          description: step.description,
        });
        break;

      case "goto":
        script.push({ action: "goto", url: substituteUrlVariables(step.url) });
        break;

      default:
        console.warn(chalk.yellow(`  ⚠ Unknown legacy action: ${step.action}`));
    }
  }

  return script;
}

/**
 * Wait for loading skeletons and spinners to disappear
 * Looks for common skeleton/loading patterns and waits until they're gone
 * Increased maxWait to handle slower data fetches in SaaS apps
 */
async function waitForLoadingComplete(page, maxWait = 10000) {
  // Strict loading selectors - these are definitely loading states
  const strictLoadingSelectors = [
    // Common skeleton classes
    '[class*="skeleton"]',
    '[class*="Skeleton"]',
    '[class*="shimmer"]',
    // Explicit loading states
    '[class*="loading"]',
    '[class*="Loading"]',
    // Spinner/loader elements
    '[class*="spinner"]',
    '[class*="Spinner"]',
    '[class*="loader"]',
    '[class*="Loader"]',
    // Role-based loading indicators
    '[role="progressbar"]',
    '[aria-busy="true"]',
    // Next.js/React specific
    '[data-loading="true"]',
    "[data-skeleton]",
    // Bootstrap placeholders
    ".placeholder-glow",
    ".placeholder-wave",
    // Suspense fallbacks
    ".suspense-fallback",
    ".lazy-loading",
    // Data testids for loading
    '[data-testid*="loading"]',
    '[data-testid*="skeleton"]',
  ];

  // These selectors might be decorative (like animated icons) - check size
  const decorativeSelectors = ['[class*="pulse"]', '[class*="animate-pulse"]'];

  const startTime = Date.now();
  let consecutiveNoLoading = 0;

  while (Date.now() - startTime < maxWait) {
    try {
      // Check if any strict loading elements are visible
      const hasStrictLoading = await page.evaluate((selectors) => {
        for (const selector of selectors) {
          try {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
              // Check if element is visible and reasonably sized
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              if (
                rect.width > 10 &&
                rect.height > 10 &&
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                parseFloat(style.opacity) > 0
              ) {
                return true;
              }
            }
          } catch (e) {
            // Invalid selector, skip
          }
        }
        return false;
      }, strictLoadingSelectors);

      // Check decorative selectors only if they're large (skeleton-like)
      let hasDecorativeLoading = false;
      if (!hasStrictLoading) {
        hasDecorativeLoading = await page.evaluate((selectors) => {
          for (const selector of selectors) {
            try {
              const elements = document.querySelectorAll(selector);
              for (const el of elements) {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                // Only consider large pulse elements (actual skeletons, not decorative)
                if (
                  rect.width > 50 &&
                  rect.height > 20 &&
                  style.display !== "none" &&
                  style.visibility !== "hidden" &&
                  parseFloat(style.opacity) > 0
                ) {
                  return true;
                }
              }
            } catch (e) {
              // Invalid selector, skip
            }
          }
          return false;
        }, decorativeSelectors);
      }

      if (!hasStrictLoading && !hasDecorativeLoading) {
        consecutiveNoLoading++;
        // Require 3 consecutive checks with no loading to ensure stability
        if (consecutiveNoLoading >= 3) {
          return true;
        }
      } else {
        consecutiveNoLoading = 0;
      }

      // Wait a bit and check again
      await page.waitForTimeout(150);
    } catch {
      // Page might be navigating, wait and retry
      await page.waitForTimeout(150);
    }
  }

  // Timed out, but continue anyway
  return false;
}

/**
 * Wait for visual stability - detect when the page stops changing
 * Returns true if stable, false if timed out
 */
async function waitForVisualStability(page, maxWait = 1500) {
  // First wait for loading elements to disappear
  await waitForLoadingComplete(page, Math.min(maxWait, 3000));

  let previousHash = null;
  let stableCount = 0;
  const checkInterval = 100;
  let elapsed = 0;

  while (elapsed < maxWait && stableCount < 2) {
    const buffer = await page.screenshot();
    const currentHash = calculateImageHash(buffer);

    if (currentHash === previousHash) {
      stableCount++;
    } else {
      stableCount = 0;
      previousHash = currentHash;
    }

    if (stableCount < 2) {
      await page.waitForTimeout(checkInterval);
      elapsed += checkInterval;
    }
  }

  return stableCount >= 2;
}

/**
 * Run scenario with deduplication and step-by-step image capture.
 */
async function runScenarioWithStepByStepCapture(scenario, options = {}) {
  const {
    outputDir,
    baseUrl,
    headless = true,
    viewport = { width: 1280, height: 720 },
    variantsConfig = {},
    storageStateData = null,
    quiet = false,
  } = options;

  const outputConfig = scenario.output || {};

  // Extract crop configuration from scenario output settings
  // This persists across all variations of the scenario
  const scenarioCropConfig = outputConfig.crop || null;

  // Resolve variant configuration
  const variantConfig = resolveVariantConfig(scenario, variantsConfig);

  // Resolve privacy configuration (global + scenario-level overrides)
  const scenarioPrivacyConfig = config.getPrivacyConfig(scenario.privacy);
  // Respect --no-privacy CLI flag
  if (options.noPrivacy) {
    scenarioPrivacyConfig.enabled = false;
  }
  const hasPrivacy = scenarioPrivacyConfig.enabled && scenarioPrivacyConfig.selectors.length > 0;

  // Resolve style configuration (global + scenario-level overrides)
  const scenarioStyleConfig = config.getStyleConfig(scenario.style);
  // Respect --no-style CLI flag
  if (options.noStyle) {
    scenarioStyleConfig.enabled = false;
  }
  // Smart default: if scenario uses element capture (selector), default frame to "none"
  const hasElementCapture = (scenario.steps || []).some(
    (s) => s.action === "screenshot" && s.selector
  );
  if (hasElementCapture && scenarioStyleConfig.frame === undefined) {
    scenarioStyleConfig.frame = "none";
  }
  const hasStyle = scenarioStyleConfig.enabled;

  if (!quiet) {
    console.log(chalk.bold(`\n📋 Scenario: ${scenario.name}`));
    console.log(chalk.gray(`   Key: ${scenario.key}`));

    if (variantConfig?.summary?.length) {
      for (const item of variantConfig.summary) {
        console.log(chalk.gray(`   ${item}`));
      }
    }

    // Log crop config if enabled
    if (scenarioCropConfig && scenarioCropConfig.enabled) {
      console.log(
        chalk.gray(`   Crop: ${JSON.stringify(scenarioCropConfig.region)}`)
      );
    }

    // Log privacy config if enabled
    if (hasPrivacy) {
      console.log(
        chalk.gray(`   Privacy: ${scenarioPrivacyConfig.selectors.length} selector(s), method=${scenarioPrivacyConfig.method}`)
      );
    }

    // Log style config if enabled
    if (hasStyle) {
      const styleDesc = [];
      if (scenarioStyleConfig.frame !== "none") styleDesc.push(`frame=${scenarioStyleConfig.frame}`);
      if (scenarioStyleConfig.shadow !== "none") styleDesc.push(`shadow=${scenarioStyleConfig.shadow}`);
      if (scenarioStyleConfig.padding > 0) styleDesc.push(`padding=${scenarioStyleConfig.padding}`);
      if (scenarioStyleConfig.borderRadius > 0) styleDesc.push(`radius=${scenarioStyleConfig.borderRadius}`);
      if (styleDesc.length > 0) {
        console.log(chalk.gray(`   Style: ${styleDesc.join(", ")}`));
      }
    }
  }

  // Resolve capture config for this scenario
  const scenarioCaptureConfig = getCaptureConfig({
    retryOnError: scenario.retryOnError,
    readyTimeout: scenario.readyTimeout,
    scenarioTimeout: scenario.scenarioTimeout,
    errorSelectors: scenario.errorSelectors,
  });
  const forbidText = collectForbiddenText(options.globalQuality, scenario);

  // Extract readySelector: prefer scenario-level, fall back to first waitForSelector step
  let readySelector = scenario.readySelector || null;
  if (!readySelector && scenario.steps) {
    const firstWaitFor = scenario.steps.find(
      (s) => s.action === "waitForSelector"
    );
    if (firstWaitFor) {
      readySelector = firstWaitFor.selector;
    }
  }

  const script = convertLegacySteps(scenario);

  if (script.length === 0) {
    if (!quiet) console.log(chalk.yellow("  ⚠ No steps to execute"));
    return { success: true, assets: [] };
  }

  if (!quiet) console.log(chalk.gray(`   Steps: ${script.length}`));

  // Check for saved session state (auth cookies)
  const sessionPath = getDefaultSessionPath();
  const hasSession = fs.existsSync(sessionPath);
  if (!quiet) {
    let sessionIsEmpty = false;
    if (hasSession) {
      try {
        const sessionContents = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
        const noCookies = !Array.isArray(sessionContents.cookies) || sessionContents.cookies.length === 0;
        const noOrigins = !Array.isArray(sessionContents.origins) || sessionContents.origins.length === 0;
        sessionIsEmpty = noCookies && noOrigins;
      } catch {
        // Malformed JSON — fall through and treat as non-empty so the warning still fires.
      }
    }
    if (hasSession && !sessionIsEmpty) {
      // Validate session freshness with graduated warnings
      const sessionStats = fs.statSync(sessionPath);
      const sessionAgeHours =
        (Date.now() - sessionStats.mtimeMs) / (1000 * 60 * 60);
      if (sessionAgeHours > 48) {
        console.log(
          chalk.red(
            `  ⚠ Auth session is ${Math.round(sessionAgeHours)}h old. Strongly recommend refreshing with \`reshot record\`.`
          )
        );
      } else if (sessionAgeHours > 24) {
        console.log(
          chalk.yellow(
            `  ⚠ Auth session is ${Math.round(sessionAgeHours)}h old. Consider refreshing with \`reshot record\`.`
          )
        );
      } else if (sessionAgeHours > 12) {
        console.log(
          chalk.gray(
            `   Auth session is ${Math.round(sessionAgeHours)}h old`
          )
        );
      } else {
        console.log(chalk.gray(`   Using saved auth session`));
      }
    } else if (scenario.requiresAuth) {
      console.log(
        chalk.yellow(
          `  ⚠ Scenario requires auth but no session found at ${sessionPath}. Run \`reshot record\` to capture a session.`
        )
      );
    }
  }

  const engine = new CaptureEngine({
    outputDir:
      outputDir || path.join(".reshot/output", scenario.key, "default"),
    baseUrl: baseUrl || "",
    viewport,
    headless,
    variantConfig,
    cropConfig: scenarioCropConfig, // Pass scenario-level crop config to engine
    storageStatePath: hasSession ? sessionPath : null, // Use saved session if available
    storageStateData, // Pre-loaded auth state (avoids redundant file reads)
    hideDevtools: true, // Always hide dev overlays in captures
    authPatterns: scenarioCaptureConfig.authPatterns, // Custom auth redirect patterns
    waitForReady: scenario.waitForReady || null, // Custom loading-state hook
    privacyConfig: hasPrivacy ? scenarioPrivacyConfig : null, // Privacy masking
    styleConfig: hasStyle ? scenarioStyleConfig : null, // Image beautification
    injectWorkspaceStore: scenario.needsWorkspaceInjection !== false,
    logger: quiet ? () => {} : (msg) => console.log(msg),
  });

  const assets = [];
  let skippedSteps = 0;
  let duplicatesSkipped = 0;
  let failedSteps = [];
  let retriedSteps = 0;
  let lastGotoUrl = null;
  let lastScreenshotHash = null;
  let captureIndex = 0;

  try {
    await engine.init();

    // Wrap scenario execution in a timeout to prevent hanging
    const scenarioTimeoutMs = scenarioCaptureConfig.scenarioTimeout;
    const scenarioTimeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              `Scenario timed out after ${scenarioTimeoutMs / 1000}s`
            )
          ),
        scenarioTimeoutMs
      );
    });

    // Execute the scenario steps (will race against timeout)
    const scenarioExecution = (async () => {
    const outDir =
      outputDir || path.join(".reshot/output", scenario.key, "default");
    fs.ensureDirSync(outDir);

    /**
     * Capture a screenshot only if it's visually different from the last one
     * Applies scenario-level cropping and style processing if configured
     * @param {string} name - Capture name
     * @param {string} description - Human-readable description
     * @param {string} type - Capture type (state, initial, action, final)
     * @param {Object} [stepOverrides] - Optional step-level overrides
     * @param {Object} [stepOverrides.cropConfig] - Step-level crop override
     * @param {Object} [stepOverrides.privacy] - Step-level privacy override
     * @param {Object} [stepOverrides.style] - Step-level style override
     */
    async function captureIfChanged(
      name,
      description,
      type = "state",
      stepOverrides = {}
    ) {
      const { cropConfig: stepCropConfig = null, privacy: stepPrivacy = null, style: stepStyle = null } = stepOverrides || {};

      // CRITICAL: If privacy masking was configured but injection failed, skip capture
      if (hasPrivacy && !engine._privacyInjectionOk) {
        console.error(chalk.red(`  ✖ PRIVACY: Skipping capture "${name}" — privacy masking injection failed. Fix the issue or use --no-privacy.`));
        return null;
      }

      // Handle step-level privacy override (remove + re-inject merged config)
      // Uses pause/resume to prevent framenavigated handler from re-injecting stale CSS
      let privacyWasOverridden = false;
      if (stepPrivacy && hasPrivacy) {
        pausePrivacyReinjection(engine.page);
        try {
          const mergedStepPrivacy = mergePrivacyConfig(scenarioPrivacyConfig, stepPrivacy);
          await removePrivacyMasking(engine.page);
          const stepResult = await injectPrivacyMasking(engine.page, mergedStepPrivacy, quiet ? () => {} : (msg) => console.log(msg));
          if (!stepResult.success) {
            // Fallback: re-inject scenario-level privacy
            console.error(chalk.red(`  ✖ PRIVACY: Step override injection failed, re-injecting scenario-level masking`));
            await injectPrivacyMasking(engine.page, scenarioPrivacyConfig, quiet ? () => {} : (msg) => console.log(msg));
          }
          privacyWasOverridden = true;
        } catch (privacyError) {
          // Fallback: try to re-inject scenario-level privacy
          console.error(chalk.red(`  ✖ PRIVACY: Step override error: ${privacyError.message}. Re-injecting scenario-level masking.`));
          try {
            await injectPrivacyMasking(engine.page, scenarioPrivacyConfig, quiet ? () => {} : (msg) => console.log(msg));
          } catch (_e) {
            // Last resort — scenario privacy is broken
          }
        } finally {
          resumePrivacyReinjection(engine.page);
        }
      }
      // Wait for visual stability
      await waitForVisualStability(engine.page, 1000);

      // CRITICAL: Final theme enforcement right before capture
      // This ensures theme classes haven't been reset by React/framework re-renders
      await engine.page.evaluate(() => {
        if (window.__RESHOT_THEME_OVERRIDE__) {
          const wanted = window.__RESHOT_THEME_OVERRIDE__;
          document.documentElement.classList.remove("dark", "light");
          document.documentElement.classList.add(wanted);
          document.documentElement.style.colorScheme = wanted;
          document.documentElement.setAttribute("data-theme", wanted);
        }
      });
      // Brief wait for CSS to apply
      await engine.page.waitForTimeout(50);
      await assertForbiddenTextAbsent(engine.page, forbidText);

      let buffer = await engine.page.screenshot();

      // Apply cropping if configured (scenario-level or step-level)
      const effectiveCropConfig = mergeCropConfigs(
        scenarioCropConfig,
        stepCropConfig
      );
      let wasCropped = false;

      // Resolve selector-based crop to a bounding box region
      if (effectiveCropConfig && effectiveCropConfig.enabled && effectiveCropConfig.selector && !effectiveCropConfig.region) {
        try {
          const box = await engine.page.evaluate((sel) => {
            const selectors = sel.split(',').map(s => s.trim());
            for (const s of selectors) {
              const el = document.querySelector(s);
              if (el) {
                const rect = el.getBoundingClientRect();
                return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
              }
            }
            return null;
          }, effectiveCropConfig.selector);
          if (box) {
            effectiveCropConfig.region = box;
          } else {
            debug(`Crop selector not found: ${effectiveCropConfig.selector}`);
          }
        } catch (e) {
          debug(`Failed to resolve crop selector: ${e.message}`);
        }
      }

      if (
        effectiveCropConfig &&
        effectiveCropConfig.enabled &&
        isSharpAvailable()
      ) {
        try {
          // Get device scale factor for coordinate scaling
          const deviceScaleFactor = await engine.page.evaluate(
            () => window.devicePixelRatio || 1
          );

          buffer = await cropImageBuffer(buffer, effectiveCropConfig, {
            deviceScaleFactor,
          });
          wasCropped = true;
          debug(
            `Cropped ${name} to region: ${JSON.stringify(
              effectiveCropConfig.region
            )}`
          );
        } catch (cropError) {
          console.log(
            chalk.yellow(`  ⚠ Crop failed for ${name}: ${cropError.message}`)
          );
          // Continue with uncropped buffer
        }
      }

      // Apply style processing (frames, shadow, padding, etc.)
      let wasStyled = false;
      if (hasStyle && isStyleAvailable()) {
        const effectiveStyleConfig = stepStyle
          ? mergeStyleConfig(scenarioStyleConfig, stepStyle)
          : { ...scenarioStyleConfig };

        // Detect dark mode from variant config
        if (variantConfig?.browserOptions?.colorScheme === "dark") {
          effectiveStyleConfig._darkMode = true;
        }

        try {
          // Get DPR for accurate scaling
          const captureDpr = await engine.page.evaluate(() => window.devicePixelRatio || 1);
          buffer = await applyStyle(buffer, effectiveStyleConfig, quiet ? () => {} : (msg) => console.log(msg), captureDpr);
          wasStyled = true;
        } catch (styleError) {
          console.log(
            chalk.yellow(`  ⚠ Style failed for ${name}: ${styleError.message}`)
          );
        }
      }

      const currentHash = calculateImageHash(buffer);

      // Check for duplicate — but always save explicit captures (docs reference these keys)
      if (lastScreenshotHash && currentHash === lastScreenshotHash && type !== "explicit") {
        console.log(chalk.gray(`  → Skipped (no change): ${name}`));
        duplicatesSkipped++;
        // Restore scenario-level privacy if step override was used
        if (privacyWasOverridden) {
          pausePrivacyReinjection(engine.page);
          try {
            await removePrivacyMasking(engine.page);
            await injectPrivacyMasking(engine.page, scenarioPrivacyConfig, quiet ? () => {} : (msg) => console.log(msg));
          } finally {
            resumePrivacyReinjection(engine.page);
          }
        }
        return null;
      }

      // Save the screenshot
      const filePath = path.join(outDir, `${name}.png`);
      await fs.writeFile(filePath, buffer);
      lastScreenshotHash = currentHash;

      // Capture sidecar MHTML so variations can be rendered from the
      // captured DOM (one CDP call; failures are non-fatal).
      const domScene = await captureDomScene(engine.page, filePath, {
        enabled: scenario.domScene !== false && options.domScene !== false,
        logger: quiet ? () => {} : (msg) => console.log(chalk.gray(msg)),
      });

      const asset = {
        name,
        path: filePath,
        domScenePath: domScene ? domScene.path : null,
        domSceneBytes: domScene ? domScene.bytes : null,
        description,
        captureIndex,
        type,
        cropped: wasCropped,
        cropConfig: wasCropped ? effectiveCropConfig : undefined,
        styled: wasStyled,
      };
      assets.push(asset);
      captureIndex++;
      const cropIndicator = wasCropped ? " ✂" : "";
      const styleIndicator = wasStyled ? " ✨" : "";
      console.log(chalk.green(`  📸 ${name}.png${cropIndicator}${styleIndicator}`));

      // Restore scenario-level privacy if step override was used
      if (privacyWasOverridden) {
        pausePrivacyReinjection(engine.page);
        try {
          await removePrivacyMasking(engine.page);
          await injectPrivacyMasking(engine.page, scenarioPrivacyConfig, quiet ? () => {} : (msg) => console.log(msg));
        } finally {
          resumePrivacyReinjection(engine.page);
        }
      }

      return asset;
    }

    // Execute steps
    for (let stepIndex = 0; stepIndex < script.length; stepIndex++) {
      const step = script[stepIndex];
      const { action, ...params } = step;
      const onNotFound = step.onNotFound || "skip";

      // Handle goto - capture initial state with error detection
      if (action === "goto") {
        let url = params.url;
        if (variantConfig?.urlParams) {
          url = applyUrlParams(url, variantConfig.urlParams);
        }
        lastGotoUrl = url; // Track for per-step retry restoration
        await engine.goto(url, params);

        // Wait for page to fully load
        try {
          await engine.page.waitForLoadState("networkidle", { timeout: 5000 });
        } catch (e) {
          // Continue even if timeout
        }

        // Extra wait for i18n/dynamic content
        await engine.page.waitForTimeout(300);

        // If we have a readySelector, use error-aware waiting with retries
        if (readySelector) {
          const retryResult = await executeWithRetry(engine, readySelector, {
            retryOnError: scenarioCaptureConfig.retryOnError,
            retryDelay: scenarioCaptureConfig.retryDelay,
            readyTimeout: scenarioCaptureConfig.readyTimeout,
            errorSelectors: scenarioCaptureConfig.errorSelectors,
            errorHeuristics: scenarioCaptureConfig.errorHeuristics,
          });

          if (retryResult.status === "error") {
            const errMsg =
              retryResult.errorDetails?.errorMessage || "Unknown error";
            console.log(
              chalk.red(
                `  ✖ Page loaded with error after ${retryResult.attempts} attempt(s): ${errMsg}`
              )
            );
            throw new Error(
              `Page error detected: ${errMsg}. The page rendered an error UI instead of expected content.`
            );
          } else if (retryResult.status === "timeout") {
            const currentUrl = engine.page.url();
            console.log(
              chalk.yellow(
                `  ⚠ Ready selector not found after ${retryResult.attempts} attempt(s): ${readySelector}`
              )
            );
            console.log(
              chalk.gray(`    URL: ${currentUrl}`)
            );
            console.log(
              chalk.gray(
                `    Hint: The page loaded but this selector does not exist. Check your readySelector in reshot.config.json.`
              )
            );
            throw new Error(
              `Scenario readySelector "${readySelector}" not found after ${retryResult.attempts} attempt(s). ` +
              `The page loaded at ${currentUrl} but the selector does not exist. ` +
              `Update readySelector in reshot.config.json or remove it to skip this check.`
            );
          } else if (retryResult.attempts > 1) {
            console.log(
              chalk.green(
                `  ✔ Page loaded successfully after ${retryResult.attempts} attempt(s)`
              )
            );
          }
        }

        // Content verification (if enabled)
        if (scenarioCaptureConfig.contentVerification) {
          const contentResult = await engine._verifyContent({
            minContentLength: 100,
            rejectSelectors: scenarioCaptureConfig.errorSelectors,
          });
          if (!contentResult.valid) {
            console.log(
              chalk.yellow(
                `  ⚠ Content verification warning: ${contentResult.reason}`
              )
            );
          }
        }

        // Capture initial state
        await captureIfChanged(
          `step-${stepIndex}-initial`,
          "Initial page state",
          "initial"
        );
        continue;
      }

      // Handle keyboard actions
      if (action === "keyboard") {
        await engine.page.keyboard.press(params.key);
        await engine.page.waitForTimeout(300);
        await captureIfChanged(
          `step-${stepIndex}-keyboard`,
          params.description || `After pressing ${params.key}`,
          "keyboard"
        );
        continue;
      }

      // Handle interactive actions (click / type / hover)
      if (["click", "type", "hover"].includes(action)) {
        const target = params.target;
        const isOptional = step.optional === true;

        if (isOptional) {
          // Optional steps: attempt once, skip silently on failure (no retry)
          const visibilityTimeout = 3000;
          let elementExists = false;
          try {
            const element = await engine.page.locator(target).first();
            elementExists = await element
              .isVisible({ timeout: visibilityTimeout })
              .catch(() => false);
          } catch (_e) {
            elementExists = false;
          }

          if (!elementExists) {
            skippedSteps++;
            if (!quiet) {
              console.log(
                chalk.dim(
                  `   → ${action}(selector=${JSON.stringify(target)}) matched 0 elements (optional, skipped)`
                )
              );
            }
            continue;
          }

          try {
            switch (action) {
              case "click":
                await engine.click(target, params);
                break;
              case "type":
                await engine.type(target, params.text, params);
                break;
              case "hover":
                await engine.hover(target, params);
                break;
            }
          } catch (_actionError) {
            skippedSteps++;
            continue;
          }
        } else {
          // Non-optional steps: use retry with page reload recovery
          const result = await retryInteractiveStep(engine, action, params, {
            lastGotoUrl,
            variantConfig,
            logger: quiet ? () => {} : (msg) => console.log(msg),
          });

          if (result.retried) retriedSteps++;

          if (!result.success) {
            if (onNotFound === "fail") {
              throw new Error(
                `Step ${stepIndex + 1} (${action} "${target}") failed after retry: ${result.error}`
              );
            }
            console.log(
              chalk.red(
                `  ✖ Step ${stepIndex + 1} (${action} "${target}") failed after retry: ${result.error}`
              )
            );
            failedSteps.push({
              stepIndex: stepIndex + 1,
              action,
              target,
              error: result.error,
            });
            continue;
          }
        }

        // Promote the current page URL after successful interactive steps so
        // retries restore the page we actually navigated to, not the last
        // explicit goto target.
        lastGotoUrl = promoteLastGotoUrl(lastGotoUrl, engine.page.url());

        // Wait for animations/transitions - longer wait for multi-step flows
        const isMultiStep = script.length > 3;
        await engine.page.waitForTimeout(isMultiStep ? 500 : 150);

        // Capture the result (only if visually different)
        const stepDesc = step.description || `After ${action}`;
        await captureIfChanged(`step-${stepIndex}-${action}`, stepDesc, action);
        continue;
      }

      // Handle wait actions (no capture)
      if (action === "wait") {
        await engine.wait(params.ms || params.duration || 1000);
        continue;
      }

      if (action === "waitFor") {
        const isOptional = step.optional === true;
        const waitTimeout = params.timeout || (isOptional ? 3000 : 10000);

        // Use error-aware waiting for waitFor steps
        const waitResult = await engine.waitForReadyOrError(params.target, {
          timeout: waitTimeout,
          errorSelectors: scenarioCaptureConfig.errorSelectors,
          errorHeuristics: scenarioCaptureConfig.errorHeuristics,
        });

        if (waitResult.status === "error") {
          const errMsg =
            waitResult.errorDetails?.errorMessage?.slice(0, 100) ||
            "Unknown error";
          if (!isOptional) {
            console.warn(
              chalk.yellow(
                `  ⚠ Page error detected while waiting for: ${params.target}`
              )
            );
            console.warn(chalk.gray(`    Error: ${errMsg}`));
            console.warn(
              chalk.gray(
                `    Hint: If data isn't loading, run 'reshot record' to refresh your session`
              )
            );
            failedSteps.push({
              stepIndex: stepIndex + 1,
              action: "waitFor",
              target: params.target,
              error: errMsg,
            });
          }
        } else if (waitResult.status === "timeout") {
          if (!isOptional) {
            const currentUrl = engine.page.url();
            console.warn(
              chalk.yellow(`  ⚠ Element not found: ${params.target}`)
            );
            console.warn(chalk.gray(`    URL: ${currentUrl}`));
            console.warn(
              chalk.gray(
                `    Hint: If content isn't loading, run 'reshot record' to refresh your session`
              )
            );
            failedSteps.push({
              stepIndex: stepIndex + 1,
              action: "waitFor",
              target: params.target,
              error: `Element not found within ${waitTimeout}ms`,
            });
          }
        }
        continue;
      }

      // Handle explicit capture actions
      if (action === "capture") {
        await captureIfChanged(
          params.name || `step-${stepIndex}`,
          params.description,
          "explicit",
          {
            cropConfig: params.cropConfig,
            privacy: params.privacy,
            style: params.style,
          }
        );
        continue;
      }
    }

    // Wait for the final state to settle after all actions
    // This is important for actions like form submissions that trigger page changes
    if (!quiet) console.log(chalk.gray(`  → Waiting for final state to settle...`));
    await engine.page.waitForTimeout(1000);
    try {
      await engine.page.waitForLoadState("networkidle", { timeout: 3000 });
    } catch (e) {
      // Continue even if timeout
    }

    // Capture final state (only if different from last)
    await captureIfChanged(`final`, "Final state", "final");

    // Summary
    const captured = assets.length;

    if (!quiet) {
      console.log(chalk.green(`\n  ✔ Scenario completed: ${captured} captures`));
      if (duplicatesSkipped > 0) {
        console.log(
          chalk.gray(`     ${duplicatesSkipped} unchanged states skipped`)
        );
      }
      if (skippedSteps > 0) {
        console.log(
          chalk.yellow(`     ${skippedSteps} optional steps skipped`)
        );
      }
      if (retriedSteps > 0) {
        console.log(
          chalk.cyan(`     ↻ ${retriedSteps} step(s) recovered after retry`)
        );
      }
      if (failedSteps.length > 0) {
        console.log(
          chalk.red(`     ✖ ${failedSteps.length} step(s) failed after retry:`)
        );
        for (const f of failedSteps) {
          console.log(
            chalk.red(`       Step ${f.stepIndex} (${f.action} "${f.target}"): ${f.error}`)
          );
        }
      }
    }

    // Build privacy/style metadata for the manifest
    const privacyMeta = hasPrivacy ? {
      enabled: true,
      method: scenarioPrivacyConfig.method,
      selectorCount: scenarioPrivacyConfig.selectors.length,
    } : { enabled: false };

    const styleMeta = hasStyle ? {
      enabled: true,
      frame: scenarioStyleConfig.frame || "none",
      shadow: scenarioStyleConfig.shadow || "none",
      padding: scenarioStyleConfig.padding || 0,
      borderRadius: scenarioStyleConfig.borderRadius || 0,
      background: scenarioStyleConfig.background || "transparent",
    } : { enabled: false };

    // Write manifest with privacy/style metadata
    const manifestPath = path.join(outDir, "manifest.json");
    const manifest = {
      generatedAt: new Date().toISOString(),
      scenario: scenario.key,
      assetCount: assets.length,
      privacy: privacyMeta,
      style: styleMeta,
    };
    try {
      fs.writeJSONSync(manifestPath, manifest, { spaces: 2 });
    } catch (_e) {
      // Non-critical — don't fail the capture
    }

    return {
      success: failedSteps.length === 0,
      assets,
      skippedSteps,
      duplicatesSkipped,
      failedSteps,
      retriedSteps,
      privacy: privacyMeta,
      style: styleMeta,
      diagnostics: engine.getDiagnostics(),
    };
    })(); // End of scenarioExecution async IIFE

    // Race scenario execution against timeout
    return await Promise.race([scenarioExecution, scenarioTimeoutPromise]);
  } catch (error) {
    console.error(
      chalk.red(
        `\n  ❌ Scenario '${scenario.name || scenario.key}' failed: ${
          error.message
        }`
      )
    );

    try {
      if (engine.page) {
        const debugPath = path.join(
          outputDir || ".reshot/output",
          scenario.key,
          "debug-failure.png"
        );
        fs.ensureDirSync(path.dirname(debugPath));
        await engine.page.screenshot({ path: debugPath, fullPage: true });
        console.error(chalk.yellow(`     Debug screenshot: ${debugPath}`));
      }
    } catch (e) {
      // Ignore
    }

    return {
      success: false,
      error: error.message,
      assets,
      skippedSteps,
      failedSteps,
      retriedSteps,
      diagnostics: engine.getDiagnostics(),
    };
  } finally {
    await engine.close();
  }
}

/**
 * Capture screenshot without interaction overlays.
 */
async function captureWithHighlight(
  engine,
  target,
  outputPath,
  highlight = {}
) {
  await engine.page.screenshot({ path: outputPath });
}

/**
 * Run a scenario with video capture (summary-video format)
 * Records the entire flow as a single video without interaction overlays
 * Supports graceful handling of permission-restricted steps
 * Supports cropping for sentinel frames (same config as step-by-step-images)
 */
async function runScenarioWithVideoCapture(scenario, options = {}) {
  const {
    outputDir,
    baseUrl,
    headless = true,
    viewport = { width: 1280, height: 720 },
    variantsConfig = {}, // Global variant configuration (new format with dimensions)
    globalQuality = null,
  } = options;

  const outputConfig = scenario.output || { format: "summary-video" };
  const subtitles = outputConfig.subtitles || { enabled: false };
  const videoFrameRate = Number(outputConfig.frameRate || 24);
  const typeDelayMs = Number(outputConfig.typeDelayMs || 20);

  // Extract crop configuration from scenario output settings
  // This persists across all variations and applies to sentinel frames
  const scenarioCropConfig = outputConfig.crop || null;
  const scenarioCaptureConfig = getCaptureConfig({
    retryOnError: scenario.retryOnError,
    readyTimeout: scenario.readyTimeout,
    scenarioTimeout: scenario.scenarioTimeout,
    errorSelectors: scenario.errorSelectors,
  });
  const forbidText = collectForbiddenText(globalQuality, scenario);

  // Resolve variant configuration using new universal variant system
  const variantConfig = resolveVariantConfig(scenario, variantsConfig);
  let readySelector = scenario.readySelector || null;
  if (!readySelector && scenario.steps) {
    const firstWaitFor = scenario.steps.find(
      (s) => s.action === "waitForSelector"
    );
    if (firstWaitFor) {
      readySelector = firstWaitFor.selector;
    }
  }

  // Resolve privacy configuration for video (CSS masking persists through entire video)
  const videoPrivacyConfig = config.getPrivacyConfig(scenario.privacy);
  const hasVideoPrivacy = videoPrivacyConfig.enabled && videoPrivacyConfig.selectors.length > 0;

  console.log(chalk.bold(`\n📋 Scenario: ${scenario.name}`));
  console.log(chalk.gray(`   Key: ${scenario.key}`));
  console.log(chalk.gray(`   Output format: summary-video`));

  // Log variant summary
  if (variantConfig?.summary?.length) {
    for (const item of variantConfig.summary) {
      console.log(chalk.gray(`   ${item}`));
    }
  }

  // Log privacy config for video
  if (hasVideoPrivacy) {
    console.log(
      chalk.gray(`   Privacy: ${videoPrivacyConfig.selectors.length} selector(s), method=${videoPrivacyConfig.method}`)
    );
  }

  // Resolve style configuration for sentinel frames
  const sentinelStyleConfig = config.getStyleConfig(scenario.style);
  const hasSentinelStyle = sentinelStyleConfig.enabled;

  // Log crop config if enabled
  if (scenarioCropConfig && scenarioCropConfig.enabled) {
    console.log(
      chalk.gray(`   Crop: ${JSON.stringify(scenarioCropConfig.region)}`)
    );
  }

  // Check for ffmpeg
  debug("Checking for ffmpeg...");
  const hasFFmpeg = await checkFFmpeg();
  if (!hasFFmpeg) {
    console.error(
      chalk.red(
        "  ❌ ffmpeg is not installed. Please install it for video generation."
      )
    );
    console.log(chalk.yellow("     Install with: brew install ffmpeg"));
    return { success: false, error: "ffmpeg not installed", assets: [] };
  }
  debug("ffmpeg found");

  // Convert steps
  const script = convertLegacySteps(scenario);
  debug(`Converted ${script.length} steps from scenario`);

  if (script.length === 0) {
    console.log(chalk.yellow("  ⚠ No steps to execute"));
    return { success: true, assets: [] };
  }

  console.log(chalk.gray(`   Steps: ${script.length}`));

  // Check for saved session state (auth cookies) - CRITICAL for authenticated scenarios
  const sessionPath = getDefaultSessionPath();
  const hasSession = fs.existsSync(sessionPath);
  if (hasSession) {
    // Validate session freshness
    const sessionStats = fs.statSync(sessionPath);
    const sessionAgeHours = (Date.now() - sessionStats.mtimeMs) / (1000 * 60 * 60);
    if (sessionAgeHours > 24) {
      console.log(chalk.yellow(`  ⚠ Auth session is ${Math.round(sessionAgeHours)}h old. Consider refreshing with \`reshot record\`.`));
    } else {
      console.log(chalk.gray(`   Using saved auth session`));
    }
  } else if (scenario.requiresAuth) {
    console.log(chalk.yellow(`  ⚠ Scenario requires auth but no session found at ${sessionPath}. Run \`reshot record\` to capture a session.`));
  }

  const { chromium } = require("playwright");
  // Use a unique temp directory for this recording to avoid conflicts
  const recordingId = `recording-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const tempDir = path.join(process.cwd(), ".reshot", "tmp", recordingId);
  debug(`Using temp directory: ${tempDir}`);
  fs.ensureDirSync(tempDir);
  fs.ensureDirSync(
    outputDir || path.join(".reshot/output", scenario.key, "default")
  );

  const finalVideoPath = path.join(
    outputDir || path.join(".reshot/output", scenario.key, "default"),
    "summary-video.mp4"
  );
  debug(`Final video path: ${finalVideoPath}`);

  let browser = null;
  let page = null;
  const events = [];

  try {
    console.log(chalk.cyan("🎬 Recording video..."));
    debug("Launching browser...");

    // Launch browser with video recording
    browser = await chromium.launch(buildLaunchOptions({ headless }));
    debug("Browser launched successfully");

    // Build context options with variant support using universal injector
    const defaultContextOptions = {
      viewport,
      recordVideo: { dir: tempDir, size: viewport },
      locale: "en-US",
      timezoneId: "America/New_York",
    };

    const contextOptions = getBrowserOptions(
      variantConfig,
      defaultContextOptions
    );
    // Always include video recording
    contextOptions.recordVideo = { dir: tempDir, size: viewport };

    // CRITICAL FIX: Load auth session for video capture (same as step-by-step)
    // This enables capturing authenticated platform pages in videos
    if (hasSession) {
      try {
        const rawState = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
        const { sanitized, stats } = sanitizeStorageState(rawState);
        contextOptions.storageState = sanitized;
        if (stats.fixed > 0 || stats.removed > 0 || stats.stripped > 0) {
          debug(`Sanitized cookies: ${stats.fixed} fixed, ${stats.removed} removed, ${stats.stripped} stripped`);
        }
      } catch (_e) {
        contextOptions.storageState = sessionPath;
      }
      debug("Loaded storageState from session file for video capture");
    }

    debug("Context options:", JSON.stringify(contextOptions, null, 2));

    // Log colorScheme for debugging
    if (contextOptions.colorScheme) {
      console.log(
        chalk.magenta(`  → colorScheme: ${contextOptions.colorScheme}`)
      );
    } else if (variantConfig) {
      console.log(chalk.yellow(`  ⚠ No colorScheme set for video capture`));
    }

    const context = await browser.newContext(contextOptions);
    debug("Browser context created");
    page = await context.newPage();
    debug("Page created");
    await installVisibleCursor(page);

    // CRITICAL: Hide development overlays (Next.js devtools, Vercel toolbar, etc.)
    // This prevents dev tools from intercepting clicks during video capture
    const hideDevtoolsCSS = `
      /* Next.js Development Overlay */
      [data-nextjs-dialog],
      [data-nextjs-dialog-overlay],
      [data-nextjs-toast],
      #__next-build-watcher,
      nextjs-portal,
      
      /* Vercel Toolbar */
      [data-vercel-toolbar],
      #vercel-live-feedback,
      
      /* React DevTools */
      #__REACT_DEVTOOLS_GLOBAL_HOOK__,
      
      /* Common hot reload indicators */
      [data-hot-reload],
      .webpack-hot-middleware-clientOverlay {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;

    // Inject CSS early via addInitScript so it runs before page loads
    await page.addInitScript((css) => {
      const style = document.createElement("style");
      style.setAttribute("data-reshot-devtools-hide", "true");
      style.textContent = css;

      // Try to add immediately, or wait for head/body
      const addStyle = () => {
        if (document.head) {
          document.head.appendChild(style);
        } else if (document.body) {
          document.body.appendChild(style);
        } else {
          document.addEventListener("DOMContentLoaded", () => {
            (document.head || document.body).appendChild(style);
          });
        }
      };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", addStyle);
      } else {
        addStyle();
      }
    }, hideDevtoolsCSS);
    debug("Dev overlays CSS injected via addInitScript");

    // Inject privacy masking CSS for video capture (persists through entire recording)
    if (hasVideoPrivacy) {
      const privacyCss = generatePrivacyCSS(videoPrivacyConfig);
      if (privacyCss) {
        await page.addInitScript((css) => {
          const style = document.createElement("style");
          style.setAttribute("data-reshot-privacy", "true");
          style.textContent = css;
          const addStyle = () => {
            if (document.head) {
              document.head.appendChild(style);
            } else if (document.body) {
              document.body.appendChild(style);
            } else {
              document.addEventListener("DOMContentLoaded", () => {
                (document.head || document.body).appendChild(style);
              });
            }
          };
          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", addStyle);
          } else {
            addStyle();
          }
        }, privacyCss);
        debug("Privacy CSS injected via addInitScript for video capture");
      }
    }

    // Apply all variant injections (localStorage, sessionStorage, cookies, scripts)
    if (variantConfig) {
      debug("Applying variant config...");
      await applyVariantToPage(page, variantConfig, (msg) => debug(msg));

      // Set up header interception if needed
      if (
        variantConfig.headers &&
        Object.keys(variantConfig.headers).length > 0
      ) {
        await setupHeaderInterception(page, variantConfig.headers);
        debug("Header interception set up");
      }
    }

    // CRITICAL: Auto-inject workspace store data (projectId + workspace) into Zustand store
    // Without both fields, the app shows "Failed to load project"
    let _activeProjectId = null;
    let _activeWorkspace = null;
    try {
      const settings = config.readSettings() || {};
      const projectId = settings.urlVariables?.PROJECT_ID || settings.projectId;
      const workspace = settings.workspace || null;
      if (projectId) {
        _activeProjectId = projectId;
        _activeWorkspace = workspace;
        await page.addInitScript(({ pid, ws }) => {
          const storeState = {
            activeProjectId: pid,
            sidebarMinimized: true,
          };
          if (ws) {
            storeState.activeWorkspace = { id: ws.id, name: ws.name, slug: ws.slug };
          }

          const storePrefixes = ["reshot-store-", "workspace-store-"];
          let found = false;
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && storePrefixes.some((prefix) => key.startsWith(prefix))) {
              try {
                const data = JSON.parse(localStorage.getItem(key) || "{}");
                data.state = { ...data.state, ...storeState };
                data.version = data.version ?? 0;
                localStorage.setItem(key, JSON.stringify(data));
                found = true;
              } catch (e) {}
            }
          }
          if (!found) {
            localStorage.setItem(
              "reshot-store-workspace",
              JSON.stringify({ state: storeState, version: 0 })
            );
          }
        }, { pid: projectId, ws: workspace });
        debug(`Injected workspace store: projectId=${projectId.slice(0, 12)}...${workspace ? `, workspace=${workspace.slug}` : ""}`);
      }
    } catch (e) {
      // Settings not available, continue without injection
    }

    const startTime = Date.now();

    // ============================================
    // SENTINEL CAPTURE SETUP
    // ============================================
    const actualOutputDir =
      outputDir || path.join(".reshot/output", scenario.key, "default");
    const sentinelDir = path.join(actualOutputDir, "sentinels");
    fs.ensureDirSync(sentinelDir);
    const sentinelPaths = [];
    let sentinelIndex = 0;
    let hasAppliedStorageReload = false; // Track if we've reloaded for localStorage

    async function moveMouseToBox(box) {
      if (!box) return;
      const x = Math.round(box.x + box.width / 2);
      const y = Math.round(box.y + box.height / 2);
      await page.mouse.move(x, y, { steps: 18 });
      await page.waitForTimeout(120);
    }

    /**
     * Capture a sentinel frame (full page screenshot)
     * Applies scenario-level cropping if configured
     * @param {string} label - Label for the sentinel (e.g., "initial", "after-click-1")
     */
    async function captureSentinel(label) {
      const sentinelPath = path.join(
        sentinelDir,
        `step-${sentinelIndex}-${label}.png`
      );

      // CRITICAL: Final theme enforcement right before capture
      await page.evaluate(() => {
        if (window.__RESHOT_THEME_OVERRIDE__) {
          const wanted = window.__RESHOT_THEME_OVERRIDE__;
          document.documentElement.classList.remove("dark", "light");
          document.documentElement.classList.add(wanted);
          document.documentElement.style.colorScheme = wanted;
          document.documentElement.setAttribute("data-theme", wanted);
        }
      });
      await page.waitForTimeout(50);

      let buffer = await page.screenshot({ fullPage: false });

      // Resolve selector-based crop to a bounding box region (sentinel)
      if (scenarioCropConfig && scenarioCropConfig.enabled && scenarioCropConfig.selector && !scenarioCropConfig.region) {
        try {
          const box = await page.evaluate((sel) => {
            const selectors = sel.split(',').map(s => s.trim());
            for (const s of selectors) {
              const el = document.querySelector(s);
              if (el) {
                const rect = el.getBoundingClientRect();
                return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
              }
            }
            return null;
          }, scenarioCropConfig.selector);
          if (box) {
            scenarioCropConfig.region = box;
          } else {
            debug(`Crop selector not found (sentinel): ${scenarioCropConfig.selector}`);
          }
        } catch (e) {
          debug(`Failed to resolve crop selector (sentinel): ${e.message}`);
        }
      }

      // Apply cropping if configured at scenario level
      if (
        scenarioCropConfig &&
        scenarioCropConfig.enabled &&
        isSharpAvailable()
      ) {
        try {
          const deviceScaleFactor = await page.evaluate(
            () => window.devicePixelRatio || 1
          );
          buffer = await cropImageBuffer(buffer, scenarioCropConfig, {
            deviceScaleFactor,
          });
          debug(
            `Cropped sentinel ${label} to region: ${JSON.stringify(
              scenarioCropConfig.region
            )}`
          );
        } catch (cropError) {
          debug(`Crop failed for sentinel ${label}: ${cropError.message}`);
          // Continue with uncropped buffer
        }
      }

      // Apply style processing to sentinel frames (same as step-by-step captures)
      if (hasSentinelStyle && isStyleAvailable()) {
        try {
          const effectiveStyleConfig = { ...sentinelStyleConfig };
          if (variantConfig?.browserOptions?.colorScheme === "dark") {
            effectiveStyleConfig._darkMode = true;
          }
          const sentinelDpr = await page.evaluate(() => window.devicePixelRatio || 1);
          buffer = await applyStyle(buffer, effectiveStyleConfig, (msg) => debug(msg), sentinelDpr);
        } catch (styleError) {
          debug(`Style failed for sentinel ${label}: ${styleError.message}`);
        }
      }

      await fs.writeFile(sentinelPath, buffer);
      sentinelPaths.push({ index: sentinelIndex, label, path: sentinelPath });
      if (firstSentinelTimestamp === null) {
        firstSentinelTimestamp = (Date.now() - startTime) / 1000;
        debug(`First sentinel captured at ${firstSentinelTimestamp.toFixed(2)}s`);
      }
      sentinelIndex++;
      return sentinelPath;
    }

    // Capture initial state BEFORE first navigation (placeholder - actual capture after goto)
    let hasNavigated = false;
    let firstSentinelTimestamp = null;

    // Execute all steps and capture timeline
    for (let stepIndex = 0; stepIndex < script.length; stepIndex++) {
      const step = script[stepIndex];
      const { action, ...params } = step;
      const timestamp = (Date.now() - startTime) / 1000;
      debug(`Executing step ${stepIndex + 1}/${script.length}: ${action}`);

      if (action === "goto") {
        // Apply URL params from variant if any
        let url = params.url;
        if (variantConfig?.urlParams) {
          url = applyUrlParams(url, variantConfig.urlParams);
        }
        // Handle relative URLs by prepending baseUrl
        const fullUrl = url.startsWith("http") ? url : `${baseUrl || ""}${url}`;
        console.log(chalk.gray(`  → Navigate to ${fullUrl}`));
        await page.goto(fullUrl, { waitUntil: "domcontentloaded" });

        // CRITICAL: For SSR apps with inline <script> tags that read localStorage
        // during HTML parsing, we must reload after navigation so the localStorage
        // values (set by addInitScript) are available to inline scripts
        if (variantConfig && !hasAppliedStorageReload) {
          hasAppliedStorageReload = true;
          const didReload = await applyStorageAndReload(
            page,
            variantConfig,
            (msg) => debug(msg)
          );
          if (didReload) {
            debug("Page reloaded with localStorage applied for video capture");
          }
        }

        // Wait for network to settle and i18n to render
        try {
          await page.waitForLoadState("networkidle", { timeout: 5000 });
        } catch (e) {
          // Okay if timeout
        }
        await page.waitForTimeout(300); // Extra time for i18n/translations to render
        await waitForLoadingComplete(page, 5000);

        if (readySelector) {
          let readyError = null;
          const maxAttempts = 1 + scenarioCaptureConfig.retryOnError;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              await page.locator(readySelector).first().waitFor({
                state: "visible",
                timeout: scenarioCaptureConfig.readyTimeout,
              });
              readyError = null;
              break;
            } catch (error) {
              readyError = error;
              if (attempt === maxAttempts) {
                break;
              }

              const delay =
                scenarioCaptureConfig.retryDelay * Math.pow(2, attempt - 1);
              console.log(
                chalk.yellow(
                  `  ⚠ Attempt ${attempt}/${maxAttempts} failed (ready selector timeout). Retrying in ${delay}ms...`
                )
              );
              await page.waitForTimeout(delay);
              await page.reload({ waitUntil: "domcontentloaded" });
              await page.waitForTimeout(300);
              await waitForLoadingComplete(page, 5000);
            }
          }

          if (readyError) {
            const currentUrl = page.url();
            throw new Error(
              `Scenario readySelector "${readySelector}" not found in video capture mode at ${currentUrl}. ${
                readyError instanceof Error ? readyError.message : String(readyError)
              }`
            );
          }
        }

        await assertForbiddenTextAbsent(page, forbidText);

        // Re-inject workspace store after navigation to handle Zustand hydration resets
        if (_activeProjectId) {
          await page.evaluate(({ pid, ws }) => {
            const storePrefixes = ["reshot-store-", "workspace-store-"];
            let foundKey = null;
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && storePrefixes.some((prefix) => key.startsWith(prefix))) {
                try {
                  const data = JSON.parse(localStorage.getItem(key) || "{}");
                  if (data.state) {
                    data.state.activeProjectId = pid;
                    if (ws) data.state.activeWorkspace = data.state.activeWorkspace || { id: ws.id, name: ws.name, slug: ws.slug };
                    data.version = data.version ?? 0;
                    localStorage.setItem(key, JSON.stringify(data));
                    foundKey = key;
                  }
                } catch (e) {}
              }
            }
            window.dispatchEvent(new StorageEvent("storage", { key: foundKey || "reshot-store-workspace" }));
          }, { pid: _activeProjectId, ws: _activeWorkspace });
        }

        // Capture sentinel after navigation (initial state)
        if (!hasNavigated) {
          await captureSentinel("initial");
          hasNavigated = true;
        }

        events.push({
          action: "goto",
          timestamp,
          subtitle: `Navigating to ${url}`,
          elementBox: null,
        });
        continue;
      }

      if (action === "keyboard") {
        console.log(chalk.gray(`  → Keyboard: ${params.key}`));
        await page.keyboard.press(params.key);
        await page.waitForTimeout(300);

        events.push({
          action: "keyboard",
          timestamp,
          subtitle: subtitles.enabled ? `Press ${params.key}` : "",
          elementBox: null,
        });

        // Capture sentinel after keyboard action
        await captureSentinel(`after-keyboard-${stepIndex}`);
        continue;
      }

      if (action === "click") {
        const target = params.target;
        const isOptional = params.optional === true;
        const clickTimeout = isOptional ? 3000 : 10000; // Shorter timeout for optional clicks
        console.log(
          chalk.gray(`  → Click: ${target}${isOptional ? " (optional)" : ""}`)
        );

        try {
          const element = await page.locator(target).first();
          await element.waitFor({ state: "visible", timeout: clickTimeout });
          const box = await element.boundingBox();

          await moveMouseToBox(box);
          await element.click();

          events.push({
            action: "click",
            timestamp,
            target,
            subtitle: subtitles.enabled ? `Click on ${target}` : "",
            elementBox: box,
          });

          await page.waitForTimeout(500);

          // Capture sentinel after click
          await captureSentinel(`after-click-${stepIndex}`);
        } catch (e) {
          if (!isOptional) {
            throw new Error(
              `Required click target not found: ${target}. ${e instanceof Error ? e.message : String(e)}`
            );
          }
          console.warn(
            chalk.yellow(`    ⚠ Could not click ${target}: ${e.message}`)
          );
        }
        continue;
      }

      if (action === "type") {
        const target = params.target;
        const text = params.text;
        const isOptional = params.optional === true;
        const typeTimeout = isOptional ? 3000 : 10000; // Shorter timeout for optional type actions
        console.log(
          chalk.gray(
            `  → Type into: ${target}${isOptional ? " (optional)" : ""}`
          )
        );

        try {
          const element = await page.locator(target).first();
          await element.waitFor({ state: "visible", timeout: typeTimeout });
          const box = await element.boundingBox();

          await moveMouseToBox(box);
          await element.fill("");
          await element.type(text, { delay: typeDelayMs }); // Visible typing effect

          events.push({
            action: "type",
            timestamp,
            target,
            subtitle: subtitles.enabled ? `Entering "${text}"` : "",
            elementBox: box,
          });

          await page.waitForTimeout(300);

          // Capture sentinel after type
          await captureSentinel(`after-type-${stepIndex}`);
        } catch (e) {
          if (!isOptional) {
            throw new Error(
              `Required input target not found: ${target}. ${e instanceof Error ? e.message : String(e)}`
            );
          }
          console.warn(
            chalk.yellow(`    ⚠ Could not type into ${target}: ${e.message}`)
          );
        }
        continue;
      }

      if (action === "wait") {
        await page.waitForTimeout(params.ms || 1000);
        continue;
      }

      if (action === "waitFor") {
        const isOptional = params.optional === true;
        const waitTimeout = params.timeout || (isOptional ? 3000 : 10000);
        try {
          await page.locator(params.target).first().waitFor({
            state: "visible",
            timeout: waitTimeout,
          });
        } catch (e) {
          if (!isOptional) {
            const currentUrl = page.url();
            throw new Error(
              `Required selector not found in video capture: ${params.target} (URL: ${currentUrl}, timeout: ${waitTimeout}ms)`
            );
          }
        }
        continue;
      }

      if (action === "hover") {
        const isOptional = params.optional === true;
        const hoverTimeout = isOptional ? 3000 : 10000;
        console.log(
          chalk.gray(
            `  → Hover: ${params.target}${isOptional ? " (optional)" : ""}`
          )
        );
        try {
          const element = await page.locator(params.target).first();
          await element.waitFor({ state: "visible", timeout: hoverTimeout });
          const box = await element.boundingBox();
          await moveMouseToBox(box);
          await element.hover();
          await page.waitForTimeout(300);
          // Capture sentinel after hover (state may have changed with tooltips/dropdowns)
          await captureSentinel(`after-hover-${stepIndex}`);
        } catch (e) {
          if (!isOptional) {
            throw new Error(
              `Required hover target not found: ${params.target}. ${e instanceof Error ? e.message : String(e)}`
            );
          }
          console.warn(
            chalk.yellow(`    ⚠ Could not hover ${params.target}: ${e.message}`)
          );
        }
        continue;
      }
    }

    // Capture final sentinel
    await captureSentinel("final");
    console.log(
      chalk.green(`  ✔ Captured ${sentinelPaths.length} sentinel frames`)
    );

    // Record final timestamp for trimming
    const finalTimestamp = (Date.now() - startTime) / 1000;
    debug(`Final action timestamp: ${finalTimestamp}s`);

    // Brief wait to let the final state render
    debug("All steps executed, waiting before finalizing video...");
    await page.waitForTimeout(500);

    // Get the video path from Playwright BEFORE closing the context
    const video = page.video();
    debug(`Video object exists: ${!!video}`);
    let recordedVideoPath = null;

    if (video) {
      // Close context to finalize video
      debug("Closing context to finalize video...");
      await context.close();
      console.log(chalk.green("  ✔ Video recorded"));

      // Get the path after closing (this ensures video is written)
      recordedVideoPath = await video.path();
      debug(`Recorded video path from Playwright: ${recordedVideoPath}`);
    } else {
      // Fallback: close and scan directory
      debug("No video object, using fallback directory scan...");
      await context.close();
      console.log(chalk.green("  ✔ Video recorded"));

      // Wait for video file to be written
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Find the recorded video in the unique temp directory
      const videoFiles = fs
        .readdirSync(tempDir)
        .filter((f) => f.endsWith(".webm"));
      debug(
        `Found ${videoFiles.length} video files in temp dir: ${videoFiles.join(
          ", "
        )}`
      );
      if (videoFiles.length === 0) {
        throw new Error("No video file was created");
      }
      // Sort by modification time to get the newest
      const sortedFiles = videoFiles
        .map((f) => ({
          name: f,
          mtime: fs.statSync(path.join(tempDir, f)).mtime,
        }))
        .sort((a, b) => b.mtime - a.mtime);
      recordedVideoPath = path.join(tempDir, sortedFiles[0].name);
      debug(`Using video file: ${recordedVideoPath}`);
    }

    if (!recordedVideoPath || !fs.existsSync(recordedVideoPath)) {
      const existingFiles = fs.existsSync(tempDir)
        ? fs.readdirSync(tempDir)
        : [];
      debug(`Temp dir contents: ${existingFiles.join(", ") || "empty"}`);
      throw new Error(
        `Video file not found after recording. Expected: ${recordedVideoPath}`
      );
    }

    const videoSize = fs.statSync(recordedVideoPath).size;
    debug(`Video file size: ${videoSize} bytes`);
    console.log(
      chalk.gray(
        `  → Source video: ${recordedVideoPath} (${(videoSize / 1024).toFixed(
          1
        )} KB)`
      )
    );

    // Convert to MP4 with ffmpeg, trimming blank loading frames from start
    // and excess frames from end
    const startOffset = Math.max(0, (firstSentinelTimestamp || 0) - 0.3);
    const endTimestamp = finalTimestamp + 0.25;
    const contentDuration = endTimestamp - startOffset;
    if (startOffset > 0) {
      console.log(
        chalk.cyan(
          `  📹 Converting to MP4 (${startOffset.toFixed(1)}s–${endTimestamp.toFixed(1)}s, ${contentDuration.toFixed(1)}s content)...`
        )
      );
    } else {
      console.log(
        chalk.cyan(
          `  📹 Converting to MP4 (trimmed to ${contentDuration.toFixed(1)}s)...`
        )
      );
    }
    debug(`Running ffmpeg: start=${startOffset}s, duration=${contentDuration}s`);
    await runFFmpegConvert([
      "-ss",
      startOffset.toFixed(2),
      "-i",
      recordedVideoPath,
      "-t",
      contentDuration.toFixed(2),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(videoFrameRate),
      "-movflags",
      "+faststart",
      "-y",
      finalVideoPath,
    ]);

    const finalSize = fs.existsSync(finalVideoPath)
      ? fs.statSync(finalVideoPath).size
      : 0;
    debug(`Final video size: ${finalSize} bytes`);
    console.log(
      chalk.green(
        `  ✔ Video saved: ${finalVideoPath} (${(finalSize / 1024).toFixed(
          1
        )} KB)`
      )
    );

    // Save timeline for reference
    const timelinePath = path.join(
      outputDir || path.join(".reshot/output", scenario.key, "default"),
      "timeline.json"
    );
    fs.writeFileSync(timelinePath, JSON.stringify(events, null, 2));
    debug(`Timeline saved to: ${timelinePath}`);

    // Save sentinel manifest for the asset bundle
    const sentinelManifestPath = path.join(actualOutputDir, "sentinels.json");
    fs.writeJSONSync(
      sentinelManifestPath,
      {
        generatedAt: new Date().toISOString(),
        sentinels: sentinelPaths.map((s) => ({
          index: s.index,
          label: s.label,
          filename: path.basename(s.path),
        })),
      },
      { spaces: 2 }
    );
    debug(`Sentinel manifest saved to: ${sentinelManifestPath}`);

    const metadataPath = path.join(actualOutputDir, "summary-video.metadata.json");
    fs.writeJSONSync(
      metadataPath,
      buildVideoMetadata(events, sentinelPaths, viewport, videoFrameRate),
      { spaces: 2 },
    );
    debug(`Video metadata saved to: ${metadataPath}`);

    // Cleanup temp directory (unique per recording)
    try {
      fs.removeSync(tempDir);
      debug("Temp directory cleaned up");
    } catch (e) {
      debug(`Cleanup error: ${e.message}`);
    }

    // Return asset bundle info including sentinels
    return {
      success: true,
      assets: [
        {
          name: "summary-video",
          path: finalVideoPath,
          type: "video",
          duration: (Date.now() - startTime) / 1000,
          metadataPath,
        },
      ],
      sentinels: sentinelPaths.map((s) => ({
        index: s.index,
        label: s.label,
        path: s.path,
      })),
    };
  } catch (error) {
    console.error(
      chalk.red(
        `\n  ❌ Video capture for '${scenario.name || scenario.key}' failed: ${
          error.message
        }`
      )
    );
    if (DEBUG) {
      console.error(chalk.red("  Stack trace:"));
      console.error(chalk.gray(error.stack));
    }
    // Cleanup temp directory on error too
    try {
      fs.removeSync(tempDir);
    } catch (e) {
      debug(`Cleanup error: ${e.message}`);
    }
    return { success: false, error: error.message, assets: [] };
  } finally {
    if (browser) {
      debug("Closing browser...");
      await browser.close();
    }
  }
}

/**
 * Check if ffmpeg is installed
 */
function checkFFmpeg() {
  const { spawn } = require("child_process");
  return new Promise((resolve) => {
    try {
      const proc = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
      proc.on("close", (code) => resolve(code === 0));
      proc.on("error", () => resolve(false));
    } catch (e) {
      resolve(false);
    }
  });
}

/**
 * Run ffmpeg conversion
 */
function runFFmpegConvert(args) {
  const { spawn } = require("child_process");
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(`ffmpeg failed with code ${code}: ${stderr.slice(-200)}`)
        );
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Run a scenario using the new capture engine
 * Routes to appropriate runner based on output.format
 *
 * Supported formats:
 * - "step-by-step-images" (default): Captures after each step with deduplication
 * - "summary-video": Records a video of the entire flow
 * - "legacy": Only captures explicit screenshot steps
 */
async function runScenarioWithEngine(scenario, options = {}) {
  const {
    outputDir,
    baseUrl,
    headless = true,
    viewport = { width: 1280, height: 720 },
    timeout = 30000,
    variantsConfig = {}, // Universal variant configuration
    storageStateData = null,
    globalQuality = null,
    quiet = false,
  } = options;

  const outputFormat = scenario.output?.format || "step-by-step-images";

  // Route to step-by-step capture (default - now with deduplication built-in)
  if (outputFormat === "step-by-step-images" || outputFormat === "smart") {
    return runScenarioWithStepByStepCapture(scenario, {
      ...options,
      variantsConfig,
      globalQuality,
    });
  }

  // Route to summary video generation
  if (outputFormat === "summary-video") {
    return runScenarioWithVideoCapture(scenario, {
      ...options,
      variantsConfig,
    });
  }

  // Legacy behavior: only capture explicit screenshot steps
  // Resolve variant configuration for this scenario
  const variantConfig = resolveVariantConfig(scenario, variantsConfig);
  const forbidText = collectForbiddenText(globalQuality, scenario);

  // Extract crop configuration from scenario output settings
  const outputConfig = scenario.output || {};
  const scenarioCropConfig = outputConfig.crop || null;

  if (!quiet) {
    console.log(chalk.bold(`\n📋 Scenario: ${scenario.name}`));
    console.log(chalk.gray(`   Key: ${scenario.key}`));

    // Log variant summary
    if (variantConfig?.summary?.length) {
      for (const item of variantConfig.summary) {
        console.log(chalk.gray(`   ${item}`));
      }
    }

    // Log crop config if enabled
    if (scenarioCropConfig && scenarioCropConfig.enabled) {
      console.log(
        chalk.gray(`   Crop: ${JSON.stringify(scenarioCropConfig.region)}`)
      );
    }
  }

  // Convert legacy steps to new format
  const script = convertLegacySteps(scenario);

  if (script.length === 0) {
    if (!quiet) console.log(chalk.yellow("  ⚠ No steps to execute"));
    return { success: true, assets: [] };
  }

  if (!quiet) console.log(chalk.gray(`   Steps: ${script.length}`));

  // Check for saved session state (auth cookies)
  const sessionPath = getDefaultSessionPath();
  const hasSession = fs.existsSync(sessionPath);
  if (!quiet && hasSession) {
    console.log(chalk.gray(`   Using saved auth session`));
  }

  const engine = new CaptureEngine({
    outputDir:
      outputDir || path.join(".reshot/output", scenario.key, "default"),
    baseUrl: baseUrl || "",
    viewport,
    headless,
    variantConfig, // Pass resolved variant config
    cropConfig: scenarioCropConfig, // Pass scenario-level crop config
    storageStatePath: hasSession ? sessionPath : null, // Use saved session if available
    storageStateData, // Pre-loaded auth state
    hideDevtools: true, // Always hide dev overlays in captures
    injectWorkspaceStore: scenario.needsWorkspaceInjection !== false,
    logger: quiet ? () => {} : (msg) => console.log(msg),
  });

  try {
    await engine.init();
    await assertForbiddenTextAbsent(engine.page, forbidText);
    const assets = await engine.runScript(script);

    if (!quiet) console.log(
      chalk.green(`\n  ✔ Scenario completed: ${assets.length} assets captured`)
    );

    return { success: true, assets, diagnostics: engine.getDiagnostics() };
  } catch (error) {
    console.error(chalk.red(`\n  ❌ Scenario failed: ${error.message}`));

    // Try to capture debug screenshot
    try {
      if (engine.page) {
        const debugPath = path.join(
          outputDir || ".reshot/output",
          scenario.key,
          "debug-failure.png"
        );
        fs.ensureDirSync(path.dirname(debugPath));
        await engine.page.screenshot({ path: debugPath, fullPage: true });
        console.error(chalk.yellow(`     Debug screenshot: ${debugPath}`));
      }
    } catch (e) {
      // Ignore screenshot errors
    }

    return { success: false, error: error.message, diagnostics: engine.getDiagnostics() };
  } finally {
    await engine.close();
  }
}

/**
 * Generate a timestamp string for versioned output
 */
function generateVersionTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19); // YYYY-MM-DD_HH-MM-SS
}

/**
 * Resolve output directory for a scenario capture
 * Supports output path templating with {{variables}}
 *
 * @param {Object} config - Global config
 * @param {Object} scenario - Scenario being captured
 * @param {Object} options - Additional options
 * @returns {Object} { outputDir, outputTemplate, useTemplating }
 */
function resolveScenarioOutputDir(config, scenario, options = {}) {
  const { variantOverride, timestamp, versioned = true } = options;

  // Check if output templating is configured
  // Use DEFAULT_OUTPUT_TEMPLATE if no template is specified in config or scenario
  const outputTemplate =
    config.output?.template ||
    scenario.output?.template ||
    DEFAULT_OUTPUT_TEMPLATE;

  if (outputTemplate) {
    // Use new output path templating system
    // Build directory template (remove filename portion)
    let dirTemplate = path.dirname(outputTemplate);

    // IMPORTANT: If versioned mode is enabled and template doesn't include timestamp/date/time,
    // automatically inject timestamp folder after scenario for proper versioning
    const hasTimestampVar = /\{\{(timestamp|date|time)\}\}/.test(
      outputTemplate
    );
    if (versioned && !hasTimestampVar && timestamp) {
      // Insert timestamp after {{scenario}} or at the start of the path after base dir
      const scenarioMatch = dirTemplate.match(
        /^(.*)(\{\{scenario(Key)?\}\})(.*?)$/
      );
      if (scenarioMatch) {
        // Insert timestamp right after scenario
        dirTemplate = `${scenarioMatch[1]}{{scenario}}/{{timestamp}}${scenarioMatch[4]}`;
      } else {
        // No scenario in template, add timestamp as first folder after base
        const parts = dirTemplate.split("/");
        if (parts.length > 1) {
          // Insert timestamp after first path segment
          parts.splice(1, 0, "{{timestamp}}");
          dirTemplate = parts.join("/");
        } else {
          dirTemplate = `${dirTemplate}/{{timestamp}}`;
        }
      }
    }

    // Build context for this capture
    const variant = variantOverride || scenario.variant || {};
    const resolvedViewport = resolveViewport(config.viewport);

    const context = buildTemplateContext({
      scenario,
      assetName: "placeholder", // Will be replaced per-asset
      stepIndex: 0,
      variant,
      timestamp,
      viewport: resolvedViewport,
      viewportPresetName: resolvedViewport.presetName,
    });

    // Resolve directory path
    const outputDir = resolveOutputPath(dirTemplate + "/{{name}}.{{ext}}", {
      ...options,
      scenario,
      assetName: "placeholder",
      variant,
      timestamp,
      viewport: resolvedViewport,
    }).replace(/\/placeholder\.png$/, "");

    // For templating mode, versionFolder is the timestamp
    const versionFolder = timestamp || "latest";

    return {
      outputDir,
      outputTemplate,
      useTemplating: true,
      context,
      versionFolder,
    };
  }

  // Legacy output directory logic
  let versionFolder = versioned ? timestamp : "latest";
  if (variantOverride) {
    const variantSlug = Object.entries(variantOverride)
      .map(([k, v]) => `${k}-${v}`)
      .join("_");
    versionFolder = path.join(versionFolder, variantSlug);
  }

  const outputDir = path.join(
    config.assetDir || ".reshot/output",
    scenario.key,
    versionFolder
  );

  return {
    outputDir,
    outputTemplate: null,
    useTemplating: false,
    context: null,
    versionFolder,
  };
}

/**
 * Helper to generate variant combinations for a specific scenario
 * Uses scenario.variants.dimensions to filter which dimensions to expand
 */
function generateScenarioVariantCombinations(scenario, variantsConfig) {
  const scenarioVariants = scenario.variants || {};
  const dimensionKeys = scenarioVariants.dimensions || [];

  if (dimensionKeys.length === 0) {
    return []; // No variants for this scenario
  }

  const dimensions = variantsConfig.dimensions || {};
  const validKeys = dimensionKeys.filter((key) => {
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

  // Generate cartesian product
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

/**
 * Detect optimal concurrency based on system resources.
 * Each browser context uses ~250MB of memory.
 * @returns {number}
 */
function detectOptimalConcurrency() {
  const cpuCount = Math.max(1, os.cpus().length - 1); // Leave one for system
  const freeMem = os.freemem();
  const memSlots = Math.max(1, Math.floor(freeMem / (250 * 1024 * 1024))); // 250MB per context
  const optimal = Math.min(cpuCount, memSlots, 8); // Cap at 8
  return Math.max(1, optimal);
}

function normalizeAuthPreflightTargets(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  const normalized = String(value || "").trim();
  return normalized ? [normalized] : [];
}

function resolveAuthPreflightTargets(config, options = {}) {
  const { scenarioKeys = null } = options;
  const scenarios = config.scenarios || [];
  const selectedScenarios =
    Array.isArray(scenarioKeys) && scenarioKeys.length > 0
      ? scenarios.filter((scenario) => scenarioKeys.includes(scenario.key))
      : scenarios;
  const liveAuthScenarios = selectedScenarios.filter(
    (scenario) => scenario.captureClass === "live-auth",
  );
  const configuredTargets = normalizeAuthPreflightTargets(
    config.target?.authPreflightUrls || config.target?.authPreflightUrl,
  );
  const scenarioTargets = liveAuthScenarios
    .map((scenario) => scenario.authPreflightUrl || scenario.url)
    .filter(Boolean);
  const targets = Array.from(
    new Set([
      ...configuredTargets,
      ...scenarioTargets,
    ]),
  );

  return {
    selectedScenarioKeys: selectedScenarios.map((scenario) => scenario.key),
    liveAuthScenarioKeys: liveAuthScenarios.map((scenario) => scenario.key),
    targets: targets.length > 0 || liveAuthScenarios.length === 0
      ? targets
      : ["/app/projects"],
  };
}

/**
 * Run all scenarios from config
 */
async function runAllScenarios(config, options = {}) {
  const {
    scenarioKeys,
    headless = true,
    versioned = true,
    variantOverride,
    concurrency = 1,
    sharedTimestamp, // Optional shared timestamp for variant expansion
  } = options;

  console.log(chalk.cyan("🎬 Running capture scenarios...\n"));

  const scenarios = config.scenarios || [];
  const toRun =
    scenarioKeys?.length > 0
      ? scenarios.filter((scenario) => scenarioKeys.includes(scenario.key))
      : scenarios;

  if (toRun.length === 0) {
    console.log(chalk.yellow("No scenarios to run"));
    return { success: true, results: [] };
  }

  // Auto-sync session from CDP browser if available
  // This allows captures to use the authenticated session from a running Chrome instance
  try {
    const sessionPath = getDefaultSessionPath();
    const syncResult = await autoSyncSessionFromCDP(sessionPath, (msg) =>
      console.log(msg)
    );
    if (syncResult.synced) {
      console.log(
        chalk.gray(`  → Using authenticated session from CDP browser\n`)
      );
    } else if (syncResult.reason === "no_cdp") {
      const hasExistingSession = fs.existsSync(sessionPath);
      if (hasExistingSession) {
        const sessionAge = Date.now() - fs.statSync(sessionPath).mtimeMs;
        const ageMinutes = Math.round(sessionAge / 60000);
        const ageLabel = ageMinutes < 60 ? `${ageMinutes}m ago` : `${Math.round(ageMinutes / 60)}h ago`;
        console.log(
          chalk.gray(`  → CDP browser not found — using cached session (saved ${ageLabel})\n`)
        );
      } else {
        console.log(
          chalk.yellow(`  ⚠ No CDP browser detected and no cached session found.`)
        );
        console.log(
          chalk.yellow(`    Scenarios requiring auth will fail.\n`)
        );
        console.log(
          chalk.gray(`    To fix: launch Chrome with remote debugging enabled:`)
        );
        console.log(
          chalk.gray(`    google-chrome --remote-debugging-port=9222\n`)
        );
      }
    }
  } catch (e) {
    // Silently continue - session sync is optional
  }

  // Run auth pre-flight check if any scenario requires auth
  const captureConfig = getCaptureConfig(config.capture || {});
  const authPreflight = resolveAuthPreflightTargets(config, { scenarioKeys });
  const hasLiveAuthScenarios = authPreflight.liveAuthScenarioKeys.length > 0;

  if (captureConfig.preflightCheck && hasLiveAuthScenarios) {
    const sessionPath = getDefaultSessionPath();
    const hasSession = fs.existsSync(sessionPath);
    if (hasSession) {
      const preflightResult = await preflightAuthCheck(
        config.baseUrl || "",
        {
          storageStatePath: sessionPath,
          viewport: config.viewport || { width: 1280, height: 720 },
          authCheckUrl: authPreflight.targets,
        }
      );
      if (!preflightResult.ok) {
        console.log(chalk.red(`\n  ✖ ${preflightResult.message}\n`));
        return { success: false, results: [], error: preflightResult.message };
      }
    }
  }

  // Use shared timestamp if provided (for variant expansion), otherwise generate new one
  const runTimestamp = sharedTimestamp || generateVersionTimestamp();

  // Get variant configuration from config (new universal format)
  const variantsConfig = config.variants || {};

  // CRITICAL FIX: Expand scenarios based on their individual variant requirements
  // Each scenario can declare which variant dimensions it wants to expand across
  const expandedScenarios = [];

  for (const scenario of toRun) {
    // If there's a global variant override, use it for all scenarios (CLI flag takes precedence)
    if (variantOverride) {
      expandedScenarios.push({ scenario, variantOverride });
      continue;
    }

    // Check if this scenario needs variant expansion
    const scenarioVariantCombos = generateScenarioVariantCombinations(
      scenario,
      variantsConfig
    );

    if (scenarioVariantCombos.length > 0) {
      // Expand this scenario across all its variant combinations
      for (const variantCombo of scenarioVariantCombos) {
        expandedScenarios.push({ scenario, variantOverride: variantCombo });
      }
    } else {
      // No variants for this scenario, run it once with no variant override
      expandedScenarios.push({ scenario, variantOverride: null });
    }
  }

  const totalRuns = expandedScenarios.length;
  const effectiveConcurrency = Math.max(1, Math.min(concurrency, totalRuns));
  console.log(
    chalk.gray(
      `Running ${totalRuns} scenario variation(s) with ${effectiveConcurrency} worker(s)...\n`
    )
  );

  /**
   * Execute a single scenario variation (scenario + variant combination)
   * @param {Object} scenarioVariation - { scenario, variantOverride }
   * @param {Object} poolOptions - { storageStateData }
   */
  async function executeScenarioVariation(scenarioVariation, poolOptions = {}) {
    const { scenario, variantOverride: variantCombo } = scenarioVariation;
    const { storageStateData: ssData = null, quiet = false } = poolOptions;

    // Apply variant to the scenario
    let scenarioToRun = scenario;
    if (variantCombo && typeof variantCombo === "object") {
      // CRITICAL FIX: Merge the expanded variant with the scenario's base variant
      // This allows scenarios to declare a fixed role while varying theme, for example
      const baseVariant = scenario.variant || {};
      scenarioToRun = {
        ...scenario,
        variant: { ...baseVariant, ...variantCombo },
      };
    }

    // Resolve output directory using new templating system or legacy logic
    const outputResolution = resolveScenarioOutputDir(config, scenario, {
      variantOverride: variantCombo,
      timestamp: runTimestamp,
      versioned,
    });

    const { outputDir, outputTemplate, useTemplating, versionFolder } =
      outputResolution;

    // Also create/update 'latest' symlink or copy (for legacy mode)
    const latestDir = path.join(
      config.assetDir || ".reshot/output",
      scenario.key,
      "latest"
    );

    // Resolve viewport - support preset names and custom sizes
    const resolvedViewport = resolveViewport(config.viewport);

    const result = await runScenarioWithEngine(scenarioToRun, {
      outputDir,
      outputTemplate, // Pass template for per-asset path resolution
      useTemplating,
      baseUrl: config.baseUrl,
      viewport: resolvedViewport,
      timeout: config.timeout,
      headless,
      variantsConfig, // Pass universal variant config
      runTimestamp, // Pass timestamp for templating
      storageStateData: ssData,
      quiet,
      globalQuality: config.quality || null,
      noPrivacy: options.noPrivacy,
      noStyle: options.noStyle,
    });

    // After successful run, update 'latest' to point to this version (legacy mode only)
    if (result.success && versioned && !useTemplating) {
      try {
        // Remove existing latest folder/symlink
        if (fs.existsSync(latestDir)) {
          fs.removeSync(latestDir);
        }
        // Copy the versioned output to latest
        fs.copySync(outputDir, latestDir);
        console.log(chalk.gray(`  → Updated 'latest' symlink`));
      } catch (e) {
        // Ignore symlink errors
      }
    }

    return {
      scenario: scenario.key,
      key: scenario.key,
      version: versionFolder,
      timestamp: versioned ? runTimestamp : null,
      outputDir,
      variant: variantCombo,
      ...result,
    };
  }

  // Pre-load auth state once to avoid redundant file reads across parallel workers
  let storageStateData = null;
  const sessionPath = getDefaultSessionPath();
  if (fs.existsSync(sessionPath)) {
    try {
      const rawState = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
      const { sanitized, stats } = sanitizeStorageState(rawState);
      storageStateData = sanitized;
      if (stats.fixed > 0 || stats.removed > 0 || stats.stripped > 0) {
        console.log(chalk.gray(`  → Sanitized cookies: ${stats.fixed} fixed, ${stats.removed} removed, ${stats.stripped} stripped`));
      }
      console.log(chalk.gray(`  → Pre-loaded auth state for ${totalRuns} workers`));
    } catch (_e) {
      // Fall back to file path per-engine
    }
  }

  // Helper to get a readable label for a scenario variation
  function getVariationLabel(scenarioVariation) {
    const { scenario, variantOverride: variantCombo } = scenarioVariation;
    if (variantCombo) {
      const variantLabel = Object.entries(variantCombo)
        .map(([dim, opt]) => {
          const dimension = variantsConfig.dimensions?.[dim];
          const option = dimension?.options?.[opt];
          return option?.name || opt;
        })
        .join(" \u2022 ");
      return `${scenario.name} (${variantLabel})`;
    }
    return scenario.name;
  }

  // Execute scenario variations with concurrency
  const results = [];
  let allSuccess = true;
  const tracker = new ProgressTracker(totalRuns, { concurrency: effectiveConcurrency });

  if (effectiveConcurrency > 1) {
    // Parallel execution with streaming worker pool (each worker launches its own browser)
    console.log(chalk.gray(`  → ${effectiveConcurrency} concurrent workers, each with isolated browser\n`));

    const pool = new WorkerPool(effectiveConcurrency, {
      onProgress: ({ completed, total, active, durationMs, result, error, task }) => {
        tracker.recordCompletion(durationMs);

        // Per-scenario completion line
        const label = task ? getVariationLabel(task) : `Scenario ${completed}`;
        const success = result && result.success !== false;
        console.log(
          success
            ? chalk.green(`  ${tracker.formatCompletionLine(label, durationMs, true)}`)
            : chalk.red(`  ${tracker.formatCompletionLine(label, durationMs, false, error?.message)}`)
        );

        // Structured progress line (parseable by Studio UI)
        console.log(chalk.cyan(`  ${tracker.formatProgressLine(active, durationMs)}`));
      },
    });

    const poolResults = await pool.runAll(expandedScenarios, (sv) =>
      executeScenarioVariation(sv, { storageStateData, quiet: true })
    );

    for (const result of poolResults) {
      results.push(result);
      if (!result.success) {
        allSuccess = false;
      }
    }
  } else {
    // Sequential execution (no pool needed)
    for (const scenarioVariation of expandedScenarios) {
      const label = getVariationLabel(scenarioVariation);
      console.log(chalk.gray(`\n  Starting: ${label}`));

      const taskStart = Date.now();
      const result = await executeScenarioVariation(scenarioVariation, { storageStateData });
      const durationMs = Date.now() - taskStart;
      tracker.recordCompletion(durationMs);

      results.push(result);
      if (!result.success) {
        allSuccess = false;
      }

      // Per-scenario completion line
      console.log(
        result.success
          ? chalk.green(`  ${tracker.formatCompletionLine(label, durationMs, true)}`)
          : chalk.red(`  ${tracker.formatCompletionLine(label, durationMs, false, result.error)}`)
      );

      // Structured progress line
      console.log(chalk.cyan(`  ${tracker.formatProgressLine(0, durationMs)}`));
    }
  }

  // Summary
  const summary = tracker.getSummary();
  console.log(chalk.bold("\n\uD83D\uDCCA Summary"));
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(chalk.gray(`   Total: ${results.length} in ${summary.elapsed}`));
  console.log(chalk.green(`   Successful: ${successful}`));
  if (failed > 0) {
    console.log(chalk.red(`   Failed: ${failed}`));
  }
  console.log(chalk.gray(`   Avg: ${summary.avgDuration}/scenario | Throughput: ${summary.throughput}/min`));
  if (effectiveConcurrency > 1) {
    console.log(chalk.gray(`   Workers: ${effectiveConcurrency} parallel`));
  }
  if (versioned) {
    console.log(chalk.gray(`   Version: ${runTimestamp}`));
  }

  return { success: allSuccess, results, version: runTimestamp };
}

module.exports = {
  convertLegacySteps,
  substituteUrlVariables,
  runScenarioWithEngine,
  runScenarioWithStepByStepCapture,
  runScenarioWithVideoCapture,
  buildVideoMetadata,
  captureWithHighlight,
  checkFFmpeg,
  runAllScenarios,
  calculateImageHash,
  imagesAreIdentical,
  waitForVisualStability,
  // Error detection & retry
  retryInteractiveStep,
  promoteLastGotoUrl,
  executeWithRetry,
  preflightAuthCheck,
  resolveAuthPreflightTargets,
  collectForbiddenText,
  assertForbiddenTextAbsent,
  normalizeVisibleText,
  // New exports for output templating
  resolveScenarioOutputDir,
  generateVersionTimestamp,
  // Concurrency
  detectOptimalConcurrency,
  installVisibleCursor,
  normalizeVideoTargetName,
};
