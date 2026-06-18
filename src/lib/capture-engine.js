// capture-engine.js - Robust capture engine for SaaS documentation screenshots
// Designed for stability over flexibility - every action waits and verifies

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs-extra");
const chalk = require("chalk");
const { buildLaunchOptions } = require("./ci-detect");
const {
  applyVariantToPage,
  applyStorageAndReload,
  setupHeaderInterception,
  getBrowserOptions,
  logVariantSummary,
} = require("./variant-injector");
const {
  cropImageBuffer,
  mergeCropConfigs,
  validateCropConfig,
  scaleRegionByDPR,
  isSharpAvailable,
} = require("./image-crop");
const { sanitizeStorageState, assessSessionHealth } = require("./record-cdp");
const {
  injectPrivacyMasking,
  removePrivacyMasking,
} = require("./privacy-engine");
const { applyStyle, isStyleAvailable } = require("./style-engine");

// Default path patterns that indicate an auth redirect
const DEFAULT_AUTH_PATH_PATTERNS = [
  "/auth/signin",
  "/auth/login",
  "/auth/confirm",
  "/login",
  "/signin",
  "/sign-in",
  "/log-in",
  "/sso/",
  "/oauth/",
  "/saml/",
  "/cas/",
];

// Known OAuth provider domains — if the page lands here, auth is required
const OAUTH_PROVIDER_DOMAINS = [
  "accounts.google.com",
  "login.microsoftonline.com",
  "auth0.com",
  "okta.com",
  "login.salesforce.com",
];

/**
 * Check whether a URL indicates an authentication redirect.
 * Matches against default path patterns, known OAuth provider domains,
 * and optional user-supplied custom patterns.
 *
 * @param {string} url - The URL to check
 * @param {string[]} customPatterns - Additional path substrings to match
 * @returns {boolean}
 */
function isAuthRedirectUrl(url, customPatterns = []) {
  if (!url) return false;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    // If the URL can't be parsed, fall back to substring matching
    const allPatterns = [...DEFAULT_AUTH_PATH_PATTERNS, ...customPatterns];
    return allPatterns.some((p) => url.includes(p));
  }

  // Check OAuth provider domains
  const hostname = parsed.hostname;
  if (OAUTH_PROVIDER_DOMAINS.some((d) => hostname.includes(d))) {
    return true;
  }

  // Check path patterns (default + custom)
  const pathname = parsed.pathname;
  const allPatterns = [...DEFAULT_AUTH_PATH_PATTERNS, ...customPatterns];
  return allPatterns.some((p) => pathname.includes(p));
}

/**
 * Browser automation engine with semantic selectors and variant injection.
 */
class CaptureEngine {
  constructor(options = {}) {
    this.browser = null;
    this.page = null;
    this.context = null;
    this.outputDir = options.outputDir || ".reshot/output";
    this.viewport = options.viewport || { width: 1280, height: 720 };
    this.baseUrl = options.baseUrl || "";
    this.capturedAssets = [];
    this.logger = options.logger || console.log;
    this.headless = options.headless !== false; // Default to headless
    this.injectWorkspaceStore = options.injectWorkspaceStore !== false;
    this.diagnostics = [];
    this.sessionHealth = null;

    // Storage state path for authenticated sessions
    // If provided, loads cookies/localStorage from file to preserve auth state
    this.storageStatePath = options.storageStatePath || null;

    // Hide development UI overlays (Next.js devtools, etc.)
    this.hideDevtools = options.hideDevtools !== false; // Default to true

    // Universal variant configuration
    // Supports multiple injection methods: localStorage, sessionStorage, cookie,
    // urlParam, browser (locale/timezone), script, header
    this.variantConfig = options.variantConfig || null;

    // Crop configuration - applied to all captures unless overridden per-step
    // Persisted across variations for consistent output
    this.cropConfig = options.cropConfig || null;

    // Validate crop config at initialization
    if (this.cropConfig) {
      const validation = validateCropConfig(this.cropConfig);
      if (!validation.valid) {
        this.logger(
          chalk.yellow(`  ⚠ Invalid crop config: ${validation.error}`)
        );
        this.cropConfig = null;
      }
    }

    // Pre-loaded storage state object (avoids redundant file reads in parallel mode)
    this.storageStateData = options.storageStateData || null;

    // Custom auth redirect patterns (appended to defaults)
    this._customAuthPatterns = options.authPatterns || [];

    // Custom loading-state hook — lets users specify app-specific readiness signals
    // { selector?: string, expression?: string, timeout?: number }
    this.waitForReady = options.waitForReady || null;

    // Privacy masking configuration (CSS injection for PII redaction)
    this.privacyConfig = options.privacyConfig || null;

    // Style configuration (image beautification post-capture)
    this.styleConfig = options.styleConfig || null;

    // DOM scene (MHTML) capture toggle — emits a self-contained Chromium
    // MHTML bundle alongside each PNG so variations can be rendered from
    // the captured DOM without re-running the live app. Defaults to ON;
    // opt out via reshot.config.json -> { domScene: false } or per-scenario
    // -> { domScene: false }.
    this.domSceneEnabled = options.domScene !== false;

    // Legacy support for old variant format
    if (!this.variantConfig && options.variant) {
      this.variantConfig = this._convertLegacyVariant(options.variant);
    }
  }

  /**
   * Convert legacy variant format to new universal format
   */
  _convertLegacyVariant(variant) {
    const injections = [];
    const browserOptions = {};
    const summary = [];

    // Convert locale config
    if (variant.locale) {
      if (variant.locale.browserLocale) {
        browserOptions.locale = variant.locale.browserLocale;
      }
      if (variant.locale.timezone) {
        browserOptions.timezoneId = variant.locale.timezone;
      }
      if (variant.locale.storage) {
        for (const [key, value] of Object.entries(variant.locale.storage)) {
          injections.push({ method: "localStorage", key, value });
        }
      }
      summary.push(
        `Locale: ${variant.locale.name || variant.locale.key || "custom"}`
      );
    }

    // Convert role config
    if (variant.role) {
      if (variant.role.storage) {
        for (const [key, value] of Object.entries(variant.role.storage)) {
          injections.push({ method: "localStorage", key, value });
        }
      }
      summary.push(
        `Role: ${variant.role.name || variant.role.key || "custom"}`
      );
    }

    return { injections, browserOptions, summary, metadata: {} };
  }

  /**
   * Initialize the browser with variant support
   */
  /**
   * Build context options from variant config and storage state.
   * Extracted so it can be reused with browser pool contexts.
   */
  _buildContextOptions() {
    const defaultOptions = {
      viewport: this.viewport,
      deviceScaleFactor: 2, // Retina quality screenshots
      locale: "en-US",
      timezoneId: "America/New_York",
    };

    const contextOptions = getBrowserOptions(
      this.variantConfig,
      defaultOptions
    );

    // Suppress permission dialogs (notifications, geolocation, etc.)
    contextOptions.permissions = [];

    if (contextOptions.colorScheme) {
      this.logger(chalk.gray(`  → colorScheme: ${contextOptions.colorScheme}`));
    }

    // Load storage state: prefer pre-loaded data, fall back to file path
    // Always sanitize to prevent "Invalid cookie fields" from CDP-sourced cookies
    if (this.storageStateData) {
      const { sanitized, stats } = sanitizeStorageState(this.storageStateData);
      contextOptions.storageState = sanitized;
      if (stats.fixed > 0 || stats.removed > 0 || stats.stripped > 0) {
        this.logger(chalk.gray(`  → Sanitized cookies: ${stats.fixed} fixed, ${stats.removed} removed, ${stats.stripped} stripped`));
      }
      this.logger(chalk.gray(`  → Using pre-loaded auth session`));
    } else if (this.storageStatePath && fs.existsSync(this.storageStatePath)) {
      this.sessionHealth = assessSessionHealth(
        this.storageStatePath,
        this.baseUrl,
      );

      if (!this.sessionHealth.compatible) {
        this.logger(
          chalk.yellow(
            `  ⚠ Skipping cached auth session because it does not match ${this.baseUrl || "the current target"}`,
          ),
        );
        for (const issue of this.sessionHealth.issues) {
          this.logger(chalk.gray(`    ${issue}`));
        }
        this.diagnostics.push({
          type: "auth-session-mismatch",
          sessionPath: this.storageStatePath,
          issues: [...this.sessionHealth.issues],
        });
        return contextOptions;
      }

      if (this.sessionHealth.stale) {
        this.logger(
          chalk.yellow(
            `  ⚠ Cached auth session is ${this.sessionHealth.ageMinutes}m old; validating it during startup.`,
          ),
        );
      }

      // Read and sanitize instead of passing raw file path (Playwright would read it unsanitized)
      try {
        const rawState = JSON.parse(fs.readFileSync(this.storageStatePath, "utf-8"));
        const { sanitized, stats } = sanitizeStorageState(rawState);
        contextOptions.storageState = sanitized;
        if (stats.fixed > 0 || stats.removed > 0 || stats.stripped > 0) {
          this.logger(chalk.gray(`  → Sanitized cookies: ${stats.fixed} fixed, ${stats.removed} removed, ${stats.stripped} stripped`));
        }
      } catch (_e) {
        // Fall back to raw file path if JSON parse fails
        contextOptions.storageState = this.storageStatePath;
      }
      this.logger(
        chalk.gray(
          `  → Loading auth session from: ${path.basename(
            this.storageStatePath
          )}`
        )
      );

      for (const warning of this.sessionHealth.warnings) {
        this.logger(chalk.gray(`    ${warning}`));
      }
    }

    return contextOptions;
  }

  async init() {
    this.logger(chalk.cyan("🚀 Initializing capture engine..."));

    const contextOptions = this._buildContextOptions();

    this.browser = await chromium.launch(buildLaunchOptions({
      headless: this.headless,
    }));
    this.context = await this.browser.newContext(contextOptions);
    this.page = await this.context.newPage();

    // Hide development UI overlays (Next.js devtools, React DevTools, etc.)
    if (this.hideDevtools) {
      await this._setupDevtoolsHiding();
    }

    // Apply all variant injections (localStorage, sessionStorage, cookies, scripts)
    if (this.variantConfig) {
      await applyVariantToPage(this.page, this.variantConfig, this.logger);

      // Set up header interception if needed
      if (
        this.variantConfig.headers &&
        Object.keys(this.variantConfig.headers).length > 0
      ) {
        await setupHeaderInterception(this.page, this.variantConfig.headers);
        this.logger(
          chalk.gray(
            `  → HTTP headers: ${Object.keys(this.variantConfig.headers).join(
              ", "
            )}`
          )
        );
      }

      // Log variant summary
      logVariantSummary(this.variantConfig, this.logger);
    }

    if (this.injectWorkspaceStore) {
      await this._injectWorkspaceStore();
    }

    // Inject privacy masking CSS (after variant injection, before captures)
    this._privacyInjectionOk = true;
    if (this.privacyConfig && this.privacyConfig.enabled && this.privacyConfig.selectors?.length > 0) {
      const privacyResult = await injectPrivacyMasking(this.page, this.privacyConfig, this.logger);
      this._privacyInjectionOk = privacyResult.success;
      if (!privacyResult.success) {
        // Non-suppressible — always warn even in quiet mode
        console.error(chalk.red(`  ✖ PRIVACY: Injection failed — captures will be skipped to prevent PII leak. Error: ${privacyResult.error}`));
      }
    }

    // Track HTTP 401/403 on document requests — indicates auth is required
    this._authResponseDetected = false;
    this.page.on("response", (response) => {
      const status = response.status();
      const url = response.url();
      if (
        (status === 401 || status === 403) &&
        response.request().resourceType() === "document"
      ) {
        this._authResponseDetected = true;
      }

      if (status >= 400 && response.request().resourceType() === "document") {
        this._recordDiagnostic("response_error", "error", {
          url,
          status,
          resourceType: response.request().resourceType(),
        });
      }
    });

    // Set up error handling
    this.page.on("pageerror", (err) => {
      const firstLine = (err.message || '').split('\n')[0].slice(0, 200);
      this._recordDiagnostic("pageerror", "error", {
        message: err.message || String(err),
      });
      this.logger(chalk.yellow(`  [Page Error] ${firstLine}`));
    });
    this.page.on("console", (message) => {
      const type = message.type();
      const text = message.text();
      const severity =
        type === "error"
          ? "error"
          : type === "warning"
            ? "warning"
            : "info";

      if (severity === "error" || severity === "warning") {
        this._recordDiagnostic("console", severity, {
          message: text,
          consoleType: type,
          cspViolation: /content security policy|csp/i.test(text),
        });
      }
    });
    this.page.on("requestfailed", (request) => {
      this._recordDiagnostic("requestfailed", "error", {
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        message: request.failure()?.errorText || "Request failed",
      });
    });

    this.logger(chalk.green("  ✔ Browser initialized"));
    return this;
  }

  _recordDiagnostic(kind, severity, details = {}) {
    this.diagnostics.push({
      id: `${Date.now()}-${this.diagnostics.length + 1}`,
      kind,
      severity,
      ...details,
      capturedAt: new Date().toISOString(),
    });
  }

  getDiagnostics() {
    return [...this.diagnostics];
  }

  /**
   * Hide development overlays (Next.js devtools, Vercel toolbar, etc.)
   * Injects CSS to hide common development UI elements before each navigation
   */
  async _setupDevtoolsHiding() {
    // Add CSS to hide common development overlays
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
      .webpack-hot-middleware-clientOverlay,

      /* ChannelIO chat widget */
      #ch-plugin,
      #ch-plugin-core,
      .ch-desk-messenger,
      [class*="ChannelIO"],
      [id*="channel-io"],
      #channel-io-plugin,

      /* Cookie consent banners */
      .cookie-consent,
      #cookie-banner,
      [data-testid="cookie-banner"],
      .cc-banner,
      #onetrust-banner-sdk,
      .CookieConsent,
      #gdpr-cookie-notice,
      .cookie-notice,
      [class*="cookie-consent"],
      [class*="CookieConsent"],

      /* Other third-party widgets */
      .intercom-lightweight-app,
      #hubspot-messages-iframe-container {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;

    // Inject CSS on every frame and navigation
    await this.page.addStyleTag({ content: hideDevtoolsCSS });

    // Also inject on route changes for SPAs
    this.page.on("framenavigated", async (frame) => {
      if (frame === this.page.mainFrame()) {
        try {
          await this.page.addStyleTag({ content: hideDevtoolsCSS });
        } catch (e) {
          // Page might have closed, ignore
        }
      }
    });

    this.logger(chalk.gray("  → Dev overlays will be hidden"));
  }

  /**
   * Inject workspace store data (activeProjectId + activeWorkspace) into app's localStorage.
   * Without both fields, the target app's Zustand workspace store starts empty
   * and pages show "Failed to load project".
   */
  async _injectWorkspaceStore() {
    // Try to get PROJECT_ID and workspace from multiple sources (fallback chain)
    let projectId = null;
    let workspace = null;
    try {
      const config = require("./config");
      const settings = config.readSettings() || {};
      // 1. Check settings urlVariables
      projectId = settings.urlVariables?.PROJECT_ID;
      // 2. Check settings projectId
      if (!projectId) projectId = settings.projectId;
      // 3. Check reshot.config.json urlVariables
      if (!projectId) {
        try {
          const reshotConfig = config.readConfig() || {};
          projectId = reshotConfig.urlVariables?.PROJECT_ID;
        } catch (_e) {
          // Config may not exist
        }
      }
      // 4. Check environment variable
      if (!projectId) projectId = process.env.RESHOT_PROJECT_ID;
      // Get workspace data from settings
      workspace = settings.workspace || null;
    } catch (e) {
      // Settings not available, skip injection
      return;
    }

    if (!projectId) {
      this.logger(
        chalk.yellow("  ⚠ No PROJECT_ID configured. Platform pages may show 'No project selected'.\n    Set urlVariables.PROJECT_ID in .reshot/settings.json or RESHOT_PROJECT_ID env var.")
      );
      return;
    }

    // Store for post-navigation re-injection
    this._activeProjectId = projectId;
    this._activeWorkspace = workspace;

    // Inject via addInitScript so it runs before any page JS
    await this.page.addInitScript(({ pid, ws }) => {
      const storeState = {
        activeProjectId: pid,
        sidebarMinimized: true,
      };
      if (ws) {
        storeState.activeWorkspace = { id: ws.id, name: ws.name, slug: ws.slug };
      }

      // Update existing workspace store entries (support both legacy and current key prefixes)
      const storePrefixes = ["reshot-store-", "workspace-store-"];
      let found = false;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && storePrefixes.some(p => key.startsWith(p))) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || "{}");
            data.state = { ...data.state, ...storeState };
            data.version = data.version ?? 0;
            localStorage.setItem(key, JSON.stringify(data));
            found = true;
          } catch (e) {
            // Invalid JSON, skip
          }
        }
      }
      // Create default store if none existed (use current Zustand persist key)
      if (!found) {
        localStorage.setItem(
          "reshot-store-workspace",
          JSON.stringify({ state: storeState, version: 0 })
        );
      }
    }, { pid: projectId, ws: workspace });

    this.logger(
      chalk.gray(`  → Injected workspace store: projectId=${projectId.slice(0, 12)}...${workspace ? `, workspace=${workspace.slug}` : ""}`)
    );
  }

  /**
   * Navigate to a URL and wait for it to be fully loaded
   */
  async goto(url, options = {}) {
    const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;
    this.logger(chalk.cyan(`📍 Navigating to ${fullUrl}`));

    await this.page.goto(fullUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // CRITICAL FIX: For SSR apps with inline <script> tags that read localStorage
    // during HTML parsing, we must use page.evaluate() to set localStorage
    // AFTER navigation, then reload so the inline scripts can read the values.
    // This is because addInitScript runs when JS context initializes, which is
    // AFTER inline <script> tags have already executed.
    if (this.variantConfig && !this._hasAppliedStorageReload) {
      this._hasAppliedStorageReload = true; // Only do this once per session
      const didReload = await applyStorageAndReload(
        this.page,
        this.variantConfig,
        this.logger
      );
      if (didReload) {
        this.logger(chalk.gray("  → Page reloaded with localStorage applied"));
      }
    }

    // Check for auth redirect after navigation (URL patterns + HTTP 401/403)
    // Skip the check if the scenario explicitly targeted this URL (e.g. capturing /login)
    const currentUrl = this.page.url();
    const targetPath = url.startsWith("http") ? new URL(url).pathname : url;
    const currentPath = (() => { try { return new URL(currentUrl).pathname; } catch { return currentUrl; } })();
    const isIntentionalTarget = currentPath === targetPath;
    const isAuthRedirect =
      !isIntentionalTarget &&
      (isAuthRedirectUrl(currentUrl, this._customAuthPatterns) ||
      this._authResponseDetected);
    if (isAuthRedirect) {
      const errorMsg = `Auth redirect detected: navigated to ${currentUrl}. Session may be expired. Re-run \`reshot record\` to refresh session, or export a fresh Playwright storage state to .reshot/auth-state.json.`;
      this.logger(chalk.red(`  ✖ ${errorMsg}`));
      throw new Error(errorMsg);
    }
    // Reset flag after check so subsequent navigations get a clean slate
    this._authResponseDetected = false;

    // Wait for network to settle
    await this._waitForStability();

    // Post-stability auth redirect check: catches SPA redirects that happen
    // after client-side JS has executed (the pre-stability check at domcontentloaded
    // may miss these since JS hasn't finished routing yet)
    if (!isIntentionalTarget) {
      const postStabilityUrl = this.page.url();
      const postStabilityRedirect =
        isAuthRedirectUrl(postStabilityUrl, this._customAuthPatterns) ||
        this._authResponseDetected;
      if (postStabilityRedirect) {
        const errorMsg = `Auth redirect detected after page load: navigated to ${postStabilityUrl}. Session may be expired. Re-run \`reshot record\` to refresh session.`;
        this.logger(chalk.red(`  ✖ ${errorMsg}`));
        throw new Error(errorMsg);
      }
      // Also check DOM for login forms (SPA may render login UI without changing URL)
      const hasLoginForm = await this.page.evaluate(() => {
        const h = document.querySelector("h1, h2");
        return h && /sign\s*in|log\s*in/i.test(h.textContent);
      }).catch(() => false);
      if (hasLoginForm) {
        const errorMsg = `Login form detected after page load at ${postStabilityUrl}. Session may be expired. Re-run \`reshot record\` to refresh session.`;
        this.logger(chalk.red(`  ✖ ${errorMsg}`));
        throw new Error(errorMsg);
      }
      this._authResponseDetected = false;
    }

    // Additional wait for theme/variants to fully apply
    // This handles CSS transitions and async re-renders
    if (this.variantConfig && this.variantConfig.injections?.length > 0) {
      this.logger(chalk.gray("  → Waiting for variant styles to apply..."));
      await this.page.waitForTimeout(500);
    }

    // Re-inject workspace store after navigation to handle Zustand hydration resets
    if (this._activeProjectId) {
      await this.page.evaluate(({ pid, ws }) => {
        const storePrefixes = ["reshot-store-", "workspace-store-"];
        let foundKey = null;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && storePrefixes.some(p => key.startsWith(p))) {
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
        // Trigger Zustand storage listener to rehydrate with the correct key
        window.dispatchEvent(new StorageEvent("storage", { key: foundKey || "reshot-store-workspace" }));
      }, { pid: this._activeProjectId, ws: this._activeWorkspace });
    }

    this.logger(chalk.green("  ✔ Page loaded"));
    return this;
  }

  /**
   * Find an element using multiple strategies
   * This is the core of robust element selection
   *
   * Following Playwright/Testing Library best practices:
   * 1. Role-based locators (most semantic, resilient)
   * 2. Label-based locators (for form controls)
   * 3. Placeholder/text locators
   * 4. Test ID locators (explicit contract)
   * 5. CSS selectors (fallback)
   */
  async _findElement(target, options = {}) {
    const { timeout = 10000, mustBeVisible = true } = options;

    // If target is already a locator, use it
    if (typeof target !== "string") {
      return target;
    }

    // Handle role-based selectors (from new selector strategies)
    // Format: role=button[name="Submit"]
    if (target.startsWith("role=")) {
      const roleMatch = target.match(/^role=(\w+)(?:\[name="(.+)"\])?$/);
      if (roleMatch) {
        const [, role, name] = roleMatch;
        const locator = name
          ? this.page.getByRole(role, { name })
          : this.page.getByRole(role);
        try {
          await locator.first().waitFor({
            state: mustBeVisible ? "visible" : "attached",
            timeout,
          });
          return locator.first();
        } catch (e) {
          // Continue to other strategies
          this.logger(chalk.gray(`    Role selector failed: ${target}`));
        }
      }
    }

    // Handle label-based selectors
    // Format: label:has-text("Email") >> input
    if (target.includes(" >> ") && target.includes("label:has-text")) {
      try {
        const locator = this.page.locator(target).first();
        await locator.waitFor({
          state: mustBeVisible ? "visible" : "attached",
          timeout: 3000,
        });
        return locator;
      } catch (e) {
        // Continue to other strategies
      }
    }

    // Strategy 1: If it looks like a CSS selector, try it directly
    if (
      target.startsWith("#") ||
      target.startsWith(".") ||
      target.startsWith("[")
    ) {
      const locator = this.page.locator(target).first();
      try {
        await locator.waitFor({
          state: mustBeVisible ? "visible" : "attached",
          timeout,
        });
        return locator;
      } catch (e) {
        // Continue to other strategies
      }
    }

    // Strategy 2: Playwright's semantic locators (best practice)
    const semanticStrategies = [
      // Role-based (most reliable for buttons, links, etc.)
      () => this.page.getByRole("button", { name: target }),
      () => this.page.getByRole("link", { name: target }),
      () => this.page.getByRole("menuitem", { name: target }),
      () => this.page.getByRole("tab", { name: target }),
      () => this.page.getByRole("checkbox", { name: target }),
      () => this.page.getByRole("radio", { name: target }),
      () => this.page.getByRole("textbox", { name: target }),
      () => this.page.getByRole("combobox", { name: target }),
      // Label-based (for form controls)
      () => this.page.getByLabel(target),
      // Placeholder-based (for inputs)
      () => this.page.getByPlaceholder(target),
      // Text-based (for general content)
      () => this.page.getByText(target, { exact: true }),
      () => this.page.getByText(target),
      // Test ID (explicit contract)
      () => this.page.getByTestId(target),
      // Alt text (for images)
      () => this.page.getByAltText(target),
      // Title (for elements with title attribute)
      () => this.page.getByTitle(target),
    ];

    for (const getLocator of semanticStrategies) {
      try {
        const locator = getLocator().first();
        await locator.waitFor({
          state: mustBeVisible ? "visible" : "attached",
          timeout: 2000,
        });
        return locator;
      } catch (e) {
        // Try next strategy
      }
    }

    // Strategy 3: Text-based CSS selectors (legacy fallback)
    const textStrategies = [
      // Button with text
      `button:has-text("${target}")`,
      // Link with text
      `a:has-text("${target}")`,
      // Any element with text
      `*:has-text("${target}")`,
    ];

    for (const strategy of textStrategies) {
      try {
        const locator = this.page.locator(strategy).first();
        await locator.waitFor({
          state: mustBeVisible ? "visible" : "attached",
          timeout: 2000,
        });
        return locator;
      } catch (e) {
        // Try next strategy
      }
    }

    // Strategy 4: Placeholder/label for inputs (legacy)
    const inputStrategies = [
      `input[placeholder*="${target}" i]`,
      `textarea[placeholder*="${target}" i]`,
      `input[name*="${target}" i]`,
      `label:has-text("${target}") + input`,
      `label:has-text("${target}") input`,
    ];

    for (const strategy of inputStrategies) {
      try {
        const locator = this.page.locator(strategy).first();
        await locator.waitFor({
          state: mustBeVisible ? "visible" : "attached",
          timeout: 1500,
        });
        return locator;
      } catch (e) {
        // Try next strategy
      }
    }

    // Strategy 5: Aria and test attributes (legacy)
    const ariaStrategies = [
      `[aria-label*="${target}" i]`,
      `[data-testid*="${target}" i]`,
      `[data-test*="${target}" i]`,
      `[data-cy*="${target}" i]`,
    ];

    for (const strategy of ariaStrategies) {
      try {
        const locator = this.page.locator(strategy).first();
        await locator.waitFor({
          state: mustBeVisible ? "visible" : "attached",
          timeout: 1500,
        });
        return locator;
      } catch (e) {
        // Try next strategy
      }
    }

    throw new Error(`Could not find element: "${target}"`);
  }

  /**
   * Click on an element
   */
  async click(target, options = {}) {
    this.logger(chalk.gray(`  → Click: ${target}`));

    await this._waitForStability();

    const element = await this._findElement(target, options);

    // Scroll into view if needed
    await element.scrollIntoViewIfNeeded();

    // Wait for element to be clickable
    await element.waitFor({ state: "visible" });

    // Perform click - use force:true if element may have CSS animations
    // that Playwright considers "not stable" (e.g., pulsing buttons)
    try {
      await element.click({ timeout: 10000 });
    } catch (clickError) {
      if (clickError.message?.includes('not stable') || clickError.message?.includes('intercept')) {
        this.logger(chalk.gray("    → Retrying click with force:true (animated element)"));
        await element.click({ force: true, timeout: 10000 });
      } else {
        throw clickError;
      }
    }

    // Wait for any resulting navigation or updates
    await this._waitForStability();

    this.logger(chalk.green("    ✔ Clicked"));
    return this;
  }

  /**
   * Hover over an element (for dropdowns, tooltips, etc.)
   */
  async hover(target, options = {}) {
    this.logger(chalk.gray(`  → Hover: ${target}`));

    await this._waitForStability();

    const element = await this._findElement(target, options);
    await element.scrollIntoViewIfNeeded();
    await element.hover();

    // Wait for hover effects to appear
    await this.page.waitForTimeout(300);

    this.logger(chalk.green("    ✔ Hovered"));
    return this;
  }

  /**
   * Type into an input field
   */
  async type(target, text, options = {}) {
    this.logger(chalk.gray(`  → Type into: ${target}`));

    await this._waitForStability();

    const element = await this._findElement(target, options);

    // Clear existing content first
    await element.fill("");
    await element.fill(text);

    this.logger(chalk.green("    ✔ Typed"));
    return this;
  }

  /**
   * Wait for an element to appear
   */
  async waitFor(target, options = {}) {
    this.logger(chalk.gray(`  → Wait for: ${target}`));

    await this._findElement(target, {
      ...options,
      timeout: options.timeout || 15000,
    });

    this.logger(chalk.green("    ✔ Element found"));
    return this;
  }

  /**
   * Wait for a specific amount of time
   */
  async wait(ms) {
    this.logger(chalk.gray(`  → Wait ${ms}ms`));
    await this.page.waitForTimeout(ms);
    return this;
  }

  /**
   * Capture a screenshot with optional cropping
   * This is the main output of the capture engine
   *
   * Cropping workflow:
   * 1. If step-level cropConfig is provided, it overrides scenario-level config
   * 2. Crop is applied after capture using Sharp for high-quality results
   * 3. Crop coordinates are automatically scaled by device pixel ratio
   * 4. Cropping is lossless and preserves image quality
   */
  async capture(name, options = {}) {
    const {
      selector, // Optional: capture specific element
      fullPage, // Capture full scrollable page
      padding = 16, // Padding around element (if selector specified)
      clip, // Manual clip region {x, y, width, height}
      description, // Human-readable description for documentation
      cropConfig: stepCropConfig, // Step-level crop override
    } = options;

    this.logger(chalk.cyan(`📸 Capturing: ${name}`));

    // CRITICAL: If privacy masking was configured but injection failed, skip capture
    if (this.privacyConfig && this.privacyConfig.enabled && !this._privacyInjectionOk) {
      console.error(chalk.red(`  ✖ PRIVACY: Skipping capture "${name}" — privacy masking injection failed. Fix the issue or use --no-privacy.`));
      return this;
    }

    await this._waitForStability();

    // Guard: final check for loading indicators before capture
    await this._waitForLoadingComplete(3000);

    // Guard: catch late auth redirects (e.g., token expiring mid-session)
    const currentUrl = this.page.url();
    if (isAuthRedirectUrl(currentUrl, this._customAuthPatterns)) {
      throw new Error(`Auth redirect detected before capture: ${currentUrl}`);
    }

    // CRITICAL: Final theme enforcement right before capture
    // This ensures theme classes haven't been reset by React/framework re-renders
    if (this.variantConfig && this.variantConfig.injections?.length > 0) {
      await this.page.evaluate(() => {
        if (window.__RESHOT_THEME_OVERRIDE__) {
          const wanted = window.__RESHOT_THEME_OVERRIDE__;
          document.documentElement.classList.remove("dark", "light");
          document.documentElement.classList.add(wanted);
          document.documentElement.style.colorScheme = wanted;
          document.documentElement.setAttribute("data-theme", wanted);
        }
      });
      // Brief wait for CSS to apply
      await this.page.waitForTimeout(100);
    }

    // Ensure output directory exists
    const outputPath = path.join(this.outputDir, `${name}.png`);
    fs.ensureDirSync(path.dirname(outputPath));

    let screenshotOptions = {
      type: "png",
    };

    if (selector) {
      // Capture specific element with padding
      const element = await this._findElement(selector);
      const box = await element.boundingBox();

      if (box) {
        screenshotOptions.clip = {
          x: Math.max(0, box.x - padding),
          y: Math.max(0, box.y - padding),
          width: box.width + padding * 2,
          height: box.height + padding * 2,
        };
      } else {
        // Element not visible, capture full page
        screenshotOptions.fullPage = true;
      }
    } else if (clip) {
      screenshotOptions.clip = clip;
    } else if (fullPage) {
      screenshotOptions.fullPage = true;
    }

    // Capture screenshot to buffer first (for optional cropping)
    const screenshotBuffer = await this.page.screenshot(screenshotOptions);

    // Determine effective crop config (step overrides scenario)
    const effectiveCropConfig = mergeCropConfigs(
      this.cropConfig,
      stepCropConfig
    );

    // Apply cropping if configured
    let finalBuffer = screenshotBuffer;
    let wasCropped = false;

    if (
      effectiveCropConfig &&
      effectiveCropConfig.enabled &&
      isSharpAvailable()
    ) {
      try {
        // Get device scale factor for coordinate scaling
        const deviceScaleFactor = await this.page.evaluate(
          () => window.devicePixelRatio || 1
        );

        finalBuffer = await cropImageBuffer(
          screenshotBuffer,
          effectiveCropConfig,
          {
            deviceScaleFactor,
          }
        );
        wasCropped = true;

        this.logger(
          chalk.gray(
            `    ✂ Cropped to region: ${JSON.stringify(
              effectiveCropConfig.region
            )}`
          )
        );
      } catch (cropError) {
        this.logger(
          chalk.yellow(
            `    ⚠ Crop failed: ${cropError.message}, using full screenshot`
          )
        );
        finalBuffer = screenshotBuffer;
      }
    } else if (
      effectiveCropConfig &&
      effectiveCropConfig.enabled &&
      !isSharpAvailable()
    ) {
      this.logger(
        chalk.yellow(
          `    ⚠ Sharp not installed, skipping crop. Run: npm install sharp`
        )
      );
    }

    // Apply style processing (frames, shadow, padding, etc.)
    let wasStyled = false;
    if (this.styleConfig && this.styleConfig.enabled && isStyleAvailable()) {
      // Smart default: skip frame for element screenshots
      const effectiveStyleConfig = selector
        ? { ...this.styleConfig, frame: this.styleConfig.frame === undefined ? "none" : this.styleConfig.frame }
        : { ...this.styleConfig };

      // Detect dark mode from variant config
      if (this.variantConfig?.browserOptions?.colorScheme === "dark") {
        effectiveStyleConfig._darkMode = true;
      }

      // Get DPR for accurate scaling
      const captureDpr = await this.page.evaluate(() => window.devicePixelRatio || 1);
      finalBuffer = await applyStyle(finalBuffer, effectiveStyleConfig, this.logger, captureDpr);
      wasStyled = true;
    } else if (this.styleConfig && this.styleConfig.enabled && !isStyleAvailable()) {
      this.logger(chalk.yellow("  ⚠ Sharp not installed, skipping style. Run: npm install sharp"));
    }

    // Write the final buffer to file
    await fs.writeFile(outputPath, finalBuffer);

    // ── DOM scene capture (sidecar MHTML) ──────────────────────────────
    // Capture a self-contained MHTML bundle of the page at the same moment
    // as the PNG. The bundle re-renders in any Chromium browser without
    // network access and is the source of truth for variations: marketing
    // can mutate the captured DOM (swap copy, hide chrome, recrop, rebrand
    // tenant names) and render new outputs without re-running Playwright
    // against the live app. Opt out per-scenario or globally via
    // reshot.config.json -> { domScene: false }.
    //
    // The MHTML capture is best-effort — failures are logged but do not
    // fail the scenario, since the primary PNG already succeeded.
    let domScenePath = null;
    let domSceneBytes = null;
    if (this.domSceneEnabled) {
      try {
        const cdp = await this.page.context().newCDPSession(this.page);
        const { data: mhtml } = await cdp.send("Page.captureSnapshot", {
          format: "mhtml",
        });
        domScenePath = outputPath.replace(/\.png$/i, ".mhtml");
        await fs.writeFile(domScenePath, mhtml);
        domSceneBytes = Buffer.byteLength(mhtml, "utf8");
        this.logger(
          chalk.gray(
            `  ✓ DOM scene: ${path.basename(domScenePath)} (${(domSceneBytes / 1024).toFixed(0)} KB)`,
          ),
        );
      } catch (err) {
        this.logger(
          chalk.yellow(
            `  ⚠ DOM scene capture skipped: ${err.message || err}`,
          ),
        );
        domScenePath = null;
        domSceneBytes = null;
      }
    }

    // Record asset metadata
    this.capturedAssets.push({
      name,
      path: outputPath,
      domScenePath,
      domSceneBytes,
      description,
      capturedAt: new Date().toISOString(),
      viewport: this.viewport,
      cropped: wasCropped,
      cropConfig: wasCropped ? effectiveCropConfig : undefined,
      styled: wasStyled,
    });

    this.logger(chalk.green(`  ✔ Saved: ${outputPath}`));
    return this;
  }

  /**
   * Capture with hover state visible
   * Useful for dropdowns, menus, tooltips
   */
  async captureWithHover(name, hoverTarget, options = {}) {
    this.logger(chalk.cyan(`📸 Capturing with hover: ${name}`));

    await this.hover(hoverTarget);
    await this.wait(200); // Let hover animation complete
    await this.capture(name, options);

    // Move mouse away to clear hover
    await this.page.mouse.move(0, 0);

    return this;
  }

  /**
   * Capture a sequence of steps as a GIF or series of images
   */
  async captureSequence(name, steps, options = {}) {
    const { frameDelay = 500 } = options;
    const frames = [];

    this.logger(chalk.cyan(`🎬 Capturing sequence: ${name}`));

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // Execute the step action
      if (step.action) {
        await this[step.action](...(step.args || []));
      }

      // Capture frame
      const framePath = path.join(
        this.outputDir,
        `${name}-frame-${i.toString().padStart(3, "0")}.png`
      );
      fs.ensureDirSync(path.dirname(framePath));

      await this.page.screenshot({ path: framePath });
      frames.push(framePath);

      await this.wait(frameDelay);
    }

    this.logger(chalk.green(`  ✔ Captured ${frames.length} frames`));

    return frames;
  }

  /**
   * Wait for page to be stable (no network activity, no animations, no unrendered i18n keys)
   */
  async _waitForStability() {
    try {
      // Wait for network to be idle (no requests for 500ms)
      await this.page.waitForLoadState("networkidle", { timeout: 5000 });
    } catch (e) {
      // Network might never be fully idle - check for pending data fetches
      try {
        await this.page.waitForFunction(
          () => {
            // Check if there are recent fetch/XHR requests still in progress
            const entries = performance.getEntriesByType("resource");
            const recentDataFetches = entries.filter((e) => {
              const isFetch =
                e.initiatorType === "fetch" || e.initiatorType === "xmlhttprequest";
              const isRecent = performance.now() - e.startTime < 2000;
              const isNotComplete = e.duration === 0;
              return isFetch && isRecent && isNotComplete;
            });
            return recentDataFetches.length === 0;
          },
          { timeout: 2000 }
        );
      } catch (_e) {
        // Continue anyway - best effort
      }
    }

    // Wait for any pending React/Vue hydration and i18n to complete
    // Check for common i18n key patterns that indicate translations haven't loaded
    try {
      await this.page.waitForFunction(
        () => {
          // Look for common unrendered i18n key patterns in visible text
          const body = document.body;
          if (!body) return true;

          const text = body.innerText || "";

          // Common i18n key patterns that indicate translations haven't loaded yet
          const i18nKeyPatterns = [
            /[a-z]+\.[a-z]+\.[a-z]+/i, // nested.key.pattern
            /[a-z]+:[a-z]+\.[a-z]+/i, // namespace:key.pattern
            /\{\{[^}]+\}\}/, // {{interpolation}}
            /\$t\([^)]+\)/, // $t('key')
          ];

          // Check if visible text contains raw i18n keys
          // This is a heuristic - we check if there are suspiciously many dotted identifiers
          const dottedMatches = text.match(/\b[a-z_]+\.[a-z_]+\b/gi) || [];

          // Filter to only those that look like translation keys (all lowercase with dots)
          const suspiciousKeys = dottedMatches.filter((match) => {
            // Skip common non-i18n patterns
            if (
              match.includes(".com") ||
              match.includes(".org") ||
              match.includes(".io")
            )
              return false;
            if (match.match(/\d+\.\d+/)) return false; // version numbers
            if (match === "e.g" || match === "i.e") return false;
            // Keys are typically all lowercase with underscores/dots
            return match === match.toLowerCase() && match.length > 5;
          });

          // If we find more than 3 suspicious keys visible, translations probably haven't loaded
          return suspiciousKeys.length < 3;
        },
        { timeout: 3000 }
      );
    } catch (e) {
      // Timeout is okay - we'll proceed anyway
    }

    // Additional wait for any animations/transitions
    await this.page.waitForTimeout(200);

    // Wait for loading skeletons/spinners to disappear
    await this._waitForLoadingComplete();

    // Custom ready-state hook (user-configured per scenario)
    if (this.waitForReady) {
      const result = await this._waitForCustomReady(this.waitForReady);
      if (!result.ready) {
        this.logger(chalk.yellow(`  ⚠ Custom ready check failed: ${result.reason}`));
      }
    }
  }

  /**
   * Wait for loading indicators (skeletons, spinners, etc.) to disappear
   * Increased timeout for SaaS apps that may have data fetching
   */
  async _waitForLoadingComplete(maxWait = 5000) {
    // Selectors for actual loading states (not decorative animations)
    const loadingSelectors = [
      '[class*="skeleton"]',
      '[class*="Skeleton"]',
      '[class*="shimmer"]',
      '[class*="loading"]',
      '[class*="Loading"]',
      '[class*="spinner"]',
      '[class*="Spinner"]',
      '[class*="loader"]',
      '[class*="Loader"]',
      '[role="progressbar"]',
      '[aria-busy="true"]',
      '[data-loading="true"]',
      "[data-skeleton]",
      // Additional common patterns
      ".placeholder-glow",
      ".placeholder-wave", // Bootstrap
      '[data-testid*="loading"]',
      '[data-testid*="skeleton"]',
      ".suspense-fallback",
      ".lazy-loading",
    ];

    // Selectors that might be decorative animations (small status indicators)
    // We check these but require them to be larger than a certain size
    const decorativeSelectors = [
      '[class*="pulse"]',
      '[class*="animate-pulse"]',
    ];

    const startTime = Date.now();
    let attempts = 0;
    let consecutiveNoLoading = 0;

    while (Date.now() - startTime < maxWait) {
      attempts++;
      let loadingFound = false;

      // Check strict loading selectors
      for (const selector of loadingSelectors) {
        try {
          const count = await this.page.locator(selector).count();
          if (count > 0) {
            const visible = await this.page
              .locator(selector)
              .first()
              .isVisible()
              .catch(() => false);
            if (visible) {
              loadingFound = true;
              consecutiveNoLoading = 0;
              break;
            }
          }
        } catch {
          // Selector didn't match, that's fine
        }
      }

      // Check decorative selectors but only if they're large enough to be actual skeletons
      if (!loadingFound) {
        for (const selector of decorativeSelectors) {
          try {
            const elements = await this.page.locator(selector).all();
            for (const el of elements) {
              const visible = await el.isVisible().catch(() => false);
              if (visible) {
                // Check size - decorative dots are typically small (< 50px)
                const box = await el.boundingBox().catch(() => null);
                if (box && (box.width > 50 || box.height > 50)) {
                  // This is likely a skeleton/loading placeholder, not a decorative dot
                  loadingFound = true;
                  consecutiveNoLoading = 0;
                  break;
                }
              }
            }
            if (loadingFound) break;
          } catch {
            // Selector didn't match, that's fine
          }
        }
      }

      if (!loadingFound) {
        consecutiveNoLoading++;
        // Wait for 5 consecutive checks with no loading to ensure stability
        if (consecutiveNoLoading >= 5) {
          if (attempts > 5) {
            this.logger &&
              this.logger(
                chalk.dim(
                  `  Loading indicators cleared after ${attempts} checks`
                )
              );
          }
          return;
        }
      }

      // Wait a bit before checking again
      await this.page.waitForTimeout(200);
    }

    this.logger &&
      this.logger(
        chalk.yellow(
          `  Warning: Loading indicators still present after ${maxWait}ms, proceeding anyway`
        )
      );
  }

  /**
   * Wait for a custom ready condition configured per-scenario.
   * Supports CSS selector presence and/or a JS expression evaluating to true.
   *
   * @param {Object} config - { selector?: string, expression?: string, timeout?: number }
   * @returns {Promise<{ready: boolean, reason?: string}>}
   */
  async _waitForCustomReady(config) {
    const timeout = config.timeout || 10000;

    // Selector check: wait for the element to be attached to the DOM
    if (config.selector) {
      try {
        await this.page
          .locator(config.selector)
          .first()
          .waitFor({ state: "attached", timeout });
      } catch {
        return { ready: false, reason: `Selector "${config.selector}" not found within ${timeout}ms` };
      }
    }

    // Expression check: wait for a JS expression to return truthy
    if (config.expression) {
      try {
        await this.page.waitForFunction(config.expression, { timeout });
      } catch {
        return { ready: false, reason: `Expression "${config.expression}" did not become truthy within ${timeout}ms` };
      }
    }

    return { ready: true };
  }

  /**
   * Detect error state on the current page
   * Checks explicit data attributes, custom selectors, and heuristic patterns
   * @param {Object} options - Detection options
   * @param {string[]} options.errorSelectors - Custom error selectors to check
   * @param {boolean} options.errorHeuristics - Whether to use heuristic detection
   * @returns {Promise<{hasError: boolean, errorType: string|null, errorMessage: string|null}>}
   */
  async _detectErrorState(options = {}) {
    const {
      errorSelectors = ["[data-testid='page-error']", "[data-error-type]"],
      errorHeuristics = true,
    } = options;

    try {
      return await this.page.evaluate(
        ({ selectors, useHeuristics }) => {
          // 1. Check explicit data attributes (fast, deterministic)
          const errorEl = document.querySelector("[data-testid='page-error']");
          if (errorEl) {
            const errorType =
              errorEl.getAttribute("data-error-type") || "unknown";
            const errorMessage =
              errorEl.textContent?.trim().slice(0, 200) || "Page error detected";
            return { hasError: true, errorType, errorMessage };
          }

          // Also check data-error-type on any element
          const errorTypeEl = document.querySelector("[data-error-type]");
          if (errorTypeEl) {
            const errorType =
              errorTypeEl.getAttribute("data-error-type") || "unknown";
            const errorMessage =
              errorTypeEl.textContent?.trim().slice(0, 200) ||
              "Error state detected";
            return { hasError: true, errorType, errorMessage };
          }

          // 2. Check custom error selectors from config
          for (const selector of selectors) {
            if (
              selector === "[data-testid='page-error']" ||
              selector === "[data-error-type]"
            )
              continue; // Already checked
            try {
              const el = document.querySelector(selector);
              if (el) {
                const style = window.getComputedStyle(el);
                if (
                  style.display !== "none" &&
                  style.visibility !== "hidden"
                ) {
                  return {
                    hasError: true,
                    errorType: "custom-selector",
                    errorMessage: `Error selector matched: ${selector}`,
                  };
                }
              }
            } catch (e) {
              // Invalid selector, skip
            }
          }

          // 3. Heuristic patterns (fallback)
          if (useHeuristics) {
            const bodyText = document.body?.innerText || "";
            const errorPatterns = [
              /failed to load/i,
              /something went wrong/i,
              /unable to load/i,
              /error loading/i,
              /could not load/i,
              /an error occurred/i,
            ];

            for (const pattern of errorPatterns) {
              if (pattern.test(bodyText)) {
                // Structural check: error text should be in a centered/prominent element
                const candidates = document.querySelectorAll(
                  ".text-center, .text-destructive, [class*='error'], [class*='Error']"
                );
                for (const candidate of candidates) {
                  if (
                    pattern.test(candidate.textContent || "") &&
                    candidate.offsetHeight > 50
                  ) {
                    return {
                      hasError: true,
                      errorType: "heuristic",
                      errorMessage: candidate.textContent
                        ?.trim()
                        .slice(0, 200),
                    };
                  }
                }
              }
            }
          }

          return { hasError: false, errorType: null, errorMessage: null };
        },
        { selectors: errorSelectors, useHeuristics: errorHeuristics }
      );
    } catch (e) {
      // Page may be navigating, return no error
      return { hasError: false, errorType: null, errorMessage: null };
    }
  }

  /**
   * Race between page ready state and error state detection
   * @param {string} readySelector - Selector indicating page is ready
   * @param {Object} options - Options
   * @param {number} options.timeout - Max time to wait
   * @param {string[]} options.errorSelectors - Error selectors
   * @param {boolean} options.errorHeuristics - Enable heuristic detection
   * @returns {Promise<{status: 'ready'|'error'|'timeout', errorDetails?: Object}>}
   */
  async waitForReadyOrError(readySelector, options = {}) {
    const {
      timeout = 15000,
      errorSelectors = ["[data-testid='page-error']", "[data-error-type]"],
      errorHeuristics = true,
    } = options;

    const startTime = Date.now();
    const pollInterval = 300;

    // Start waitForSelector in background
    const readyPromise = this.page
      .locator(readySelector)
      .first()
      .waitFor({ state: "visible", timeout })
      .then(() => ({ status: "ready" }))
      .catch(() => null); // Will be handled by timeout

    // Poll for error state
    while (Date.now() - startTime < timeout) {
      // Check if ready selector resolved
      const readyResult = await Promise.race([
        readyPromise,
        new Promise((resolve) => setTimeout(() => resolve(null), pollInterval)),
      ]);

      if (readyResult) {
        return readyResult;
      }

      // Check for error state
      const errorState = await this._detectErrorState({
        errorSelectors,
        errorHeuristics,
      });

      if (errorState.hasError) {
        return { status: "error", errorDetails: errorState };
      }
    }

    return { status: "timeout" };
  }

  /**
   * Verify page has meaningful content before capture (optional)
   * @param {Object} options - Verification options
   * @param {number} options.minContentLength - Minimum body text length
   * @param {string[]} options.rejectSelectors - Selectors that indicate bad content
   * @returns {Promise<{valid: boolean, reason?: string}>}
   */
  async _verifyContent(options = {}) {
    const { minContentLength = 100, rejectSelectors = [] } = options;

    try {
      return await this.page.evaluate(
        ({ minLen, rejectSels }) => {
          const bodyText = (document.body?.innerText || "").trim();

          if (bodyText.length < minLen) {
            return {
              valid: false,
              reason: `Page content too short (${bodyText.length} chars, minimum ${minLen})`,
            };
          }

          for (const sel of rejectSels) {
            try {
              if (document.querySelector(sel)) {
                return {
                  valid: false,
                  reason: `Reject selector found: ${sel}`,
                };
              }
            } catch (e) {
              // Invalid selector, skip
            }
          }

          return { valid: true };
        },
        { minLen: minContentLength, rejectSels: rejectSelectors }
      );
    } catch (e) {
      return { valid: true }; // Don't block on evaluation errors
    }
  }

  /**
   * Get all captured assets
   */
  getAssets() {
    return this.capturedAssets;
  }

  /**
   * Close the browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.context = null;
    }
    this.logger(chalk.green("✔ Browser closed"));
  }

  /**
   * Run a capture script
   * Script is an array of step objects
   */
  async runScript(script) {
    for (const step of script) {
      const { action, ...params } = step;

      if (!this[action]) {
        throw new Error(`Unknown action: ${action}`);
      }

      // Handle different action signatures
      switch (action) {
        case "goto":
          await this.goto(params.url, params);
          break;
        case "click":
          await this.click(params.target, params);
          break;
        case "hover":
          await this.hover(params.target, params);
          break;
        case "type":
          await this.type(params.target, params.text, params);
          break;
        case "wait":
          await this.wait(params.ms || params.duration || 1000);
          break;
        case "waitFor":
          await this.waitFor(params.target, params);
          break;
        case "capture":
          await this.capture(params.name, params);
          break;
        case "captureWithHover":
          await this.captureWithHover(params.name, params.hoverTarget, params);
          break;
        default:
          this.logger(chalk.yellow(`  ⚠ Unknown action: ${action}`));
      }
    }

    return this.capturedAssets;
  }
}

/**
 * Helper to create and run a capture script
 */
async function runCaptureScript(script, options = {}) {
  const engine = new CaptureEngine(options);

  try {
    await engine.init();
    const assets = await engine.runScript(script);
    return { success: true, assets };
  } catch (error) {
    console.error(chalk.red(`Capture failed: ${error.message}`));
    return { success: false, error: error.message };
  } finally {
    await engine.close();
  }
}

module.exports = {
  CaptureEngine,
  runCaptureScript,
  isAuthRedirectUrl,
};
