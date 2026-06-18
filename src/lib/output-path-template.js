// output-path-template.js - Output path templating with variable interpolation
// Allows developers to define custom output paths: "./docs/assets/{{locale}}/{{name}}.png"

const path = require("path");
const fs = require("fs-extra");

/**
 * Supported template variables:
 * - {{scenario}} / {{scenarioKey}} - Scenario key
 * - {{scenarioName}} - Human-readable scenario name
 * - {{name}} / {{assetName}} - Asset/screenshot name
 * - {{step}} / {{stepIndex}} - Step index (1-based)
 * - {{locale}} - Current locale from variant (e.g., "en", "ko")
 * - {{role}} - Current role from variant (e.g., "admin", "viewer")
 * - {{theme}} - Current theme from variant (e.g., "light", "dark")
 * - {{variant}} - Full variant slug (e.g., "locale-en_role-admin_theme-dark")
 * - {{timestamp}} - ISO timestamp for this run
 * - {{date}} - Date portion (YYYY-MM-DD)
 * - {{time}} - Time portion (HH-MM-SS)
 * - {{viewport}} - Viewport preset name or WxH (e.g., "desktop", "1280x720")
 * - {{viewportWidth}} - Viewport width
 * - {{viewportHeight}} - Viewport height
 * - {{ext}} / {{extension}} - File extension (default: "png")
 * 
 * Custom dimension variables are also supported automatically from variant config.
 */

/**
 * Default output template when none specified
 */
const DEFAULT_OUTPUT_TEMPLATE = ".reshot/output/{{scenario}}/{{timestamp}}/{{variant}}/{{name}}.{{ext}}";

/**
 * Template presets for common use cases
 */
const TEMPLATE_PRESETS = {
  default: DEFAULT_OUTPUT_TEMPLATE,
  
  // Flat structure - all assets in one folder per scenario
  flat: ".reshot/output/{{scenario}}/{{name}}_{{variant}}.{{ext}}",
  
  // Locale-first organization (good for i18n documentation)
  "locale-first": "./docs/{{locale}}/{{scenario}}/{{name}}.{{ext}}",
  
  // Versioned by timestamp
  versioned: ".reshot/output/{{scenario}}/{{date}}_{{time}}/{{variant}}/{{name}}.{{ext}}",
  
  // Simple docs structure
  docs: "./docs/assets/{{scenario}}/{{name}}.{{ext}}",
  
  // Variant-focused (good for matrix testing)
  "variant-matrix": ".reshot/output/{{scenario}}/{{locale}}/{{role}}/{{theme}}/{{name}}.{{ext}}",
  
  // GitHub Pages / Static site friendly
  "static-site": "./public/screenshots/{{locale}}/{{scenario}}/{{name}}.{{ext}}",
  
  // Local CLI artifacts
  cli: "./artifacts/screenshots/{{scenario}}/{{viewport}}/{{variant}}/{{name}}.{{ext}}",
};

/**
 * Parse a template string and extract all variable names
 * @param {string} template - Template string with {{variable}} placeholders
 * @returns {string[]} Array of variable names found in template
 */
function parseTemplateVariables(template) {
  const regex = /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g;
  const variables = [];
  let match;
  
  while ((match = regex.exec(template)) !== null) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }
  
  return variables;
}

/**
 * Build context object from capture state
 * @param {Object} options - Capture context options
 * @returns {Object} Template context with all available variables
 */
function buildTemplateContext(options = {}) {
  const {
    scenario = {},
    assetName = "screenshot",
    stepIndex = 0,
    variant = {},
    timestamp = null,
    viewport = { width: 1280, height: 720 },
    viewportPresetName = null,
    extension = "png",
    customVariables = {},
  } = options;

  // Handle timestamp - can be a Date, ISO string, or pre-formatted string (YYYY-MM-DD_HH-MM-SS)
  let isoTimestamp;
  let datePart;
  let timePart;
  
  if (timestamp) {
    // Check if timestamp is already in our formatted format (YYYY-MM-DD_HH-MM-SS)
    const formattedMatch = String(timestamp).match(/^(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})$/);
    if (formattedMatch) {
      // Already formatted, use directly
      isoTimestamp = timestamp;
      datePart = formattedMatch[1];
      timePart = formattedMatch[2];
    } else {
      // Try to parse as Date
      const now = new Date(timestamp);
      if (!isNaN(now.getTime())) {
        isoTimestamp = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
        [datePart, timePart] = isoTimestamp.split("_");
      } else {
        // Fall back to current time
        const fallback = new Date();
        isoTimestamp = fallback.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
        [datePart, timePart] = isoTimestamp.split("_");
      }
    }
  } else {
    // No timestamp provided, use current time
    const now = new Date();
    isoTimestamp = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
    [datePart, timePart] = isoTimestamp.split("_");
  }

  // Build variant slug from all variant dimensions
  const variantSlug = Object.entries(variant)
    .filter(([_, v]) => v != null)
    .map(([k, v]) => `${k}-${v}`)
    .join("_") || "default";

  // Core context
  const context = {
    // Scenario info
    scenario: scenario.key || "unknown",
    scenarioKey: scenario.key || "unknown",
    scenarioName: (scenario.name || scenario.key || "unknown").replace(/[^a-zA-Z0-9-_]/g, "-"),
    
    // Asset info
    name: assetName,
    assetName: assetName,
    step: String(stepIndex + 1), // 1-based for human readability
    stepIndex: String(stepIndex),
    
    // Variant info - individual dimensions
    locale: variant.locale || "default",
    role: variant.role || "default",
    theme: variant.theme || "default",
    variant: variantSlug,
    
    // Timestamp info
    timestamp: isoTimestamp,
    date: datePart,
    time: timePart,
    
    // Viewport info
    viewport: viewportPresetName || `${viewport.width}x${viewport.height}`,
    viewportWidth: String(viewport.width),
    viewportHeight: String(viewport.height),
    
    // Extension
    ext: extension,
    extension: extension,
  };

  // Add any custom variant dimensions dynamically
  for (const [key, value] of Object.entries(variant)) {
    if (!context[key]) {
      context[key] = String(value);
    }
  }

  // Add any custom variables provided
  for (const [key, value] of Object.entries(customVariables)) {
    context[key] = String(value);
  }

  return context;
}

/**
 * Resolve a template string with context values
 * @param {string} template - Template string or preset name
 * @param {Object} context - Context object with variable values
 * @returns {string} Resolved path string
 */
function resolveTemplate(template, context = {}) {
  // Check if template is a preset name
  const actualTemplate = TEMPLATE_PRESETS[template] || template || DEFAULT_OUTPUT_TEMPLATE;
  
  // Replace all {{variable}} placeholders
  let resolved = actualTemplate.replace(/\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g, (match, varName) => {
    const value = context[varName];
    if (value !== undefined && value !== null) {
      return String(value);
    }
    // Unknown variables are replaced with empty string
    return "";
  });

  // Clean up any double slashes from empty replacements
  resolved = resolved.replace(/\/+/g, "/");
  
  // Remove leading ./ if present and path is absolute
  if (path.isAbsolute(resolved.replace(/^\.\//, ""))) {
    resolved = resolved.replace(/^\.\//, "");
  }

  return resolved;
}

/**
 * Resolve output path for a capture
 * @param {string} templateOrPreset - Template string, preset name, or null for default
 * @param {Object} options - Capture context options (see buildTemplateContext)
 * @returns {string} Fully resolved output file path
 */
function resolveOutputPath(templateOrPreset, options = {}) {
  const context = buildTemplateContext(options);
  return resolveTemplate(templateOrPreset, context);
}

/**
 * Resolve output directory (without filename) for a capture run
 * Useful for creating directories before capture
 * @param {string} templateOrPreset - Template string or preset name
 * @param {Object} options - Capture context options
 * @returns {string} Resolved directory path
 */
function resolveOutputDirectory(templateOrPreset, options = {}) {
  const fullPath = resolveOutputPath(templateOrPreset, options);
  return path.dirname(fullPath);
}

/**
 * Validate a template string
 * @param {string} template - Template string to validate
 * @returns {{ valid: boolean, error?: string, variables?: string[] }}
 */
function validateTemplate(template) {
  if (!template || typeof template !== "string") {
    return { valid: false, error: "Template must be a non-empty string" };
  }

  // Check for valid template syntax
  const variables = parseTemplateVariables(template);
  
  // Check for unbalanced braces
  const openBraces = (template.match(/\{\{/g) || []).length;
  const closeBraces = (template.match(/\}\}/g) || []).length;
  if (openBraces !== closeBraces) {
    return { valid: false, error: "Unbalanced template braces - check {{}} syntax" };
  }

  // Check for invalid variable syntax
  const invalidMatches = template.match(/\{\{[^}]*[^a-zA-Z0-9_}][^}]*\}\}/g);
  if (invalidMatches) {
    return { 
      valid: false, 
      error: `Invalid variable syntax: ${invalidMatches.join(", ")}. Variables must be alphanumeric with underscores.`
    };
  }

  // Must include at least {{name}} or {{assetName}} to be useful
  if (!variables.includes("name") && !variables.includes("assetName")) {
    return {
      valid: true,
      warning: "Template should include {{name}} or {{assetName}} to distinguish different captures",
      variables,
    };
  }

  return { valid: true, variables };
}

/**
 * Get list of available template presets
 * @returns {Array<{name: string, template: string, description: string}>}
 */
function getTemplatePresets() {
  return [
    { name: "default", template: TEMPLATE_PRESETS.default, description: "Standard versioned output" },
    { name: "flat", template: TEMPLATE_PRESETS.flat, description: "Flat structure with variant suffix" },
    { name: "locale-first", template: TEMPLATE_PRESETS["locale-first"], description: "Organized by locale for i18n docs" },
    { name: "versioned", template: TEMPLATE_PRESETS.versioned, description: "Date-based versioning" },
    { name: "docs", template: TEMPLATE_PRESETS.docs, description: "Simple docs asset structure" },
    { name: "variant-matrix", template: TEMPLATE_PRESETS["variant-matrix"], description: "Hierarchical by variant dimensions" },
    { name: "static-site", template: TEMPLATE_PRESETS["static-site"], description: "GitHub Pages / static site friendly" },
    { name: "cli", template: TEMPLATE_PRESETS.cli, description: "Local CLI artifact organization" },
  ];
}

/**
 * Ensure output directory exists
 * @param {string} filePath - Full file path
 */
function ensureOutputDirectory(filePath) {
  const dir = path.dirname(filePath);
  fs.ensureDirSync(dir);
}

module.exports = {
  DEFAULT_OUTPUT_TEMPLATE,
  TEMPLATE_PRESETS,
  parseTemplateVariables,
  buildTemplateContext,
  resolveTemplate,
  resolveOutputPath,
  resolveOutputDirectory,
  validateTemplate,
  getTemplatePresets,
  ensureOutputDirectory,
};
