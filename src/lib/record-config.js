// record-config.js - Config merging and scenario construction
const chalk = require("chalk");
const inquirer = require("inquirer");
const { readConfig, writeConfig, configExists } = require("./config");

/**
 * Parse a path-based visual name into groupPath and key
 * Supports "Folder/Subfolder/Name" syntax for tree-based organization
 * @param {string} pathName - Path-based name (e.g., "Settings/Billing/Invoices Table")
 * @returns {{ groupPath: string|null, key: string, name: string }}
 */
function parseVisualPath(pathName) {
  if (!pathName || typeof pathName !== "string") {
    return { groupPath: null, key: "", name: "" };
  }

  const parts = pathName
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { groupPath: null, key: "", name: "" };
  }

  // Last part is the visual name, rest is the group path
  const name = parts[parts.length - 1];
  const groupParts = parts.slice(0, -1);

  // Convert to kebab-case for storage
  const key = parts.map((p) => titleToKey(p)).join("/");
  const groupPath =
    groupParts.length > 0
      ? groupParts.map((p) => titleToKey(p)).join("/")
      : null;

  return { groupPath, key, name };
}

/**
 * Generate a kebab-case key from a title
 * @param {string} title - Human-readable title (e.g., "Admin Dashboard")
 * @returns {string} - Kebab-case key (e.g., "admin-dashboard")
 */
function titleToKey(title) {
  if (!title || typeof title !== "string") {
    return "";
  }

  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // Remove non-alphanumeric except spaces and hyphens
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-"); // Collapse multiple hyphens
}

function humanizeVisualKey(visualKey) {
  if (!visualKey) {
    return "";
  }
  // Handle path-based keys (e.g., "settings/billing/invoices-table")
  const parts = visualKey.split("/");
  const lastPart = parts[parts.length - 1];
  return lastPart
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getScenarioName(sessionState) {
  if (sessionState.existingScenario?.name) {
    return sessionState.existingScenario.name;
  }
  return humanizeVisualKey(sessionState.visualKey);
}

function readConfigSafe() {
  if (!configExists()) {
    return { scenarios: [] };
  }

  try {
    const cfg = readConfig();
    if (!cfg || typeof cfg !== "object") {
      return { scenarios: [] };
    }
    return {
      ...cfg,
      scenarios: Array.isArray(cfg.scenarios) ? cfg.scenarios : [],
    };
  } catch (error) {
    console.warn(chalk.yellow("⚠ Existing config is invalid, starting fresh"));
    return { scenarios: [] };
  }
}

function writeConfigSafe(config) {
  writeConfig({
    ...config,
    scenarios: Array.isArray(config.scenarios) ? config.scenarios : [],
  });
}

function findScenarioIndex(config, visualKey) {
  return config.scenarios.findIndex((scenario) => scenario.key === visualKey);
}

/**
 * Show visual selection menu
 * @param {Page} page - Playwright page object
 * @param {string|undefined} title - Optional title for auto-generating the key
 * @returns {Promise<{visualKey, existingScenario}>}
 */
async function showVisualSelectionMenu(page, title) {
  let existingScenarios = [];

  if (configExists()) {
    try {
      const config = readConfig();
      existingScenarios = config.scenarios || [];
    } catch (error) {
      // Config exists but is invalid, continue with empty scenarios
      console.warn(
        chalk.yellow("⚠ Existing config is invalid, starting fresh")
      );
    }
  }

  const choices = [{ name: "Create a new Visual", value: "new" }];

  if (existingScenarios.length > 0) {
    choices.push({ name: "Edit an existing Visual", value: "edit" });
  }

  const { mode } = await inquirer.prompt([
    {
      type: "list",
      name: "mode",
      message: "What would you like to do?",
      choices,
    },
  ]);

  if (mode === "new") {
    // Generate default path from title if provided (supports "Folder/Subfolder/Name" syntax)
    const defaultPath = title || "";

    console.log(
      chalk.gray(
        '\n💡 Tip: Use path syntax for organization (e.g., "Settings/Billing/Invoices Table")'
      )
    );
    console.log(
      chalk.gray("   This creates a folder structure in the platform UI.\n")
    );

    const { visualPath } = await inquirer.prompt([
      {
        type: "input",
        name: "visualPath",
        message:
          "Enter a path for this visual (e.g., Settings/Billing/Invoices Table):",
        default: defaultPath,
        validate: (input) => {
          if (!input || input.trim().length === 0) {
            return "Visual path cannot be empty";
          }
          const parsed = parseVisualPath(input);
          if (!parsed.key) {
            return "Invalid path format";
          }
          if (existingScenarios.find((s) => s.key === parsed.key)) {
            return "A visual with this path already exists";
          }
          return true;
        },
      },
    ]);

    const parsed = parseVisualPath(visualPath);
    return {
      visualKey: parsed.key,
      visualName: parsed.name,
      groupPath: parsed.groupPath,
      existingScenario: null,
    };
  } else {
    // Group existing scenarios by groupPath for better display
    const grouped = {};
    for (const s of existingScenarios) {
      const group = s.groupPath || "(root)";
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(s);
    }

    const choices = [];
    for (const [group, scenarios] of Object.entries(grouped).sort()) {
      if (group !== "(root)") {
        choices.push(new inquirer.Separator(`📁 ${group}`));
      }
      for (const s of scenarios) {
        const displayName = s.groupPath
          ? `  ${s.name} (${s.key.split("/").pop()})`
          : `${s.name} (${s.key})`;
        choices.push({ name: displayName, value: s.key });
      }
    }

    const { visualKey } = await inquirer.prompt([
      {
        type: "list",
        name: "visualKey",
        message: "Select a visual to edit:",
        choices,
      },
    ]);

    const existingScenario = existingScenarios.find((s) => s.key === visualKey);
    return {
      visualKey,
      visualName: existingScenario?.name,
      groupPath: existingScenario?.groupPath,
      existingScenario,
    };
  }
}

/**
 * Optional persona configuration wizard
 * @param {Object} sessionState - Recording session state
 * @returns {Promise<{contexts, matrix}>}
 */
async function maybeConfigurePersonas(sessionState) {
  const { wantsPersonas } = await inquirer.prompt([
    {
      type: "confirm",
      name: "wantsPersonas",
      message: "Would you like to define persona variations for this visual?",
      default: false,
    },
  ]);

  if (!wantsPersonas) {
    return { contexts: {}, matrix: undefined };
  }

  console.log(chalk.cyan("\n📝 Persona Configuration\n"));

  const contexts = {};
  const personaKeys = [];

  // Ask for base context
  const { wantsBase } = await inquirer.prompt([
    {
      type: "confirm",
      name: "wantsBase",
      message:
        "Do you want to define a base context (shared by all variations)?",
      default: false,
    },
  ]);

  if (wantsBase) {
    const { baseContextJson } = await inquirer.prompt([
      {
        type: "input",
        name: "baseContextJson",
        message: 'Enter base context as JSON (e.g., {"env":"staging"}):',
        default: "{}",
        validate: (input) => {
          try {
            JSON.parse(input);
            return true;
          } catch (e) {
            return "Invalid JSON: " + e.message;
          }
        },
      },
    ]);

    contexts.base = JSON.parse(baseContextJson);
  }

  // Collect persona contexts
  let addingPersonas = true;
  while (addingPersonas) {
    const { personaKey } = await inquirer.prompt([
      {
        type: "input",
        name: "personaKey",
        message: "Enter persona key (e.g., admin-persona):",
        validate: (input) => {
          if (!input || !input.match(/^[a-z0-9-]+$/)) {
            return "Persona key must contain only lowercase letters, numbers, and hyphens";
          }
          if (personaKeys.includes(input)) {
            return "This persona key already exists";
          }
          return true;
        },
      },
    ]);

    const { contextJson } = await inquirer.prompt([
      {
        type: "input",
        name: "contextJson",
        message: `Enter context for ${personaKey} as JSON:`,
        default: "{}",
        validate: (input) => {
          try {
            JSON.parse(input);
            return true;
          } catch (e) {
            return "Invalid JSON: " + e.message;
          }
        },
      },
    ]);

    contexts[personaKey] = JSON.parse(contextJson);
    personaKeys.push(personaKey);

    const { addMore } = await inquirer.prompt([
      {
        type: "confirm",
        name: "addMore",
        message: "Add another persona?",
        default: false,
      },
    ]);

    addingPersonas = addMore;
  }

  // Build simple matrix (single axis with all personas)
  const matrix = personaKeys.length > 0 ? [personaKeys] : undefined;

  return { contexts, matrix };
}

async function saveScenarioProgress(sessionState, page, options = {}) {
  const {
    finalize = false,
    uiMode = false,
    mergeMode: providedMergeMode,
  } = options;

  if (finalize) {
    return persistFinalScenario(sessionState, page, {
      uiMode,
      mergeMode: providedMergeMode,
    });
  }
  return persistInProgressScenario(sessionState, page);
}

async function persistInProgressScenario(sessionState, page) {
  const startIndex = sessionState.savedStepCount || 0;
  const newSteps = sessionState.capturedSteps.slice(startIndex);

  if (newSteps.length === 0) {
    return { wrote: false };
  }

  const config = readConfigSafe();
  const scenarioName = getScenarioName(sessionState);
  // Use custom scenarioUrl if provided, otherwise use current page URL
  const scenarioUrl = sessionState.scenarioUrl || page.url();

  let scenarioIndex = findScenarioIndex(config, sessionState.visualKey);

  if (scenarioIndex === -1) {
    config.scenarios.push({
      name: scenarioName,
      key: sessionState.visualKey,
      url: scenarioUrl,
      steps: [],
    });
    scenarioIndex = config.scenarios.length - 1;
  }

  const scenario = config.scenarios[scenarioIndex];
  scenario.steps = Array.isArray(scenario.steps) ? scenario.steps : [];

  // Check if any new step has _persistCropToScenario flag
  // This means the user wants the crop applied to all captures in this scenario
  for (const step of newSteps) {
    if (step._persistCropToScenario && step.crop) {
      // Persist crop to scenario-level output config
      if (!scenario.output) {
        scenario.output = { format: "step-by-step-images" };
      }
      scenario.output.crop = {
        enabled: step.crop.enabled,
        region: step.crop.region,
        scaleMode: step.crop.scaleMode || "none",
        preserveAspectRatio: step.crop.preserveAspectRatio !== false,
      };
      if (step.crop.padding) {
        scenario.output.crop.padding = step.crop.padding;
      }
      // Remove the flag and step-level crop since it's now at scenario level
      delete step._persistCropToScenario;
      delete step.crop;
      console.log(
        chalk.cyan(`  → Crop configuration saved to scenario output settings`)
      );
    }
  }

  scenario.steps.push(...newSteps);
  scenario.url = scenario.url || scenarioUrl;

  writeConfigSafe(config);
  sessionState.savedStepCount = sessionState.capturedSteps.length;

  return {
    wrote: true,
    scenarioName,
    scenarioKey: sessionState.visualKey,
    stepsAdded: newSteps.length,
    totalSteps: scenario.steps.length,
  };
}

async function persistFinalScenario(sessionState, page, options = {}) {
  const { uiMode = false, mergeMode: providedMergeMode } = options;

  const config = readConfigSafe();
  const scenarioKey = sessionState.visualKey;
  const scenarioName = getScenarioName(sessionState);
  // Use custom scenarioUrl if provided, otherwise use current page URL
  const scenarioUrl = sessionState.scenarioUrl || page.url();

  let scenarioIndex = findScenarioIndex(config, scenarioKey);
  const scenarioExists = scenarioIndex >= 0;
  const existingScenario = scenarioExists
    ? config.scenarios[scenarioIndex]
    : null;

  const mergePromptNeeded =
    scenarioExists &&
    (sessionState.existingScenario?.steps?.length ||
      existingScenario?.steps?.length);

  let mergeMode = providedMergeMode || "replace";

  if (mergePromptNeeded && !uiMode && !providedMergeMode) {
    const { mergeMode: selectedMerge } = await inquirer.prompt([
      {
        type: "list",
        name: "mergeMode",
        message: `A scenario with key '${scenarioKey}' already exists. What would you like to do?`,
        choices: [
          { name: "Replace existing scenario", value: "replace" },
          { name: "Append new steps to the end", value: "append" },
          { name: "Cancel", value: "cancel" },
        ],
      },
    ]);

    if (selectedMerge === "cancel") {
      console.log(chalk.yellow("Cancelled. Changes not saved."));
      return { wrote: false, cancelled: true };
    }

    mergeMode = selectedMerge;
  }

  const baselineSteps =
    mergeMode === "append"
      ? sessionState.existingScenario?.steps || existingScenario?.steps || []
      : [];

  const mergedSteps =
    mergeMode === "append"
      ? [...baselineSteps, ...sessionState.capturedSteps]
      : [...sessionState.capturedSteps];

  // In UI mode, skip the persona configuration wizard
  let contexts = {};
  let matrix = undefined;

  if (!uiMode) {
    const personaConfig = await maybeConfigurePersonas(sessionState);
    contexts = personaConfig.contexts;
    matrix = personaConfig.matrix;
  }

  // Default output configuration for automatic step-by-step image generation
  const defaultOutput = {
    format: "step-by-step-images",
  };

  // Parse groupPath from session state or existing scenario
  const groupPath =
    sessionState.groupPath || existingScenario?.groupPath || null;

  const finalScenario = {
    name: scenarioName,
    key: scenarioKey,
    url: scenarioUrl,
    // Group path for folder-based organization (Tree + Matrix model)
    ...(groupPath && { groupPath }),
    // Preserve existing output config or use default
    output: existingScenario?.output || defaultOutput,
    steps: mergedSteps,
  };

  if (matrix) {
    finalScenario.matrix = matrix;
  } else if (mergeMode === "append" && existingScenario?.matrix) {
    finalScenario.matrix = existingScenario.matrix;
  }

  if (Object.keys(contexts).length > 0) {
    finalScenario.contexts = contexts;
  } else if (mergeMode === "append" && existingScenario?.contexts) {
    finalScenario.contexts = existingScenario.contexts;
  }

  if (scenarioExists) {
    config.scenarios[scenarioIndex] = finalScenario;
  } else {
    config.scenarios.push(finalScenario);
  }

  writeConfigSafe(config);
  sessionState.savedStepCount = sessionState.capturedSteps.length;

  return {
    wrote: true,
    scenarioName,
    scenarioKey,
    stepsTotal: mergedSteps.length,
  };
}

/**
 * Finalize scenario and write to config
 * @param {Object} sessionState - Recording session state
 * @param {Page} page - Playwright page object
 * @param {Object} options - Options
 * @param {boolean} options.uiMode - If true, skip inquirer prompts
 * @param {string} options.mergeMode - Merge mode ('replace' or 'append')
 */
async function finalizeScenarioAndWriteConfig(
  sessionState,
  page,
  options = {}
) {
  const { uiMode = false, mergeMode } = options;

  if (!sessionState.saveOnQuit) {
    console.log(chalk.gray("Exiting without saving..."));
    return;
  }

  if (sessionState.capturedSteps.length === 0) {
    if (!uiMode) {
      const { confirmDiscard } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmDiscard",
          message: "No steps were recorded. Exit without saving?",
          default: true,
        },
      ]);

      if (confirmDiscard) {
        console.log(chalk.gray("Exited without saving."));
      } else {
        console.log(
          chalk.gray("No changes were saved because no steps were captured.")
        );
      }
    } else {
      console.log(chalk.gray("[UI Mode] No steps were recorded."));
    }
    return { wrote: false, noSteps: true };
  }

  console.log(chalk.cyan("\n📝 Finalizing scenario...\n"));

  const result = await saveScenarioProgress(sessionState, page, {
    finalize: true,
    uiMode,
    mergeMode,
  });

  if (!result?.wrote) {
    return result;
  }

  console.log(
    chalk.green(
      "\n✔ reshot.config.json has been updated. Please review and commit the changes to your repository.\n"
    )
  );
  console.log(chalk.gray(`Scenario: ${result.scenarioName}`));
  if (typeof result.stepsTotal === "number") {
    console.log(chalk.gray(`Steps captured: ${result.stepsTotal}`));
  }
  console.log(chalk.gray(`URL: ${page.url()}\n`));

  return result;
}

module.exports = {
  parseVisualPath,
  titleToKey,
  humanizeVisualKey,
  showVisualSelectionMenu,
  maybeConfigurePersonas,
  saveScenarioProgress,
  finalizeScenarioAndWriteConfig,
};
