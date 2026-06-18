// matrix.js - Matrix expansion and context merging utilities

/**
 * Expand matrix definition into all combinations
 * @param {Array<Array<string>>} matrix - Array of axes, each containing context keys
 * @returns {Array<Array<string>>} Array of all combinations
 */
function expandMatrix(matrix) {
  if (!matrix || matrix.length === 0) {
    return [[]]; // Single empty variation if no matrix
  }

  // Cartesian product of all axes
  const result = [];
  
  function generateCombinations(current, depth) {
    if (depth === matrix.length) {
      result.push([...current]);
      return;
    }
    
    for (const item of matrix[depth]) {
      current.push(item);
      generateCombinations(current, depth + 1);
      current.pop();
    }
  }
  
  generateCombinations([], 0);
  return result;
}

/**
 * Deep merge two objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}

/**
 * Merge contexts based on selected context keys
 * @param {Object} baseContext - Base context object
 * @param {Array<string>} selectedContextKeys - Array of context keys to merge
 * @param {Object} allContexts - Object mapping context keys to context objects
 * @returns {Object} Merged context
 */
function mergeContexts(baseContext, selectedContextKeys, allContexts) {
  let result = { ...baseContext };
  
  for (const key of selectedContextKeys) {
    if (allContexts[key]) {
      result = deepMerge(result, allContexts[key]);
    }
  }
  
  return result;
}

/**
 * Create a slug from variation keys
 * @param {Array<string>} variation - Array of context keys
 * @returns {string} Slug for the variation
 */
function variationToSlug(variation) {
  if (variation.length === 0) {
    return 'default';
  }
  return variation.join('_');
}

module.exports = {
  expandMatrix,
  mergeContexts,
  variationToSlug
};

