// ui-api.js - Internal REST API for Reshot UI
const express = require("express");
const path = require("path");
const fs = require("fs-extra");
const config = require("./config");
const apiClient = require("./api-client");
const {
  findAssetFiles,
  groupAssetsByScenario,
  getVersionsPerScenario,
} = require("./ui-assets");
const {
  getTemplatePresets,
  validateTemplate,
  parseTemplateVariables,
} = require("./output-path-template");
const {
  getAllViewportPresets,
  getViewportPresetsByCategory,
  getAllCropPresets,
  resolveViewport,
  validateViewport,
} = require("./viewport-presets");
const {
  isStandaloneMode,
  getAvailableFeatures,
  printModeStatus,
} = require("./standalone-mode");
const {
  validatePrivacyConfig,
  DEFAULT_PRIVACY_CONFIG,
} = require("./privacy-engine");
const {
  validateStyleConfig,
  DEFAULT_STYLE_CONFIG,
  applyStyle,
  isStyleAvailable,
} = require("./style-engine");
const {
  generateVariantCombinations,
  getPlatformUrl,
  handleApiError,
  isPathWithinBase,
  isValidPathSegment,
} = require("./ui-api-helpers");
const {
  deleteAllOutputAssets,
  deleteScenarioAssetDirectories,
} = require("./ui-asset-cleanup");
const { listScenarioVersions } = require("./ui-output-versions");
const { addScenarioMetadata } = require("./ui-scenario-metadata");
const { attachRecorderRoutes } = require("./ui-recorder-routes");

/**
 * Attach all API routes to an Express app
 * @param {express.Application} app - Express app instance
 * @param {Object} context - Context with settings
 */
function attachApiRoutes(app, context) {
  const { settings } = context;

  // Error handler middleware
  const handleError = (err, req, res, next) => {
    console.error("API Error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal server error",
    });
  };

  // ===== CONFIG ENDPOINTS =====

  /**
   * GET /api/config
   * Returns current config, settings, and derived status
   */
  app.get("/api/config", async (req, res, next) => {
    try {
      let docSyncConfig = null;
      let configError = null;

      if (config.configExists()) {
        try {
          docSyncConfig = config.readConfig();
        } catch (error) {
          configError = error.message;
        }
      }

      const status = {
        hasConfig: docSyncConfig !== null,
        configError,
        scenarioCount: docSyncConfig?.scenarios?.length || 0,
        totalSteps:
          docSyncConfig?.scenarios?.reduce(
            (sum, s) => sum + (s.steps?.length || 0),
            0,
          ) || 0,
        lastSyncedAt: settings?.lastSyncedAt || null,
        lastPublishedCommitHash: settings?.lastPublishedCommitHash || null,
      };

      res.json({
        config: docSyncConfig,
        settings,
        status,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/scenarios/metadata
   * Returns scenarios with additional metadata (createdAt, lastRunAt)
   * Data sourced from output directories and job history
   */
  app.get("/api/scenarios/metadata", async (req, res, next) => {
    try {
      const docSyncConfig = config.configExists()
        ? config.readConfig()
        : { scenarios: [] };
      const scenarios = docSyncConfig?.scenarios || [];
      const outputBaseDir = path.join(process.cwd(), ".reshot", "output");
      const uiExecutor = require("./ui-executor");
      const allJobs = uiExecutor.getAllJobs(500);
      const scenariosWithMetadata = addScenarioMetadata(
        scenarios,
        allJobs,
        outputBaseDir,
      );

      res.json({ scenarios: scenariosWithMetadata });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /api/config
   * Replace entire config file
   */
  app.put("/api/config", async (req, res, next) => {
    try {
      const newConfig = req.body;

      // Validate structure
      if (!newConfig.scenarios || !Array.isArray(newConfig.scenarios)) {
        return res
          .status(400)
          .json({ error: 'Config must have a "scenarios" array' });
      }

      for (const scenario of newConfig.scenarios) {
        if (!scenario.name) {
          return res.status(400).json({
            error: `Scenario missing "name": ${JSON.stringify(scenario)}`,
          });
        }
        if (!scenario.key) {
          return res
            .status(400)
            .json({ error: `Scenario "${scenario.name}" missing "key"` });
        }
        if (!scenario.url) {
          return res
            .status(400)
            .json({ error: `Scenario "${scenario.name}" missing "url"` });
        }
        if (!scenario.steps || !Array.isArray(scenario.steps)) {
          return res.status(400).json({
            error: `Scenario "${scenario.name}" missing "steps" array`,
          });
        }
      }

      config.writeConfig(newConfig);

      // Update settings if metadata changed
      if (newConfig._metadata) {
        const updatedSettings = {
          ...settings,
          projectName: newConfig._metadata.projectName || settings.projectName,
          lastSyncedAt: new Date().toISOString(),
        };
        config.writeSettings(updatedSettings);
      }

      res.json({ ok: true, config: newConfig });
    } catch (error) {
      next(error);
    }
  });

  // ===== PRIVACY ENDPOINTS =====

  /**
   * GET /api/privacy
   * Returns current privacy configuration merged with defaults
   */
  app.get("/api/privacy", async (req, res, next) => {
    try {
      const docSyncConfig = config.configExists() ? config.readConfig() : {};
      const privacyConfig = {
        ...DEFAULT_PRIVACY_CONFIG,
        ...(docSyncConfig.privacy || {}),
      };
      res.json(privacyConfig);
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /api/privacy
   * Update privacy configuration in reshot.config.json
   */
  app.put("/api/privacy", async (req, res, next) => {
    try {
      const newPrivacy = req.body;
      const validation = validatePrivacyConfig(newPrivacy);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.errors.join("; ") });
      }

      const docSyncConfig = config.configExists() ? config.readConfig() : { scenarios: [] };
      docSyncConfig.privacy = newPrivacy;
      config.writeConfig(docSyncConfig);

      res.json({ ok: true, config: newPrivacy });
    } catch (error) {
      next(error);
    }
  });

  // ===== STYLE ENDPOINTS =====

  /**
   * GET /api/style
   * Returns current style configuration merged with defaults
   */
  app.get("/api/style", async (req, res, next) => {
    try {
      const docSyncConfig = config.configExists() ? config.readConfig() : {};
      const styleConfig = {
        ...DEFAULT_STYLE_CONFIG,
        ...(docSyncConfig.style || {}),
      };
      res.json(styleConfig);
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /api/style
   * Update style configuration in reshot.config.json
   */
  app.put("/api/style", async (req, res, next) => {
    try {
      const newStyle = req.body;
      const validation = validateStyleConfig(newStyle);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.errors.join("; ") });
      }

      const docSyncConfig = config.configExists() ? config.readConfig() : { scenarios: [] };
      docSyncConfig.style = newStyle;
      config.writeConfig(docSyncConfig);

      res.json({ ok: true, config: newStyle });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/style/preview
   * Generate a styled preview image
   * Accepts { style, assetPath? }
   * Returns { preview: "data:image/png;base64,..." }
   */
  app.post("/api/style/preview", async (req, res, next) => {
    try {
      if (!isStyleAvailable()) {
        return res.status(400).json({ error: "Sharp is not available — style preview requires the sharp package" });
      }

      const { style, assetPath } = req.body;
      if (!style) {
        return res.status(400).json({ error: "style config is required" });
      }

      const validation = validateStyleConfig(style);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.errors.join("; ") });
      }

      let inputBuffer;
      if (assetPath) {
        // Validate path safety
        const resolvedPath = path.resolve(assetPath);
        const outputBase = path.resolve(process.cwd(), ".reshot");
        if (!isPathWithinBase(resolvedPath, outputBase) && !isPathWithinBase(resolvedPath, process.cwd())) {
          return res.status(400).json({ error: "Asset path is outside project directory" });
        }
        if (!fs.existsSync(resolvedPath)) {
          return res.status(404).json({ error: "Asset file not found" });
        }
        inputBuffer = fs.readFileSync(resolvedPath);
      } else {
        // Generate a placeholder gradient image (400x300)
        const sharp = require("sharp");
        inputBuffer = await sharp({
          create: {
            width: 400,
            height: 300,
            channels: 4,
            background: { r: 99, g: 102, b: 241, alpha: 1 },
          },
        })
          .png()
          .toBuffer();
      }

      const styledBuffer = await applyStyle(inputBuffer, style, console, 1);
      const base64 = styledBuffer.toString("base64");

      res.json({ preview: `data:image/png;base64,${base64}` });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/config/scenarios/:key
   * Get a single scenario by key
   */
  app.get("/api/config/scenarios/:key", async (req, res, next) => {
    try {
      const docSyncConfig = config.readConfig();
      const scenario = docSyncConfig.scenarios.find(
        (s) => s.key === req.params.key,
      );

      if (!scenario) {
        return res
          .status(404)
          .json({ error: `Scenario with key "${req.params.key}" not found` });
      }

      res.json({ scenario });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/config/scenarios/:key
   * Partial update of a scenario
   */
  app.patch("/api/config/scenarios/:key", async (req, res, next) => {
    try {
      const docSyncConfig = config.readConfig();
      const scenarioIndex = docSyncConfig.scenarios.findIndex(
        (s) => s.key === req.params.key,
      );

      if (scenarioIndex === -1) {
        return res
          .status(404)
          .json({ error: `Scenario with key "${req.params.key}" not found` });
      }

      const allowedFields = [
        "name",
        "url",
        "steps",
        "contexts",
        "matrix",
        "metadata",
        "output",
        "locale",
        "role",
        "variant",
        "variantPreset",
        "privacy",
        "style",
      ];
      const updates = req.body;

      // Validate fields
      for (const field of Object.keys(updates)) {
        if (!allowedFields.includes(field)) {
          return res
            .status(400)
            .json({ error: `Field "${field}" is not allowed for update` });
        }
      }

      // Apply updates
      docSyncConfig.scenarios[scenarioIndex] = {
        ...docSyncConfig.scenarios[scenarioIndex],
        ...updates,
      };

      // Validate updated scenario
      const updated = docSyncConfig.scenarios[scenarioIndex];
      if (
        !updated.name ||
        !updated.key ||
        !updated.url ||
        !Array.isArray(updated.steps)
      ) {
        return res.status(400).json({ error: "Updated scenario is invalid" });
      }

      config.writeConfig(docSyncConfig);
      res.json({ ok: true, scenario: updated });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/config/scenarios
   * Create a new scenario
   */
  app.post("/api/config/scenarios", async (req, res, next) => {
    try {
      const docSyncConfig = config.readConfig();
      const newScenario = req.body;

      // Validate required fields
      if (!newScenario.name || !newScenario.key || !newScenario.url) {
        return res
          .status(400)
          .json({ error: "Scenario must have name, key, and url" });
      }

      // Check for duplicate key
      if (docSyncConfig.scenarios.find((s) => s.key === newScenario.key)) {
        return res.status(409).json({
          error: `Scenario with key "${newScenario.key}" already exists`,
        });
      }

      // Ensure steps array
      if (!Array.isArray(newScenario.steps)) {
        newScenario.steps = [];
      }

      docSyncConfig.scenarios.push(newScenario);
      config.writeConfig(docSyncConfig);

      res.status(201).json({ ok: true, scenario: newScenario });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/config/scenarios/:key
   * Delete a scenario
   */
  app.delete("/api/config/scenarios/:key", async (req, res, next) => {
    try {
      const docSyncConfig = config.readConfig();
      const scenarioIndex = docSyncConfig.scenarios.findIndex(
        (s) => s.key === req.params.key,
      );

      if (scenarioIndex === -1) {
        return res
          .status(404)
          .json({ error: `Scenario with key "${req.params.key}" not found` });
      }

      docSyncConfig.scenarios.splice(scenarioIndex, 1);
      config.writeConfig(docSyncConfig);

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/config/scenarios
   * Bulk delete all scenarios from config
   */
  app.delete("/api/config/scenarios", async (req, res, next) => {
    try {
      const docSyncConfig = config.readConfig();
      const deletedCount = (docSyncConfig.scenarios || []).length;
      docSyncConfig.scenarios = [];
      config.writeConfig(docSyncConfig);

      res.json({ ok: true, deleted: deletedCount });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/assets
   * Bulk delete all assets from output folder
   */
  app.delete("/api/assets", async (req, res, next) => {
    try {
      const outputDir = path.join(process.cwd(), ".reshot", "output");
      const fileCount = deleteAllOutputAssets(outputDir);

      res.json({ ok: true, deleted: fileCount });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/assets/bulk-delete
   * Delete assets for specific scenarios
   */
  app.post("/api/assets/bulk-delete", async (req, res, next) => {
    try {
      const { scenarioKeys } = req.body;

      if (
        !scenarioKeys ||
        !Array.isArray(scenarioKeys) ||
        scenarioKeys.length === 0
      ) {
        return res
          .status(400)
          .json({ error: "scenarioKeys array is required" });
      }

      // Validate all scenario keys before processing
      for (const key of scenarioKeys) {
        if (!isValidPathSegment(key)) {
          return res
            .status(400)
            .json({ error: `Invalid scenario key: ${key}` });
        }
      }

      const outputDir = path.join(process.cwd(), ".reshot", "output");
      const { deletedScenarios, deletedFiles } = deleteScenarioAssetDirectories(
        outputDir,
        scenarioKeys,
        isPathWithinBase,
      );

      res.json({ ok: true, deletedScenarios, deletedFiles });
    } catch (error) {
      next(error);
    }
  });

  // ===== STEPS ENDPOINTS =====

  /**
   * POST /api/config/scenarios/:key/steps
   * Add a step to a scenario
   */
  app.post("/api/config/scenarios/:key/steps", async (req, res, next) => {
    try {
      const docSyncConfig = config.readConfig();
      const scenarioIndex = docSyncConfig.scenarios.findIndex(
        (s) => s.key === req.params.key,
      );

      if (scenarioIndex === -1) {
        return res
          .status(404)
          .json({ error: `Scenario with key "${req.params.key}" not found` });
      }

      const newStep = req.body;
      const scenario = docSyncConfig.scenarios[scenarioIndex];

      if (!Array.isArray(scenario.steps)) {
        scenario.steps = [];
      }

      scenario.steps.push(newStep);
      config.writeConfig(docSyncConfig);

      res
        .status(201)
        .json({ ok: true, step: newStep, index: scenario.steps.length - 1 });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/config/scenarios/:key/steps/:index
   * Update a step by index
   */
  app.patch(
    "/api/config/scenarios/:key/steps/:index",
    async (req, res, next) => {
      try {
        const docSyncConfig = config.readConfig();
        const scenarioIndex = docSyncConfig.scenarios.findIndex(
          (s) => s.key === req.params.key,
        );

        if (scenarioIndex === -1) {
          return res
            .status(404)
            .json({ error: `Scenario with key "${req.params.key}" not found` });
        }

        const stepIndex = parseInt(req.params.index, 10);
        const scenario = docSyncConfig.scenarios[scenarioIndex];

        if (
          !Array.isArray(scenario.steps) ||
          stepIndex < 0 ||
          stepIndex >= scenario.steps.length
        ) {
          return res
            .status(404)
            .json({ error: `Step at index ${stepIndex} not found` });
        }

        scenario.steps[stepIndex] = {
          ...scenario.steps[stepIndex],
          ...req.body,
        };

        config.writeConfig(docSyncConfig);
        res.json({ ok: true, step: scenario.steps[stepIndex] });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * DELETE /api/config/scenarios/:key/steps/:index
   * Delete a step by index
   */
  app.delete(
    "/api/config/scenarios/:key/steps/:index",
    async (req, res, next) => {
      try {
        const docSyncConfig = config.readConfig();
        const scenarioIndex = docSyncConfig.scenarios.findIndex(
          (s) => s.key === req.params.key,
        );

        if (scenarioIndex === -1) {
          return res
            .status(404)
            .json({ error: `Scenario with key "${req.params.key}" not found` });
        }

        const stepIndex = parseInt(req.params.index, 10);
        const scenario = docSyncConfig.scenarios[scenarioIndex];

        if (
          !Array.isArray(scenario.steps) ||
          stepIndex < 0 ||
          stepIndex >= scenario.steps.length
        ) {
          return res
            .status(404)
            .json({ error: `Step at index ${stepIndex} not found` });
        }

        scenario.steps.splice(stepIndex, 1);
        config.writeConfig(docSyncConfig);

        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    },
  );

  // ===== STORAGE CONFIGURATION ENDPOINTS =====

  /**
   * GET /api/config/storage
   * Returns current storage configuration
   */
  app.get("/api/config/storage", async (req, res, next) => {
    try {
      let docSyncConfig = null;
      try {
        docSyncConfig = config.readConfig();
      } catch (error) {
        // No config
      }

      const storageConfig = docSyncConfig?.storage || { type: "reshot" };

      res.json({
        storage: storageConfig,
        mode: storageConfig.type === "reshot" ? "platform" : "byos",
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /api/config/storage
   * Update storage configuration
   */
  app.put("/api/config/storage", async (req, res, next) => {
    try {
      const { storage } = req.body;

      if (!storage || !storage.type) {
        return res.status(400).json({ error: "storage.type is required" });
      }

      const validTypes = ["reshot", "s3", "r2", "local"];
      if (!validTypes.includes(storage.type)) {
        return res.status(400).json({
          error: `Invalid storage type. Must be one of: ${validTypes.join(
            ", ",
          )}`,
        });
      }

      // Read current config
      let docSyncConfig = {};
      try {
        docSyncConfig = config.readConfig();
      } catch (error) {
        // Start with empty config
        docSyncConfig = {
          baseUrl: "http://localhost:3000",
          assetDir: ".reshot/output",
          viewport: { width: 1280, height: 720 },
          scenarios: [],
        };
      }

      // Update storage config
      docSyncConfig.storage = storage;
      config.writeConfig(docSyncConfig);

      res.json({
        ok: true,
        storage,
        mode: storage.type === "reshot" ? "platform" : "byos",
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/config/env-check
   * Check which environment variables are set (without revealing values)
   */
  app.get("/api/config/env-check", async (req, res, next) => {
    try {
      const envVars = [
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_REGION",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "CLOUDFLARE_ACCOUNT_ID",
        "RESHOT_API_KEY",
        "RESHOT_PROJECT_ID",
      ];

      const envStatus = {};
      for (const key of envVars) {
        envStatus[key] = !!process.env[key];
      }

      res.json({ envStatus });
    } catch (error) {
      next(error);
    }
  });

  // ===== SETTINGS ENDPOINTS =====

  /**
   * GET /api/settings
   * Returns sanitized settings (no secrets)
   */
  app.get("/api/settings", async (req, res, next) => {
    try {
      let currentSettings = null;
      try {
        currentSettings = config.readSettings();
      } catch (error) {
        // Settings don't exist - return degraded mode
      }

      const sanitized = {
        isAuthenticated: !!(
          currentSettings?.apiKey && currentSettings?.projectId
        ),
        projectId: currentSettings?.projectId || null,
        projectName: currentSettings?.projectName || null,
        // workspace can be stored as either workspaceName (string) or workspace.name (object)
        workspaceName:
          currentSettings?.workspaceName ||
          currentSettings?.workspace?.name ||
          null,
        platformUrl: currentSettings?.platformUrl || null,
        linkedAt: currentSettings?.linkedAt || null,
        user: currentSettings?.user || null,
        lastSyncedAt: currentSettings?.lastSyncedAt || null,
        lastPublishedCommitHash:
          currentSettings?.lastPublishedCommitHash || null,
        features: currentSettings?._metadata?.features || null,
      };

      res.json({ settings: sanitized });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/settings/init
   * Initialize project by fetching config from platform
   */
  app.post("/api/settings/init", async (req, res, next) => {
    try {
      const { projectId, overwrite = false } = req.body;

      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }

      // Try to get settings to find apiKey
      let currentSettings = null;
      try {
        currentSettings = config.readSettings();
      } catch (error) {
        return res.status(400).json({
          error:
            "No CLI settings found. Run `reshot auth` first to authenticate.",
        });
      }

      const { apiKey } = currentSettings;
      if (!apiKey) {
        return res.status(400).json({
          error: "Missing API key in settings. Run `reshot auth` again.",
        });
      }

      // Use shared initializeProject helper
      const blueprint = await config.initializeProject(projectId, apiKey, {
        overwrite,
      });

      // Read updated settings
      const updatedSettings = config.readSettings();
      const sanitized = {
        isAuthenticated: true,
        projectId: updatedSettings.projectId,
        projectName: updatedSettings.projectName || null,
        workspaceName: updatedSettings.workspaceName || null,
        lastSyncedAt: updatedSettings.lastSyncedAt || null,
        features: blueprint._metadata?.features || null,
      };

      res.json({ ok: true, config: blueprint, settings: sanitized });
    } catch (error) {
      next(error);
    }
  });

  // ===== WORKSPACE ENDPOINTS =====

  /**
   * GET /api/workspace
   * Get current workspace with resolved scenarios
   */
  app.get("/api/workspace", async (req, res, next) => {
    try {
      const workspace = config.getWorkspaceWithScenarios();
      res.json({ workspace });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/workspace
   * Create or update workspace
   */
  app.post("/api/workspace", async (req, res, next) => {
    try {
      const { name, description, variants } = req.body;

      let workspace = config.readWorkspace();
      if (workspace) {
        // Update existing
        workspace.name = name || workspace.name;
        workspace.description =
          description !== undefined ? description : workspace.description;
        if (variants) {
          workspace.variants = variants;
        }
        config.writeWorkspace(workspace);
      } else {
        // Create new
        workspace = config.createWorkspace({ name, description, variants });
      }

      res.json({ ok: true, workspace: config.getWorkspaceWithScenarios() });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /api/workspace/variants
   * Update workspace variant dimensions
   */
  app.put("/api/workspace/variants", async (req, res, next) => {
    try {
      const { dimensions, presets } = req.body;

      let workspace = config.readWorkspace();
      if (!workspace) {
        workspace = config.createWorkspace();
      }

      workspace.variants = {
        dimensions: dimensions || workspace.variants?.dimensions || {},
        presets: presets || workspace.variants?.presets || {},
      };
      config.writeWorkspace(workspace);

      res.json({ ok: true, workspace: config.getWorkspaceWithScenarios() });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/workspace/scenarios
   * Add scenario(s) to workspace
   */
  app.post("/api/workspace/scenarios", async (req, res, next) => {
    try {
      const { scenarioKeys } = req.body;

      if (!scenarioKeys || !Array.isArray(scenarioKeys)) {
        return res
          .status(400)
          .json({ error: "scenarioKeys array is required" });
      }

      for (const key of scenarioKeys) {
        config.addScenarioToWorkspace(key);
      }

      res.json({ ok: true, workspace: config.getWorkspaceWithScenarios() });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/workspace/scenarios/:key
   * Remove scenario from workspace
   */
  app.delete("/api/workspace/scenarios/:key", async (req, res, next) => {
    try {
      const { key } = req.params;
      config.removeScenarioFromWorkspace(key);
      res.json({ ok: true, workspace: config.getWorkspaceWithScenarios() });
    } catch (error) {
      next(error);
    }
  });

  // ===== COMMIT ENDPOINTS =====

  /**
   * POST /api/commit
   * Create a commit from selected workspace scenarios and publish to platform
   */
  app.post("/api/commit", async (req, res, next) => {
    try {
      const { message, scenarioKeys, includeAllVariants } = req.body;

      if (!message || !message.trim()) {
        return res.status(400).json({ error: "Commit message is required" });
      }

      // Get settings for API access
      const settings = config.readSettings();
      if (!settings?.apiKey || !settings?.projectId) {
        return res.status(400).json({
          error: "Not authenticated. Please connect to platform first.",
        });
      }

      // Get workspace
      const workspace = config.getWorkspaceWithScenarios();
      if (!workspace) {
        return res.status(400).json({ error: "No workspace found" });
      }

      // Determine which scenarios to include (use resolvedScenarios which have full scenario objects)
      let targetScenarios = workspace.resolvedScenarios || [];
      if (scenarioKeys && scenarioKeys.length > 0) {
        targetScenarios = targetScenarios.filter((s) =>
          scenarioKeys.includes(s.key),
        );
      }

      if (targetScenarios.length === 0) {
        return res
          .status(400)
          .json({ error: "No scenarios selected for commit" });
      }

      // Find captured assets for these scenarios
      const outputBaseDir = path.join(process.cwd(), ".reshot", "output");
      if (!fs.existsSync(outputBaseDir)) {
        return res.status(400).json({ error: "No captured assets found" });
      }

      const assetFiles = findAssetFiles(outputBaseDir);
      const groups = groupAssetsByScenario(assetFiles, outputBaseDir);

      // Filter to only selected scenarios (targetScenarios is now array of scenario objects)
      const selectedGroups = groups.filter((g) =>
        targetScenarios.some((s) => s.key === g.scenarioKey),
      );

      if (selectedGroups.length === 0) {
        return res.status(400).json({
          error: "No captured assets found for selected scenarios",
        });
      }

      // Prepare metadata for sync API
      const assets = [];
      const files = [];

      for (const group of selectedGroups) {
        for (const asset of group.assets) {
          const filename = path.basename(asset.path);
          const format = path.extname(filename).slice(1).toLowerCase();

          assets.push({
            scenarioKey: group.scenarioKey,
            scenarioName: targetScenarios.find(
              (s) => s.key === group.scenarioKey,
            )?.name,
            variationSlug: group.variationSlug,
            captureKey: asset.step || "capture",
            filename,
            format,
          });

          files.push({
            path: asset.path,
            filename,
          });
        }
      }

      // Get git info if available
      let gitInfo = {};
      try {
        const { execSync } = require("child_process");
        const commitHash = execSync("git rev-parse HEAD", {
          encoding: "utf-8",
        }).trim();
        const branch = execSync("git rev-parse --abbrev-ref HEAD", {
          encoding: "utf-8",
        }).trim();
        gitInfo = { commitHash, branch };
      } catch {
        // Not in a git repo
      }

      // Build FormData for sync API
      const FormData = (await import("form-data")).default;
      const formData = new FormData();

      // Add metadata
      const metadata = {
        projectId: settings.projectId,
        syncMode: "incremental",
        commit: {
          message: message.trim(),
          scenarioKeys: targetScenarios.map((s) => s.key),
        },
        assets,
        git: {
          ...gitInfo,
          commitMessage: message.trim(),
        },
        cli: {
          version: require("../../package.json").version,
          syncTimestamp: new Date().toISOString(),
        },
      };

      formData.append("metadata", JSON.stringify(metadata));

      // Add files - use key format expected by sync API: scenarioKey/variationSlug/filename
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const asset = assets[i];
        const fileKey = `${asset.scenarioKey}/${asset.variationSlug}/${asset.filename}`;
        formData.append(fileKey, fs.createReadStream(file.path), file.filename);
      }

      // Send to platform sync API
      const platformUrl = getPlatformUrl(settings);
      const axios = (await import("axios")).default;

      let response;
      try {
        response = await axios.post(`${platformUrl}/api/v1/sync`, formData, {
          headers: {
            ...formData.getHeaders(),
            "X-API-Key": settings.apiKey,
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
      } catch (axiosError) {
        // Check if this is an auth error
        const authHandled = handleApiError(axiosError, res);
        if (authHandled) return authHandled;

        // Otherwise, throw for generic handling
        const errorMsg = axiosError.response?.data?.error || axiosError.message;
        throw new Error(`Platform sync failed: ${errorMsg}`);
      }

      if (!response.data?.ok) {
        return res.status(500).json({
          error: response.data?.error || "Failed to sync to platform",
        });
      }

      // Record commit in workspace
      const commitRecord = {
        id: response.data.commitId || `local-${Date.now()}`,
        message: message.trim(),
        scenarioKeys: targetScenarios.map((s) => s.key),
        assetCount: assets.length,
        createdAt: new Date().toISOString(),
        syncedAt: new Date().toISOString(),
        platformCommitId: response.data.commitId,
      };

      let workspaceData = config.readWorkspace();
      if (!workspaceData) {
        workspaceData = config.createWorkspace();
      }
      if (!workspaceData.commits) {
        workspaceData.commits = [];
      }
      if (!Array.isArray(workspaceData.commits)) {
        workspaceData.commits = [];
      }
      workspaceData.commits.push(commitRecord);
      config.writeWorkspace(workspaceData);

      res.json({
        ok: true,
        commit: commitRecord,
        syncResult: {
          processed: response.data.processed,
          errorCount: response.data.errorCount,
          commitId: response.data.commitId,
          changelogDraftId: response.data.changelogDraftId,
        },
      });
    } catch (error) {
      console.error("Commit error:", error);
      next(error);
    }
  });

  /**
   * GET /api/commits
   * Get commit history from workspace
   */
  app.get("/api/commits", async (req, res, next) => {
    try {
      const workspace = config.readWorkspace();
      const commits = workspace?.commits || [];
      res.json({ commits: commits.reverse() }); // Most recent first
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/status
   * Aggregator endpoint for Dashboard - combines settings, config, jobs, assets, and remote status
   */
  app.get("/api/status", async (req, res, next) => {
    try {
      const uiExecutor = require("./ui-executor");

      // 1. Settings summary
      let currentSettings = null;
      try {
        currentSettings = config.readSettings();
      } catch (error) {
        // Settings don't exist
      }

      const settings = {
        isAuthenticated: !!(
          currentSettings?.apiKey && currentSettings?.projectId
        ),
        projectId: currentSettings?.projectId || null,
        projectName: currentSettings?.projectName || null,
        workspaceName:
          currentSettings?.workspaceName ||
          currentSettings?.workspace?.name ||
          null,
        linkedAt: currentSettings?.linkedAt || null,
        user: currentSettings?.user || null,
        lastSyncedAt: currentSettings?.lastSyncedAt || null,
        lastPublishedCommitHash:
          currentSettings?.lastPublishedCommitHash || null,
        features: currentSettings?._metadata?.features || null,
      };

      // 2. Config summary
      let docSyncConfig = null;
      let configError = null;
      if (config.configExists()) {
        try {
          docSyncConfig = config.readConfig();
        } catch (error) {
          configError = error.message;
        }
      }

      const configStatus = {
        hasConfig: docSyncConfig !== null,
        configError,
        scenarioCount: docSyncConfig?.scenarios?.length || 0,
        totalSteps:
          docSyncConfig?.scenarios?.reduce(
            (sum, s) => sum + (s.steps?.length || 0),
            0,
          ) || 0,
        lastSyncedAt: settings.lastSyncedAt,
        lastPublishedCommitHash: settings.lastPublishedCommitHash,
      };

      // 3. Job summary (clean up stuck jobs first)
      uiExecutor.cleanupStuckJobs();
      const jobs = uiExecutor.getAllJobs(10); // Last 10 jobs

      // 4. Local assets summary
      const outputBaseDir = path.join(process.cwd(), ".reshot", "output");
      let localAssets = {
        totalFiles: 0,
        totalSize: 0,
        groups: [],
      };

      if (fs.existsSync(outputBaseDir)) {
        try {
          const assetFiles = findAssetFiles(outputBaseDir);
          const groups = groupAssetsByScenario(assetFiles, outputBaseDir);
          localAssets = {
            totalFiles: assetFiles.length,
            totalSize: assetFiles.reduce((sum, file) => {
              try {
                return sum + fs.statSync(file).size;
              } catch {
                return sum;
              }
            }, 0),
            groups: groups.map((g) => ({
              scenarioKey: g.scenarioKey,
              variationSlug: g.variationSlug,
              assetCount: g.assets.length,
            })),
          };
        } catch (error) {
          // Ignore asset enumeration errors
        }
      }

      // 5. Remote summary (best-effort, don't fail if platform is unreachable)
      let remote = {
        visualsCount: 0,
        reviewQueueCount: 0,
        error: null,
      };

      if (currentSettings?.projectId && currentSettings?.apiKey) {
        try {
          const [visuals, queue] = await Promise.all([
            apiClient
              .getVisuals(currentSettings.projectId, currentSettings.apiKey)
              .catch(() => ({ data: [] })),
            apiClient
              .getReviewQueue(currentSettings.projectId, currentSettings.apiKey)
              .catch(() => []),
          ]);
          remote.visualsCount = Array.isArray(visuals)
            ? visuals.length
            : visuals?.data?.length || 0;
          remote.reviewQueueCount = Array.isArray(queue) ? queue.length : 0;
        } catch (error) {
          remote.error = error.message;
        }
      }

      res.json({
        settings,
        configStatus,
        jobs,
        localAssets,
        remote,
      });
    } catch (error) {
      next(error);
    }
  });

  // ===== MODE & FEATURES ENDPOINTS =====

  /**
   * GET /api/mode
   * Get current CLI mode (standalone vs connected) and available features
   */
  app.get("/api/mode", async (req, res, next) => {
    try {
      let currentSettings = null;
      try {
        currentSettings = config.readSettings();
      } catch (e) {
        // No settings
      }

      const standalone = isStandaloneMode(currentSettings);
      const features = getAvailableFeatures(currentSettings);

      res.json({
        mode: standalone ? "standalone" : "connected",
        features,
        settings: currentSettings
          ? {
              projectId: currentSettings.projectId,
              projectName: currentSettings.projectName,
              hasApiKey: !!currentSettings.apiKey,
            }
          : null,
      });
    } catch (error) {
      next(error);
    }
  });

  // ===== VIEWPORT PRESETS ENDPOINTS =====

  /**
   * GET /api/viewports
   * Get all viewport presets (built-in and custom)
   */
  app.get("/api/viewports", async (req, res, next) => {
    try {
      const builtIn = getAllViewportPresets();
      const byCategory = getViewportPresetsByCategory();

      // Get custom presets from config
      let customPresets = {};
      if (config.configExists()) {
        try {
          const docSyncConfig = config.readConfig();
          customPresets = docSyncConfig.viewportPresets || {};
        } catch (e) {
          // Config parse error
        }
      }

      res.json({
        builtIn,
        custom: customPresets,
        byCategory,
        all: { ...builtIn, ...customPresets },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/viewports
   * Create or update a custom viewport preset
   */
  app.post("/api/viewports", async (req, res, next) => {
    try {
      const { key, name, width, height, deviceScaleFactor, description } =
        req.body;

      if (!key || !width || !height) {
        return res.status(400).json({
          error: "key, width, and height are required",
        });
      }

      const preset = {
        name: name || key,
        category: "custom",
        width: parseInt(width, 10),
        height: parseInt(height, 10),
        deviceScaleFactor: deviceScaleFactor
          ? parseFloat(deviceScaleFactor)
          : 2,
        description: description || `${width}×${height}`,
      };

      const validation = validateViewport(preset);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      // Save to config
      const savedConfig = config.saveViewportPreset(key, preset);

      res.json({
        success: true,
        preset: { key, ...preset },
        viewportPresets: savedConfig.viewportPresets,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/viewports/:key
   * Delete a custom viewport preset
   */
  app.delete("/api/viewports/:key", async (req, res, next) => {
    try {
      const { key } = req.params;

      // Check if it's a built-in preset
      const builtIn = getAllViewportPresets();
      if (builtIn[key]) {
        return res.status(400).json({
          error: "Cannot delete built-in viewport presets",
        });
      }

      config.deleteViewportPreset(key);

      res.json({ success: true, deleted: key });
    } catch (error) {
      next(error);
    }
  });

  // ===== CROP PRESETS ENDPOINTS =====

  /**
   * GET /api/crops
   * Get all crop presets
   */
  app.get("/api/crops", async (req, res, next) => {
    try {
      const cropPresets = getAllCropPresets();

      res.json({
        presets: cropPresets,
      });
    } catch (error) {
      next(error);
    }
  });

  // ===== OUTPUT TEMPLATE ENDPOINTS =====

  /**
   * GET /api/output-template
   * Get output template configuration and available presets
   */
  app.get("/api/output-template", async (req, res, next) => {
    try {
      const presets = getTemplatePresets();

      let currentTemplate = null;
      let outputConfig = {};
      if (config.configExists()) {
        try {
          const docSyncConfig = config.readConfig();
          currentTemplate = docSyncConfig.output?.template || null;
          outputConfig = docSyncConfig.output || {};
        } catch (e) {
          // Config parse error
        }
      }

      res.json({
        presets,
        currentTemplate,
        outputConfig,
        availableVariables: [
          { name: "scenario", description: "Scenario key" },
          { name: "scenarioName", description: "Human-readable scenario name" },
          { name: "name", description: "Asset/screenshot name" },
          { name: "assetName", description: "Alias for name" },
          { name: "step", description: "Step number (1-based)" },
          { name: "locale", description: "Current locale from variant" },
          { name: "role", description: "Current role from variant" },
          { name: "theme", description: "Current theme from variant" },
          { name: "variant", description: "Full variant slug" },
          { name: "timestamp", description: "ISO timestamp for run" },
          { name: "date", description: "Date portion (YYYY-MM-DD)" },
          { name: "time", description: "Time portion (HH-MM-SS)" },
          { name: "viewport", description: "Viewport preset or WxH" },
          { name: "viewportWidth", description: "Viewport width" },
          { name: "viewportHeight", description: "Viewport height" },
          { name: "ext", description: "File extension (default: png)" },
        ],
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /api/output-template
   * Update output template configuration
   */
  app.put("/api/output-template", async (req, res, next) => {
    try {
      const { template, preset } = req.body;

      let templateToUse = template;

      // If preset name provided, get template from preset
      if (preset && !template) {
        const presets = getTemplatePresets();
        const presetConfig = presets.find((p) => p.name === preset);
        if (!presetConfig) {
          return res.status(400).json({ error: `Unknown preset: ${preset}` });
        }
        templateToUse = presetConfig.template;
      }

      if (!templateToUse) {
        return res
          .status(400)
          .json({ error: "template or preset is required" });
      }

      // Validate template
      const validation = validateTemplate(templateToUse);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      // Update config
      const updatedConfig = config.updateOutputConfig({
        template: templateToUse,
      });

      res.json({
        success: true,
        template: templateToUse,
        variables: parseTemplateVariables(templateToUse),
        warning: validation.warning || null,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/output-template/validate
   * Validate an output template without saving
   */
  app.post("/api/output-template/validate", async (req, res, next) => {
    try {
      const { template } = req.body;

      if (!template) {
        return res.status(400).json({ error: "template is required" });
      }

      const validation = validateTemplate(template);

      res.json({
        valid: validation.valid,
        error: validation.error || null,
        warning: validation.warning || null,
        variables: validation.variables || parseTemplateVariables(template),
      });
    } catch (error) {
      next(error);
    }
  });

  // ===== OUTPUT/ASSETS ENDPOINTS =====

  /**
   * GET /api/output
   * List all generated assets grouped by scenario and variation
   * Query params:
   *   - allVersions=true: Include all timestamped versions (not just latest)
   *   - latestJobOnly=true: Only include the most recent timestamp folder (for publish preview)
   */
  app.get("/api/output", async (req, res, next) => {
    try {
      const outputBaseDir = path.join(process.cwd(), ".reshot", "output");
      const includeAllVersions = req.query.allVersions === "true";
      const latestJobOnly = req.query.latestJobOnly === "true";

      if (!fs.existsSync(outputBaseDir)) {
        return res.json({ groups: [], versions: [] });
      }

      const assetFiles = findAssetFiles(outputBaseDir, undefined, {
        includeAllVersions,
        latestJobOnly,
      });
      const groups = groupAssetsByScenario(assetFiles, outputBaseDir);

      // Also return available version timestamps per scenario
      const versions = getVersionsPerScenario(outputBaseDir);

      res.json({ groups, versions });
    } catch (error) {
      next(error);
    }
  });

  // ========================================
  // SPECIFIC ROUTES MUST COME BEFORE GENERIC
  // Express matches routes in order, so /versions and /version/:timestamp
  // must be defined BEFORE /:scenarioKey/:variationSlug
  // ========================================

  /**
   * GET /api/output/:scenarioKey/versions
   * List all version timestamps for a specific scenario with asset counts
   * Also detects variant subfolders (e.g., light, dark) within each timestamp
   */
  app.get("/api/output/:scenarioKey/versions", async (req, res, next) => {
    try {
      const { scenarioKey } = req.params;
      const outputBaseDir = path.join(process.cwd(), ".reshot", "output");
      const scenarioDir = path.join(outputBaseDir, scenarioKey);

      if (!fs.existsSync(scenarioDir)) {
        return res.json({ versions: [] });
      }

      const versions = listScenarioVersions(scenarioDir);

      res.json({ versions });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/output/:scenarioKey/version/:timestamp
   * Get assets for a specific version timestamp
   */
  app.get(
    "/api/output/:scenarioKey/version/:timestamp",
    async (req, res, next) => {
      try {
        const { scenarioKey, timestamp } = req.params;
        const outputBaseDir = path.join(process.cwd(), ".reshot", "output");
        const versionDir = path.join(outputBaseDir, scenarioKey, timestamp);

        if (!fs.existsSync(versionDir)) {
          return res.json({ assets: [] });
        }

        const extensions = [".png", ".gif", ".mp4", ".jpg", ".jpeg", ".webm"];
        const assets = [];
        const diffManifests = []; // Collect all diff manifests found

        function collectAssets(dir, baseRelativePath = "") {
          try {
            const items = fs.readdirSync(dir);
            for (const item of items) {
              // Skip diffs folder - these are generated by diff engine
              if (item === "diffs") continue;

              const fullPath = path.join(dir, item);
              const stat = fs.statSync(fullPath);
              const relativePath = baseRelativePath
                ? `${baseRelativePath}/${item}`
                : item;

              if (stat.isDirectory()) {
                collectAssets(fullPath, relativePath);
              } else {
                // Check for diff manifest files
                if (item === "diff-manifest.json") {
                  try {
                    const manifest = fs.readJSONSync(fullPath);
                    diffManifests.push({ path: baseRelativePath, manifest });
                  } catch (e) {
                    // Ignore read errors
                  }
                  continue;
                }

                const ext = path.extname(item).toLowerCase();
                if (extensions.includes(ext)) {
                  const relativeFromOutput = path.relative(
                    outputBaseDir,
                    fullPath,
                  );
                  // Use relative path without extension as key to match manifest
                  const assetKey = relativePath.replace(/\.[^/.]+$/, "");
                  const captureKey = path.basename(item, ext);
                  const isSentinel = baseRelativePath.includes("sentinels");
                  assets.push({
                    assetKey, // Full path key for matching manifest
                    captureKey, // Just filename for display
                    path: fullPath,
                    relativePath: relativeFromOutput,
                    filename: item,
                    size: stat.size,
                    mtime: stat.mtime.toISOString(),
                    url: `/assets/${relativeFromOutput.replace(/\\/g, "/")}`,
                    isSentinel,
                  });
                }
              }
            }
          } catch (e) {
            // Ignore errors
          }
        }

        collectAssets(versionDir);

        // Merge all diff manifests and enrich assets
        let mergedSummary = null;
        let comparedAgainst = null;

        for (const { manifest } of diffManifests) {
          if (manifest.comparedAgainst) {
            comparedAgainst = manifest.comparedAgainst;
          }

          // Merge summary - normalize field names for UI
          if (manifest.summary) {
            if (!mergedSummary) {
              mergedSummary = {
                total: manifest.summary.total || 0,
                new: manifest.summary.newAssets || manifest.summary.new || 0,
                changed: manifest.summary.changed || 0,
                unchanged: manifest.summary.unchanged || 0,
              };
            } else {
              mergedSummary.total += manifest.summary.total || 0;
              mergedSummary.new +=
                manifest.summary.newAssets || manifest.summary.new || 0;
              mergedSummary.changed += manifest.summary.changed || 0;
              mergedSummary.unchanged += manifest.summary.unchanged || 0;
            }
          }

          // Enrich assets with diff data
          if (manifest.assets) {
            for (const asset of assets) {
              const diffData = manifest.assets[asset.assetKey];
              if (diffData) {
                asset.diff = {
                  status: diffData.status,
                  hasDiff: diffData.hasDiff,
                  score: diffData.score,
                  reason: diffData.reason,
                  diffUrl: diffData.diffPath
                    ? `/assets/${scenarioKey}/${timestamp}/${diffData.diffPath}`
                    : null,
                };
              }
            }
          }
        }

        res.json({
          assets,
          timestamp,
          diffManifest: mergedSummary
            ? {
                comparedAgainst,
                summary: mergedSummary,
              }
            : null,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * GET /api/output/:scenarioKey/version/:timestamp/variant/:variant
   * Get assets for a specific variant within a version timestamp
   */
  app.get(
    "/api/output/:scenarioKey/version/:timestamp/variant/:variant",
    async (req, res, next) => {
      try {
        const { scenarioKey, timestamp, variant } = req.params;
        const outputBaseDir = path.join(process.cwd(), ".reshot", "output");
        const variantDir = path.join(outputBaseDir, scenarioKey, timestamp, variant);

        if (!fs.existsSync(variantDir)) {
          return res.status(404).json({ error: "Variant not found", assets: [] });
        }

        const extensions = [".png", ".gif", ".mp4", ".jpg", ".jpeg", ".webm"];
        const assets = [];

        function collectAssets(dir, baseRelativePath = "") {
          try {
            const items = fs.readdirSync(dir);
            for (const item of items) {
              // Skip diffs folder
              if (item === "diffs") continue;

              const fullPath = path.join(dir, item);
              const stat = fs.statSync(fullPath);
              const relativePath = baseRelativePath
                ? `${baseRelativePath}/${item}`
                : item;

              if (stat.isDirectory()) {
                collectAssets(fullPath, relativePath);
              } else {
                const ext = path.extname(item).toLowerCase();
                if (extensions.includes(ext)) {
                  const relativeFromOutput = path.relative(outputBaseDir, fullPath);
                  const captureKey = path.basename(item, ext);
                  const isSentinel = relativePath.includes("sentinels");
                  assets.push({
                    captureKey,
                    path: fullPath,
                    relativePath: relativeFromOutput,
                    filename: item,
                    size: stat.size,
                    mtime: stat.mtime.toISOString(),
                    url: `/assets/${relativeFromOutput.replace(/\\/g, "/")}`,
                    isSentinel,
                  });
                }
              }
            }
          } catch (e) {
            // Ignore errors
          }
        }

        collectAssets(variantDir);

        res.json({
          assets,
          timestamp,
          variant,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * GET /api/output/:scenarioKey/version/:timestamp/diff-manifest
   * Get the diff manifest for a specific version
   */
  app.get(
    "/api/output/:scenarioKey/version/:timestamp/diff-manifest",
    async (req, res, next) => {
      try {
        const { scenarioKey, timestamp } = req.params;
        const outputBaseDir = path.join(process.cwd(), ".reshot", "output");
        const manifestPath = path.join(
          outputBaseDir,
          scenarioKey,
          timestamp,
          "diff-manifest.json",
        );

        if (!fs.existsSync(manifestPath)) {
          return res.json({
            manifest: null,
            message: "No diff manifest found for this version",
          });
        }

        const manifest = fs.readJSONSync(manifestPath);
        res.json({ manifest });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * GET /api/output/:scenarioKey/:variationSlug/sentinels
   * List sentinel frames for a specific scenario/variation (for video bundles)
   *
   * Sentinels are captured at each step during video recording for diffing.
   * Structure: .reshot/output/<scenarioKey>/<timestamp>/<variationSlug>/sentinels/
   */
  app.get(
    "/api/output/:scenarioKey/:variationSlug/sentinels",
    async (req, res, next) => {
      try {
        const { scenarioKey, variationSlug } = req.params;
        const outputBaseDir = path.join(process.cwd(), ".reshot", "output");
        const scenarioDir = path.join(outputBaseDir, scenarioKey);

        if (!fs.existsSync(scenarioDir)) {
          return res.json({ files: [], sentinelsManifest: null });
        }

        // Find sentinels directory in timestamped folders
        let sentinelsDir = null;
        let sentinelsManifest = null;

        // Check for sentinels in timestamped folders (most recent first)
        const subFolders = fs.readdirSync(scenarioDir).filter((item) => {
          const fullPath = path.join(scenarioDir, item);
          try {
            return fs.statSync(fullPath).isDirectory();
          } catch {
            return false;
          }
        });

        const timestampedFolders = subFolders
          .filter((f) => /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(f))
          .sort()
          .reverse();

        // Look in timestamped folders for variation/sentinels
        for (const tsFolder of timestampedFolders) {
          const possiblePaths = [
            path.join(scenarioDir, tsFolder, variationSlug, "sentinels"),
            path.join(scenarioDir, tsFolder, "sentinels"), // If no variation nesting
          ];

          for (const sentinelPath of possiblePaths) {
            if (
              fs.existsSync(sentinelPath) &&
              fs.statSync(sentinelPath).isDirectory()
            ) {
              sentinelsDir = sentinelPath;

              // Check for sentinels.json manifest
              const manifestPath = path.join(sentinelPath, "sentinels.json");
              if (fs.existsSync(manifestPath)) {
                try {
                  sentinelsManifest = fs.readJSONSync(manifestPath);
                } catch (e) {
                  // Ignore parse errors
                }
              }
              break;
            }
          }
          if (sentinelsDir) break;
        }

        if (!sentinelsDir) {
          return res.json({ files: [], sentinelsManifest: null });
        }

        // List PNG files in sentinels directory
        const files = fs
          .readdirSync(sentinelsDir)
          .filter((f) => f.endsWith(".png"))
          .sort((a, b) => {
            // Sort by step number if present (step-0, step-1, etc.)
            const numA = parseInt((a.match(/step-(\d+)/) || [])[1] || "0", 10);
            const numB = parseInt((b.match(/step-(\d+)/) || [])[1] || "0", 10);
            return numA - numB;
          });

        // Calculate relative path for asset URLs
        const relativePath = path.relative(outputBaseDir, sentinelsDir);

        res.json({
          files,
          sentinelsManifest,
          basePath: `/assets/${relativePath.replace(/\\/g, "/")}`,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // ========================================
  // GENERIC ROUTE - must come AFTER specific routes
  // ========================================

  /**
   * GET /api/output/:scenarioKey/:variationSlug
   * List assets for a specific scenario/variation
   *
   * Handles multiple directory structures:
   * - .reshot/output/<scenarioKey>/<variationSlug>/ (direct)
   * - .reshot/output/<scenarioKey>/latest/ (latest version)
   * - .reshot/output/<scenarioKey>/<timestamp>/ (timestamped)
   * - .reshot/output/<scenarioKey>/<timestamp>/<variationSlug>/ (variant in timestamp)
   */
  app.get("/api/output/:scenarioKey/:variationSlug", async (req, res, next) => {
    try {
      const { scenarioKey, variationSlug } = req.params;
      const outputBaseDir = path.join(process.cwd(), ".reshot", "output");
      const scenarioDir = path.join(outputBaseDir, scenarioKey);

      if (!fs.existsSync(scenarioDir)) {
        return res.json({ assets: [] });
      }

      // Try to find the variation folder in order of preference
      let variationDir = null;
      const directPath = path.join(scenarioDir, variationSlug);

      if (fs.existsSync(directPath) && fs.statSync(directPath).isDirectory()) {
        variationDir = directPath;
      } else {
        // Look for the variation inside timestamped folders
        const subFolders = fs.readdirSync(scenarioDir).filter((item) => {
          const fullPath = path.join(scenarioDir, item);
          try {
            return fs.statSync(fullPath).isDirectory();
          } catch {
            return false;
          }
        });

        // Sort timestamped folders by date (most recent first)
        const timestampedFolders = subFolders
          .filter((f) => /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(f))
          .sort()
          .reverse();

        // Check timestamped folders for the variation
        for (const tsFolder of timestampedFolders) {
          const nestedPath = path.join(scenarioDir, tsFolder, variationSlug);
          if (
            fs.existsSync(nestedPath) &&
            fs.statSync(nestedPath).isDirectory()
          ) {
            variationDir = nestedPath;
            break;
          }
        }

        // If still not found and looking for 'latest', try the most recent timestamp
        if (
          !variationDir &&
          variationSlug === "latest" &&
          timestampedFolders.length > 0
        ) {
          variationDir = path.join(scenarioDir, timestampedFolders[0]);
        }
      }

      if (!variationDir || !fs.existsSync(variationDir)) {
        return res.json({ assets: [] });
      }

      // Collect assets from the variation folder
      const extensions = [".png", ".gif", ".mp4", ".jpg", ".jpeg", ".webm"];
      const assets = [];

      function collectAssets(dir, baseRelativePath = "") {
        try {
          const items = fs.readdirSync(dir);
          for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            const relativePath = baseRelativePath
              ? `${baseRelativePath}/${item}`
              : item;

            if (stat.isDirectory()) {
              collectAssets(fullPath, relativePath);
            } else {
              const ext = path.extname(item).toLowerCase();
              if (extensions.includes(ext)) {
                const relativeFromOutput = path.relative(
                  outputBaseDir,
                  fullPath,
                );
                // Extract captureKey from filename (remove extension)
                const captureKey = path.basename(item, ext);
                assets.push({
                  captureKey,
                  path: fullPath,
                  relativePath: relativeFromOutput,
                  filename: item,
                  size: stat.size,
                  mtime: stat.mtime.toISOString(),
                  url: `/assets/${relativeFromOutput.replace(/\\/g, "/")}`,
                });
              }
            }
          }
        } catch (e) {
          // Ignore errors
        }
      }

      collectAssets(variationDir);

      res.json({ assets });
    } catch (error) {
      next(error);
    }
  });

  // Serve static assets from output directory
  const outputBaseDir = path.join(process.cwd(), ".reshot", "output");
  if (fs.existsSync(outputBaseDir)) {
    app.use("/assets", express.static(outputBaseDir));
  }

  // ===== AUTH ENDPOINTS =====

  /**
   * GET /api/auth/verify
   * Verify current API key is still valid and refresh project info from platform
   */
  app.get("/api/auth/verify", async (req, res) => {
    try {
      let currentSettings = null;
      try {
        currentSettings = config.readSettings();
      } catch (error) {
        return res
          .status(401)
          .json(
            config.createAuthErrorResponse(
              "No CLI settings found. Run authentication.",
            ),
          );
      }

      if (!currentSettings?.apiKey) {
        return res
          .status(401)
          .json(
            config.createAuthErrorResponse(
              "No API key found. Please authenticate.",
            ),
          );
      }

      const axios = require("axios");
      const platformUrl = getPlatformUrl(currentSettings);

      try {
        // Verify API key with platform and get current project info
        const verifyRes = await axios.get(
          `${platformUrl}/api/auth/cli/verify`,
          {
            headers: {
              Authorization: `Bearer ${currentSettings.apiKey}`,
            },
            timeout: 10000,
          },
        );

        const payload = verifyRes.data?.data || verifyRes.data;

        // Update settings with latest project info from platform if available
        if (payload?.project) {
          const updatedSettings = {
            ...currentSettings,
            projectId: payload.project.id || currentSettings.projectId,
            projectName: payload.project.name || currentSettings.projectName,
            workspaceName:
              payload.project.workspace?.name ||
              currentSettings.workspaceName ||
              currentSettings.workspace?.name,
          };
          config.writeSettings(updatedSettings);
          currentSettings = updatedSettings;
        }

        res.json({
          ok: true,
          valid: true,
          projectId: currentSettings.projectId,
          projectName: currentSettings.projectName,
          workspaceName:
            currentSettings.workspaceName || currentSettings.workspace?.name,
          user: currentSettings.user,
        });
      } catch (verifyError) {
        // Check if this is specifically an auth error
        if (config.isAuthError(verifyError)) {
          return res
            .status(401)
            .json(
              config.createAuthErrorResponse(
                "API key is invalid or expired. Please re-authenticate.",
              ),
            );
        }
        // Network or other error - don't assume auth failure
        console.warn(
          "API key verification error (may be network):",
          verifyError.message,
        );
        res.json({
          ok: true,
          valid: "unknown",
          warning: "Could not verify API key - platform may be unreachable",
          projectId: currentSettings.projectId,
          projectName: currentSettings.projectName,
        });
      }
    } catch (error) {
      console.error("Auth verify error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/auth/refresh
   * Refresh connection info from platform (project name, workspace, etc.)
   */
  app.post("/api/auth/refresh", async (req, res) => {
    try {
      let currentSettings = null;
      try {
        currentSettings = config.readSettings();
      } catch (error) {
        return res
          .status(401)
          .json({ error: "No CLI settings found. Please authenticate first." });
      }

      if (!currentSettings?.apiKey || !currentSettings?.projectId) {
        return res
          .status(401)
          .json({ error: "Not authenticated. Please connect first." });
      }

      const axios = require("axios");
      const platformUrl = getPlatformUrl(currentSettings);

      try {
        // Fetch project details from platform
        const projectRes = await axios.get(
          `${platformUrl}/api/projects/${currentSettings.projectId}`,
          {
            headers: {
              "X-API-Key": currentSettings.apiKey,
            },
            timeout: 10000,
          },
        );

        const project = projectRes.data?.data || projectRes.data;

        if (!project) {
          return res
            .status(404)
            .json({ error: "Project not found on platform" });
        }

        // Update local settings with latest from platform
        const updatedSettings = {
          ...currentSettings,
          projectName: project.name || currentSettings.projectName,
          workspaceName:
            project.workspace?.name || currentSettings.workspaceName,
          workspace: project.workspace || currentSettings.workspace,
        };
        config.writeSettings(updatedSettings);

        res.json({
          ok: true,
          projectId: updatedSettings.projectId,
          projectName: updatedSettings.projectName,
          workspaceName:
            updatedSettings.workspaceName || updatedSettings.workspace?.name,
          user: updatedSettings.user,
          linkedAt: updatedSettings.linkedAt,
        });
      } catch (fetchError) {
        console.error("Failed to fetch project info:", fetchError.message);

        if (config.isAuthError(fetchError)) {
          return res.status(401).json({
            error: "API key is invalid. Please re-authenticate.",
            authRequired: true,
          });
        }

        // Return current settings even if refresh failed
        res.json({
          ok: false,
          warning: "Could not refresh from platform - showing cached data",
          projectId: currentSettings.projectId,
          projectName: currentSettings.projectName,
          workspaceName:
            currentSettings.workspaceName || currentSettings.workspace?.name,
          user: currentSettings.user,
          linkedAt: currentSettings.linkedAt,
        });
      }
    } catch (error) {
      console.error("Auth refresh error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Store for active auth sessions
  const activeAuthSessions = new Map();

  /**
   * POST /api/auth/start
   * Initiates the browser-based authentication flow
   */
  app.post("/api/auth/start", async (req, res, next) => {
    try {
      const axios = require("axios");
      const pkg = require("../../package.json");
      const { getApiBaseUrl } = require("./api-client");
      const apiBaseUrl = getApiBaseUrl();

      // Initiate auth session with platform
      // Use default callback port since we'll poll instead
      const initiateResponse = await axios.post(
        `${apiBaseUrl}/auth/cli/initiate`,
        {
          callbackPort: 3721, // Default port, we'll poll instead of callback
          clientVersion: pkg.version,
        },
        { headers: { "Content-Type": "application/json" } },
      );

      const payload = initiateResponse.data?.data || initiateResponse.data;
      const { authUrl, authToken, expiresAt } = payload;

      if (!authUrl || !authToken) {
        return res.status(500).json({
          error: "Authentication session did not return a URL or token",
        });
      }

      // Store session for polling
      activeAuthSessions.set(authToken, {
        expiresAt,
        status: "pending",
        createdAt: new Date().toISOString(),
      });

      // Clean up expired sessions
      const now = Date.now();
      for (const [token, session] of activeAuthSessions) {
        if (session.expiresAt && Date.parse(session.expiresAt) < now) {
          activeAuthSessions.delete(token);
        }
      }

      res.json({
        ok: true,
        authUrl,
        authToken,
        expiresAt,
      });
    } catch (error) {
      console.error("Auth start error:", error.message);
      next(error);
    }
  });

  /**
   * GET /api/auth/status
   * Poll for authentication status
   */
  app.get("/api/auth/status", async (req, res, next) => {
    try {
      const { token } = req.query;

      if (!token) {
        return res.status(400).json({ error: "Auth token is required" });
      }

      const axios = require("axios");
      const { getApiBaseUrl } = require("./api-client");
      const apiBaseUrl = getApiBaseUrl();

      const statusResponse = await axios.get(`${apiBaseUrl}/auth/cli/status`, {
        params: { token },
      });

      const payload = statusResponse.data?.data || statusResponse.data;
      const { status, project, user } = payload;

      if (status === "completed" && project?.apiKey) {
        // Save settings
        const pkg = require("../../package.json");
        const { getApiBaseUrl } = require("./api-client");
        const apiBaseUrl = getApiBaseUrl();
        // Derive platformUrl from apiBaseUrl (remove /api suffix)
        const platformUrl =
          apiBaseUrl.replace(/\/api\/?$/, "") || "https://reshot.dev";

        config.writeSettings({
          projectId: project.id,
          projectName: project.name,
          apiKey: project.apiKey,
          platformUrl: platformUrl,
          workspace: project.workspace || null,
          workspaceName: project.workspace?.name || null,
          linkedAt: new Date().toISOString(),
          cliVersion: pkg.version,
          user: user
            ? {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
              }
            : null,
          settingsDir: config.SETTINGS_DIR,
        });

        // Clean up session
        activeAuthSessions.delete(token);

        res.json({
          ok: true,
          status: "completed",
          projectId: project.id,
          projectName: project.name,
          workspaceName: project.workspace?.name,
        });
      } else if (status === "expired") {
        activeAuthSessions.delete(token);
        res.json({
          ok: false,
          status: "expired",
          error: "Authentication token expired",
        });
      } else if (status === "invalid") {
        activeAuthSessions.delete(token);
        res.json({
          ok: false,
          status: "invalid",
          error: "Authentication session invalid",
        });
      } else {
        res.json({ ok: true, status: "pending" });
      }
    } catch (error) {
      console.error("Auth status error:", error.message);
      // If the token is invalid or expired on the platform side
      if (error.response?.status === 404 || error.response?.status === 400) {
        return res.json({
          ok: false,
          status: "expired",
          error: "Session not found or expired",
        });
      }
      next(error);
    }
  });

  /**
   * POST /api/auth/open-browser
   * Opens the auth URL in the user's browser
   */
  app.post("/api/auth/open-browser", async (req, res, next) => {
    try {
      const { authUrl } = req.body;

      if (!authUrl) {
        return res.status(400).json({ error: "authUrl is required" });
      }

      // open is ESM-only, require it with default fallback
      const openModule = require("open");
      const open = openModule.default || openModule;

      await open(authUrl, { wait: false });

      res.json({ ok: true, message: "Browser opened" });
    } catch (error) {
      console.error("Failed to open browser:", error.message);
      res.json({
        ok: false,
        error: "Failed to open browser. Please copy the URL manually.",
      });
    }
  });

  // ===== SYNC ENDPOINTS =====

  /**
   * GET /api/sync/status
   * Get comprehensive sync status including local assets and platform state
   */
  app.get("/api/sync/status", async (req, res, next) => {
    try {
      let currentSettings = null;
      try {
        currentSettings = config.readSettings();
      } catch (error) {
        return res
          .status(400)
          .json({ error: "No CLI settings found. Run `reshot auth` first." });
      }

      if (!currentSettings?.projectId || !currentSettings?.apiKey) {
        return res
          .status(400)
          .json({ error: "Missing projectId or apiKey in settings" });
      }

      // Get local assets summary
      const localOutputDir = path.join(process.cwd(), ".reshot", "output");
      const localAssets = findAssetFiles(localOutputDir);
      const groupedLocal = groupAssetsByScenario(localAssets, localOutputDir);

      // Get platform status
      let platformStatus = null;
      try {
        platformStatus = await apiClient.getSyncStatus(currentSettings.apiKey);
      } catch (error) {
        console.warn("Failed to fetch platform status:", error.message);
      }

      // Build summary
      const localSummary = {
        totalAssets: localAssets.length,
        scenarios: groupedLocal.map((g) => ({
          key: g.scenarioKey,
          variations: g.variationSlug,
          assetCount: g.assets.length,
        })),
        scenarioCount: new Set(groupedLocal.map((g) => g.scenarioKey)).size,
        variationCount: new Set(groupedLocal.map((g) => g.variationSlug)).size,
      };

      res.json({
        local: localSummary,
        platform: platformStatus,
        lastSyncedAt: currentSettings.lastSyncedAt || null,
        isAuthenticated: true,
        projectId: currentSettings.projectId,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/sync/diff
   * Get differences between local and remote config
   */
  app.get("/api/sync/diff", async (req, res, next) => {
    try {
      let currentSettings = null;
      try {
        currentSettings = config.readSettings();
      } catch (error) {
        return res
          .status(400)
          .json({ error: "No CLI settings found. Run `reshot auth` first." });
      }

      if (!currentSettings?.projectId || !currentSettings?.apiKey) {
        return res
          .status(400)
          .json({ error: "Missing projectId or apiKey in settings" });
      }

      let localConfig = null;
      if (config.configExists()) {
        try {
          localConfig = config.readConfig();
        } catch (error) {
          // Local config invalid
        }
      }

      let remoteConfig = null;
      try {
        remoteConfig = await apiClient.getProjectConfig(
          currentSettings.projectId,
          currentSettings.apiKey,
        );
      } catch (error) {
        // Remote fetch failed
      }

      res.json({
        local: localConfig,
        remote: remoteConfig,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/sync/pull
   * Pull config from platform and merge with local
   */
  app.post("/api/sync/pull", async (req, res, next) => {
    try {
      let currentSettings = null;
      try {
        currentSettings = config.readSettings();
      } catch (error) {
        return res
          .status(400)
          .json({ error: "No CLI settings found. Run `reshot auth` first." });
      }

      if (!currentSettings?.projectId || !currentSettings?.apiKey) {
        return res
          .status(400)
          .json({ error: "Missing projectId or apiKey in settings" });
      }

      const remoteConfig = await apiClient.getProjectConfig(
        currentSettings.projectId,
        currentSettings.apiKey,
      );

      // Merge strategy: use remote as base, preserve local-only fields if they exist
      let localConfig = null;
      if (config.configExists()) {
        try {
          localConfig = config.readConfig();
        } catch (error) {
          // Local config invalid, use remote as-is
        }
      }

      // For v1: simple merge - use remote config, but preserve _local metadata if present
      const mergedConfig = {
        ...remoteConfig,
        _metadata: {
          ...remoteConfig._metadata,
          ...(localConfig?._metadata || {}),
          lastSyncedAt: new Date().toISOString(),
        },
      };

      // Preserve local-only scenario metadata if present
      if (localConfig?.scenarios) {
        const localScenarioMap = new Map(
          localConfig.scenarios.map((s) => [s.key, s]),
        );
        mergedConfig.scenarios = mergedConfig.scenarios.map(
          (remoteScenario) => {
            const localScenario = localScenarioMap.get(remoteScenario.key);
            if (localScenario?._local) {
              return {
                ...remoteScenario,
                _local: localScenario._local,
              };
            }
            return remoteScenario;
          },
        );
      }

      config.writeConfig(mergedConfig);

      // Update settings
      const updatedSettings = {
        ...currentSettings,
        lastSyncedAt: new Date().toISOString(),
        projectName:
          mergedConfig._metadata?.projectName || currentSettings.projectName,
      };
      config.writeSettings(updatedSettings);

      // Save last remote config for diffing
      const lastRemotePath = path.join(
        process.cwd(),
        ".reshot",
        "last-remote-config.json",
      );
      fs.writeJSONSync(lastRemotePath, remoteConfig, { spaces: 2 });

      res.json({ ok: true, config: mergedConfig });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/sync/push
   * Push local assets to platform (uploads to Supabase/storage and creates Visual records)
   */
  app.post("/api/sync/push", async (req, res, next) => {
    try {
      const { commitMessage, selectedAssets } = req.body;

      // Check settings
      let currentSettings = null;
      try {
        currentSettings = config.readSettings();
      } catch (error) {
        return res
          .status(400)
          .json({ error: "No CLI settings found. Run `reshot auth` first." });
      }

      if (!currentSettings?.projectId || !currentSettings?.apiKey) {
        return res
          .status(400)
          .json({ error: "Missing projectId or apiKey in settings" });
      }

      const docSyncConfig = config.readConfig();

      // Find all asset files in output directory
      const outputDir = path.join(process.cwd(), ".reshot", "output");
      let assetFiles = findAssetFiles(outputDir);

      if (assetFiles.length === 0) {
        return res.json({
          ok: true,
          message: "No assets found to sync",
          assetsFound: 0,
        });
      }

      // Filter by selected assets if provided
      if (
        selectedAssets &&
        Array.isArray(selectedAssets) &&
        selectedAssets.length > 0
      ) {
        const selectedKeys = new Set();
        for (const group of selectedAssets) {
          for (const asset of group.assets) {
            const key = `${group.scenarioKey}/${group.variationSlug}/${asset.filename}`;
            selectedKeys.add(key);
          }
        }

        assetFiles = assetFiles.filter((filePath) => {
          const relativePath = path.relative(outputDir, filePath);
          const parts = relativePath.split(path.sep);
          if (parts.length >= 3) {
            const key = `${parts[0]}/${parts[1]}/${parts.slice(2).join("/")}`;
            return selectedKeys.has(key);
          }
          return false;
        });
      }

      // Group assets by scenario and variation
      const groupedAssets = groupAssetsByScenario(assetFiles, outputDir);

      // Build metadata for sync
      const syncAssets = [];
      const assetFilesMap = {};

      for (const group of groupedAssets) {
        const scenario = docSyncConfig.scenarios?.find(
          (s) => s.key === group.scenarioKey,
        );

        for (const asset of group.assets) {
          const ext = path.extname(asset.filename).slice(1).toLowerCase();
          const format = ["png", "jpg", "jpeg", "gif", "mp4", "webm"].includes(
            ext,
          )
            ? ext
            : "png";

          syncAssets.push({
            scenarioKey: group.scenarioKey,
            scenarioName: scenario?.name || group.scenarioKey,
            variationSlug: group.variationSlug,
            captureKey: asset.captureKey,
            filename: asset.filename,
            format,
          });

          const fileKey = `${group.scenarioKey}/${group.variationSlug}/${asset.filename}`;
          assetFilesMap[fileKey] = asset.path;
        }
      }

      // Build variation context mapping from config
      const variationContext = {};
      const variantsConfig = docSyncConfig?.variants || {};
      const dimensions = variantsConfig.dimensions || {};

      // Parse variation slugs into dimension values
      for (const group of groupedAssets) {
        const slug = group.variationSlug;
        if (!variationContext[slug] && slug !== "default") {
          // Try to parse slug like "en-admin-light"
          const parts = slug.split("-");
          const context = {};

          // Map parts to known dimensions (order: locale, role, theme)
          const dimKeys = Object.keys(dimensions);
          for (let i = 0; i < parts.length && i < dimKeys.length; i++) {
            const dimKey = dimKeys[i];
            context[dimKey] = parts[i];
          }

          variationContext[slug] = context;
        }
      }

      // Build sync metadata
      // Get git info if available
      let gitInfo = {};
      try {
        const { execSync } = require("child_process");
        gitInfo.commitHash = execSync("git rev-parse HEAD", {
          encoding: "utf-8",
        }).trim();
        gitInfo.branch = execSync("git rev-parse --abbrev-ref HEAD", {
          encoding: "utf-8",
        }).trim();
      } catch (e) {
        // Git not available or not in a repo
      }

      const metadata = {
        projectId: currentSettings.projectId,
        syncMode: "incremental",
        assets: syncAssets,
        variationContext,
        git: {
          ...gitInfo,
          commitMessage: commitMessage || gitInfo.commitMessage || undefined,
        },
        cli: {
          version: require("../../package.json").version,
          syncTimestamp: new Date().toISOString(),
        },
      };

      // Execute sync
      let result;
      try {
        result = await apiClient.syncPushAssets(
          currentSettings.apiKey,
          metadata,
          assetFilesMap,
          (progress) => {
            console.log("Sync progress:", progress);
          },
        );
      } catch (syncError) {
        // Check if this is an auth error
        const authHandled = handleApiError(syncError, res);
        if (authHandled) return authHandled;
        throw syncError;
      }

      // Update settings with last sync time
      const updatedSettings = {
        ...currentSettings,
        lastSyncedAt: new Date().toISOString(),
      };
      config.writeSettings(updatedSettings);

      res.json({
        ok: true,
        message: `Successfully synced ${result.processed} assets to platform`,
        ...result,
      });
    } catch (error) {
      console.error("Sync push error:", error);
      // Final check for auth errors
      const authHandled = handleApiError(error, res);
      if (authHandled) return authHandled;
      next(error);
    }
  });

  /**
   * PATCH /api/config/features
   * Update feature toggles in config metadata
   */
  app.patch("/api/config/features", async (req, res, next) => {
    try {
      const docSyncConfig = config.readConfig();
      const { features } = req.body;

      if (!docSyncConfig._metadata) {
        docSyncConfig._metadata = {};
      }

      docSyncConfig._metadata.features = {
        ...(docSyncConfig._metadata.features || {}),
        ...features,
      };

      config.writeConfig(docSyncConfig);

      res.json({ ok: true, features: docSyncConfig._metadata.features });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/remote/visuals
   * Get visuals from platform (read-only)
   */
  app.get("/api/remote/visuals", async (req, res, next) => {
    try {
      let currentSettings = null;
      try {
        currentSettings = config.readSettings();
      } catch (error) {
        return res
          .status(400)
          .json({ error: "No CLI settings found. Run `reshot auth` first." });
      }

      if (!currentSettings?.projectId) {
        return res.status(400).json({ error: "Missing projectId in settings" });
      }

      if (!currentSettings?.apiKey) {
        return res.status(400).json({ error: "Missing apiKey in settings" });
      }

      try {
        const visuals = await apiClient.getVisuals(
          currentSettings.projectId,
          currentSettings.apiKey,
        );
        res.json({ visuals });
      } catch (error) {
        // Gracefully handle API errors (endpoint might not exist or require auth)
        console.warn("Failed to fetch visuals from platform:", error.message);
        res.json({ visuals: [], error: error.message });
      }
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/remote/review-queue
   * Get review queue from platform (read-only)
   */
  app.get("/api/remote/review-queue", async (req, res, next) => {
    try {
      let currentSettings = null;
      try {
        currentSettings = config.readSettings();
      } catch (error) {
        return res
          .status(400)
          .json({ error: "No CLI settings found. Run `reshot auth` first." });
      }

      if (!currentSettings?.projectId) {
        return res.status(400).json({ error: "Missing projectId in settings" });
      }

      if (!currentSettings?.apiKey) {
        return res.status(400).json({ error: "Missing apiKey in settings" });
      }

      try {
        const queue = await apiClient.getReviewQueue(
          currentSettings.projectId,
          currentSettings.apiKey,
        );
        res.json({ queue });
      } catch (error) {
        // Gracefully handle API errors (endpoint might not exist)
        console.warn(
          "Failed to fetch review queue from platform:",
          error.message,
        );
        res.json({ queue: [], error: error.message });
      }
    } catch (error) {
      next(error);
    }
  });

  // ===== JOBS API =====
  const uiExecutor = require("./ui-executor");

  /**
   * GET /api/jobs
   * List all jobs
   */
  app.get("/api/jobs", async (req, res, next) => {
    try {
      // Clean up stuck jobs before returning
      uiExecutor.cleanupStuckJobs();
      const limit = parseInt(req.query.limit || "50", 10);
      const jobs = uiExecutor.getAllJobs(limit);
      res.json({ jobs });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/jobs/cleanup
   * Manually trigger cleanup of stuck jobs
   */
  app.post("/api/jobs/cleanup", async (req, res, next) => {
    try {
      const cleaned = uiExecutor.cleanupStuckJobs();
      res.json({ ok: true, cleaned });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/jobs/:id
   * Get a single job
   */
  app.get("/api/jobs/:id", async (req, res, next) => {
    try {
      const job = uiExecutor.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      res.json({ job });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/jobs/:id/logs
   * Get job logs (tail)
   */
  app.get("/api/jobs/:id/logs", async (req, res, next) => {
    try {
      const job = uiExecutor.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      const tail = parseInt(req.query.tail || "100", 10);
      const logs = job.logs.slice(-tail);
      res.json({ logs });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/jobs/:id/cancel
   * Cancel a running job
   */
  app.post("/api/jobs/:id/cancel", async (req, res, next) => {
    try {
      const jobId = req.params.id;
      const job = uiExecutor.getJob(jobId);

      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.status !== "running") {
        return res
          .status(400)
          .json({ error: `Cannot cancel job with status: ${job.status}` });
      }

      const cancelled = uiExecutor.cancelJob(jobId);
      res.json({ ok: true, cancelled });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/jobs/run
   * Create and execute a run job
   * @param {string[]} scenarioKeys - Scenario keys to run
   * @param {object} variant - Variant override
   * @param {string} format - Output format override: 'step-by-step-images' | 'summary-video'
   * @param {boolean} diff - Enable baseline diffing (optional, uses config if not specified)
   */
  app.post("/api/jobs/run", async (req, res, next) => {
    try {
      const { scenarioKeys, variant, format, diff, noPrivacy, noStyle } = req.body;
      const job = uiExecutor.createJob("run", {
        scenarioKeys,
        variant,
        format,
        diff,
        noPrivacy,
        noStyle,
      });

      // Execute asynchronously - don't await, return immediately
      setImmediate(async () => {
        try {
          await uiExecutor.executeRunJob(
            job.id,
            scenarioKeys,
            variant,
            format,
            diff,
            noPrivacy,
            noStyle,
          );
        } catch (err) {
          console.error("Run job execution failed:", err);
          // Error already logged in executor
        }
      });

      res.status(201).json({ ok: true, job });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/jobs/run-all-variations
   * Run a scenario with all possible variant combinations
   */
  app.post("/api/jobs/run-all-variations", async (req, res, next) => {
    try {
      const {
        scenarioKey,
        dimensions,
        format = "step-by-step-images",
      } = req.body;

      if (!scenarioKey) {
        return res.status(400).json({ error: "scenarioKey is required" });
      }

      // Get variants config from current config
      const currentConfig = config.configExists() ? config.readConfig() : {};
      const variantsConfig = currentConfig?.variants || {};
      const allDimensions = variantsConfig.dimensions || {};

      // Get scenario to use its name
      const scenario = currentConfig.scenarios?.find(
        (s) => s.key === scenarioKey,
      );
      const scenarioName = scenario?.name || scenarioKey;

      // Use provided dimensions or all available dimensions
      const dimensionsToUse = dimensions || Object.keys(allDimensions);

      // Generate all combinations
      const combinations = generateVariantCombinations(
        allDimensions,
        dimensionsToUse,
      );

      if (combinations.length === 0) {
        return res
          .status(400)
          .json({ error: "No variant combinations available" });
      }

      // Create a job for each combination
      const jobs = [];
      const formatLabel = format === "summary-video" ? "Video" : "Screenshots";

      for (const variant of combinations) {
        // Build a human-readable variant label
        const variantParts = [];
        for (const [dimKey, optionValue] of Object.entries(variant)) {
          const dimension = allDimensions[dimKey];
          if (dimension) {
            // Find option label or use value (options is an object keyed by option ID)
            const option = dimension.options?.[optionValue];
            const label = option?.name || option?.label || optionValue;
            variantParts.push(label);
          } else {
            variantParts.push(optionValue);
          }
        }
        const variantLabel = variantParts.join(" • ");

        // Create descriptive job name: "Scenario Name [English • Admin • Light] - Screenshots"
        const jobDescription = `${scenarioName} [${variantLabel}] - ${formatLabel}`;

        const job = uiExecutor.createJob("run", {
          scenarioKeys: [scenarioKey],
          variant,
          format,
          description: jobDescription,
        });

        jobs.push(job);

        // Execute asynchronously
        setImmediate(async () => {
          try {
            await uiExecutor.executeRunJob(
              job.id,
              [scenarioKey],
              variant,
              format,
            );
          } catch (err) {
            console.error(`Run job ${job.id} execution failed:`, err);
          }
        });
      }

      res.status(201).json({
        ok: true,
        jobs,
        totalVariations: combinations.length,
        combinations,
        format,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/jobs/publish
   * Create and execute a publish job - directly calls the platform API
   * Pre-checks auth before starting the job
   */
  app.post("/api/jobs/publish", async (req, res, next) => {
    try {
      const { scenarioKeys, selectedGroups, commitMessage } = req.body;

      // Pre-check authentication before starting job
      let currentSettings;
      try {
        currentSettings = config.readSettings();
      } catch (err) {
        return res
          .status(401)
          .json(
            config.createAuthErrorResponse(
              "Not authenticated. Please connect first.",
            ),
          );
      }

      if (!currentSettings?.apiKey || !currentSettings?.projectId) {
        return res
          .status(401)
          .json(
            config.createAuthErrorResponse(
              "API key or project ID not found. Please connect.",
            ),
          );
      }

      // Verify API key is still valid before starting publish
      const axios = require("axios");
      const platformUrl = getPlatformUrl(currentSettings);
      try {
        await axios.get(`${platformUrl}/api/auth/cli/verify`, {
          headers: { Authorization: `Bearer ${currentSettings.apiKey}` },
          timeout: 10000,
        });
      } catch (verifyError) {
        if (config.isAuthError(verifyError)) {
          return res
            .status(401)
            .json(
              config.createAuthErrorResponse(
                "Your API key has expired. Please reconnect to the platform.",
              ),
            );
        }
        // Network error - continue anyway, might work
        console.warn(
          "Could not verify API key before publish:",
          verifyError.message,
        );
      }

      // Extract scenario keys from selectedGroups if provided
      const effectiveScenarioKeys = selectedGroups
        ? [...new Set(selectedGroups.map((g) => g.scenarioKey))]
        : scenarioKeys;

      const job = uiExecutor.createJob("publish", {
        scenarioKeys: effectiveScenarioKeys,
        selectedGroups,
        commitMessage,
      });

      // Execute directly - don't spawn CLI subprocess
      setImmediate(async () => {
        try {
          await executeDirectPublish(job.id, selectedGroups, commitMessage);
        } catch (err) {
          console.error("Publish job execution failed:", err);
          uiExecutor.appendJobLog(job.id, `[error] ${err.message}`);

          // Check if this is an auth error and mark job appropriately
          if (config.isAuthError(err)) {
            uiExecutor.updateJobStatus(job.id, "failed", {
              error: err.message,
              authRequired: true,
            });
          } else {
            uiExecutor.updateJobStatus(job.id, "failed", {
              error: err.message,
            });
          }
        }
      });

      res.status(201).json({ ok: true, job });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Load all diff manifests from the output directory for attaching diff data to assets
   * @returns {Map} Map of "scenarioKey" -> manifest data
   */
  function loadDiffManifestsForPublish(outputBaseDir) {
    const manifests = new Map();
    if (!fs.existsSync(outputBaseDir)) return manifests;

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

        // Check for manifest in root AND in variant subdirectories
        const latestVersionDir = path.join(scenarioDir, latestVersion);

        // Recursive search for diff-manifest.json files
        const findManifests = (dir, relativePath = "") => {
          const items = fs.readdirSync(dir);
          for (const item of items) {
            const fullPath = path.join(dir, item);
            if (item === "diff-manifest.json") {
              try {
                const manifest = fs.readJSONSync(fullPath);
                const key = relativePath
                  ? `${scenarioKey}/${relativePath}`
                  : scenarioKey;
                manifests.set(key, manifest);
              } catch (e) {
                /* skip malformed */
              }
            } else if (
              fs.statSync(fullPath).isDirectory() &&
              item !== "diffs"
            ) {
              findManifests(
                fullPath,
                relativePath ? `${relativePath}/${item}` : item,
              );
            }
          }
        };

        findManifests(latestVersionDir);
      }
    } catch (e) {
      /* ignore */
    }
    return manifests;
  }

  /**
   * Get diff data for an asset from loaded manifests
   */
  function getDiffDataFromManifests(manifests, scenarioKey, captureKey) {
    // Try direct match first - check both with and without trailing slash
    for (const [key, manifest] of manifests.entries()) {
      if (key === scenarioKey || key.startsWith(`${scenarioKey}/`)) {
        const assetData = manifest.assets?.[captureKey];
        if (assetData) {
          return {
            diffPercentage:
              assetData.score != null ? assetData.score * 100 : null,
            diffStatus: assetData.status || null,
          };
        }
        // Also check with variant prefix patterns
        for (const [assetKey, data] of Object.entries(manifest.assets || {})) {
          if (assetKey.endsWith(`/${captureKey}`) || assetKey === captureKey) {
            return {
              diffPercentage: data.score != null ? data.score * 100 : null,
              diffStatus: data.status || null,
            };
          }
        }
      }
    }
    return null;
  }

  /**
   * Execute a direct publish to the platform API
   * Uses the transactional flow: presigned URLs -> direct R2 upload -> metadata commit
   * This bypasses Vercel serverless timeout limits
   */
  async function executeDirectPublish(jobId, selectedGroups, commitMessage) {
    uiExecutor.updateJobStatus(jobId, "running");
    uiExecutor.appendJobLog(
      jobId,
      "[info] Starting direct publish to platform...",
    );

    // Generate a unique session ID for this publish run
    // This ensures all assets from this run are grouped into ONE commit on the platform
    const crypto = require("crypto");
    const publishSessionId = crypto.randomUUID();
    uiExecutor.appendJobLog(
      jobId,
      `[info] Session ID: ${publishSessionId.substring(0, 8)}...`,
    );

    // Load diff manifests for attaching diff data to assets
    const outputBaseDir = path.join(process.cwd(), ".reshot", "output");
    const diffManifests = loadDiffManifestsForPublish(outputBaseDir);
    if (diffManifests.size > 0) {
      uiExecutor.appendJobLog(
        jobId,
        `[info] Loaded diff data from ${diffManifests.size} scenario(s)`,
      );
    }

    // Read settings
    let currentSettings;
    try {
      currentSettings = config.readSettings();
    } catch (err) {
      throw new Error("Not authenticated. Run 'reshot auth' first.");
    }

    const apiKey = currentSettings?.apiKey;
    const projectId = currentSettings?.projectId;

    if (!apiKey || !projectId) {
      throw new Error(
        "API key or project ID not found. Run 'reshot auth' first.",
      );
    }

    uiExecutor.appendJobLog(jobId, `[info] Project ID: ${projectId}`);
    uiExecutor.appendJobLog(
      jobId,
      `[info] API Key: ${apiKey.substring(0, 15)}...`,
    );

    // Read config for scenario metadata
    let docSyncConfig = null;
    try {
      docSyncConfig = config.readConfig();
    } catch (err) {
      uiExecutor.appendJobLog(
        jobId,
        "[warn] Could not read config, using minimal metadata",
      );
    }

    // Get git info
    const { execSync } = require("child_process");
    let commitHash = "unknown";
    let gitBranch = "main";
    let gitMessage = commitMessage || "CLI publish";
    try {
      commitHash = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
      try {
        gitBranch = execSync("git rev-parse --abbrev-ref HEAD", {
          encoding: "utf-8",
        }).trim();
      } catch (branchErr) {
        // Ignore branch error, use default
      }
      if (!commitMessage) {
        gitMessage = execSync("git log -1 --pretty=%B", {
          encoding: "utf-8",
        }).trim();
      }
    } catch (err) {
      uiExecutor.appendJobLog(jobId, "[warn] Could not get git info");
    }

    if (!selectedGroups || selectedGroups.length === 0) {
      throw new Error("No assets selected for publishing");
    }

    uiExecutor.appendJobLog(
      jobId,
      `[info] Publishing ${selectedGroups.length} variation group(s) using transactional flow`,
    );

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    let viewUrl = null;

    // Process each group using transactional flow
    for (const group of selectedGroups) {
      const { scenarioKey, variationSlug, assets } = group;

      if (!assets || assets.length === 0) {
        uiExecutor.appendJobLog(
          jobId,
          `[warn] Skipping ${scenarioKey}/${variationSlug} - no assets`,
        );
        continue;
      }

      uiExecutor.appendJobLog(
        jobId,
        `[info] Processing ${scenarioKey}/${variationSlug} (${assets.length} asset(s))`,
      );

      // Build metadata - include publishSessionId to group all assets into one commit
      const scenarioConfig = docSyncConfig?.scenarios?.find(
        (s) => s.key === scenarioKey,
      );
      const metadata = {
        projectId,
        publishSessionId, // Groups all assets from this publish run into ONE commit
        scenarioName: scenarioKey,
        scenario: scenarioConfig
          ? {
              name: scenarioConfig.name || scenarioKey,
              targetUrl: scenarioConfig.targetUrl,
              steps: scenarioConfig.steps,
            }
          : { name: scenarioKey },
        context: {
          name: variationSlug || "default",
          data: {},
        },
        git: {
          commitHash,
          commitMessage: gitMessage,
          branch: gitBranch,
        },
        cli: {
          version: require("../../package.json").version,
          captureTimestamp: new Date().toISOString(),
          features: ["steps", "transactional"],
        },
      };

      // Prepare files for signing
      const filesToSign = [];
      const { hashFile, getMimeType } = require("./hash");

      for (const asset of assets) {
        if (!fs.existsSync(asset.path)) {
          uiExecutor.appendJobLog(
            jobId,
            `[warn] Asset file not found: ${asset.path}`,
          );
          continue;
        }

        const fileStat = fs.statSync(asset.path);
        const hash = await hashFile(asset.path);
        const contentType = getMimeType(asset.path);
        // Group all assets by scenario+variant, not by individual captureKey
        // This creates ONE Visual per scenario+variant, with multiple assets (steps)
        const visualKey = `${scenarioKey}/${variationSlug || "default"}`;

        // Get diff data from manifest if available
        const diffData = getDiffDataFromManifests(
          diffManifests,
          scenarioKey,
          asset.captureKey,
        );

        filesToSign.push({
          key: asset.captureKey, // captureKey identifies the step within the visual
          visualKey, // visualKey groups all steps into one Visual
          path: asset.path,
          size: fileStat.size,
          contentType,
          hash,
          diffPercentage: diffData?.diffPercentage ?? null,
          diffStatus: diffData?.diffStatus ?? null,
        });
      }

      if (filesToSign.length === 0) {
        uiExecutor.appendJobLog(
          jobId,
          `[warn] No valid asset files for ${scenarioKey}/${variationSlug}`,
        );
        failCount += assets.length;
        continue;
      }

      try {
        // Step 1: Get presigned URLs
        uiExecutor.appendJobLog(
          jobId,
          `[info] Getting presigned URLs for ${filesToSign.length} files...`,
        );
        let signResponse;
        try {
          signResponse = await apiClient.signAssets(apiKey, {
            files: filesToSign.map((f) => ({
              key: f.key,
              contentType: f.contentType,
              size: f.size,
              hash: f.hash,
              visualKey: f.visualKey,
            })),
          });
        } catch (signError) {
          // Log detailed sign error
          const status = signError.response?.status;
          const statusText = signError.response?.statusText;
          const responseData = signError.response?.data;
          if (status) {
            uiExecutor.appendJobLog(
              jobId,
              `[error] Sign request failed: HTTP ${status} ${statusText || ""}`,
            );
            if (responseData?.error) {
              uiExecutor.appendJobLog(jobId, `[error] ${responseData.error}`);
            }
          }
          throw signError;
        }

        const { urls } = signResponse;

        if (!urls || Object.keys(urls).length === 0) {
          throw new Error("No presigned URLs returned from server");
        }

        // Step 2: Upload files directly to R2 (parallel with concurrency limit)
        uiExecutor.appendJobLog(
          jobId,
          `[info] Uploading ${filesToSign.length} file(s) to storage...`,
        );
        const CONCURRENCY = 5;
        const uploadQueue = [...filesToSign];
        const uploadResults = [];

        while (uploadQueue.length > 0) {
          const batch = uploadQueue.splice(0, CONCURRENCY);
          const batchPromises = batch.map(async (file) => {
            const compositeKey = `${file.visualKey}:${file.hash}`;
            const urlInfo = urls[compositeKey] || urls[file.visualKey] || urls[file.key];
            if (!urlInfo) {
              return {
                success: false,
                file,
                error: `No presigned URL for ${file.key} (visualKey: ${file.visualKey}, compositeKey: ${compositeKey})`,
              };
            }

            try {
              const fileBuffer = fs.readFileSync(file.path);
              await apiClient.uploadToPresignedUrl(
                urlInfo.uploadUrl,
                fileBuffer,
                { contentType: file.contentType },
              );
              return { success: true, file, s3Path: urlInfo.path };
            } catch (err) {
              // Extract detailed error info for debugging
              const status = err.response?.status;
              const statusText = err.response?.statusText;
              const responseData = err.response?.data;
              const errorDetail = status
                ? `HTTP ${status} ${statusText || ""} - ${
                    typeof responseData === "string"
                      ? responseData
                      : JSON.stringify(responseData) || err.message
                  }`
                : err.message;
              return { success: false, file, error: errorDetail };
            }
          });

          const results = await Promise.all(batchPromises);
          uploadResults.push(...results);
        }

        // Count successes and failures
        const successfulUploads = uploadResults.filter((r) => r.success);
        const failedUploads = uploadResults.filter((r) => !r.success);

        if (failedUploads.length > 0) {
          for (const failed of failedUploads.slice(0, 5)) {
            // Only log first 5 errors
            uiExecutor.appendJobLog(
              jobId,
              `[warn] Failed to upload ${failed.file.key}: ${failed.error}`,
            );
          }
          if (failedUploads.length > 5) {
            uiExecutor.appendJobLog(
              jobId,
              `[warn] ... and ${failedUploads.length - 5} more upload failures`,
            );
          }
        }

        if (successfulUploads.length === 0) {
          throw new Error("All file uploads failed");
        }

        // Step 3: Commit metadata to platform
        uiExecutor.appendJobLog(jobId, `[info] Committing metadata...`);
        const commitAssets = successfulUploads.map((r) => ({
          key: r.file.key,
          s3Path: r.s3Path,
          hash: r.file.hash,
          visualKey: r.file.visualKey,
          size: r.file.size,
          contentType: r.file.contentType,
          diffPercentage: r.file.diffPercentage,
          diffStatus: r.file.diffStatus,
        }));

        const result = await apiClient.publishTransactional(apiKey, {
          metadata,
          assets: commitAssets,
        });

        const processedCount =
          result?.assetsProcessed ?? successfulUploads.length;
        uiExecutor.appendJobLog(
          jobId,
          `[success] Published ${processedCount} asset(s) for ${scenarioKey}/${variationSlug}`,
        );
        successCount += processedCount;
        failCount += failedUploads.length;

        // Handle skipped assets (visual limit)
        if (result?.skippedAssets?.length > 0) {
          for (const key of result.skippedAssets) {
            uiExecutor.appendJobLog(
              jobId,
              `[warn] Skipped "${key}" (plan limit reached)`,
            );
          }
          skippedCount += result.skippedAssets.length;
        }

        // Capture viewUrl from first successful response
        if (!viewUrl && result?.viewUrl) {
          viewUrl = result.viewUrl;
        }
      } catch (err) {
        // Check if this is an auth error - if so, fail immediately with auth message
        if (config.isAuthError(err)) {
          uiExecutor.appendJobLog(
            jobId,
            `[error] Authentication failed: ${err.message}`,
          );
          uiExecutor.appendJobLog(
            jobId,
            `[error] Your API key may have expired. Please reconnect to the platform.`,
          );
          throw new Error(
            "Authentication failed. Please reconnect to the platform.",
          );
        }
        uiExecutor.appendJobLog(
          jobId,
          `[error] Failed ${scenarioKey}/${variationSlug}: ${err.message}`,
        );
        failCount += filesToSign.length;
      }
    }

    let summaryMsg = `[info] Publish complete: ${successCount} succeeded, ${failCount} failed`;
    if (skippedCount > 0) {
      summaryMsg += `, ${skippedCount} skipped (plan limit)`;
    }
    uiExecutor.appendJobLog(jobId, summaryMsg);

    if (viewUrl) {
      uiExecutor.appendJobLog(jobId, `[info] View in platform: ${viewUrl}`);
    }

    if (failCount > 0 && successCount === 0) {
      throw new Error(`All uploads failed (${failCount} assets)`);
    }

    uiExecutor.updateJobStatus(jobId, "success", {
      successCount,
      failCount,
      skippedCount,
      viewUrl,
    });
  }

  /**
   * POST /api/jobs/record
   * Create and execute a record job
   */
  app.post("/api/jobs/record", async (req, res, next) => {
    try {
      const { title, scenarioKey } = req.body;
      if (!title) {
        return res
          .status(400)
          .json({ error: "Title is required for record job" });
      }

      const job = uiExecutor.createJob("record", { title, scenarioKey });

      // Execute asynchronously - don't await, return immediately
      // Note: Record is interactive and may require Chrome to be running
      setImmediate(async () => {
        try {
          await uiExecutor.executeRecordJob(job.id, title, scenarioKey);
        } catch (err) {
          console.error("Record job execution failed:", err);
          // Error already logged in executor
        }
      });

      res.status(201).json({ ok: true, job });
    } catch (error) {
      next(error);
    }
  });

  attachRecorderRoutes(app, context);

  // Error handler
  app.use(handleError);
}

module.exports = {
  attachApiRoutes,
};
