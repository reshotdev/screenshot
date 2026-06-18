// standalone-mode.js - Standalone mode support for Reshot CLI
// Allows CLI to work without connecting to Reshot platform

const fs = require("fs-extra");
const path = require("path");
const chalk = require("chalk");

/**
 * Default standalone configuration
 * Used when no platform connection is available
 */
const DEFAULT_STANDALONE_CONFIG = {
  baseUrl: "http://localhost:3000",
  assetDir: ".reshot/output",
  concurrency: 1,
  defaultWaitUntil: "networkidle",
  viewport: { width: 1280, height: 720 },
  timeout: 45000,
  headless: true,
  
  // Default output template
  output: {
    template: ".reshot/output/{{scenario}}/{{timestamp}}/{{variant}}/{{name}}.{{ext}}",
  },
  
  // Default variant dimensions (common examples)
  variants: {
    dimensions: {
      locale: {
        label: "Language",
        description: "UI language for the application",
        options: {
          en: {
            name: "English",
            inject: [
              { method: "localStorage", key: "locale", value: "en" },
              { method: "browser", locale: "en-US", timezone: "America/New_York" },
            ],
          },
        },
      },
      theme: {
        label: "Theme",
        description: "Light or dark mode",
        options: {
          light: {
            name: "Light Mode",
            inject: [
              { method: "localStorage", key: "theme", value: "light" },
              { method: "browser", colorScheme: "light" },
            ],
          },
          dark: {
            name: "Dark Mode",
            inject: [
              { method: "localStorage", key: "theme", value: "dark" },
              { method: "browser", colorScheme: "dark" },
            ],
          },
        },
      },
    },
    presets: {},
  },
  
  // Empty scenarios - user will create their own
  scenarios: [],
  
  // Standalone metadata
  _metadata: {
    projectId: null,
    projectName: "Standalone Project",
    generatedAt: null,
    mode: "standalone",
    visualCount: 0,
    contextCount: 1,
    features: {
      visuals: true,
      docs: false,
      changelog: false,
      platformSync: false,
    },
  },
};

/**
 * Standalone mode settings structure
 */
const DEFAULT_STANDALONE_SETTINGS = {
  mode: "standalone",
  apiKey: null,
  projectId: null,
  projectName: "Standalone Project",
  platformUrl: null,
  lastSyncedAt: null,
  features: {
    offlineCapture: true,
    localDiffing: true,
    outputTemplating: true,
    viewportPresets: true,
    matrixCapture: true,
  },
};

const SETTINGS_DIR = ".reshot";
const CONFIG_PATH = "reshot.config.json";
const SETTINGS_PATH = path.join(SETTINGS_DIR, "settings.json");

/**
 * Check if CLI is running in standalone mode
 * Standalone mode is active when:
 * - No API key is configured
 * - Settings explicitly set mode: "standalone"
 * - Platform sync is disabled in features
 * 
 * @param {Object} [settings] - Optional settings object (will be read if not provided)
 * @returns {boolean}
 */
function isStandaloneMode(settings = null) {
  if (settings) {
    return settings.mode === "standalone" || !settings.apiKey;
  }

  try {
    const settingsPath = path.join(process.cwd(), SETTINGS_PATH);
    if (!fs.existsSync(settingsPath)) {
      return true; // No settings = standalone
    }
    const loadedSettings = fs.readJSONSync(settingsPath);
    return loadedSettings.mode === "standalone" || !loadedSettings.apiKey;
  } catch (e) {
    return true; // Error reading settings = standalone
  }
}

/**
 * Check if platform features are available
 * @param {Object} [settings] - Optional settings object
 * @returns {boolean}
 */
function isPlatformConnected(settings = null) {
  return !isStandaloneMode(settings);
}

/**
 * Get features available in current mode
 * @param {Object} [settings] - Optional settings object
 * @returns {Object} Available features
 */
function getAvailableFeatures(settings = null) {
  const standalone = isStandaloneMode(settings);
  
  return {
    // Always available
    capture: true,
    viewportPresets: true,
    outputTemplating: true,
    matrixCapture: true,
    localDiffing: true,
    recording: true,
    
    // Platform-dependent
    platformSync: !standalone,
    cloudBaselines: !standalone,
    publishing: !standalone,
    changelog: !standalone,
    teamCollaboration: !standalone,
    analytics: !standalone,
    
    // Mode info
    mode: standalone ? "standalone" : "connected",
  };
}

/**
 * Initialize standalone mode configuration
 * Creates default config files if they don't exist
 * 
 * @param {Object} options - Initialization options
 * @param {string} options.projectName - Optional project name
 * @param {boolean} options.force - Force overwrite existing config
 * @returns {Object} Initialized configuration
 */
function initStandaloneMode(options = {}) {
  const { projectName, force = false } = options;
  const cwd = process.cwd();
  
  const configPath = path.join(cwd, CONFIG_PATH);
  const settingsPath = path.join(cwd, SETTINGS_PATH);
  
  // Check if already initialized
  if (!force && fs.existsSync(configPath)) {
    console.log(chalk.yellow("⚠ Config already exists. Use --force to overwrite."));
    return fs.readJSONSync(configPath);
  }
  
  // Create settings directory
  fs.ensureDirSync(path.join(cwd, SETTINGS_DIR));
  
  // Create standalone settings
  const settings = {
    ...DEFAULT_STANDALONE_SETTINGS,
    projectName: projectName || path.basename(cwd),
  };
  fs.writeJSONSync(settingsPath, settings, { spaces: 2 });
  
  // Create standalone config
  const config = {
    ...DEFAULT_STANDALONE_CONFIG,
    _metadata: {
      ...DEFAULT_STANDALONE_CONFIG._metadata,
      projectName: projectName || path.basename(cwd),
      generatedAt: new Date().toISOString(),
    },
  };
  fs.writeJSONSync(configPath, config, { spaces: 2 });
  
  console.log(chalk.green("✔ Initialized Reshot in standalone mode"));
  console.log(chalk.gray(`  Config: ${configPath}`));
  console.log(chalk.gray(`  Settings: ${settingsPath}`));
  
  return config;
}

/**
 * Convert standalone config to connected mode
 * Called when user authenticates
 * 
 * @param {Object} platformConfig - Config received from platform
 * @param {Object} credentials - { apiKey, projectId, projectName }
 * @returns {Object} Merged configuration
 */
function upgradeToConnectedMode(platformConfig, credentials) {
  const cwd = process.cwd();
  const configPath = path.join(cwd, CONFIG_PATH);
  const settingsPath = path.join(cwd, SETTINGS_PATH);
  
  // Read existing local config
  let localConfig = {};
  if (fs.existsSync(configPath)) {
    try {
      localConfig = fs.readJSONSync(configPath);
    } catch (e) {
      // Ignore parse errors
    }
  }
  
  // Merge configs - platform config takes priority but preserve local scenarios
  const mergedConfig = {
    ...platformConfig,
    // Preserve local viewport presets if any
    viewportPresets: {
      ...platformConfig.viewportPresets,
      ...localConfig.viewportPresets,
    },
    // Preserve local output template if set
    output: localConfig.output || platformConfig.output,
    // Merge scenarios - local scenarios not in platform are preserved
    scenarios: mergeScenarios(platformConfig.scenarios || [], localConfig.scenarios || []),
    _metadata: {
      ...platformConfig._metadata,
      mode: "connected",
      mergedAt: new Date().toISOString(),
    },
  };
  
  // Update settings
  const settings = {
    ...DEFAULT_STANDALONE_SETTINGS,
    mode: "connected",
    apiKey: credentials.apiKey,
    projectId: credentials.projectId,
    projectName: credentials.projectName,
    lastSyncedAt: new Date().toISOString(),
  };
  
  fs.writeJSONSync(settingsPath, settings, { spaces: 2 });
  fs.writeJSONSync(configPath, mergedConfig, { spaces: 2 });
  
  console.log(chalk.green("✔ Upgraded to connected mode"));
  
  return mergedConfig;
}

/**
 * Merge scenarios from platform and local
 * Platform scenarios take priority, but local-only scenarios are preserved
 * 
 * @param {Array} platformScenarios - Scenarios from platform
 * @param {Array} localScenarios - Local scenarios
 * @returns {Array} Merged scenarios
 */
function mergeScenarios(platformScenarios, localScenarios) {
  const platformKeys = new Set(platformScenarios.map(s => s.key));
  
  // Start with platform scenarios
  const merged = [...platformScenarios];
  
  // Add local-only scenarios (not on platform)
  for (const localScenario of localScenarios) {
    if (!platformKeys.has(localScenario.key)) {
      merged.push({
        ...localScenario,
        _localOnly: true, // Mark as local-only
      });
    }
  }
  
  return merged;
}

/**
 * Get appropriate config defaults based on mode
 * @returns {Object} Configuration defaults
 */
function getConfigDefaults() {
  return { ...DEFAULT_STANDALONE_CONFIG };
}

/**
 * Validate that minimum requirements are met for capture
 * Works in both standalone and connected modes
 * 
 * @param {Object} config - Configuration to validate
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateCaptureRequirements(config) {
  const errors = [];
  const warnings = [];
  
  if (!config) {
    errors.push("No configuration found. Run `reshot init` first.");
    return { valid: false, errors, warnings };
  }
  
  // Check baseUrl
  if (!config.baseUrl) {
    errors.push("baseUrl is required. Set the URL of your application.");
  } else if (!config.baseUrl.startsWith("http")) {
    warnings.push("baseUrl should start with http:// or https://");
  }
  
  // Check scenarios
  if (!config.scenarios || config.scenarios.length === 0) {
    warnings.push("No scenarios defined. Use the recorder to create scenarios.");
  }
  
  // Check viewport
  if (config.viewport) {
    if (!config.viewport.width || !config.viewport.height) {
      errors.push("viewport.width and viewport.height are required");
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Print mode status banner
 * Shows current mode and available features
 */
function printModeStatus() {
  const features = getAvailableFeatures();
  
  if (features.mode === "standalone") {
    console.log(chalk.cyan("\n┌─────────────────────────────────────────┐"));
    console.log(chalk.cyan("│") + chalk.bold("  📦 Reshot CLI - Standalone Mode     ") + chalk.cyan("│"));
    console.log(chalk.cyan("├─────────────────────────────────────────┤"));
    console.log(chalk.cyan("│") + "  ✔ Capture screenshots & videos       " + chalk.cyan("│"));
    console.log(chalk.cyan("│") + "  ✔ Viewport presets & matrix capture  " + chalk.cyan("│"));
    console.log(chalk.cyan("│") + "  ✔ Output path templating            " + chalk.cyan("│"));
    console.log(chalk.cyan("│") + "  ✔ Local diffing                     " + chalk.cyan("│"));
    console.log(chalk.cyan("│") + chalk.gray("  ○ Platform sync (auth required)     ") + chalk.cyan("│"));
    console.log(chalk.cyan("│") + chalk.gray("  ○ Cloud baselines (auth required)   ") + chalk.cyan("│"));
    console.log(chalk.cyan("└─────────────────────────────────────────┘\n"));
  } else {
    console.log(chalk.green("\n┌─────────────────────────────────────────┐"));
    console.log(chalk.green("│") + chalk.bold("  🔗 Reshot CLI - Connected Mode      ") + chalk.green("│"));
    console.log(chalk.green("│") + "  All features enabled                 " + chalk.green("│"));
    console.log(chalk.green("└─────────────────────────────────────────┘\n"));
  }
}

module.exports = {
  DEFAULT_STANDALONE_CONFIG,
  DEFAULT_STANDALONE_SETTINGS,
  isStandaloneMode,
  isPlatformConnected,
  getAvailableFeatures,
  initStandaloneMode,
  upgradeToConnectedMode,
  mergeScenarios,
  getConfigDefaults,
  validateCaptureRequirements,
  printModeStatus,
};
