// hash.js - Content hash calculation for asset deduplication
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Calculate SHA256 hash of a file
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>} - Hex-encoded hash
 */
async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Calculate hash synchronously (for smaller files)
 * @param {Buffer} buffer - File contents
 * @returns {string} - Hex-encoded hash
 */
function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Get MIME type from file extension
 * @param {string} filePath - Path to the file
 * @returns {string} - MIME type
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.svg': 'image/svg+xml',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Get file extension from MIME type (for generating paths)
 * @param {string} mimeType - MIME type
 * @returns {string} - File extension without dot
 */
function getExtFromMimeType(mimeType) {
  const extMap = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'image/svg+xml': 'svg',
  };
  return extMap[mimeType] || 'bin';
}

module.exports = {
  hashFile,
  hashBuffer,
  getMimeType,
  getExtFromMimeType,
};
