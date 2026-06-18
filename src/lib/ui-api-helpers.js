const path = require("path");
const config = require("./config");

/**
 * Get the platform URL from settings, falling back to production.
 * @param {Object} settings - CLI settings object
 * @returns {string} Platform URL
 */
function getPlatformUrl(settings) {
  if (settings?.platformUrl) {
    return settings.platformUrl;
  }

  const envUrl = process.env.RESHOT_API_BASE_URL;
  if (envUrl) {
    return envUrl.replace(/\/api\/?$/, "");
  }

  return "https://reshot.dev";
}

/**
 * Handle API errors and detect if re-auth is needed.
 * @param {Error} error - The error from API call
 * @param {Object} res - Express response object
 * @returns {Object|null} Response if error was handled, null otherwise
 */
function handleApiError(error, res) {
  if (config.isAuthError(error)) {
    const errorMsg =
      error.response?.data?.error ||
      error.message ||
      "API key is invalid or expired";
    return res.status(401).json(config.createAuthErrorResponse(errorMsg));
  }

  return null;
}

/**
 * Generate all possible variant combinations from dimensions.
 * @param {Object} dimensions - Variant dimensions config
 * @param {string[]} dimensionKeys - Which dimensions to include
 * @returns {Array<Object>} Array of variant objects
 */
function generateVariantCombinations(dimensions, dimensionKeys = []) {
  if (!dimensions || dimensionKeys.length === 0) {
    return [];
  }

  const dimensionOptions = dimensionKeys
    .map((key) => {
      const dim = dimensions[key];
      if (!dim?.options) return [];
      return Object.keys(dim.options).map((optKey) => ({
        dimension: key,
        option: optKey,
      }));
    })
    .filter((opts) => opts.length > 0);

  if (dimensionOptions.length === 0) {
    return [];
  }

  const combinations = cartesian(...dimensionOptions);

  return combinations.map((combo) => {
    const variant = {};
    for (const { dimension, option } of combo) {
      variant[dimension] = option;
    }
    return variant;
  });
}

function cartesian(...arrays) {
  return arrays.reduce(
    (acc, arr) => acc.flatMap((combo) => arr.map((item) => [...combo, item])),
    [[]],
  );
}

/**
 * Validate a path segment to prevent directory traversal attacks.
 * @param {string} segment - Path segment to validate
 * @returns {boolean} True if safe, false if potentially malicious
 */
function isValidPathSegment(segment) {
  if (!segment || typeof segment !== "string") return false;
  if (segment === "." || segment === "..") return false;
  if (segment.includes("/") || segment.includes("\\")) return false;
  if (segment.includes("\0")) return false;
  return true;
}

/**
 * Validate that a resolved path stays within the expected base directory.
 * @param {string} resolvedPath - Fully resolved path
 * @param {string} baseDir - Expected base directory
 * @returns {boolean} True if path is within base, false otherwise
 */
function isPathWithinBase(resolvedPath, baseDir) {
  const normalizedBase = path.resolve(baseDir);
  const normalizedPath = path.resolve(resolvedPath);
  return (
    normalizedPath.startsWith(normalizedBase + path.sep) ||
    normalizedPath === normalizedBase
  );
}

module.exports = {
  generateVariantCombinations,
  getPlatformUrl,
  handleApiError,
  isPathWithinBase,
  isValidPathSegment,
};
