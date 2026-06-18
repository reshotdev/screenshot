// secrets.js - Variable resolution utilities

/**
 * Resolve ${process.env.VAR_NAME} placeholders in a string
 * @param {string} text - Text with placeholders
 * @returns {string} Text with resolved values
 */
function resolveSecretsInString(text) {
  if (typeof text !== 'string') {
    return text;
  }
  
  return text.replace(/\$\{process\.env\.(\w+)\}/g, (match, varName) => {
    const value = process.env[varName];
    if (value === undefined) {
      throw new Error(`Environment variable ${varName} is not set`);
    }
    return value;
  });
}

/**
 * Recursively resolve secrets in an object
 * @param {*} obj - Object to resolve
 * @returns {*} Object with resolved values
 */
function resolveSecretsInObject(obj) {
  if (typeof obj === 'string') {
    return resolveSecretsInString(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => resolveSecretsInObject(item));
  }
  
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const key in obj) {
      result[key] = resolveSecretsInObject(obj[key]);
    }
    return result;
  }
  
  return obj;
}

module.exports = {
  resolveSecretsInString,
  resolveSecretsInObject
};

