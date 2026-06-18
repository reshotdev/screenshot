const { chromium } = require("playwright");
const chalk = require("chalk");
const path = require("path");
const fs = require("fs-extra");
const { connectToActivePage } = require("./record-cdp");
const { setupBrowserActionListener } = require("./record-browser-injection");
const { captureScreenshotInteractive } = require("./record-screenshot");
const {
  finalizeScenarioAndWriteConfig,
  saveScenarioProgress,
  showVisualSelectionMenu,
} = require("./record-config");
const config = require("./config");

/**
 * RecorderService - Manages recording sessions for Studio UI and CLI
 * Replaces terminal-based recording with API-driven stateful service
 * Enhanced with robust CDP connection and real-time event broadcasting
 */
class RecorderService {
  constructor(options = {}) {
    this.io = options.io || null; // Socket.io server instance (optional, for Studio)
    this.dispatcher = options.dispatcher || null; // Event dispatcher function (optional)
    this.logger = options.logger || console.log; // Logger function (optional)
    this.currentSession = null;
    this.browser = null;
    this.page = null;
    this.context = null;
    this._active = false;
    this._lastError = null;
    this._navigationListener = null; // Track navigation listener for cleanup
    this._disconnectListener = null; // Track disconnect listener for cleanup
  }

  /**
   * Emergency cleanup called on server shutdown or new session start
   * Uses timeout to avoid blocking shutdown if browser is unresponsive
   */
  async forceCleanup() {
    console.log(
      chalk.yellow("[Recorder] Force cleaning up browser session...")
    );

    // Remove event listeners first (synchronous, won't block)
    if (this.page && this._navigationListener) {
      try {
        this.page.off("framenavigated", this._navigationListener);
      } catch (e) {}
      this._navigationListener = null;
    }

    if (this.browser && this._disconnectListener) {
      try {
        this.browser.off("disconnected", this._disconnectListener);
      } catch (e) {}
      this._disconnectListener = null;
    }

    if (this.page) {
      try {
        // Remove listeners if possible to avoid side effects
        // await this.page.evaluate(() => window.__RESHOT_ACTIVE = false).catch(() => {});
      } catch (e) {}
      this.page = null;
    }

    if (this.browser) {
      try {
        // Use disconnect for CDP connections to avoid killing user's Chrome
        // Wrap in a timeout to avoid blocking shutdown indefinitely
        if (this.browser.isConnected()) {
          console.log(chalk.gray("[Recorder] Disconnecting from Chrome..."));
          const disconnectPromise = this.browser.disconnect();
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Disconnect timeout")), 2000)
          );
          await Promise.race([disconnectPromise, timeoutPromise]).catch(() => {
            console.log(
              chalk.gray(
                "[Recorder] Disconnect timed out, continuing shutdown..."
              )
            );
          });
        } else {
          // If we launched it (headless), close it.
          // NOTE: connectToActivePage usually connects to an existing Chrome.
          // Closing it might close the user's window. Disconnect is safer.
          const closePromise = this.browser.close();
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Close timeout")), 2000)
          );
          await Promise.race([closePromise, timeoutPromise]).catch(() => {
            console.log(
              chalk.gray("[Recorder] Close timed out, continuing shutdown...")
            );
          });
        }
      } catch (e) {
        console.error("[Recorder] Error disconnecting browser:", e.message);
      }
      this.browser = null;
    }
    this.context = null;
    this.currentSession = null;
  }

  /**
   * Start a new recording session
   * @param {Object} options - Recording options
   * @param {string} options.visualKey - Visual key (optional, will prompt if not provided in CLI mode)
   * @param {string} options.title - Title for new visual (optional)
   * @param {boolean} options.uiMode - If true, skip prompts and use options directly
   * @param {string} options.targetUrl - Specific URL to connect to (optional)
   * @param {string} options.targetId - Specific tab ID to connect to (optional)
   * @returns {Promise<{sessionId: string, visualKey: string}>}
   */
  async start(options = {}) {
    const {
      visualKey: providedVisualKey,
      title,
      uiMode = false,
      targetUrl,
      targetId,
      scenarioUrl, // Custom URL to save with the scenario
    } = options;

    // 1. Strict Session Check & Cleanup
    if (this._active) {
      if (uiMode) {
        // In Studio mode, auto-stop without saving
        this.logger(
          chalk.yellow(
            "[Recorder] Session active. Auto-stopping previous session..."
          )
        );
        await this.stop(false);
      } else {
        // In CLI mode, throw error
        throw new Error(
          "Recording session already active. Stop the current session before starting a new one."
        );
      }
    }

    try {
      this._emitDiagnostic("info", "Connecting to Chrome via CDP...");

      // 2. Connect to Chrome (with optional target selection)
      const { browser, page, context } = await connectToActivePage({
        autoLaunch: true,
        uiMode: uiMode,
        targetUrl,
        targetId,
      });

      this.browser = browser;
      this.page = page;
      this.context = context;

      // Check if we're on a valid page
      const currentUrl = page.url();
      if (
        currentUrl.startsWith("chrome-error://") ||
        currentUrl.startsWith("about:blank")
      ) {
        this._emitDiagnostic(
          "warn",
          `Connected to ${currentUrl}. Please navigate to your application in Chrome first.`
        );
        throw new Error(
          "Chrome is not on a valid page. Please navigate to your application first, then start recording."
        );
      }

      // Handle disconnection event (remove old one if exists)
      if (this._disconnectListener) {
        this.browser.off("disconnected", this._disconnectListener);
      }

      this._disconnectListener = () => {
        this.logger(chalk.red("[Recorder] Browser disconnected"));
        this.stop(false).catch(() => {});
      };

      this.browser.on("disconnected", this._disconnectListener);

      this._emitDiagnostic("info", `Connected to Chrome at ${page.url()}`);

      // 3. Inject "Highlighter" CSS
      await this.page.addInitScript(() => {
        if (document.getElementById("reshot-styles")) return;
        const style = document.createElement("style");
        style.id = "reshot-styles";
        style.innerHTML = `
          .reshot-highlight { outline: 2px solid #00ff00 !important; z-index: 2147483647; cursor: crosshair !important; }
          .reshot-cursor { position: fixed; width: 20px; height: 20px; border: 2px solid red; border-radius: 50%; pointer-events: none; z-index: 100000; transition: all 0.1s; }
        `;
        document.head.appendChild(style);
      });

      // 4. Initialize Session State
      let visualKey = providedVisualKey;
      let existingScenario = null;

      // In CLI mode, show visual selection menu if visualKey not provided
      if (!visualKey && !uiMode) {
        const selection = await showVisualSelectionMenu(page, title);
        visualKey = selection.visualKey;
        existingScenario = selection.existingScenario;
      } else if (!visualKey && title) {
        // Generate key from title
        visualKey = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
      }

      // Check existing config
      const { readConfig, configExists } = require("./config");
      if (!existingScenario && configExists()) {
        try {
          const cfg = readConfig();
          existingScenario =
            cfg.scenarios?.find((s) => s.key === visualKey) || null;
        } catch (e) {
          /* ignore */
        }
      }

      const sessionState = {
        visualKey: visualKey || "untitled",
        scenarioUrl: scenarioUrl || null, // Custom URL to save (if not provided, uses page URL)
        capturedSteps: existingScenario
          ? [...(existingScenario.steps || [])]
          : [],
        existingScenario: existingScenario
          ? JSON.parse(JSON.stringify(existingScenario))
          : null,
        savedStepCount: 0,
        mode: "normal",
        phase: uiMode ? "recording" : "idle",
        pendingCapture: null,
        quit: false,
        saveOnQuit: true,
        clipEvents: null,
        recordingStart: null,
        stopClipRecording: false,
        onChange: null,
        onElementSelected: null,
        emitEvent: this.dispatcher
          ? (type, payload) => {
              this.dispatcher("recorder:event", {
                type,
                ...payload,
                timestamp: new Date().toISOString(),
              });
            }
          : null,
      };

      this.currentSession = {
        id: `sess_${Date.now()}`,
        visualKey: sessionState.visualKey,
        state: sessionState,
        startedAt: new Date().toISOString(),
      };

      this._active = true;

      // 5. Expose Binding (The Data Bridge)
      // This is the ONLY place we expose the binding - setupBrowserActionListener will skip it
      let bindingRegistered = false;
      try {
        await this.page.exposeBinding("reshotReportAction", (source, data) => {
          this.handleBrowserAction(data);
        });
        bindingRegistered = true;
      } catch (error) {
        if (
          error.message.includes("already registered") ||
          error.message.includes("already been registered")
        ) {
          // Binding exists from a previous session - this is okay
          console.log(
            chalk.yellow(
              "[Recorder] Binding already exists from previous session, reusing"
            )
          );
          bindingRegistered = true; // We can still use it
        } else {
          throw error;
        }
      }

      // 6. Inject Listeners (skip binding since we just handled it above)
      await setupBrowserActionListener(this.page, sessionState, {
        skipBinding: true,
      });

      // 7. Navigation Listener (remove old one if exists)
      if (this._navigationListener) {
        try {
          this.page.off("framenavigated", this._navigationListener);
        } catch (e) {
          // Ignore errors removing old listener
        }
      }

      this._navigationListener = async () => {
        // Re-inject listeners on nav (skip binding - it persists across navigations)
        try {
          await setupBrowserActionListener(this.page, sessionState, {
            skipBinding: true,
          });
          this._emitEvent("recorder:event", {
            type: "navigation",
            sessionId: this.currentSession?.id,
            url: this.page.url(),
          });
        } catch (e) {
          console.log(
            chalk.yellow(
              "[Recorder] Error re-injecting on navigation:",
              e.message
            )
          );
        }
      };

      this.page.on("framenavigated", this._navigationListener);

      // 8. Broadcast "Started"
      this._broadcastStatus();
      this._emitEvent("recorder:event", {
        type: "session_started",
        sessionId: this.currentSession.id,
        visualKey: sessionState.visualKey,
      });

      // Send initial steps
      if (sessionState.capturedSteps.length > 0) {
        this._emitEvent("recorder:steps", {
          steps: sessionState.capturedSteps,
        });
      }

      this.logger(
        chalk.green(`[Recorder] Session started for ${sessionState.visualKey}`)
      );
      return {
        sessionId: this.currentSession.id,
        visualKey: sessionState.visualKey,
      };
    } catch (error) {
      // Emit error diagnostic before cleanup
      this._emitDiagnostic(
        "error",
        `Failed to start recording: ${error.message}`
      );
      await this.forceCleanup();
      throw error;
    }
  }

  /**
   * Stop the current recording session
   * @param {boolean} save - Whether to save the scenario
   * @param {Object} options - Additional options
   * @param {boolean} options.uiMode - If true, skip prompts
   * @param {string} options.mergeMode - Merge mode ('replace' or 'append')
   */
  async stop(save = true, options = {}) {
    if (!this._active || !this.currentSession) {
      return { saved: false, message: "No active session" };
    }

    const { uiMode = false, mergeMode = "replace" } = options;

    try {
      if (save) {
        // Finalize and write to disk
        await finalizeScenarioAndWriteConfig(
          this.currentSession.state,
          this.page,
          { uiMode, mergeMode }
        );
      }

      this._emitEvent("recorder:event", {
        type: "session_stopped",
        sessionId: this.currentSession.id,
        saved: save,
      });

      return { saved: save, sessionId: this.currentSession.id };
    } finally {
      this._cleanup();
      this._broadcastStatus();
    }
  }

  /**
   * Capture a screenshot
   * @param {Object} options - Capture options
   * @param {string} options.outputFilename - Output filename
   * @param {string} options.areaType - 'full' or 'element'
   * @param {string} options.selector - Element selector (if areaType is 'element')
   * @param {boolean} options.uiMode - If true, bypass prompts
   */
  async capture(options = {}) {
    if (!this._active || !this.currentSession) {
      throw new Error("No active session");
    }

    const { uiMode = false } = options;

    // Notify UI capture starting
    this._emitEvent("recorder:event", { type: "capture_started" });

    try {
      // Reuse logic from record-screenshot.js but bypass inquirer
      const screenshotStep = await captureScreenshotInteractive(
        this.currentSession.state,
        this.page,
        { ...options, uiMode } // Pass uiMode flag to bypass prompts
      );

      // IMMEDIATELY save the screenshot file to output directory
      await this._saveScreenshotFile(screenshotStep);

      // Add step to session
      this.currentSession.state.capturedSteps.push(screenshotStep);

      // Auto-save progress
      await saveScenarioProgress(this.currentSession.state, this.page, {
        finalize: false,
        uiMode,
      });

      this._emitEvent("recorder:event", {
        type: "capture_completed",
        step: screenshotStep,
      });

      // Send updated step list
      this._emitEvent("recorder:steps", {
        steps: this.currentSession.state.capturedSteps,
      });

      return screenshotStep;
    } catch (error) {
      this._emitEvent("recorder:event", {
        type: "capture_error",
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Save screenshot file immediately during recording
   */
  async _saveScreenshotFile(screenshotStep) {
    if (!this.page || !screenshotStep.path) {
      return;
    }

    // Determine output directory based on config
    const docSyncConfig = config.readConfig();
    const outputBaseDir = path.join(
      process.cwd(),
      docSyncConfig.assetDir || ".reshot/output"
    );
    const scenarioKey = this.currentSession.visualKey;
    const variationSlug = "default"; // For now, use default variation
    const outputDir = path.join(outputBaseDir, scenarioKey, variationSlug);

    fs.ensureDirSync(outputDir);

    const outputPath = path.join(outputDir, screenshotStep.path);

    try {
      if (screenshotStep.selector) {
        // Capture specific element
        const element = await this.page
          .locator(screenshotStep.selector)
          .first();
        await element.screenshot({
          path: outputPath,
          clip: screenshotStep.clip,
        });
      } else {
        // Capture full page or clip
        const screenshotOptions = {
          path: outputPath,
          fullPage: !screenshotStep.clip,
        };

        if (screenshotStep.clip) {
          screenshotOptions.clip = screenshotStep.clip;
        }

        await this.page.screenshot(screenshotOptions);
      }

      console.log(chalk.green(`  ✔ Screenshot saved to ${outputPath}`));

      // Add saved path to step for reference
      screenshotStep.savedPath = outputPath;
    } catch (error) {
      console.log(
        chalk.yellow(`  ⚠ Could not save screenshot: ${error.message}`)
      );
    }
  }

  /**
   * Get current session status
   */
  getStatus() {
    if (!this._active || !this.currentSession) {
      return { active: false };
    }
    return {
      active: true,
      sessionId: this.currentSession.id,
      visualKey: this.currentSession.visualKey,
      stepsCount: this.currentSession.state.capturedSteps.length,
      url: this.page?.url(),
      phase: this.currentSession.state.phase,
      mode: this.currentSession.state.mode,
    };
  }

  /**
   * Get captured steps
   */
  getSteps() {
    return this.currentSession ? this.currentSession.state.capturedSteps : [];
  }

  /**
   * Remove a step at a specific index
   * @param {number} index - The index of the step to remove
   */
  removeStep(index) {
    if (!this.currentSession) {
      throw new Error("No active recording session");
    }

    const steps = this.currentSession.state.capturedSteps;
    if (index < 0 || index >= steps.length) {
      throw new Error(
        `Invalid step index: ${index}. Valid range: 0-${steps.length - 1}`
      );
    }

    // Remove the step
    const removed = steps.splice(index, 1)[0];

    // Emit updated steps to UI
    this._emitEvent("recorder:steps", {
      steps: this.currentSession.state.capturedSteps,
    });

    return { removed, remaining: steps.length };
  }

  /**
   * Check if a selector is unstable/garbage and should be rejected
   */
  _isUnstableSelector(selector) {
    if (!selector) return true;

    // Reject body/html selectors
    if (selector === "body" || selector === "html") return true;
    if (selector.startsWith("body.") || selector.startsWith("html."))
      return true;

    // Reject form container selectors
    if (selector.startsWith("form.") || selector === "form") return true;
    if (selector.includes("form.space-") || selector.includes("form.flex"))
      return true;

    // Reject main/section/article container selectors
    if (/^(main|section|article|header|footer|nav|aside)(\.|$)/.test(selector))
      return true;

    // Reject generic div selectors without data-testid
    if (selector.startsWith("div.") && !selector.includes("[data-testid"))
      return true;

    // Reject complex path selectors with generic class patterns
    if (
      selector.includes("> select") ||
      selector.includes("> div.") ||
      selector.includes("> form.")
    )
      return true;
    if (selector.includes(".space-y-") || selector.includes(".space-x-"))
      return true;

    // Reject selectors that are purely Tailwind utility classes
    const tailwindPattern =
      /\.(p|m|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr|w|h|flex|grid|gap|space|items|justify|rounded|border|shadow|bg|text|font)-/;
    if (
      tailwindPattern.test(selector) &&
      !selector.includes("[data-testid") &&
      !selector.includes("#")
    )
      return true;

    // Reject selectors with dynamic Radix IDs
    if (/radix-[A-Za-z0-9_-]+/.test(selector)) return true;

    // Reject selectors with CSS module hashes
    if (/[a-z]+_[a-f0-9]{6,}/.test(selector)) return true;
    if (/-module__/.test(selector)) return true;

    // Reject hidden native select elements (Radix uses these)
    if (selector.includes("select") && !selector.includes("[data-testid"))
      return true;

    return false;
  }

  handleBrowserAction(action) {
    if (!this._active || !this.currentSession) return;

    const { type, selector, value } = action;

    // Validate selector - reject unstable ones
    if (this._isUnstableSelector(selector)) {
      this.logger(
        chalk.yellow(`[Action REJECTED] Unstable selector: ${selector}`)
      );
      this._emitDiagnostic("warn", `Rejected unstable selector: ${selector}`);
      return;
    }

    const steps = this.currentSession.state.capturedSteps;
    const lastStep = steps[steps.length - 1];

    // Deduplication: skip duplicate consecutive clicks
    if (
      type === "click" &&
      lastStep &&
      lastStep.action === "click" &&
      lastStep.selector === selector
    ) {
      this.logger(
        chalk.yellow(`[Action SKIPPED] Duplicate click: ${selector}`)
      );
      return;
    }

    // Skip click if we just typed into the same element
    if (
      type === "click" &&
      lastStep &&
      lastStep.action === "input" &&
      lastStep.selector === selector
    ) {
      this.logger(
        chalk.yellow(`[Action SKIPPED] Click after type: ${selector}`)
      );
      return;
    }

    // If this is an input, remove redundant preceding click on same element
    if (
      type === "input" &&
      lastStep &&
      lastStep.action === "click" &&
      lastStep.selector === selector
    ) {
      steps.pop();
      this.logger(
        chalk.yellow(
          `[Action REMOVED] Redundant click before type: ${selector}`
        )
      );
    }

    const step = {
      action: type === "input" ? "input" : type, // Normalize action type
      selector: selector,
    };

    if (value !== undefined) {
      step.text = value;
    }

    steps.push(step);
    this.logger(
      chalk.green(
        `[Action ✔] ${type} on ${selector}${value ? ` (${value})` : ""}`
      )
    );

    // Emit normalized event
    this._emitEvent("recorder:event", {
      type: "action_captured",
      sessionId: this.currentSession.id,
      step,
      timestamp: new Date().toISOString(),
    });

    // Also emit legacy 'recorder:action' for backward compatibility
    this._emitEvent("recorder:action", {
      sessionId: this.currentSession.id,
      step,
    });
  }

  async _cleanup() {
    // Remove event listeners first
    if (this.page && this._navigationListener) {
      try {
        this.page.off("framenavigated", this._navigationListener);
      } catch (e) {
        // Ignore errors during cleanup
      }
      this._navigationListener = null;
    }

    if (this.browser && this._disconnectListener) {
      try {
        this.browser.off("disconnected", this._disconnectListener);
      } catch (e) {
        // Ignore errors during cleanup
      }
      this._disconnectListener = null;
    }

    if (this.browser) {
      try {
        // Use disconnect for CDP connections to avoid killing user's Chrome
        // Check if disconnect method exists (CDP connections have it)
        if (typeof this.browser.disconnect === "function") {
          await this.browser.disconnect();
        } else if (typeof this.browser.close === "function") {
          await this.browser.close();
        }
      } catch (e) {
        // Ignore cleanup errors - browser may already be disconnected
      }
    }
    this.browser = null;
    this.page = null;
    this.context = null;
    this.currentSession = null;
    this._active = false;
  }

  _broadcastStatus() {
    const status = this.getStatus();
    this._emitEvent("recorder:status", status);
    return status; // Return for local use
  }

  _emitEvent(eventType, payload) {
    if (this.io) {
      this.io.emit(eventType, payload);
    }
    if (this.dispatcher) {
      this.dispatcher(eventType, payload);
    }
  }

  _emitDiagnostic(level, message) {
    this._emitEvent("recorder:diagnostic", {
      level,
      message,
      timestamp: new Date().toISOString(),
    });
    this.logger(`[Recorder] ${message}`);
  }
}

module.exports = RecorderService;
