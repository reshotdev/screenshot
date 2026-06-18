// record-cdp.js - CDP connection utilities for record command
const { chromium } = require("playwright");
const chalk = require("chalk");
const http = require("http");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");

/**
 * Check if Chrome CDP endpoint is available
 * @param {string} host
 * @param {number} port
 * @returns {Promise<{available: boolean, targets?: any[], error?: string}>}
 */
async function checkCdpEndpoint(host = "localhost", port = 9222) {
  return new Promise((resolve) => {
    const url = `http://${host}:${port}/json/version`;

    const req = http.get(url, { timeout: 3000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const info = JSON.parse(data);
          resolve({ available: true, info });
        } catch (e) {
          resolve({
            available: false,
            error: "Invalid response from CDP endpoint",
          });
        }
      });
    });

    req.on("error", (err) => {
      resolve({ available: false, error: err.message });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ available: false, error: "Connection timeout" });
    });
  });
}

/**
 * Get list of available pages from CDP
 * @param {string} host
 * @param {number} port
 * @returns {Promise<any[]>}
 */
async function getCdpTargets(host = "localhost", port = 9222) {
  return new Promise((resolve, reject) => {
    const url = `http://${host}:${port}/json/list`;

    const req = http.get(url, { timeout: 3000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const targets = JSON.parse(data);
          resolve(targets);
        } catch (e) {
          reject(new Error("Failed to parse CDP targets"));
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout getting CDP targets"));
    });
  });
}

/**
 * Connect to an active Chrome instance via CDP with enhanced error handling
 * @param {Object} options - Connection options
 * @param {boolean} options.autoLaunch - Whether to auto-launch Chrome if not running (not implemented yet)
 * @param {boolean} options.uiMode - Whether we're in UI mode (affects error messages)
 * @param {string} options.targetUrl - Specific URL to connect to (optional)
 * @param {string} options.targetId - Specific target ID to connect to (optional)
 * @returns {Promise<{browser, context, page}>} Connected browser objects
 */
async function connectToActivePage(options = {}) {
  const { uiMode = false, targetUrl = null, targetId = null } = options;
  const host = "localhost";
  const port = 9222;
  const cdpUrl = `http://${host}:${port}`;

  // Step 1: Check if CDP endpoint is reachable
  console.log(
    chalk.gray(`[CDP] Checking if Chrome is available at ${cdpUrl}...`)
  );

  const endpointCheck = await checkCdpEndpoint(host, port);

  if (!endpointCheck.available) {
    console.error(
      chalk.red(
        `\n❌ Chrome CDP endpoint not reachable: ${endpointCheck.error}`
      )
    );
    printChromeInstructions();
    throw new Error(
      `Chrome is not running with remote debugging enabled. ${endpointCheck.error}`
    );
  }

  console.log(
    chalk.gray(
      `[CDP] Chrome found: ${endpointCheck.info?.Browser || "Unknown browser"}`
    )
  );

  // Step 2: Get available targets
  let targets;
  try {
    targets = await getCdpTargets(host, port);
    console.log(chalk.gray(`[CDP] Found ${targets.length} browser targets`));
  } catch (error) {
    console.error(
      chalk.red(`\n❌ Failed to get browser targets: ${error.message}`)
    );
    throw new Error(`Failed to enumerate browser tabs: ${error.message}`);
  }

  // Step 3: Find a suitable page target
  const pageTargets = targets.filter((t) => t.type === "page");

  if (pageTargets.length === 0) {
    console.error(chalk.red("\n❌ No open tabs found in Chrome"));
    console.log(
      chalk.yellow("Please open at least one tab in Chrome and try again.\n")
    );
    throw new Error("No open tabs found in Chrome. Please open a tab first.");
  }

  // Find the target based on options
  let bestTarget;

  if (targetId) {
    // Find by target ID
    bestTarget = pageTargets.find((t) => t.id === targetId);
    if (!bestTarget) {
      console.error(chalk.red(`\n❌ Target with ID ${targetId} not found`));
      throw new Error(
        `Target with ID ${targetId} not found. It may have been closed.`
      );
    }
    console.log(
      chalk.gray(
        `[CDP] Using specified target: ${bestTarget.title || bestTarget.url}`
      )
    );
  } else if (targetUrl) {
    // Find by URL (partial match)
    bestTarget = pageTargets.find((t) => t.url.includes(targetUrl));
    if (!bestTarget) {
      // Try more flexible matching
      const targetUrlLower = targetUrl.toLowerCase();
      bestTarget = pageTargets.find((t) =>
        t.url.toLowerCase().includes(targetUrlLower)
      );
    }
    if (!bestTarget) {
      console.error(chalk.red(`\n❌ No tab found matching URL: ${targetUrl}`));
      console.log(chalk.yellow("Available tabs:"));
      pageTargets.forEach((t) => console.log(chalk.gray(`  - ${t.url}`)));
      throw new Error(`No tab found matching URL: ${targetUrl}`);
    }
    console.log(
      chalk.gray(
        `[CDP] Found target matching URL: ${bestTarget.title || bestTarget.url}`
      )
    );
  } else {
    // Default: Sort and pick best target (prefer non-chrome:// URLs, exclude localhost:4300 which is our UI)
    const sortedTargets = [...pageTargets].sort((a, b) => {
      // Exclude our own UI
      const aIsOurUI =
        a.url.includes("localhost:4300") || a.url.includes("127.0.0.1:4300");
      const bIsOurUI =
        b.url.includes("localhost:4300") || b.url.includes("127.0.0.1:4300");
      if (aIsOurUI && !bIsOurUI) return 1;
      if (!aIsOurUI && bIsOurUI) return -1;

      // Prefer real pages over chrome:// pages
      const aIsChrome =
        a.url.startsWith("chrome://") ||
        a.url.startsWith("chrome-error://") ||
        a.url === "about:blank";
      const bIsChrome =
        b.url.startsWith("chrome://") ||
        b.url.startsWith("chrome-error://") ||
        b.url === "about:blank";
      if (aIsChrome && !bIsChrome) return 1;
      if (!aIsChrome && bIsChrome) return -1;
      return 0;
    });

    bestTarget = sortedTargets[0];
    console.log(
      chalk.gray(`[CDP] Best target: ${bestTarget.title || bestTarget.url}`)
    );
  }

  // Warn if best target is still a chrome:// page or our UI
  if (
    bestTarget.url.startsWith("chrome://") ||
    bestTarget.url.startsWith("chrome-error://") ||
    bestTarget.url === "about:blank"
  ) {
    console.log(
      chalk.yellow("\n⚠ Warning: Chrome is not on a regular webpage.")
    );
    console.log(
      chalk.yellow(
        "  Please navigate to your application in Chrome before starting recording.\n"
      )
    );
  }

  if (
    bestTarget.url.includes("localhost:4300") ||
    bestTarget.url.includes("127.0.0.1:4300")
  ) {
    console.log(
      chalk.yellow("\n⚠ Warning: Selected tab is the Reshot UI itself!")
    );
    console.log(
      chalk.yellow(
        "  Please select a different tab with your target application.\n"
      )
    );
  }

  // Step 4: Connect via Playwright CDP
  try {
    console.log(chalk.gray(`[CDP] Connecting via Playwright...`));

    const browser = await chromium.connectOverCDP(cdpUrl, {
      timeout: 10000, // 10 second timeout
    });

    const contexts = browser.contexts();

    if (contexts.length === 0) {
      // This shouldn't happen if we found targets above, but handle it anyway
      console.error(
        chalk.red("\n❌ Connected but no browser contexts available")
      );
      await browser.close();
      throw new Error("No browser contexts found after connecting");
    }

    const context = contexts[0];
    const pages = context.pages();

    if (pages.length === 0) {
      console.error(chalk.red("\n❌ Connected but no pages available"));
      await browser.close();
      throw new Error("No pages found in browser context");
    }

    // Find the page matching our best target
    let page = null;

    // First, try exact URL match
    for (const p of pages) {
      if (p.url() === bestTarget.url) {
        page = p;
        break;
      }
    }

    // If no exact match, try partial match
    if (!page && (targetUrl || targetId)) {
      for (const p of pages) {
        const pUrl = p.url();
        if (targetUrl && pUrl.includes(targetUrl)) {
          page = p;
          break;
        }
      }
    }

    // Fallback: find any non-chrome:// page that's not our UI
    if (!page) {
      for (const p of pages) {
        const pUrl = p.url();
        const isOurUI =
          pUrl.includes("localhost:4300") || pUrl.includes("127.0.0.1:4300");
        const isChrome =
          pUrl.startsWith("chrome://") ||
          pUrl.startsWith("chrome-error://") ||
          pUrl === "about:blank";
        if (!isOurUI && !isChrome) {
          page = p;
          break;
        }
      }
    }

    // Last resort: just use the last page
    if (!page) {
      page = pages[pages.length - 1];
    }

    console.log(chalk.green(`✔ Connected to Chrome`));
    console.log(chalk.gray(`  Active page: ${page.url()}\n`));

    return { browser, context, page };
  } catch (error) {
    // Enhanced error handling for Playwright connection errors
    const errorMsg = error.message || String(error);

    if (
      errorMsg.includes("Target closed") ||
      errorMsg.includes("Target page, context or browser has been closed")
    ) {
      console.error(chalk.red("\n❌ Browser tab was closed during connection"));
      throw new Error(
        "Browser tab was closed. Please keep a tab open and try again."
      );
    }

    if (errorMsg.includes("timeout") || errorMsg.includes("Timeout")) {
      console.error(chalk.red("\n❌ Connection timeout"));
      console.log(
        chalk.yellow(
          "Chrome may be unresponsive. Try restarting Chrome with the debug flag.\n"
        )
      );
      printChromeInstructions();
      throw new Error("Connection timeout. Chrome may be unresponsive.");
    }

    console.error(chalk.red(`\n❌ Failed to connect: ${errorMsg}`));
    printChromeInstructions();
    throw new Error(`Failed to connect to Chrome: ${errorMsg}`);
  }
}

/**
 * Print instructions for starting Chrome with remote debugging
 */
function printChromeInstructions() {
  const platform = process.platform;

  console.log(
    chalk.yellow(
      "\nTo enable recording, Chrome needs to be started with remote debugging:"
    )
  );
  console.log(
    chalk.yellow(
      "1. Quit Chrome completely (check that no Chrome processes are running)"
    )
  );
  console.log(
    chalk.yellow("2. Start Chrome from terminal with the debug flag:\n")
  );

  if (platform === "darwin") {
    console.log(chalk.cyan("   macOS:"));
    console.log(
      chalk.white(
        '   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.reshot/chrome-debug"\n'
      )
    );
  } else if (platform === "win32") {
    console.log(chalk.cyan("   Windows:"));
    console.log(
      chalk.white(
        '   "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\\.reshot\\chrome-debug"\n'
      )
    );
  } else {
    console.log(chalk.cyan("   Linux:"));
    console.log(
      chalk.white(
        '   google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.reshot/chrome-debug"'
      )
    );
    console.log(chalk.gray("   or"));
    console.log(
      chalk.white(
        '   chromium --remote-debugging-port=9222 --user-data-dir="$HOME/.reshot/chrome-debug"\n'
      )
    );
  }

  console.log(
    chalk.gray("3. Navigate to your application in the opened Chrome window")
  );
  console.log(chalk.gray('4. Come back here and click "Start Recording"\n'));
}

/**
 * Save the current browser session state (cookies, localStorage) to a file
 * This can be used later by capture-engine to maintain authenticated sessions
 * @param {string} outputPath - Path to save the storage state JSON
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
async function saveSessionState(outputPath) {
  try {
    const { browser, context, page } = await connectToActivePage({ uiMode: true });
    
    if (!context) {
      return { success: false, error: "Could not connect to browser context" };
    }

    // Playwright's storageState includes cookies and localStorage
    const rawState = await context.storageState();

    // Sanitize cookies (CDP returns expires: -1 for session cookies, which Playwright rejects)
    const { sanitized: storageState, stats } = sanitizeStorageState(rawState);
    if (stats.fixed > 0 || stats.removed > 0 || stats.stripped > 0) {
      console.log(chalk.gray(`    Sanitized cookies: ${stats.fixed} fixed, ${stats.removed} removed, ${stats.stripped} stripped`));
    }

    const activePageUrl = page?.url?.() || null;
    const artifactInfo = writeSessionArtifacts(outputPath, storageState, {
      pageUrl: activePageUrl,
      baseUrl: activePageUrl,
    });

    console.log(chalk.green(`  ✔ Session saved to: ${outputPath}`));
    console.log(chalk.gray(`    Metadata: ${artifactInfo.metadataPath}`));
    console.log(chalk.gray(`    Cookies: ${storageState.cookies?.length || 0}`));
    console.log(chalk.gray(`    Origins with localStorage: ${storageState.origins?.length || 0}`));
    
    // Don't close the browser - user might still be using it
    // await browser.close();
    
    return { success: true, path: outputPath };
  } catch (error) {
    console.error(chalk.red(`  ✖ Failed to save session: ${error.message}`));
    return { success: false, error: error.message };
  }
}

/**
 * Get the default session state file path
 * @returns {string}
 */
function getDefaultSessionPath() {
  return path.join(os.homedir(), ".reshot", "session-state.json");
}

function getSessionMetadataPath(sessionPath = getDefaultSessionPath()) {
  if (sessionPath.endsWith(".json")) {
    return sessionPath.replace(/\.json$/i, ".meta.json");
  }

  return `${sessionPath}.meta.json`;
}

function normalizeOrigin(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
}

function normalizeCookieDomain(domain) {
  if (!domain || typeof domain !== "string") {
    return null;
  }

  return domain.replace(/^\./, "").toLowerCase();
}

function extractSessionEvidence(storageState) {
  const storageOrigins = Array.from(
    new Set(
      (storageState?.origins || [])
        .map((origin) => normalizeOrigin(origin?.origin))
        .filter(Boolean),
    ),
  );

  const cookieDomains = Array.from(
    new Set(
      (storageState?.cookies || [])
        .map((cookie) => normalizeCookieDomain(cookie?.domain))
        .filter(Boolean),
    ),
  );

  return { storageOrigins, cookieDomains };
}

function buildSessionMetadata(options = {}) {
  const {
    baseUrl = null,
    pageUrl = null,
    storageState = null,
    capturedAt = new Date().toISOString(),
  } = options;
  const evidence = extractSessionEvidence(storageState);

  return {
    version: 1,
    capturedAt,
    sourceUrl: pageUrl || baseUrl || null,
    sourceOrigin:
      normalizeOrigin(pageUrl) ||
      normalizeOrigin(baseUrl) ||
      evidence.storageOrigins[0] ||
      null,
    storageOrigins: evidence.storageOrigins,
    cookieDomains: evidence.cookieDomains,
  };
}

function writeSessionArtifacts(sessionPath, storageState, options = {}) {
  const metadataPath = getSessionMetadataPath(sessionPath);
  const metadata = buildSessionMetadata({ ...options, storageState });

  fs.ensureDirSync(path.dirname(sessionPath));
  fs.writeJsonSync(sessionPath, storageState, { spaces: 2 });
  fs.writeJsonSync(metadataPath, metadata, { spaces: 2 });

  return { sessionPath, metadataPath, metadata };
}

function readSessionMetadata(sessionPath = getDefaultSessionPath()) {
  const metadataPath = getSessionMetadataPath(sessionPath);

  if (!fs.existsSync(metadataPath)) {
    return {
      exists: false,
      metadataPath,
      metadata: null,
      error: null,
    };
  }

  try {
    return {
      exists: true,
      metadataPath,
      metadata: fs.readJsonSync(metadataPath),
      error: null,
    };
  } catch (error) {
    return {
      exists: true,
      metadataPath,
      metadata: null,
      error: error.message,
    };
  }
}

function sessionHostMatchesCookieDomains(hostname, cookieDomains) {
  if (!hostname) {
    return false;
  }

  return cookieDomains.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

function assessSessionHealth(
  sessionPath = getDefaultSessionPath(),
  baseUrl = null,
  options = {},
) {
  const maxAgeMinutes = Number.isFinite(options.maxAgeMinutes)
    ? options.maxAgeMinutes
    : 360;
  const expectedOrigin = normalizeOrigin(baseUrl);
  const result = {
    ok: false,
    exists: fs.existsSync(sessionPath),
    sessionPath,
    metadataPath: getSessionMetadataPath(sessionPath),
    expectedOrigin,
    compatible: true,
    stale: false,
    ageMinutes: null,
    metadata: null,
    warnings: [],
    issues: [],
    evidence: {
      sourceOrigin: null,
      storageOrigins: [],
      cookieDomains: [],
      matchSource: null,
    },
  };

  if (!result.exists) {
    return result;
  }

  let storageState = null;
  try {
    storageState = fs.readJsonSync(sessionPath);
  } catch (error) {
    result.compatible = false;
    result.issues.push(`Cached session file is unreadable: ${error.message}`);
    return result;
  }

  const metadataInfo = readSessionMetadata(sessionPath);
  if (metadataInfo.error) {
    result.warnings.push(`Session metadata is unreadable: ${metadataInfo.error}`);
  } else if (!metadataInfo.exists) {
    result.warnings.push(
      "Session metadata is missing; compatibility was inferred from stored cookies and origins.",
    );
  }

  const inferredEvidence = extractSessionEvidence(storageState);
  const metadata = metadataInfo.metadata || null;
  const storageOrigins =
    metadata?.storageOrigins
      ?.map((origin) => normalizeOrigin(origin))
      .filter(Boolean) || inferredEvidence.storageOrigins;
  const cookieDomains =
    metadata?.cookieDomains
      ?.map((domain) => normalizeCookieDomain(domain))
      .filter(Boolean) || inferredEvidence.cookieDomains;
  const sourceOrigin =
    normalizeOrigin(metadata?.sourceOrigin) ||
    normalizeOrigin(metadata?.sourceUrl) ||
    inferredEvidence.storageOrigins[0] ||
    null;

  result.metadata = metadata;
  result.evidence = {
    sourceOrigin,
    storageOrigins,
    cookieDomains,
    matchSource: null,
  };

  const capturedAtMs = Date.parse(metadata?.capturedAt || "");
  const sessionStat = fs.statSync(sessionPath);
  const referenceTime = Number.isFinite(capturedAtMs)
    ? capturedAtMs
    : sessionStat.mtimeMs;
  result.ageMinutes = Math.max(
    0,
    Math.round((Date.now() - referenceTime) / 60000),
  );
  result.stale = result.ageMinutes >= maxAgeMinutes;

  if (expectedOrigin) {
    const expectedHost = new URL(baseUrl).hostname.toLowerCase();
    const matchesSourceOrigin = sourceOrigin === expectedOrigin;
    const matchesStorageOrigin = storageOrigins.includes(expectedOrigin);
    const matchesCookieDomain = sessionHostMatchesCookieDomains(
      expectedHost,
      cookieDomains,
    );

    result.evidence.matchSource = matchesSourceOrigin
      ? "sourceOrigin"
      : matchesStorageOrigin
        ? "storageOrigins"
        : matchesCookieDomain
          ? "cookieDomains"
          : null;

    const hasEvidence =
      Boolean(sourceOrigin) ||
      storageOrigins.length > 0 ||
      cookieDomains.length > 0;
    if (hasEvidence && !result.evidence.matchSource) {
      result.compatible = false;
      result.issues.push(
        `Cached session targets ${sourceOrigin || storageOrigins[0] || cookieDomains[0]}, not ${expectedOrigin}.`,
      );
    }
  }

  result.ok = result.compatible && result.issues.length === 0;
  return result;
}

/**
 * Quietly check if CDP is available and sync the session if so.
 * This is called automatically before captures to use the live browser session.
 * @param {string} outputPath - Path to save the storage state JSON (optional, uses default)
 * @param {Function} logger - Optional logging function (uses console.log if not provided)
 * @returns {Promise<{synced: boolean, path?: string, error?: string}>}
 */
async function autoSyncSessionFromCDP(outputPath = null, logger = null) {
  const log = logger || (() => {}); // Quiet by default

  // Allow disabling CDP sync via env var (useful when session was created programmatically)
  if (process.env.RESHOT_SKIP_CDP_SYNC === "1") {
    return { synced: false, reason: "disabled" };
  }

  const sessionPath = outputPath || path.join(os.homedir(), ".reshot", "session-state.json");

  try {
    // Skip sync if cached session is very recent (likely just generated programmatically)
    if (fs.existsSync(sessionPath)) {
      const cachedAge = Date.now() - fs.statSync(sessionPath).mtimeMs;
      if (cachedAge < 5 * 60 * 1000) {
        log(chalk.gray("  → Cached session is fresh (<5min), skipping CDP sync"));
        return { synced: false, reason: "cached_fresh" };
      }
    }

    // Step 1: Check if CDP endpoint is available (quietly)
    const endpointCheck = await checkCdpEndpoint("localhost", 9222);
    
    if (!endpointCheck.available) {
      // No CDP browser - that's fine, just return
      log(chalk.gray("  → No CDP browser detected, skipping session sync"));
      return { synced: false, reason: "no_cdp" };
    }
    
    log(chalk.gray("  → CDP browser detected, syncing session..."));
    
    // Step 2: Connect to the browser
    const browser = await chromium.connectOverCDP("http://localhost:9222", {
      timeout: 5000,
    });
    
    try {
      const contexts = browser.contexts();
      if (contexts.length === 0) {
        log(chalk.gray("  → No browser contexts found"));
        await browser.close().catch(() => {}); // Disconnect (won't close Chrome since we used connectOverCDP)
        return { synced: false, reason: "no_context" };
      }
      
      const context = contexts[0];
      
      // Step 3: Get storage state
      const rawState = await context.storageState();

      // Sanitize cookies (CDP returns expires: -1 for session cookies, which Playwright rejects)
      const { sanitized: storageState, stats } = sanitizeStorageState(rawState);
      if (stats.fixed > 0 || stats.removed > 0 || stats.stripped > 0) {
        log(chalk.gray(`    Sanitized cookies: ${stats.fixed} fixed, ${stats.removed} removed, ${stats.stripped} stripped`));
      }

      // Check if there's actually any meaningful session data
      const hasCookies = storageState.cookies && storageState.cookies.length > 0;
      const hasStorage = storageState.origins && storageState.origins.length > 0;

      // Disconnect from CDP (browser.close() on CDP connection just disconnects, doesn't close Chrome)
      await browser.close().catch(() => {});

      if (!hasCookies && !hasStorage) {
        log(chalk.gray("  → No session data found in CDP browser"));
        return { synced: false, reason: "empty_session" };
      }

      const activePage =
        context
          .pages()
          .find((candidate) => {
            const currentUrl = candidate.url();
            return (
              currentUrl &&
              !currentUrl.startsWith("chrome://") &&
              !currentUrl.startsWith("devtools://") &&
              !currentUrl.startsWith("chrome-extension://")
            );
          }) || context.pages()[0] || null;
      const activePageUrl = activePage?.url?.() || null;

      // Step 4: Save to file
      writeSessionArtifacts(sessionPath, storageState, {
        pageUrl: activePageUrl,
        baseUrl: activePageUrl,
      });

      log(chalk.green(`  ✔ Auto-synced session from CDP browser`));
      log(chalk.gray(`    Cookies: ${storageState.cookies?.length || 0}, localStorage origins: ${storageState.origins?.length || 0}`));
      
      return { synced: true, path: sessionPath };
    } catch (innerError) {
      // Make sure to disconnect even on error
      await browser.close().catch(() => {});
      throw innerError;
    }
  } catch (error) {
    // Silently fail - this is a convenience feature
    log(chalk.gray(`  → Session sync skipped: ${error.message}`));
    return { synced: false, reason: "error", error: error.message };
  }
}

/**
 * Fields that Playwright's `Storage.setCookies` accepts.
 * CDP returns extra metadata (e.g. `partitionKey`, `_crHasCrossSiteAncestor`)
 * that Playwright rejects as "Invalid cookie fields".
 */
const VALID_COOKIE_FIELDS = new Set([
  'name', 'value', 'domain', 'path', 'expires', 'httpOnly', 'secure', 'sameSite',
]);

/**
 * Sanitize a Playwright storage state object so it can be safely passed
 * to `browser.newContext({ storageState })`.
 *
 * - Strips any cookie field not in the Playwright whitelist (catches CDP-only
 *   metadata like `partitionKey`, `_crHasCrossSiteAncestor`, etc.)
 * - Removes `expires` when ≤ 0 (CDP session cookies)
 * - Drops cookies missing `name` or `domain`
 *
 * @param {Object} storageState - Raw Playwright storage state (`{ cookies, origins }`)
 * @returns {{ sanitized: Object, stats: { fixed: number, removed: number, stripped: number } }}
 */
function sanitizeStorageState(storageState) {
  if (!storageState || !storageState.cookies) {
    return { sanitized: storageState, stats: { fixed: 0, removed: 0, stripped: 0 } };
  }

  let fixed = 0;
  let removed = 0;
  let stripped = 0;

  const cleanCookies = [];
  for (const cookie of storageState.cookies) {
    // Remove cookies missing required fields (value can be empty string)
    if (!cookie.name || !cookie.domain) {
      removed++;
      continue;
    }

    // Strip unknown fields (CDP metadata Playwright doesn't recognize)
    const clean = {};
    let hadUnknown = false;
    for (const [key, val] of Object.entries(cookie)) {
      if (VALID_COOKIE_FIELDS.has(key)) {
        clean[key] = val;
      } else {
        hadUnknown = true;
      }
    }
    if (hadUnknown) {
      stripped++;
    }

    // Fix invalid expires values (session cookies from CDP)
    if (clean.expires !== undefined && clean.expires <= 0) {
      fixed++;
      delete clean.expires;
    }

    cleanCookies.push(clean);
  }

  return {
    sanitized: { ...storageState, cookies: cleanCookies },
    stats: { fixed, removed, stripped },
  };
}

module.exports = {
  connectToActivePage,
  checkCdpEndpoint,
  getCdpTargets,
  printChromeInstructions,
  saveSessionState,
  getDefaultSessionPath,
  getSessionMetadataPath,
  autoSyncSessionFromCDP,
  sanitizeStorageState,
  buildSessionMetadata,
  writeSessionArtifacts,
  readSessionMetadata,
  assessSessionHealth,
};
