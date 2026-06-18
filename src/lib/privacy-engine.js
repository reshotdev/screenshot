// privacy-engine.js - DOM-level PII masking via CSS injection
// Injects CSS rules into Playwright pages to hide/redact/blur sensitive elements
// before screenshots are taken. Zero-trust: data is obfuscated in the rendering engine.

const chalk = require("chalk");

/**
 * Data attribute used to identify privacy style tags.
 * Extracted as a constant to avoid hardcoded strings scattered across the codebase.
 */
const PRIVACY_STYLE_ATTR = "data-reshot-privacy";

/**
 * Valid masking methods and their CSS rules
 */
const MASKING_METHODS = {
  redact: (blurRadius) =>
    `color: transparent !important; background-color: currentColor !important;`,
  blur: (blurRadius) => `filter: blur(${blurRadius || 8}px) !important;`,
  hide: (blurRadius) => `visibility: hidden !important;`,
  remove: (blurRadius) => `display: none !important;`,
};

/**
 * Default privacy configuration
 */
const DEFAULT_PRIVACY_CONFIG = {
  enabled: true,
  method: "redact",
  blurRadius: 8,
  selectors: [],
};

/**
 * Normalize a selector entry to { selector, method, blurRadius } form.
 * Accepts either a plain string or an object with those fields.
 *
 * @param {string|Object} entry
 * @param {string} defaultMethod
 * @param {number} defaultBlurRadius
 * @returns {{ selector: string, method: string, blurRadius: number }|null}
 */
function normalizeSelector(entry, defaultMethod, defaultBlurRadius) {
  if (typeof entry === "string") {
    if (!entry.trim()) return null;
    return {
      selector: entry.trim(),
      method: defaultMethod,
      blurRadius: defaultBlurRadius,
    };
  }

  if (entry && typeof entry === "object" && entry.selector) {
    return {
      selector: entry.selector.trim(),
      method: entry.method || defaultMethod,
      blurRadius: entry.blurRadius || defaultBlurRadius,
    };
  }

  return null;
}

/**
 * Validate a privacy configuration object.
 *
 * @param {Object} config
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePrivacyConfig(config) {
  const errors = [];

  if (!config || typeof config !== "object") {
    return { valid: false, errors: ["Privacy config must be an object"] };
  }

  if (config.method && !MASKING_METHODS[config.method]) {
    errors.push(
      `Invalid masking method "${config.method}". Valid: ${Object.keys(MASKING_METHODS).join(", ")}`
    );
  }

  if (config.blurRadius !== undefined) {
    if (
      typeof config.blurRadius !== "number" ||
      config.blurRadius < 1 ||
      config.blurRadius > 100
    ) {
      errors.push("blurRadius must be a number between 1 and 100");
    }
  }

  if (config.selectors !== undefined) {
    if (!Array.isArray(config.selectors)) {
      errors.push("selectors must be an array");
    } else {
      for (let i = 0; i < config.selectors.length; i++) {
        const entry = config.selectors[i];
        if (typeof entry === "string") {
          if (!entry.trim()) {
            errors.push(`selectors[${i}] is empty`);
          }
        } else if (entry && typeof entry === "object") {
          if (!entry.selector || !entry.selector.trim()) {
            errors.push(`selectors[${i}].selector is required`);
          }
          if (entry.method && !MASKING_METHODS[entry.method]) {
            errors.push(
              `selectors[${i}].method "${entry.method}" is invalid`
            );
          }
        } else {
          errors.push(
            `selectors[${i}] must be a string or { selector, method?, blurRadius? }`
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Merge global privacy config with scenario/step overrides.
 * Selectors are ADDITIVE (union). method/blurRadius are overridden.
 *
 * @param {Object} globalConfig - Global privacy config
 * @param {Object} [overrides] - Scenario or step-level overrides
 * @returns {Object} Merged privacy config
 */
function mergePrivacyConfig(globalConfig, overrides) {
  if (!overrides) return { ...globalConfig };
  if (!globalConfig) return { ...DEFAULT_PRIVACY_CONFIG, ...overrides };

  // Selectors are additive (union), then deduplicated by normalized selector string
  const allSelectors = [
    ...(globalConfig.selectors || []),
    ...(overrides.selectors || []),
  ];
  const seen = new Set();
  const dedupedSelectors = [];
  for (const entry of allSelectors) {
    const key = typeof entry === "string" ? entry.trim() : (entry?.selector || "").trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      dedupedSelectors.push(entry);
    }
  }

  const merged = {
    enabled:
      overrides.enabled !== undefined ? overrides.enabled : globalConfig.enabled,
    method: overrides.method || globalConfig.method,
    blurRadius: overrides.blurRadius || globalConfig.blurRadius,
    selectors: dedupedSelectors,
  };

  return merged;
}

/**
 * Generate CSS string from a privacy config.
 * Each selector gets its own rule so one invalid selector doesn't break others.
 *
 * @param {Object} config - Privacy config with method, blurRadius, selectors
 * @returns {string} CSS text
 */
function generatePrivacyCSS(config) {
  if (!config || !config.selectors || config.selectors.length === 0) {
    return "";
  }

  const defaultMethod = config.method || "redact";
  const defaultBlurRadius = config.blurRadius || 8;
  const rules = [];

  for (const entry of config.selectors) {
    const normalized = normalizeSelector(entry, defaultMethod, defaultBlurRadius);
    if (!normalized) continue;

    // Validate the selector before generating CSS
    const validation = validateCSSSelector(normalized.selector);
    if (!validation.valid) {
      console.warn(
        chalk.yellow(`  ⚠ Skipping invalid privacy selector "${normalized.selector}": ${validation.reason}`)
      );
      continue;
    }

    const cssRule = MASKING_METHODS[normalized.method];
    if (!cssRule) continue;

    rules.push(
      `${normalized.selector} { ${cssRule(normalized.blurRadius)} }`
    );
  }

  return rules.join("\n");
}

/**
 * Inject privacy masking CSS into a Playwright page.
 * Also sets up re-injection on SPA route changes via framenavigated event.
 *
 * Returns a result object so callers can detect injection failures and
 * abort captures rather than proceeding unmasked.
 *
 * @param {import('playwright').Page} page
 * @param {Object} privacyConfig - Privacy config
 * @param {Function} [logger] - Logging function
 * @returns {Promise<{ success: boolean, injectedCount?: number, failedSelectors?: string[], error?: string }>}
 */
async function injectPrivacyMasking(page, privacyConfig, logger) {
  if (!privacyConfig || !privacyConfig.enabled) {
    return { success: true, injectedCount: 0, failedSelectors: [] };
  }
  if (!privacyConfig.selectors || privacyConfig.selectors.length === 0) {
    return { success: true, injectedCount: 0, failedSelectors: [] };
  }

  const css = generatePrivacyCSS(privacyConfig);
  if (!css) {
    return { success: true, injectedCount: 0, failedSelectors: [] };
  }

  try {
    // Inject our identified style tag (remove stale ones first)
    await page.evaluate(({ cssContent, attr }) => {
      document
        .querySelectorAll(`style[${attr}]`)
        .forEach((el) => el.remove());

      const style = document.createElement("style");
      style.setAttribute(attr, "true");
      style.textContent = cssContent;
      (document.head || document.documentElement).appendChild(style);
    }, { cssContent: css, attr: PRIVACY_STYLE_ATTR });

    // Verify the style tag actually exists in the DOM
    const verified = await page.evaluate((attr) => {
      return document.querySelectorAll(`style[${attr}]`).length > 0;
    }, PRIVACY_STYLE_ATTR);

    if (!verified) {
      const errMsg = "Privacy style tag not found in DOM after injection";
      // Non-suppressible warning — always print even in quiet mode
      console.error(chalk.red(`  ✖ PRIVACY: ${errMsg}`));
      return { success: false, error: errMsg, injectedCount: 0, failedSelectors: [] };
    }
  } catch (e) {
    const errMsg = `Failed to inject privacy CSS: ${e.message}`;
    // Non-suppressible warning — always print even in quiet mode
    console.error(chalk.red(`  ✖ PRIVACY: ${errMsg}`));
    return { success: false, error: errMsg, injectedCount: 0, failedSelectors: [] };
  }

  // Re-inject on SPA route changes (respects pause flag for race-free removal)
  const reinjectionHandler = async (frame) => {
    if (frame === page.mainFrame() && !page._reshotPrivacyPaused) {
      try {
        await page.evaluate(({ cssContent, attr }) => {
          document
            .querySelectorAll(`style[${attr}]`)
            .forEach((el) => el.remove());
          const style = document.createElement("style");
          style.setAttribute(attr, "true");
          style.textContent = cssContent;
          (document.head || document.documentElement).appendChild(style);
        }, { cssContent: css, attr: PRIVACY_STYLE_ATTR });
      } catch (_e) {
        // Page might have closed, ignore
      }
    }
  };

  page.on("framenavigated", reinjectionHandler);

  // Store handler reference for cleanup
  if (!page._reshotPrivacyHandlers) {
    page._reshotPrivacyHandlers = [];
  }
  page._reshotPrivacyHandlers.push(reinjectionHandler);

  if (logger) {
    const selectorCount = privacyConfig.selectors.length;
    const method = privacyConfig.method || "redact";
    logger(
      chalk.gray(
        `  → Privacy masking: ${selectorCount} selector(s), method=${method}`
      )
    );
  }

  return { success: true, injectedCount: privacyConfig.selectors.length, failedSelectors: [] };
}

/**
 * Remove all privacy masking CSS from a Playwright page.
 * Also removes framenavigated event handlers.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<void>}
 */
async function removePrivacyMasking(page) {
  try {
    await page.evaluate((attr) => {
      document
        .querySelectorAll(`style[${attr}]`)
        .forEach((el) => el.remove());
    }, PRIVACY_STYLE_ATTR);
  } catch (_e) {
    // Page might have closed
  }

  // Remove framenavigated handlers
  if (page._reshotPrivacyHandlers) {
    for (const handler of page._reshotPrivacyHandlers) {
      page.removeListener("framenavigated", handler);
    }
    page._reshotPrivacyHandlers = [];
  }
}

/**
 * Generate privacy CSS as a string for injection via addInitScript (video captures).
 * Returns a self-executing script that injects the CSS before page load.
 *
 * @param {Object} privacyConfig
 * @returns {string} JavaScript code to inject as init script
 */
function generatePrivacyInitScript(privacyConfig) {
  if (!privacyConfig || !privacyConfig.enabled) return null;
  if (!privacyConfig.selectors || privacyConfig.selectors.length === 0)
    return null;

  const css = generatePrivacyCSS(privacyConfig);
  if (!css) return null;

  return css;
}

/**
 * Pause privacy CSS re-injection on framenavigated events.
 * Call before removePrivacyMasking in step-level override blocks
 * to prevent the handler from re-adding CSS that was just removed.
 *
 * @param {import('playwright').Page} page
 */
function pausePrivacyReinjection(page) {
  page._reshotPrivacyPaused = true;
}

/**
 * Resume privacy CSS re-injection on framenavigated events.
 *
 * @param {import('playwright').Page} page
 */
function resumePrivacyReinjection(page) {
  page._reshotPrivacyPaused = false;
}

/**
 * Validate a CSS selector string for safety.
 * Rejects HTML injection attempts, excessively long selectors,
 * and characters that are clearly not valid CSS.
 *
 * @param {string} selector
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateCSSSelector(selector) {
  if (typeof selector !== "string") {
    return { valid: false, reason: "Selector must be a string" };
  }
  const trimmed = selector.trim();
  if (!trimmed) {
    return { valid: false, reason: "Selector is empty" };
  }
  if (trimmed.length > 500) {
    return { valid: false, reason: "Selector exceeds 500 characters" };
  }
  // Block HTML/script injection via </style> or <script> tags
  if (/<\/?[a-z]/i.test(trimmed)) {
    return { valid: false, reason: "Selector contains HTML tags" };
  }
  // Block characters that should never appear in a CSS selector
  // Allow typical CSS chars: letters, digits, -, _, ., #, [, ], =, ", ', :, (, ), *, +, ~, >, ^, |, $, comma, space, @
  if (/[{}<;]/.test(trimmed)) {
    return { valid: false, reason: "Selector contains invalid characters" };
  }
  return { valid: true };
}

module.exports = {
  DEFAULT_PRIVACY_CONFIG,
  PRIVACY_STYLE_ATTR,
  MASKING_METHODS,
  normalizeSelector,
  validatePrivacyConfig,
  mergePrivacyConfig,
  generatePrivacyCSS,
  injectPrivacyMasking,
  removePrivacyMasking,
  generatePrivacyInitScript,
  pausePrivacyReinjection,
  resumePrivacyReinjection,
  validateCSSSelector,
};
