// viewport-presets.js - Robust viewport configuration with named presets
// Provides flexible viewport sizing with device presets, custom sizes, and crop regions

/**
 * Standard device viewport presets
 * Each preset includes viewport dimensions and optional deviceScaleFactor
 */
const VIEWPORT_PRESETS = {
  // Desktop presets
  "desktop-hd": {
    name: "Desktop HD",
    category: "desktop",
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    description: "Full HD desktop (1920×1080)",
  },
  "desktop": {
    name: "Desktop",
    category: "desktop",
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    description: "Standard desktop (1280×720)",
  },
  "desktop-small": {
    name: "Desktop Small",
    category: "desktop",
    width: 1024,
    height: 768,
    deviceScaleFactor: 1,
    description: "Small desktop/laptop (1024×768)",
  },
  "desktop-retina": {
    name: "Desktop Retina",
    category: "desktop",
    width: 1280,
    height: 720,
    deviceScaleFactor: 2,
    description: "Retina desktop (2x scale)",
  },
  "desktop-4k": {
    name: "Desktop 4K",
    category: "desktop",
    width: 3840,
    height: 2160,
    deviceScaleFactor: 1,
    description: "4K UHD desktop (3840×2160)",
  },
  
  // Tablet presets
  "tablet-landscape": {
    name: "Tablet Landscape",
    category: "tablet",
    width: 1024,
    height: 768,
    deviceScaleFactor: 2,
    description: "iPad-like landscape (1024×768)",
  },
  "tablet-portrait": {
    name: "Tablet Portrait",
    category: "tablet",
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    description: "iPad-like portrait (768×1024)",
  },
  "tablet-pro-landscape": {
    name: "Tablet Pro Landscape",
    category: "tablet",
    width: 1366,
    height: 1024,
    deviceScaleFactor: 2,
    description: "iPad Pro-like landscape",
  },
  "tablet-pro-portrait": {
    name: "Tablet Pro Portrait",
    category: "tablet",
    width: 1024,
    height: 1366,
    deviceScaleFactor: 2,
    description: "iPad Pro-like portrait",
  },
  
  // Mobile presets
  "mobile": {
    name: "Mobile",
    category: "mobile",
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    description: "iPhone-like (375×667)",
  },
  "mobile-small": {
    name: "Mobile Small",
    category: "mobile",
    width: 320,
    height: 568,
    deviceScaleFactor: 2,
    description: "Small mobile (320×568)",
  },
  "mobile-large": {
    name: "Mobile Large",
    category: "mobile",
    width: 414,
    height: 896,
    deviceScaleFactor: 3,
    description: "Large mobile / iPhone Pro Max-like",
  },
  "mobile-landscape": {
    name: "Mobile Landscape",
    category: "mobile",
    width: 667,
    height: 375,
    deviceScaleFactor: 2,
    description: "Mobile landscape orientation",
  },
  
  // Documentation-specific presets
  "docs-wide": {
    name: "Docs Wide",
    category: "docs",
    width: 1200,
    height: 800,
    deviceScaleFactor: 2,
    description: "Wide documentation screenshots",
  },
  "docs-standard": {
    name: "Docs Standard",
    category: "docs",
    width: 960,
    height: 640,
    deviceScaleFactor: 2,
    description: "Standard documentation screenshots",
  },
  "docs-narrow": {
    name: "Docs Narrow",
    category: "docs",
    width: 720,
    height: 480,
    deviceScaleFactor: 2,
    description: "Narrow documentation screenshots",
  },
  
  // Social/Marketing presets
  "social-og": {
    name: "Open Graph",
    category: "social",
    width: 1200,
    height: 630,
    deviceScaleFactor: 2,
    description: "Open Graph / Facebook sharing (1200×630)",
  },
  "social-twitter": {
    name: "Twitter Card",
    category: "social",
    width: 1200,
    height: 600,
    deviceScaleFactor: 2,
    description: "Twitter card image (1200×600)",
  },
  "social-linkedin": {
    name: "LinkedIn",
    category: "social",
    width: 1200,
    height: 627,
    deviceScaleFactor: 2,
    description: "LinkedIn post image (1200×627)",
  },
};

/**
 * Crop region presets for common UI sections
 */
const CROP_PRESETS = {
  // Navigation regions
  "header": {
    name: "Header Only",
    description: "Top navigation header region",
    // Percentage-based - will be calculated based on viewport
    percentBased: true,
    region: { x: 0, y: 0, widthPercent: 100, heightPercent: 10 },
  },
  "sidebar": {
    name: "Sidebar Only",
    description: "Left sidebar navigation",
    percentBased: true,
    region: { x: 0, y: 0, widthPercent: 20, heightPercent: 100 },
  },
  "main-content": {
    name: "Main Content",
    description: "Main content area (excluding sidebar)",
    percentBased: true,
    region: { xPercent: 20, y: 0, widthPercent: 80, heightPercent: 100 },
  },
  "center-modal": {
    name: "Center Modal",
    description: "Centered modal dialog area",
    percentBased: true,
    region: { xPercent: 15, yPercent: 15, widthPercent: 70, heightPercent: 70 },
  },
  "full": {
    name: "Full Viewport",
    description: "No cropping - full viewport",
    percentBased: false,
    enabled: false,
  },
};

/**
 * Get a viewport preset by name
 * @param {string} presetName - Name of the preset
 * @returns {Object|null} Viewport configuration or null if not found
 */
function getViewportPreset(presetName) {
  return VIEWPORT_PRESETS[presetName] || null;
}

/**
 * Get all viewport presets
 * @returns {Object} All viewport presets keyed by name
 */
function getAllViewportPresets() {
  return { ...VIEWPORT_PRESETS };
}

/**
 * Get viewport presets grouped by category
 * @returns {Object} Presets grouped by category
 */
function getViewportPresetsByCategory() {
  const grouped = {};
  for (const [key, preset] of Object.entries(VIEWPORT_PRESETS)) {
    const category = preset.category || "other";
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push({ key, ...preset });
  }
  return grouped;
}

/**
 * Resolve viewport configuration from various inputs
 * Supports:
 * - Preset name: "desktop", "mobile", etc.
 * - Shorthand: "1280x720" or "1280x720@2x"
 * - Object: { width: 1280, height: 720, deviceScaleFactor: 2 }
 * 
 * @param {string|Object} input - Viewport specification
 * @param {Object} defaults - Default values to use
 * @returns {Object} Resolved viewport config { width, height, deviceScaleFactor, presetName? }
 */
function resolveViewport(input, defaults = { width: 1280, height: 720, deviceScaleFactor: 2 }) {
  // Handle null/undefined - return defaults
  if (input == null) {
    return { ...defaults, presetName: null };
  }

  // Handle preset name string
  if (typeof input === "string") {
    // Check if it's a preset name
    const preset = VIEWPORT_PRESETS[input];
    if (preset) {
      return {
        width: preset.width,
        height: preset.height,
        deviceScaleFactor: preset.deviceScaleFactor || defaults.deviceScaleFactor,
        presetName: input,
      };
    }

    // Check for shorthand format: "WIDTHxHEIGHT" or "WIDTHxHEIGHT@Nx"
    const shorthandMatch = input.match(/^(\d+)x(\d+)(?:@(\d+)x)?$/i);
    if (shorthandMatch) {
      const [, width, height, scale] = shorthandMatch;
      return {
        width: parseInt(width, 10),
        height: parseInt(height, 10),
        deviceScaleFactor: scale ? parseInt(scale, 10) : defaults.deviceScaleFactor,
        presetName: null,
      };
    }

    // Unknown string - return defaults
    console.warn(`Unknown viewport specification: "${input}", using defaults`);
    return { ...defaults, presetName: null };
  }

  // Handle object format
  if (typeof input === "object") {
    return {
      width: input.width || defaults.width,
      height: input.height || defaults.height,
      deviceScaleFactor: input.deviceScaleFactor ?? input.dpr ?? defaults.deviceScaleFactor,
      presetName: input.preset || input.presetName || null,
    };
  }

  return { ...defaults, presetName: null };
}

/**
 * Validate viewport configuration
 * @param {Object} viewport - Viewport object to validate
 * @returns {{ valid: boolean, error?: string }}
 */
function validateViewport(viewport) {
  if (!viewport) {
    return { valid: false, error: "Viewport is required" };
  }

  const { width, height, deviceScaleFactor } = viewport;

  if (typeof width !== "number" || width < 100 || width > 10000) {
    return { valid: false, error: "Viewport width must be between 100 and 10000" };
  }

  if (typeof height !== "number" || height < 100 || height > 10000) {
    return { valid: false, error: "Viewport height must be between 100 and 10000" };
  }

  if (deviceScaleFactor !== undefined) {
    if (typeof deviceScaleFactor !== "number" || deviceScaleFactor < 1 || deviceScaleFactor > 4) {
      return { valid: false, error: "deviceScaleFactor must be between 1 and 4" };
    }
  }

  return { valid: true };
}

/**
 * Resolve a crop region, supporting both absolute and percentage-based regions
 * @param {Object} cropConfig - Crop configuration
 * @param {Object} viewport - Current viewport { width, height }
 * @returns {Object} Resolved absolute crop region { x, y, width, height }
 */
function resolveCropRegion(cropConfig, viewport) {
  if (!cropConfig || !cropConfig.region) {
    return null;
  }

  const region = cropConfig.region;
  
  // Check if this is a preset
  if (cropConfig.preset && CROP_PRESETS[cropConfig.preset]) {
    const presetConfig = CROP_PRESETS[cropConfig.preset];
    if (!presetConfig.enabled && presetConfig.enabled !== undefined) {
      return null; // Preset explicitly disabled (like "full")
    }
    return resolveCropRegion({ ...cropConfig, ...presetConfig }, viewport);
  }

  // Handle percentage-based regions
  if (cropConfig.percentBased) {
    const x = region.xPercent !== undefined 
      ? Math.round((region.xPercent / 100) * viewport.width)
      : (region.x || 0);
    const y = region.yPercent !== undefined
      ? Math.round((region.yPercent / 100) * viewport.height)
      : (region.y || 0);
    const width = region.widthPercent !== undefined
      ? Math.round((region.widthPercent / 100) * viewport.width)
      : region.width;
    const height = region.heightPercent !== undefined
      ? Math.round((region.heightPercent / 100) * viewport.height)
      : region.height;

    return { x, y, width, height };
  }

  // Absolute region
  return {
    x: region.x || 0,
    y: region.y || 0,
    width: region.width,
    height: region.height,
  };
}

/**
 * Get a crop preset by name
 * @param {string} presetName - Name of the crop preset
 * @returns {Object|null} Crop preset configuration or null
 */
function getCropPreset(presetName) {
  return CROP_PRESETS[presetName] || null;
}

/**
 * Get all crop presets
 * @returns {Object} All crop presets
 */
function getAllCropPresets() {
  return { ...CROP_PRESETS };
}

/**
 * Create a custom viewport configuration
 * @param {Object} options - Custom viewport options
 * @returns {Object} Viewport configuration object
 */
function createCustomViewport(options = {}) {
  const {
    width = 1280,
    height = 720,
    deviceScaleFactor = 2,
    name = "Custom",
    description = "",
  } = options;

  return {
    name,
    category: "custom",
    width,
    height,
    deviceScaleFactor,
    description: description || `${width}×${height}${deviceScaleFactor > 1 ? ` @${deviceScaleFactor}x` : ""}`,
  };
}

/**
 * Parse viewport matrix configuration for multi-viewport captures
 * @param {Array|Object|string} viewportConfig - Viewport configuration
 * @returns {Array<Object>} Array of resolved viewport configs
 */
function parseViewportMatrix(viewportConfig) {
  if (!viewportConfig) {
    return [resolveViewport(null)];
  }

  // Single viewport
  if (typeof viewportConfig === "string" || !Array.isArray(viewportConfig)) {
    return [resolveViewport(viewportConfig)];
  }

  // Array of viewports - resolve each
  return viewportConfig.map(v => resolveViewport(v));
}

module.exports = {
  VIEWPORT_PRESETS,
  CROP_PRESETS,
  getViewportPreset,
  getAllViewportPresets,
  getViewportPresetsByCategory,
  resolveViewport,
  validateViewport,
  resolveCropRegion,
  getCropPreset,
  getAllCropPresets,
  createCustomViewport,
  parseViewportMatrix,
};
