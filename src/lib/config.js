// config.js - Configuration file helpers
const fs = require("fs-extra");
const path = require("path");

// Import new modules for enhanced functionality
const {
  validateTemplate,
  getTemplatePresets,
  TEMPLATE_PRESETS,
} = require("./output-path-template");
const {
  validateViewport,
  resolveViewport,
  getAllViewportPresets,
  getAllCropPresets,
  VIEWPORT_PRESETS,
} = require("./viewport-presets");
const {
  isStandaloneMode,
  getAvailableFeatures,
  getConfigDefaults,
  validateCaptureRequirements,
} = require("./standalone-mode");
const {
  normalizeConfigContract,
  validateNormalizedConfig,
  getCertifiedScenarioKeys,
} = require("./target-contract");

const SETTINGS_DIR = ".reshot";
const SETTINGS_PATH = path.join(process.cwd(), SETTINGS_DIR, "settings.json");

/**
 * Check if an error indicates the API key is invalid and re-auth is needed
 * @param {Error|Object} error - The error from API call
 * @returns {boolean}
 */
function isAuthError(error) {
  if (!error) return false;

  // Check for axios response errors
  const status = error.response?.status;
  if (status === 401 || status === 403) return true;

  // Check error message for auth-related keywords
  const message = (
    error.message ||
    error.response?.data?.error ||
    ""
  ).toLowerCase();
  return (
    message.includes("invalid api key") ||
    message.includes("api key required") ||
    message.includes("unauthorized") ||
    message.includes("authentication") ||
    message.includes("not authenticated")
  );
}

/**
 * Create an auth error response object for the UI
 * @param {string} message - Error message
 * @returns {Object}
 */
function createAuthErrorResponse(message) {
  return {
    error: message,
    authRequired: true,
    code: "AUTH_REQUIRED",
  };
}
const CONFIG_PATH = path.join(process.cwd(), "reshot.config.json");
const WORKSPACE_PATH = path.join(process.cwd(), SETTINGS_DIR, "workspace.json");

/**
 * Read settings file
 * @returns {Object} Settings object with projectId
 */
function readSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) {
    throw new Error(
      "Reshot is not initialized in this directory. Run `reshot init` after authenticating."
    );
  }
  return fs.readJSONSync(SETTINGS_PATH);
}

/**
 * Write settings file
 * @param {Object} settings - Settings object to write
 */
function writeSettings(settings) {
  const settingsDir = path.dirname(SETTINGS_PATH);
  fs.ensureDirSync(settingsDir);
  fs.writeJSONSync(SETTINGS_PATH, settings, { spaces: 2 });
}

// ===== WORKSPACE MANAGEMENT =====

/**
 * Default workspace structure
 * A workspace groups multiple scenarios with shared variant dimensions
 */
const DEFAULT_WORKSPACE = {
  name: "Default Workspace",
  description: "",
  // Common variant dimensions that apply to all scenarios in this workspace
  variants: {
    dimensions: {
      // Example: locale, role, theme dimensions
    },
    presets: {
      // Example: commonly used variant combinations
    },
  },
  // Scenarios included in this workspace (by key)
  scenarios: [],
  // Metadata
  createdAt: null,
  updatedAt: null,
};

/**
 * Check if workspace file exists
 * @returns {boolean}
 */
function workspaceExists() {
  return fs.existsSync(WORKSPACE_PATH);
}

/**
 * Read workspace file
 * @returns {Object} Workspace configuration
 */
function readWorkspace() {
  if (!fs.existsSync(WORKSPACE_PATH)) {
    return null;
  }
  return fs.readJSONSync(WORKSPACE_PATH);
}

/**
 * Write workspace file
 * @param {Object} workspace - Workspace object to write
 */
function writeWorkspace(workspace) {
  const settingsDir = path.dirname(WORKSPACE_PATH);
  fs.ensureDirSync(settingsDir);
  workspace.updatedAt = new Date().toISOString();
  fs.writeJSONSync(WORKSPACE_PATH, workspace, { spaces: 2 });
}

/**
 * Create a new workspace
 * @param {Object} options - Workspace options
 * @param {string} options.name - Workspace name
 * @param {string} [options.description] - Workspace description
 * @param {Object} [options.variants] - Variant configuration
 * @returns {Object} Created workspace
 */
function createWorkspace(options = {}) {
  const workspace = {
    ...DEFAULT_WORKSPACE,
    name: options.name || "Default Workspace",
    description: options.description || "",
    variants: options.variants || DEFAULT_WORKSPACE.variants,
    scenarios: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeWorkspace(workspace);
  return workspace;
}

/**
 * Add a scenario to the workspace
 * @param {string} scenarioKey - Scenario key to add
 * @returns {Object} Updated workspace
 */
function addScenarioToWorkspace(scenarioKey) {
  let workspace = readWorkspace();
  if (!workspace) {
    workspace = createWorkspace();
  }

  // Ensure scenarios is an array
  if (!Array.isArray(workspace.scenarios)) {
    workspace.scenarios = [];
  }

  if (!workspace.scenarios.includes(scenarioKey)) {
    workspace.scenarios.push(scenarioKey);
    writeWorkspace(workspace);
  }
  return workspace;
}

/**
 * Remove a scenario from the workspace
 * @param {string} scenarioKey - Scenario key to remove
 * @returns {Object} Updated workspace
 */
function removeScenarioFromWorkspace(scenarioKey) {
  const workspace = readWorkspace();
  if (!workspace) {
    return null;
  }

  // Ensure scenarios is an array
  if (!Array.isArray(workspace.scenarios)) {
    workspace.scenarios = [];
    writeWorkspace(workspace);
    return workspace;
  }

  const index = workspace.scenarios.indexOf(scenarioKey);
  if (index !== -1) {
    workspace.scenarios.splice(index, 1);
    writeWorkspace(workspace);
  }
  return workspace;
}

/**
 * Update workspace variants configuration
 * @param {Object} variants - New variants configuration
 * @returns {Object} Updated workspace
 */
function updateWorkspaceVariants(variants) {
  let workspace = readWorkspace();
  if (!workspace) {
    workspace = createWorkspace();
  }

  workspace.variants = variants;
  writeWorkspace(workspace);
  return workspace;
}

/**
 * Get workspace with resolved scenarios
 * @returns {Object|null} Workspace with scenario details from config
 */
function getWorkspaceWithScenarios() {
  const workspace = readWorkspace();
  if (!workspace) {
    return null;
  }

  let docSyncConfig = null;
  try {
    docSyncConfig = readConfig();
  } catch (e) {
    // Config doesn't exist
  }

  const allScenarios = docSyncConfig?.scenarios || [];

  // Ensure workspace.scenarios is always an array to prevent .map errors
  const workspaceScenarioKeys = Array.isArray(workspace.scenarios)
    ? workspace.scenarios
    : [];

  const workspaceScenarios = workspaceScenarioKeys
    .map((key) => allScenarios.find((s) => s.key === key))
    .filter(Boolean);

  return {
    ...workspace,
    scenarios: workspaceScenarioKeys, // Ensure scenarios is always an array
    resolvedScenarios: workspaceScenarios,
    allScenarios: allScenarios,
  };
}

/**
 * Read config file
 * @returns {Object} Reshot configuration
 */
function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `Config file not found at ${CONFIG_PATH}. Run \`reshot init\` to create one.`
    );
  }

  const rawConfig = fs.readJSONSync(CONFIG_PATH);
  const config = normalizeConfigContract(rawConfig);

  // Validate required fields
  if (!config.scenarios || !Array.isArray(config.scenarios)) {
    throw new Error('Config must have a "scenarios" array');
  }

  const targetValidation = validateNormalizedConfig(config);
  if (!targetValidation.valid) {
    throw new Error(targetValidation.errors.join("\n"));
  }

  const validActions = [
    "click",
    "type",
    "input",
    "hover",
    "wait",
    "waitForSelector",
    "screenshot",
    "goto",
    "scroll",
    "select",
    "keyboard",
    "clip",
    "gif", // Looping GIF capture
    "video", // Video clip capture
  ];

  // Valid output formats
  const validOutputFormats = [
    "png", // Static screenshot (default)
    "gif", // Looping GIF (primary for animations)
    "mp4", // Video clip
    "step-by-step-images", // Legacy: individual step screenshots
    "summary-video", // Legacy: combined video of all steps
  ];

  for (const scenario of config.scenarios) {
    if (!scenario.name) {
      throw new Error('Each scenario must have a "name" field');
    }
    if (!scenario.key) {
      throw new Error(`Scenario "${scenario.name}" must have a "key" field`);
    }
    if (!/^[a-z0-9]([a-z0-9\-_/]*[a-z0-9])?$/i.test(scenario.key)) {
      throw new Error(
        `Scenario "${scenario.name}" has invalid key "${scenario.key}". Keys must start and end alphanumeric; hyphens, underscores, and slashes are allowed in between.`
      );
    }
    if (!scenario.url) {
      throw new Error(`Scenario "${scenario.name}" must have a "url" field`);
    }
    if (!scenario.steps || !Array.isArray(scenario.steps)) {
      throw new Error(`Scenario "${scenario.name}" must have a "steps" array`);
    }

    // Validate each step
    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      const stepNum = i + 1;

      if (!step.action) {
        throw new Error(
          `Scenario "${scenario.name}" step ${stepNum} must have an "action" field`
        );
      }

      if (!validActions.includes(step.action)) {
        throw new Error(
          `Scenario "${scenario.name}" step ${stepNum} has invalid action "${
            step.action
          }". Valid actions: ${validActions.join(", ")}`
        );
      }

      // Validate selector for actions that need it
      const needsSelector = [
        "click",
        "type",
        "input",
        "hover",
        "waitForSelector",
        "scroll",
        "select",
      ];
      if (needsSelector.includes(step.action) && !step.selector) {
        throw new Error(
          `Scenario "${scenario.name}" step ${stepNum} (${step.action}) requires a "selector" field`
        );
      }

      // Validate text for type/input actions
      if (
        (step.action === "type" || step.action === "input") &&
        step.text === undefined
      ) {
        throw new Error(
          `Scenario "${scenario.name}" step ${stepNum} (${step.action}) requires a "text" field`
        );
      }

      // Validate step-level privacy override (must be object or undefined)
      if (step.privacy !== undefined) {
        if (typeof step.privacy !== "object" || step.privacy === null || Array.isArray(step.privacy)) {
          throw new Error(
            `Scenario "${scenario.name}" step ${stepNum}: privacy must be an object`
          );
        }
      }

      // Validate step-level style override (must be object or undefined)
      if (step.style !== undefined) {
        if (typeof step.style !== "object" || step.style === null || Array.isArray(step.style)) {
          throw new Error(
            `Scenario "${scenario.name}" step ${stepNum}: style must be an object`
          );
        }
      }
    }
  }

  // Validate optional privacy block
  if (config.privacy !== undefined) {
    if (typeof config.privacy !== "object" || config.privacy === null || Array.isArray(config.privacy)) {
      throw new Error("privacy must be an object");
    }
    if (config.privacy.method !== undefined && !["redact", "blur", "hide", "remove"].includes(config.privacy.method)) {
      throw new Error('privacy.method must be one of: redact, blur, hide, remove');
    }
    if (config.privacy.blurRadius !== undefined) {
      if (typeof config.privacy.blurRadius !== "number" || config.privacy.blurRadius < 1 || config.privacy.blurRadius > 100) {
        throw new Error("privacy.blurRadius must be a number between 1 and 100");
      }
    }
    if (config.privacy.selectors !== undefined && !Array.isArray(config.privacy.selectors)) {
      throw new Error("privacy.selectors must be an array");
    }
    // Validate individual selector entries
    if (Array.isArray(config.privacy.selectors)) {
      for (let i = 0; i < config.privacy.selectors.length; i++) {
        const entry = config.privacy.selectors[i];
        if (typeof entry === "string") {
          if (!entry.trim()) {
            throw new Error(`privacy.selectors[${i}] is empty`);
          }
        } else if (entry && typeof entry === "object") {
          if (!entry.selector || typeof entry.selector !== "string" || !entry.selector.trim()) {
            throw new Error(`privacy.selectors[${i}].selector must be a non-empty string`);
          }
          if (entry.method !== undefined && !["redact", "blur", "hide", "remove"].includes(entry.method)) {
            throw new Error(`privacy.selectors[${i}].method must be one of: redact, blur, hide, remove`);
          }
        } else {
          throw new Error(`privacy.selectors[${i}] must be a string or { selector, method?, blurRadius? }`);
        }
      }
    }
  }

  // Validate optional style block
  if (config.style !== undefined) {
    if (typeof config.style !== "object" || config.style === null || Array.isArray(config.style)) {
      throw new Error("style must be an object");
    }
    if (config.style.frame !== undefined && !["none", "macos", "windows"].includes(config.style.frame)) {
      throw new Error('style.frame must be one of: none, macos, windows');
    }
    if (config.style.shadow !== undefined && !["none", "small", "medium", "large"].includes(config.style.shadow)) {
      throw new Error('style.shadow must be one of: none, small, medium, large');
    }
    if (config.style.padding !== undefined) {
      if (typeof config.style.padding !== "number" || config.style.padding < 0 || config.style.padding > 200) {
        throw new Error("style.padding must be a number between 0 and 200");
      }
    }
    if (config.style.borderRadius !== undefined) {
      if (typeof config.style.borderRadius !== "number" || config.style.borderRadius < 0 || config.style.borderRadius > 100) {
        throw new Error("style.borderRadius must be a number between 0 and 100");
      }
    }
    if (config.style.background !== undefined) {
      if (typeof config.style.background !== "string") {
        throw new Error("style.background must be a string");
      }
      const bg = config.style.background;
      if (bg !== "transparent") {
        const isHex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(bg);
        const isGradient = bg.startsWith("linear-gradient(");
        if (!isHex && !isGradient) {
          throw new Error('style.background must be "transparent", a hex color, or a linear-gradient()');
        }
      }
    }
  }

  return config;
}

/**
 * Read reshot.config.json without requiring scenarios array
 * Used by sync and other commands that don't need scenario validation
 * @returns {Object} Configuration
 */
function readConfigLenient() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `Config file not found at ${CONFIG_PATH}. Run \`reshot init\` to create one.`
    );
  }

  return normalizeConfigContract(fs.readJSONSync(CONFIG_PATH));
}

/**
 * Write config file
 * @param {Object} config - Config object to write
 */
function writeConfig(config) {
  fs.writeJSONSync(CONFIG_PATH, normalizeConfigContract(config), { spaces: 2 });
}

/**
 * Check if config file exists
 * @returns {boolean}
 */
function configExists() {
  return fs.existsSync(CONFIG_PATH);
}

// ===== CAPTURE CONFIGURATION =====

/**
 * Default capture configuration
 */
const DEFAULT_CAPTURE_CONFIG = {
  retryOnError: 2,
  retryDelay: 1000,
  readyTimeout: 15000,
  scenarioTimeout: 60000,
  errorSelectors: ["[data-testid='page-error']", "[data-error-type]"],
  errorHeuristics: true,
  contentVerification: false,
  preflightCheck: true,
  authPatterns: [],
};

/**
 * Get capture configuration with sensible defaults
 * Merges global capture config with per-scenario overrides
 * @param {Object} [scenarioOverrides] - Per-scenario capture config overrides
 * @returns {Object} Merged capture config
 */
function getCaptureConfig(scenarioOverrides = {}) {
  let globalConfig = {};
  try {
    const config = readConfig();
    globalConfig = config.capture || {};
  } catch (e) {
    // Config doesn't exist, use defaults
  }

  // Filter out undefined values so they don't overwrite defaults
  const cleanOverrides = Object.fromEntries(
    Object.entries(scenarioOverrides).filter(([, v]) => v !== undefined)
  );
  const cleanGlobal = Object.fromEntries(
    Object.entries(globalConfig).filter(([, v]) => v !== undefined)
  );

  const merged = {
    ...DEFAULT_CAPTURE_CONFIG,
    ...cleanGlobal,
    ...cleanOverrides,
  };

  // Validate bounds
  if (typeof merged.retryOnError === "number") {
    merged.retryOnError = Math.max(0, Math.min(merged.retryOnError, 5));
  }
  if (typeof merged.retryDelay === "number") {
    merged.retryDelay = Math.max(500, Math.min(merged.retryDelay, 30000));
  }
  if (typeof merged.readyTimeout === "number") {
    merged.readyTimeout = Math.max(1000, Math.min(merged.readyTimeout, 60000));
  }
  if (typeof merged.scenarioTimeout === "number") {
    merged.scenarioTimeout = Math.max(
      5000,
      Math.min(merged.scenarioTimeout, 300000)
    );
  }

  // Ensure errorSelectors is always an array
  if (!Array.isArray(merged.errorSelectors)) {
    merged.errorSelectors = DEFAULT_CAPTURE_CONFIG.errorSelectors;
  }

  return merged;
}

// ===== PRIVACY CONFIGURATION =====

/**
 * Default privacy configuration
 */
const DEFAULT_PRIVACY_CONFIG = {
  enabled: true,
  method: "redact",
  blurRadius: 8,
  selectors: [],
};

const VALID_PRIVACY_METHODS = ["redact", "blur", "hide", "remove"];

/**
 * Get privacy configuration with sensible defaults
 * Merges global privacy config with per-scenario overrides.
 * Selectors are ADDITIVE (union). method/blurRadius are overridden.
 * @param {Object} [scenarioOverrides] - Per-scenario privacy config overrides
 * @returns {Object} Merged privacy config
 */
function getPrivacyConfig(scenarioOverrides = {}) {
  let globalConfig = {};
  try {
    const config = readConfig();
    globalConfig = config.privacy || {};
  } catch (e) {
    // Config doesn't exist, use defaults
  }

  const merged = {
    enabled: scenarioOverrides.enabled !== undefined
      ? scenarioOverrides.enabled
      : globalConfig.enabled !== undefined
        ? globalConfig.enabled
        : DEFAULT_PRIVACY_CONFIG.enabled,
    method: scenarioOverrides.method || globalConfig.method || DEFAULT_PRIVACY_CONFIG.method,
    blurRadius: scenarioOverrides.blurRadius || globalConfig.blurRadius || DEFAULT_PRIVACY_CONFIG.blurRadius,
    // Selectors are additive (union of global + scenario)
    selectors: [
      ...(globalConfig.selectors || []),
      ...(scenarioOverrides.selectors || []),
    ],
  };

  // Validate method
  if (!VALID_PRIVACY_METHODS.includes(merged.method)) {
    merged.method = DEFAULT_PRIVACY_CONFIG.method;
  }

  // Validate blurRadius bounds
  if (typeof merged.blurRadius === "number") {
    merged.blurRadius = Math.max(1, Math.min(merged.blurRadius, 100));
  }

  return merged;
}

// ===== STYLE CONFIGURATION =====

/**
 * Default style configuration
 */
const DEFAULT_STYLE_CONFIG = {
  enabled: false,
  frame: "none",
  shadow: "none",
  padding: 0,
  background: "transparent",
  borderRadius: 0,
};

const VALID_FRAMES = ["none", "macos", "windows"];
const VALID_SHADOWS = ["none", "small", "medium", "large"];

/**
 * Get style configuration with sensible defaults
 * Merges global style config with per-scenario overrides (flat replace, not additive).
 * @param {Object} [scenarioOverrides] - Per-scenario style config overrides
 * @returns {Object} Merged style config
 */
function getStyleConfig(scenarioOverrides = {}) {
  let globalConfig = {};
  try {
    const config = readConfig();
    globalConfig = config.style || {};
  } catch (e) {
    // Config doesn't exist, use defaults
  }

  // Filter out undefined values
  const cleanOverrides = Object.fromEntries(
    Object.entries(scenarioOverrides).filter(([, v]) => v !== undefined)
  );
  const cleanGlobal = Object.fromEntries(
    Object.entries(globalConfig).filter(([, v]) => v !== undefined)
  );

  const merged = {
    ...DEFAULT_STYLE_CONFIG,
    ...cleanGlobal,
    ...cleanOverrides,
  };

  // Validate frame
  if (!VALID_FRAMES.includes(merged.frame)) {
    merged.frame = DEFAULT_STYLE_CONFIG.frame;
  }

  // Validate shadow
  if (!VALID_SHADOWS.includes(merged.shadow)) {
    merged.shadow = DEFAULT_STYLE_CONFIG.shadow;
  }

  // Validate bounds
  if (typeof merged.padding === "number") {
    merged.padding = Math.max(0, Math.min(merged.padding, 200));
  }
  if (typeof merged.borderRadius === "number") {
    merged.borderRadius = Math.max(0, Math.min(merged.borderRadius, 100));
  }

  return merged;
}

// ===== DIFFING CONFIGURATION =====

/**
 * Get diffing configuration with defaults
 * Diffing is ENABLED by default for local version-to-version comparison
 * @returns {Object} Diffing config { enabled, threshold, includeAA }
 */
function getDiffingConfig() {
  try {
    const config = readConfig();
    return {
      // Default to TRUE - always diff unless explicitly disabled
      enabled: config.diffing?.enabled ?? true,
      threshold: config.diffing?.threshold ?? 0.1,
      includeAA: config.diffing?.includeAA ?? false,
    };
  } catch (e) {
    // Return defaults if config doesn't exist - diffing ON by default
    return {
      enabled: true,
      threshold: 0.1,
      includeAA: false,
    };
  }
}

/**
 * Update diffing configuration
 * @param {Object} diffingConfig - New diffing config (partial updates supported)
 */
function updateDiffingConfig(diffingConfig) {
  const config = readConfig();
  config.diffing = {
    enabled: config.diffing?.enabled ?? false,
    threshold: config.diffing?.threshold ?? 0.1,
    includeAA: config.diffing?.includeAA ?? false,
    ...diffingConfig,
  };
  writeConfig(config);
  return config.diffing;
}

/**
 * Initialize project by fetching config from platform
 * This is the core logic shared between CLI init command and UI init endpoint
 * @param {string} projectId - Project ID to initialize
 * @param {string} apiKey - API key for authentication
 * @param {Object} options - Options
 * @param {boolean} options.overwrite - Whether to overwrite existing config (default: false)
 * @returns {Promise<Object>} The initialized config
 */
async function initializeProject(projectId, apiKey, options = {}) {
  const apiClient = require("./api-client");
  const { overwrite = false } = options;

  if (!projectId || !apiKey) {
    throw new Error("projectId and apiKey are required");
  }

  // Check if config exists and overwrite is false
  if (configExists() && !overwrite) {
    throw new Error("Config already exists. Set overwrite=true to replace it.");
  }

  let blueprint = null;
  try {
    blueprint = await apiClient.getProjectConfig(projectId, apiKey);
  } catch (error) {
    // If fetch fails, use boilerplate
    const BOILERPLATE_CONFIG = {
      baseUrl: "https://example.com",
      assetDir: ".reshot/output",
      concurrency: 2,
      defaultWaitUntil: "networkidle",
      viewport: { width: 1280, height: 720 },
      timeout: 45000,
      headless: true,
      contexts: {
        default: { name: "default", data: {} },
      },
      scenarios: [], // Start with empty scenarios - user will record their own
      _metadata: {
        projectId,
        projectName: "Unknown Project",
        generatedAt: new Date().toISOString(),
        visualCount: 1,
        contextCount: 1,
        features: {
          visuals: true,
        },
      },
    };
    blueprint = BOILERPLATE_CONFIG;
  }

  // Write config
  writeConfig(blueprint);

  // Update settings
  let settings;
  try {
    settings = readSettings();
  } catch (error) {
    // Create new settings if they don't exist
    settings = { projectId, apiKey };
  }

  const updatedSettings = {
    ...settings,
    projectId,
    apiKey,
    projectName:
      blueprint._metadata?.projectName || settings.projectName || null,
    lastSyncedAt: new Date().toISOString(),
  };
  writeSettings(updatedSettings);

  return blueprint;
}

/**
 * Get output configuration with enhanced features
 * @returns {Object} Output config with template, viewports, and crop settings
 */
function getOutputConfig() {
  try {
    const config = readConfig();
    return {
      template: config.output?.template || TEMPLATE_PRESETS.default,
      templatePresets: getTemplatePresets(),
      viewport: config.viewport || { width: 1280, height: 720 },
      viewportPresets: config.viewportPresets || {},
      crop: config.output?.crop || null,
      cropPresets: getAllCropPresets(),
    };
  } catch (e) {
    return {
      template: TEMPLATE_PRESETS.default,
      templatePresets: getTemplatePresets(),
      viewport: { width: 1280, height: 720 },
      viewportPresets: {},
      crop: null,
      cropPresets: getAllCropPresets(),
    };
  }
}

/**
 * Update output configuration
 * @param {Object} outputConfig - New output configuration (partial update)
 * @returns {Object} Updated configuration
 */
function updateOutputConfig(outputConfig) {
  const config = readConfig();

  // Validate template if provided
  if (outputConfig.template) {
    const validation = validateTemplate(outputConfig.template);
    if (!validation.valid) {
      throw new Error(`Invalid output template: ${validation.error}`);
    }
  }

  // Validate viewport if provided
  if (outputConfig.viewport) {
    const resolved = resolveViewport(outputConfig.viewport);
    const validation = validateViewport(resolved);
    if (!validation.valid) {
      throw new Error(`Invalid viewport: ${validation.error}`);
    }
  }

  // Merge output config
  config.output = {
    ...config.output,
    ...outputConfig,
  };

  // Update viewport at top level if provided
  if (outputConfig.viewport) {
    config.viewport = resolveViewport(outputConfig.viewport);
  }

  writeConfig(config);
  return config;
}

/**
 * Get available viewport presets (built-in + custom)
 * @returns {Object} Viewport presets
 */
function getViewportPresetsConfig() {
  try {
    const config = readConfig();
    const builtIn = getAllViewportPresets();
    const custom = config.viewportPresets || {};

    return {
      builtIn,
      custom,
      all: { ...builtIn, ...custom },
    };
  } catch (e) {
    return {
      builtIn: getAllViewportPresets(),
      custom: {},
      all: getAllViewportPresets(),
    };
  }
}

/**
 * Add or update a custom viewport preset
 * @param {string} key - Preset key
 * @param {Object} preset - Preset configuration
 * @returns {Object} Updated config
 */
function saveViewportPreset(key, preset) {
  const resolved = resolveViewport(preset);
  const validation = validateViewport(resolved);
  if (!validation.valid) {
    throw new Error(`Invalid viewport preset: ${validation.error}`);
  }

  const config = readConfig();
  config.viewportPresets = config.viewportPresets || {};
  config.viewportPresets[key] = {
    ...preset,
    ...resolved,
    category: "custom",
  };

  writeConfig(config);
  return config;
}

/**
 * Delete a custom viewport preset
 * @param {string} key - Preset key to delete
 * @returns {Object} Updated config
 */
function deleteViewportPreset(key) {
  const config = readConfig();
  if (config.viewportPresets && config.viewportPresets[key]) {
    delete config.viewportPresets[key];
    writeConfig(config);
  }
  return config;
}

/**
 * Check CLI mode and features
 * @returns {Object} Mode info and available features
 */
function getModeInfo() {
  let settings = null;
  try {
    settings = readSettings();
  } catch (e) {
    // No settings file
  }

  return {
    isStandalone: isStandaloneMode(settings),
    features: getAvailableFeatures(settings),
    settings: settings
      ? {
          mode: settings.mode || (settings.apiKey ? "connected" : "standalone"),
          projectName: settings.projectName,
          projectId: settings.projectId,
          hasApiKey: !!settings.apiKey,
        }
      : null,
  };
}

function readSettingsSafe() {
  try {
    return readSettings();
  } catch (error) {
    return null;
  }
}

function collectTemplateVariables(value) {
  if (typeof value !== "string" || value.length === 0) {
    return [];
  }

  const variables = new Set();
  const regex = /\{\{(\w+)\}\}/g;
  let match = regex.exec(value);

  while (match) {
    variables.add(match[1]);
    match = regex.exec(value);
  }

  return [...variables];
}

function hasDeterministicReadyContract(scenario) {
  if (!scenario || typeof scenario !== "object") {
    return false;
  }

  if (scenario.readySelector) {
    return true;
  }

  if (scenario.ready?.selector || scenario.ready?.expression) {
    return true;
  }

  return Array.isArray(scenario.steps)
    ? scenario.steps.some(
        (step) => step?.action === "waitForSelector" && step?.selector,
      )
    : false;
}

/**
 * Validate full configuration for capture readiness
 * @param {Object} [options] - Validation options
 * @param {string[]} [options.scenarioKeys] - Restrict validation to scenario keys
 * @param {boolean} [options.requireReadyContract] - Enforce deterministic readiness
 * @returns {Object} Validation result
 */
function validateConfig(options = {}) {
  const { scenarioKeys = null, requireReadyContract = false } = options;

  try {
    const config = readConfig();
    const baseResult = validateCaptureRequirements(config);
    const errors = [...baseResult.errors];
    const warnings = baseResult.warnings.filter(
      (warning) => warning !== "baseUrl should start with http:// or https://",
    );
    const scenarios = Array.isArray(config.scenarios) ? config.scenarios : [];
    const requestedScenarioKeys = Array.isArray(scenarioKeys)
      ? scenarioKeys.filter(Boolean)
      : [];
    const selectedScenarios = requestedScenarioKeys.length
      ? scenarios.filter((scenario) => requestedScenarioKeys.includes(scenario.key))
      : scenarios;
    const missingScenarioKeys = requestedScenarioKeys.filter(
      (key) => !scenarios.some((scenario) => scenario.key === key),
    );

    if (missingScenarioKeys.length > 0) {
      errors.push(
        `Unknown scenario key(s): ${missingScenarioKeys.join(", ")}. ` +
          `Available scenarios: ${scenarios.map((scenario) => scenario.key).join(", ") || "none"}`,
      );
    }

    if (config.baseUrl) {
      try {
        const parsedUrl = new URL(config.baseUrl);
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          errors.push(
            `baseUrl must use http:// or https:// (received ${parsedUrl.protocol})`,
          );
        }
      } catch (error) {
        errors.push(
          `baseUrl must be a valid absolute URL. Received: ${config.baseUrl}`,
        );
      }
    }

    const settings = readSettingsSafe();
    const configuredVariables = {
      ...(settings?.urlVariables || {}),
    };
    if (!configuredVariables.PROJECT_ID && settings?.projectId) {
      configuredVariables.PROJECT_ID = settings.projectId;
    }

    const unresolvedVariables = [];
    for (const scenario of selectedScenarios) {
      for (const variableName of collectTemplateVariables(scenario.url)) {
        if (!configuredVariables[variableName] && !process.env[variableName]) {
          unresolvedVariables.push(`${scenario.key}:${variableName}`);
        }
      }
    }

    if (unresolvedVariables.length > 0) {
      errors.push(
        `Unresolved URL variable(s): ${unresolvedVariables.join(", ")}. ` +
          `Set them in .reshot/settings.json under urlVariables or as environment variables.`,
      );
    }

    const shouldRequireReadyContract =
      requireReadyContract || config.target?.tier === "certified";
    if (shouldRequireReadyContract) {
      const missingReadyContract = selectedScenarios
        .filter((scenario) => !hasDeterministicReadyContract(scenario))
        .map((scenario) => scenario.key);

      if (missingReadyContract.length > 0) {
        errors.push(
          `Deterministic readiness is required for: ${missingReadyContract.join(", ")}. ` +
            `Add ready.selector, ready.expression, readySelector, or a waitForSelector step.`,
        );
      }
    }

    const authScenarioCount = selectedScenarios.filter(
      (scenario) => scenario.captureClass === "live-auth" || scenario.requiresAuth,
    ).length;
    const liveAuthScenarioCount = selectedScenarios.filter(
      (scenario) => scenario.captureClass === "live-auth",
    ).length;

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      details: {
        baseUrl: config.baseUrl || null,
        selectedScenarioKeys: selectedScenarios.map((scenario) => scenario.key),
        missingScenarioKeys,
        unresolvedVariables,
        requiresReadyContract: shouldRequireReadyContract,
        authScenarioCount,
        liveAuthScenarioCount,
      },
    };
  } catch (e) {
    return {
      valid: false,
      errors: [e.message],
      warnings: [],
      details: {
        baseUrl: null,
        selectedScenarioKeys: [],
        missingScenarioKeys: [],
        unresolvedVariables: [],
        requiresReadyContract: requireReadyContract,
        authScenarioCount: 0,
        liveAuthScenarioCount: 0,
      },
    };
  }
}

// ===== VERSIONING CONFIGURATION =====

/**
 * Get versioning configuration with defaults
 * Supports pinned versions vs live head URLs
 * @returns {Object} Versioning config
 */
function getVersioningConfig() {
  try {
    const config = readConfig();
    return {
      // Default URL type: "live" (always latest) or "pinned" (specific version)
      defaultUrlType: config.versioning?.defaultUrlType ?? "live",
      // Current pinned tag (if any)
      pinnedTag: config.versioning?.pinnedTag ?? null,
      // All available tags
      tags: config.versioning?.tags ?? [],
    };
  } catch (e) {
    return {
      defaultUrlType: "live",
      pinnedTag: null,
      tags: [],
    };
  }
}

/**
 * Update versioning configuration
 * @param {Object} versioningConfig - New versioning config
 */
function updateVersioningConfig(versioningConfig) {
  const config = readConfig();
  config.versioning = {
    ...config.versioning,
    ...versioningConfig,
  };
  writeConfig(config);
  return config.versioning;
}

/**
 * Add a new tag to versioning history
 * @param {string} tag - Tag name (e.g., "v1.2", "release-2024-01")
 * @param {Object} metadata - Tag metadata
 */
function addVersionTag(tag, metadata = {}) {
  const config = readConfig();
  config.versioning = config.versioning || { tags: [] };
  config.versioning.tags = config.versioning.tags || [];

  // Ensure no duplicate tags
  const existingIndex = config.versioning.tags.findIndex((t) => t.name === tag);
  const tagData = {
    name: tag,
    createdAt: new Date().toISOString(),
    commitHash: metadata.commitHash || null,
    ...metadata,
  };

  if (existingIndex >= 0) {
    config.versioning.tags[existingIndex] = tagData;
  } else {
    config.versioning.tags.push(tagData);
  }

  writeConfig(config);
  return tagData;
}

// ===== OUTPUT FORMAT CONFIGURATION =====

/**
 * Get the preferred output format configuration
 * Prioritizes GIF/video for animations, PNG for static captures
 * @returns {Object} Output format preferences
 */
function getOutputFormatConfig() {
  try {
    const config = readConfig();
    return {
      // Primary format for multi-step scenarios (prefer GIF for animations)
      primaryFormat: config.output?.primaryFormat ?? "gif",
      // Fallback format for static single-step captures
      staticFormat: config.output?.staticFormat ?? "png",
      // Video format for full recordings
      videoFormat: config.output?.videoFormat ?? "mp4",
      // GIF settings
      gif: {
        loop: config.output?.gif?.loop ?? true, // Loop infinitely by default
        fps: config.output?.gif?.fps ?? 15, // Frames per second
        quality: config.output?.gif?.quality ?? "high", // high, medium, low
        maxDuration: config.output?.gif?.maxDuration ?? 10000, // Max 10 seconds
      },
      // Video settings
      video: {
        codec: config.output?.video?.codec ?? "h264",
        fps: config.output?.video?.fps ?? 30,
        quality: config.output?.video?.quality ?? "high",
      },
    };
  } catch (e) {
    return {
      primaryFormat: "gif",
      staticFormat: "png",
      videoFormat: "mp4",
      gif: { loop: true, fps: 15, quality: "high", maxDuration: 10000 },
      video: { codec: "h264", fps: 30, quality: "high" },
    };
  }
}

/**
 * Update output format configuration
 * @param {Object} formatConfig - New format config
 */
function updateOutputFormatConfig(formatConfig) {
  const config = readConfig();
  config.output = {
    ...config.output,
    ...formatConfig,
  };
  writeConfig(config);
  return config.output;
}

module.exports = {
  readSettings,
  writeSettings,
  readConfig,
  writeConfig,
  configExists,
  initializeProject,
  // Capture configuration
  getCaptureConfig,
  DEFAULT_CAPTURE_CONFIG,
  // Privacy configuration
  getPrivacyConfig,
  DEFAULT_PRIVACY_CONFIG,
  // Style configuration
  getStyleConfig,
  DEFAULT_STYLE_CONFIG,
  // Diffing configuration
  getDiffingConfig,
  updateDiffingConfig,
  // Versioning configuration
  getVersioningConfig,
  updateVersioningConfig,
  addVersionTag,
  // Output format configuration
  getOutputFormatConfig,
  updateOutputFormatConfig,
  // Workspace management
  workspaceExists,
  readWorkspace,
  writeWorkspace,
  createWorkspace,
  addScenarioToWorkspace,
  removeScenarioFromWorkspace,
  updateWorkspaceVariants,
  getWorkspaceWithScenarios,
  // Auth helpers
  isAuthError,
  createAuthErrorResponse,
  // Output & viewport configuration
  getOutputConfig,
  updateOutputConfig,
  getViewportPresetsConfig,
  saveViewportPreset,
  deleteViewportPreset,
  // Mode & validation
  getModeInfo,
  validateConfig,
  // Lenient config read (no scenario validation)
  readConfigLenient,
  // Certified target contract helpers
  getCertifiedScenarioKeys,
  // Paths
  SETTINGS_PATH,
  SETTINGS_DIR,
  CONFIG_PATH,
  WORKSPACE_PATH,
};
