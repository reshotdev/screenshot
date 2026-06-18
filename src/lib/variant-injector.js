/**
 * Universal Variant Injector
 *
 * Supports multiple injection methods for applying variants to browser contexts:
 * - localStorage: Set values in window.localStorage
 * - sessionStorage: Set values in window.sessionStorage
 * - cookie: Set document.cookie values
 * - urlParam: Append query parameters to navigation URLs
 * - browser: Set Playwright browser context options (locale, timezone)
 * - script: Execute custom JavaScript before page load
 * - header: Set custom HTTP headers (requires route interception)
 *
 * This allows clients to use whatever method their application supports
 * for variant switching (RBAC, i18n, themes, feature flags, etc.)
 */

const chalk = require("chalk");

/**
 * Injection method types
 * @typedef {'localStorage' | 'sessionStorage' | 'cookie' | 'urlParam' | 'browser' | 'script' | 'header'} InjectionMethod
 */

/**
 * @typedef {Object} InjectionConfig
 * @property {InjectionMethod} method - The injection method to use
 * @property {string} [key] - Key for storage-based methods
 * @property {string} [value] - Value to inject
 * @property {string} [name] - Name for cookie method
 * @property {string} [locale] - Browser locale for browser method
 * @property {string} [timezone] - Timezone for browser method
 * @property {string} [code] - JavaScript code for script method
 * @property {string} [header] - Header name for header method
 * @property {string} [param] - URL parameter name for urlParam method
 * @property {Object} [options] - Additional options (e.g., cookie settings)
 */

/**
 * Resolve variant configuration from scenario and global variants config
 *
 * @param {Object} scenario - The scenario with variant selections
 * @param {Object} variantsConfig - Global variants configuration
 * @returns {Object} Resolved variant with all injection configs
 */
function resolveVariantConfig(scenario, variantsConfig = {}) {
  const dimensions = variantsConfig.dimensions || {};
  const presets = variantsConfig.presets || {};

  // Check if scenario uses a preset
  const presetKey = scenario.variantPreset || scenario.preset;
  if (presetKey && presets[presetKey]) {
    const preset = presets[presetKey];
    // Resolve preset values to full variant config
    return resolveVariantValues(preset.values, dimensions);
  }

  // Check for individual variant dimension selections
  const variantValues = scenario.variant || {};

  // Also support legacy flat format: scenario.locale, scenario.role
  if (scenario.locale && !variantValues.locale) {
    variantValues.locale = scenario.locale;
  }
  if (scenario.role && !variantValues.role) {
    variantValues.role = scenario.role;
  }

  if (Object.keys(variantValues).length === 0) {
    return null;
  }

  return resolveVariantValues(variantValues, dimensions);
}

/**
 * Resolve variant values to full injection configuration
 *
 * @param {Object} values - Map of dimension key to option key (e.g., { locale: 'ko', role: 'admin' })
 * @param {Object} dimensions - Global dimension definitions
 * @returns {Object} Resolved config with injections array and metadata
 */
function resolveVariantValues(values, dimensions) {
  const result = {
    injections: [],
    browserOptions: {},
    urlParams: {},
    headers: {},
    metadata: {},
    summary: [],
  };

  for (const [dimensionKey, optionKey] of Object.entries(values)) {
    const dimension = dimensions[dimensionKey];
    if (!dimension) {
      console.warn(
        chalk.yellow(`  ⚠ Unknown variant dimension: ${dimensionKey}`)
      );
      continue;
    }

    const option = dimension.options?.[optionKey];
    if (!option) {
      console.warn(
        chalk.yellow(
          `  ⚠ Unknown option "${optionKey}" for dimension "${dimensionKey}"`
        )
      );
      continue;
    }

    // Add to summary for logging
    result.summary.push(
      `${dimension.label || dimensionKey}: ${option.name || optionKey}`
    );

    // Store metadata
    if (option.metadata) {
      result.metadata[dimensionKey] = option.metadata;
    }

    // Process injections
    const injections = option.inject || [];
    for (const injection of injections) {
      processInjection(injection, result);
    }
  }

  return result.injections.length > 0 ||
    Object.keys(result.browserOptions).length > 0
    ? result
    : null;
}

/**
 * Process a single injection config and add to result
 */
function processInjection(injection, result) {
  const { method } = injection;

  switch (method) {
    case "localStorage":
    case "sessionStorage":
      result.injections.push({
        method,
        key: injection.key,
        value: injection.value,
      });
      
      // CRITICAL FIX: Auto-derive colorScheme from theme localStorage value
      // This ensures Playwright's prefers-color-scheme media query matches the theme
      // Match keys that contain 'theme' (case-insensitive) e.g., 'theme', 'reshot-theme', 'app-theme'
      const keyLower = String(injection.key).toLowerCase();
      if (keyLower.includes("theme") && !result.browserOptions.colorScheme) {
        const themeValue = String(injection.value).toLowerCase();
        if (themeValue === "dark" || themeValue === "night" || themeValue.includes("dark")) {
          result.browserOptions.colorScheme = "dark";
        } else if (themeValue === "light" || themeValue === "day" || themeValue.includes("light")) {
          result.browserOptions.colorScheme = "light";
        }
      }
      break;

    case "cookie":
      result.injections.push({
        method: "cookie",
        name: injection.name,
        value: injection.value,
        options: injection.options || {},
      });
      
      // CRITICAL FIX: Also derive colorScheme from theme cookie value
      // Match names that contain 'theme' (case-insensitive)
      const cookieNameLower = String(injection.name).toLowerCase();
      if (cookieNameLower.includes("theme") && !result.browserOptions.colorScheme) {
        const themeValue = String(injection.value).toLowerCase();
        if (themeValue === "dark" || themeValue === "night" || themeValue.includes("dark")) {
          result.browserOptions.colorScheme = "dark";
        } else if (themeValue === "light" || themeValue === "day" || themeValue.includes("light")) {
          result.browserOptions.colorScheme = "light";
        }
      }
      break;

    case "browser":
      // Browser options get merged for Playwright context
      if (injection.locale) {
        result.browserOptions.locale = injection.locale;
      }
      if (injection.timezone) {
        result.browserOptions.timezoneId = injection.timezone;
      }
      if (injection.colorScheme) {
        result.browserOptions.colorScheme = injection.colorScheme;
      }
      break;

    case "urlParam":
      result.urlParams[injection.param] = injection.value;
      break;

    case "header":
      result.headers[injection.header] = injection.value;
      break;

    case "script":
      result.injections.push({
        method: "script",
        code: injection.code,
      });
      break;

    default:
      console.warn(chalk.yellow(`  ⚠ Unknown injection method: ${method}`));
  }
}

/**
 * Apply variant injections to a Playwright page
 * This should be called BEFORE navigation
 * 
 * CRITICAL: For localStorage-based theming, we use addInitScript which runs 
 * before any page JavaScript. However, some apps use inline <script> tags
 * that run during HTML parsing (before addInitScript). For these cases,
 * the capture-engine will reload the page after first navigation.
 *
 * @param {import('playwright').Page} page - Playwright page
 * @param {import('playwright').BrowserContext} context - Playwright context (optional, for cookies)
 * @param {Object} variantConfig - Resolved variant configuration
 * @param {Function} [logger] - Optional logger function
 */
async function applyVariantToPage(page, variantConfig, logger = console.log, context = null) {
  if (!variantConfig || variantConfig.injections.length === 0) {
    return;
  }

  // Group injections by type for efficient application
  const storageItems = { localStorage: {}, sessionStorage: {} };
  const cookies = [];
  const scripts = [];

  for (const injection of variantConfig.injections) {
    switch (injection.method) {
      case "localStorage":
        storageItems.localStorage[injection.key] = injection.value;
        break;
      case "sessionStorage":
        storageItems.sessionStorage[injection.key] = injection.value;
        break;
      case "cookie":
        cookies.push(injection);
        break;
      case "script":
        scripts.push(injection.code);
        break;
    }
  }

  // Apply localStorage items with interception to prevent app overrides
  // This is critical for apps that force a specific theme (e.g., setTheme("dark"))
  if (Object.keys(storageItems.localStorage).length > 0) {
    await page.addInitScript((items) => {
      // Store our desired values and theme override
      window.__RESHOT_LOCKED_STORAGE__ = items;
      window.__RESHOT_THEME_OVERRIDE__ = null;
      
      // Helper function to determine theme from value
      const getThemeFromValue = (value) => {
        const v = String(value).toLowerCase();
        if (v === 'dark' || v.includes('dark') || v === 'night') return 'dark';
        if (v === 'light' || v.includes('light') || v === 'day') return 'light';
        return null;
      };
      
      // Set our values immediately
      for (const [key, value] of Object.entries(items)) {
        const strValue = typeof value === "string" ? value : JSON.stringify(value);
        localStorage.setItem(key, strValue);
        
        // Track theme override for class enforcement (normalized to 'dark' or 'light')
        if (key.toLowerCase().includes('theme')) {
          const theme = getThemeFromValue(value);
          if (theme) {
            window.__RESHOT_THEME_OVERRIDE__ = theme;
          }
        }
      }
      
      // Intercept setItem to prevent the app from overriding our values
      const origSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key.toLowerCase().includes('theme') && window.__RESHOT_THEME_OVERRIDE__) {
          // Force our theme value
          return origSetItem.call(this, key, window.__RESHOT_THEME_OVERRIDE__);
        }
        if (window.__RESHOT_LOCKED_STORAGE__ && key in window.__RESHOT_LOCKED_STORAGE__) {
          const forcedValue = window.__RESHOT_LOCKED_STORAGE__[key];
          return origSetItem.call(this, key, 
            typeof forcedValue === "string" ? forcedValue : JSON.stringify(forcedValue)
          );
        }
        return origSetItem.call(this, key, value);
      };
      
      // Function to enforce theme class on document
      const enforceTheme = () => {
        if (window.__RESHOT_THEME_OVERRIDE__ && document.documentElement) {
          const wanted = window.__RESHOT_THEME_OVERRIDE__; // Already normalized to 'dark' or 'light'
          const current = document.documentElement.classList.contains('dark') ? 'dark' : 
                          document.documentElement.classList.contains('light') ? 'light' : null;
          if (current !== wanted) {
            document.documentElement.classList.remove('dark', 'light');
            document.documentElement.classList.add(wanted);
            document.documentElement.style.colorScheme = wanted;
            // Also set data attribute used by some libraries
            document.documentElement.setAttribute('data-theme', wanted);
          }
        }
      };
      
      // Set theme class immediately
      enforceTheme();
      
      // Use MutationObserver to continuously enforce theme
      // This handles React hydration and next-themes setTheme() calls
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' && (mutation.attributeName === 'class' || mutation.attributeName === 'data-theme')) {
            enforceTheme();
          }
        }
      });
      
      // Start observing when document is ready
      if (document.documentElement) {
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
          enforceTheme();
        });
      }
    }, storageItems.localStorage);
    logger(
      chalk.gray(
        `  → localStorage: ${JSON.stringify(storageItems.localStorage)}`
      )
    );
  }

  // Apply sessionStorage items
  if (Object.keys(storageItems.sessionStorage).length > 0) {
    await page.addInitScript((items) => {
      for (const [key, value] of Object.entries(items)) {
        sessionStorage.setItem(
          key,
          typeof value === "string" ? value : JSON.stringify(value)
        );
      }
    }, storageItems.sessionStorage);
    logger(
      chalk.gray(
        `  → sessionStorage: ${JSON.stringify(storageItems.sessionStorage)}`
      )
    );
  }

  // Apply cookies using context.addCookies() for proper timing
  // This ensures cookies are sent with the first HTTP request
  if (cookies.length > 0) {
    // Get the context from the page, or use provided context
    const ctx = context || page.context();
    
    // Get a sample URL to determine domain for cookies
    // Default to localhost if we can't determine
    const playwrightCookies = cookies.map((cookie) => {
      return {
        name: cookie.name,
        value: String(cookie.value),
        domain: cookie.options?.domain || "localhost",
        path: cookie.options?.path || "/",
        secure: cookie.options?.secure || false,
        httpOnly: cookie.options?.httpOnly || false,
        sameSite: cookie.options?.sameSite || "Lax",
      };
    });
    
    await ctx.addCookies(playwrightCookies);
    
    // Also set via addInitScript for document.cookie access
    await page.addInitScript((cookieList) => {
      for (const cookie of cookieList) {
        let cookieStr = `${cookie.name}=${encodeURIComponent(cookie.value)}`;
        if (cookie.options?.path) cookieStr += `; path=${cookie.options.path}`;
        if (cookie.options?.maxAge)
          cookieStr += `; max-age=${cookie.options.maxAge}`;
        if (cookie.options?.secure) cookieStr += "; secure";
        if (cookie.options?.sameSite)
          cookieStr += `; samesite=${cookie.options.sameSite}`;
        document.cookie = cookieStr;
      }
    }, cookies);
    logger(chalk.gray(`  → cookies: ${cookies.map((c) => c.name).join(", ")}`));
  }

  // Apply custom scripts
  for (const code of scripts) {
    await page.addInitScript(code);
    logger(chalk.gray(`  → custom script injected`));
  }
}

/**
 * Apply localStorage values AFTER navigation via page.evaluate(), then reload.
 * This is needed for SSR apps that read localStorage in inline <script> tags
 * during HTML parsing (before addInitScript runs).
 *
 * @param {import('playwright').Page} page - Playwright page
 * @param {Object} variantConfig - Resolved variant configuration
 * @param {Function} [logger] - Optional logger function
 * @returns {boolean} - Whether a reload was performed
 */
async function applyStorageAndReload(page, variantConfig, logger = console.log) {
  if (!variantConfig || variantConfig.injections.length === 0) {
    return false;
  }

  // Collect localStorage injections
  const localStorageItems = {};
  for (const injection of variantConfig.injections) {
    if (injection.method === "localStorage") {
      localStorageItems[injection.key] = injection.value;
    }
  }

  if (Object.keys(localStorageItems).length === 0) {
    return false;
  }

  // Set localStorage via page.evaluate() - this runs immediately
  await page.evaluate((items) => {
    // Store locked items for interception
    window.__RESHOT_LOCKED_STORAGE__ = items;
    
    for (const [key, value] of Object.entries(items)) {
      localStorage.setItem(
        key,
        typeof value === "string" ? value : JSON.stringify(value)
      );
    }
    
    // Helper function to determine theme from value
    const getThemeFromValue = (value) => {
      const v = String(value).toLowerCase();
      if (v === 'dark' || v.includes('dark') || v === 'night') return 'dark';
      if (v === 'light' || v.includes('light') || v === 'day') return 'light';
      return null;
    };
    
    // For theme-related keys, also set the HTML class
    for (const [key, value] of Object.entries(items)) {
      if (key.toLowerCase().includes('theme')) {
        const theme = getThemeFromValue(value);
        if (theme) {
          document.documentElement.classList.remove('dark', 'light');
          document.documentElement.classList.add(theme);
          document.documentElement.style.colorScheme = theme;
          // Also set data attribute used by some libraries
          document.documentElement.setAttribute('data-theme', theme);
        }
      }
    }
  }, localStorageItems);

  logger(chalk.gray(`  → localStorage set via evaluate, reloading page...`));

  // Reload the page so inline scripts can read the new localStorage values
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  
  // After reload, force the theme class again (in case React rehydration resets it)
  await page.evaluate((items) => {
    // Helper function to determine theme from value
    const getThemeFromValue = (value) => {
      const v = String(value).toLowerCase();
      if (v === 'dark' || v.includes('dark') || v === 'night') return 'dark';
      if (v === 'light' || v.includes('light') || v === 'day') return 'light';
      return null;
    };
    
    for (const [key, value] of Object.entries(items)) {
      if (key.toLowerCase().includes('theme')) {
        const theme = getThemeFromValue(value);
        if (theme) {
          document.documentElement.classList.remove('dark', 'light');
          document.documentElement.classList.add(theme);
          document.documentElement.style.colorScheme = theme;
          // Also set data attribute used by some libraries
          document.documentElement.setAttribute('data-theme', theme);
        }
      }
    }
  }, localStorageItems);

  return true;
}

/**
 * Set up HTTP header interception for variant headers
 *
 * @param {import('playwright').Page} page - Playwright page
 * @param {Object} headers - Headers to inject
 */
async function setupHeaderInterception(page, headers) {
  if (!headers || Object.keys(headers).length === 0) {
    return;
  }

  await page.route("**/*", (route) => {
    const existingHeaders = route.request().headers();
    route.continue({
      headers: {
        ...existingHeaders,
        ...headers,
      },
    });
  });
}

/**
 * Modify URL with variant query parameters
 *
 * @param {string} url - Original URL
 * @param {Object} params - Query parameters to add
 * @returns {string} Modified URL
 */
function applyUrlParams(url, params) {
  if (!params || Object.keys(params).length === 0) {
    return url;
  }

  const urlObj = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    urlObj.searchParams.set(key, value);
  }
  return urlObj.toString();
}

/**
 * Get browser context options from variant config
 *
 * @param {Object} variantConfig - Resolved variant configuration
 * @param {Object} defaults - Default browser options
 * @returns {Object} Merged browser options
 */
function getBrowserOptions(variantConfig, defaults = {}) {
  const merged = {
    ...defaults,
    ...(variantConfig?.browserOptions || {}),
  };
  
  // Debug log for colorScheme to help diagnose theme issues
  if (process.env.RESHOT_DEBUG) {
    console.log(`[DEBUG] getBrowserOptions - colorScheme: ${merged.colorScheme || 'not set'}`);
    console.log(`[DEBUG] getBrowserOptions - variantConfig.browserOptions: ${JSON.stringify(variantConfig?.browserOptions || {})}`);
  }
  
  return merged;
}

/**
 * Log variant summary
 */
function logVariantSummary(variantConfig, logger = console.log) {
  if (!variantConfig?.summary?.length) {
    return;
  }

  for (const item of variantConfig.summary) {
    logger(chalk.gray(`   ${item}`));
  }
}

module.exports = {
  resolveVariantConfig,
  resolveVariantValues,
  applyVariantToPage,
  applyStorageAndReload,
  setupHeaderInterception,
  applyUrlParams,
  getBrowserOptions,
  logVariantSummary,
};
