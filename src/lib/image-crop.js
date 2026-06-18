// image-crop.js - High-quality image cropping with industry best practices
// Uses Sharp for lossless, high-quality image manipulation
const sharp = require("sharp");
const path = require("path");
const fs = require("fs-extra");

/**
 * Crop configuration schema:
 * {
 *   enabled: boolean,           // Whether cropping is enabled for this scenario/step
 *   region: {                   // Absolute pixel coordinates (required if enabled)
 *     x: number,                // X offset from top-left
 *     y: number,                // Y offset from top-left
 *     width: number,            // Width of crop region
 *     height: number            // Height of crop region
 *   },
 *   scaleMode: 'none' | 'fit' | 'fill',  // How to handle the cropped result (default: 'none')
 *   targetSize?: {              // Optional target dimensions for scaling (only if scaleMode !== 'none')
 *     width: number,
 *     height: number
 *   },
 *   padding?: {                 // Optional padding around the crop region
 *     top?: number,
 *     right?: number,
 *     bottom?: number,
 *     left?: number
 *   },
 *   preserveAspectRatio: boolean  // Whether to preserve aspect ratio when scaling (default: true)
 * }
 */

/**
 * Validate crop configuration
 * @param {Object} cropConfig - The crop configuration to validate
 * @returns {{ valid: boolean, error?: string }}
 */
function validateCropConfig(cropConfig) {
  if (!cropConfig) {
    return { valid: true }; // No crop config means cropping is disabled
  }

  if (!cropConfig.enabled) {
    return { valid: true }; // Explicitly disabled
  }

  if (!cropConfig.region) {
    return {
      valid: false,
      error: "Crop region is required when cropping is enabled",
    };
  }

  const { x, y, width, height } = cropConfig.region;

  if (typeof x !== "number" || x < 0) {
    return {
      valid: false,
      error: "Crop region.x must be a non-negative number",
    };
  }

  if (typeof y !== "number" || y < 0) {
    return {
      valid: false,
      error: "Crop region.y must be a non-negative number",
    };
  }

  if (typeof width !== "number" || width <= 0) {
    return {
      valid: false,
      error: "Crop region.width must be a positive number",
    };
  }

  if (typeof height !== "number" || height <= 0) {
    return {
      valid: false,
      error: "Crop region.height must be a positive number",
    };
  }

  if (
    cropConfig.scaleMode &&
    !["none", "fit", "fill"].includes(cropConfig.scaleMode)
  ) {
    return {
      valid: false,
      error: "scaleMode must be 'none', 'fit', or 'fill'",
    };
  }

  if (
    cropConfig.scaleMode &&
    cropConfig.scaleMode !== "none" &&
    cropConfig.targetSize
  ) {
    const { width: tw, height: th } = cropConfig.targetSize;
    if (
      typeof tw !== "number" ||
      tw <= 0 ||
      typeof th !== "number" ||
      th <= 0
    ) {
      return {
        valid: false,
        error: "targetSize width and height must be positive numbers",
      };
    }
  }

  return { valid: true };
}

/**
 * Apply padding to a crop region, adjusting for image boundaries
 * @param {Object} region - { x, y, width, height }
 * @param {Object} padding - { top, right, bottom, left }
 * @param {Object} imageDimensions - { width, height }
 * @returns {Object} Adjusted region with padding applied
 */
function applyPaddingToRegion(region, padding = {}, imageDimensions) {
  const { top = 0, right = 0, bottom = 0, left = 0 } = padding;

  // Expand region by padding
  let newX = Math.max(0, region.x - left);
  let newY = Math.max(0, region.y - top);
  let newWidth = region.width + left + right;
  let newHeight = region.height + top + bottom;

  // Adjust for image boundaries
  if (imageDimensions) {
    const maxWidth = imageDimensions.width - newX;
    const maxHeight = imageDimensions.height - newY;
    newWidth = Math.min(newWidth, maxWidth);
    newHeight = Math.min(newHeight, maxHeight);
  }

  return {
    x: Math.round(newX),
    y: Math.round(newY),
    width: Math.round(newWidth),
    height: Math.round(newHeight),
  };
}

/**
 * Scale a crop region by a device pixel ratio
 * This ensures crop coordinates work correctly on high-DPI displays
 * @param {Object} region - { x, y, width, height }
 * @param {number} deviceScaleFactor - The device pixel ratio (e.g., 2 for retina)
 * @returns {Object} Scaled region
 */
function scaleRegionByDPR(region, deviceScaleFactor = 1) {
  if (deviceScaleFactor === 1) {
    return region;
  }

  return {
    x: Math.round(region.x * deviceScaleFactor),
    y: Math.round(region.y * deviceScaleFactor),
    width: Math.round(region.width * deviceScaleFactor),
    height: Math.round(region.height * deviceScaleFactor),
  };
}

/**
 * Crop an image buffer using Sharp with high-quality settings
 * @param {Buffer} imageBuffer - The input image buffer (PNG)
 * @param {Object} cropConfig - The crop configuration
 * @param {Object} options - Additional options
 * @param {number} options.deviceScaleFactor - Device pixel ratio for coordinate scaling
 * @returns {Promise<Buffer>} The cropped image buffer
 */
async function cropImageBuffer(imageBuffer, cropConfig, options = {}) {
  const { deviceScaleFactor = 1 } = options;

  if (!cropConfig || !cropConfig.enabled || !cropConfig.region) {
    return imageBuffer; // Return original if no cropping
  }

  const validation = validateCropConfig(cropConfig);
  if (!validation.valid) {
    throw new Error(`Invalid crop config: ${validation.error}`);
  }

  // Get image metadata to validate crop bounds
  const metadata = await sharp(imageBuffer).metadata();
  const imageDimensions = { width: metadata.width, height: metadata.height };

  // Scale region by device pixel ratio
  let region = scaleRegionByDPR(cropConfig.region, deviceScaleFactor);

  // Apply padding if specified
  if (cropConfig.padding) {
    const scaledPadding = {
      top: (cropConfig.padding.top || 0) * deviceScaleFactor,
      right: (cropConfig.padding.right || 0) * deviceScaleFactor,
      bottom: (cropConfig.padding.bottom || 0) * deviceScaleFactor,
      left: (cropConfig.padding.left || 0) * deviceScaleFactor,
    };
    region = applyPaddingToRegion(region, scaledPadding, imageDimensions);
  }

  // Validate that crop region is within image bounds
  if (region.x >= imageDimensions.width || region.y >= imageDimensions.height) {
    throw new Error(
      `Crop region (${region.x}, ${region.y}) is outside image bounds (${imageDimensions.width}x${imageDimensions.height})`
    );
  }

  // Clamp region to image bounds (handle edge cases gracefully)
  const clampedWidth = Math.min(region.width, imageDimensions.width - region.x);
  const clampedHeight = Math.min(
    region.height,
    imageDimensions.height - region.y
  );

  if (clampedWidth <= 0 || clampedHeight <= 0) {
    throw new Error(
      `Crop region results in zero-size image after clamping to bounds`
    );
  }

  // Build Sharp pipeline with high-quality settings
  let pipeline = sharp(imageBuffer, {
    // Disable libvips cache for consistent results
    failOnError: false,
  }).extract({
    left: region.x,
    top: region.y,
    width: clampedWidth,
    height: clampedHeight,
  });

  // Apply scaling if configured
  if (
    cropConfig.scaleMode &&
    cropConfig.scaleMode !== "none" &&
    cropConfig.targetSize
  ) {
    const { width: targetWidth, height: targetHeight } = cropConfig.targetSize;
    const preserveAspectRatio = cropConfig.preserveAspectRatio !== false;

    if (cropConfig.scaleMode === "fit") {
      pipeline = pipeline.resize(targetWidth, targetHeight, {
        fit: preserveAspectRatio ? "inside" : "fill",
        withoutEnlargement: true, // Don't upscale
        kernel: sharp.kernel.lanczos3, // High-quality downscaling
      });
    } else if (cropConfig.scaleMode === "fill") {
      pipeline = pipeline.resize(targetWidth, targetHeight, {
        fit: preserveAspectRatio ? "cover" : "fill",
        position: "center",
        kernel: sharp.kernel.lanczos3,
      });
    }
  }

  // Output as PNG with high quality (lossless)
  return pipeline
    .png({
      compressionLevel: 6, // Balanced compression
      adaptiveFiltering: true, // Better compression for photos
    })
    .toBuffer();
}

/**
 * Crop an image file and save to the same or different path
 * @param {string} inputPath - Path to the input image
 * @param {string} outputPath - Path for the output image (can be same as input)
 * @param {Object} cropConfig - The crop configuration
 * @param {Object} options - Additional options
 * @returns {Promise<{ success: boolean, originalSize: Object, croppedSize: Object }>}
 */
async function cropImageFile(inputPath, outputPath, cropConfig, options = {}) {
  if (!cropConfig || !cropConfig.enabled) {
    return { success: true, skipped: true };
  }

  const imageBuffer = await fs.readFile(inputPath);
  const originalMetadata = await sharp(imageBuffer).metadata();

  const croppedBuffer = await cropImageBuffer(imageBuffer, cropConfig, options);
  const croppedMetadata = await sharp(croppedBuffer).metadata();

  await fs.writeFile(outputPath, croppedBuffer);

  return {
    success: true,
    skipped: false,
    originalSize: {
      width: originalMetadata.width,
      height: originalMetadata.height,
    },
    croppedSize: {
      width: croppedMetadata.width,
      height: croppedMetadata.height,
    },
  };
}

/**
 * Create a crop config from a bounding box (e.g., from element.boundingBox())
 * @param {Object} boundingBox - { x, y, width, height }
 * @param {Object} options - Additional options
 * @param {number} options.padding - Uniform padding to add around the box
 * @param {Object} options.customPadding - { top, right, bottom, left }
 * @returns {Object} Crop configuration
 */
function createCropConfigFromBoundingBox(boundingBox, options = {}) {
  if (!boundingBox) {
    return { enabled: false };
  }

  const { padding = 0, customPadding } = options;

  const cropConfig = {
    enabled: true,
    region: {
      x: Math.round(boundingBox.x),
      y: Math.round(boundingBox.y),
      width: Math.round(boundingBox.width),
      height: Math.round(boundingBox.height),
    },
    scaleMode: "none",
    preserveAspectRatio: true,
  };

  if (customPadding) {
    cropConfig.padding = customPadding;
  } else if (padding > 0) {
    cropConfig.padding = {
      top: padding,
      right: padding,
      bottom: padding,
      left: padding,
    };
  }

  return cropConfig;
}

/**
 * Merge a base crop config with step-level overrides
 * Step-level config takes precedence over scenario-level config
 * @param {Object} baseCropConfig - Scenario-level crop configuration
 * @param {Object} stepCropConfig - Step-level crop configuration (if any)
 * @returns {Object} Merged crop configuration
 */
function mergeCropConfigs(baseCropConfig, stepCropConfig) {
  // If step has its own crop config (even if disabled), use it
  if (stepCropConfig !== undefined) {
    if (stepCropConfig === null || stepCropConfig.enabled === false) {
      return { enabled: false };
    }
    // Merge with base, step takes precedence
    return {
      ...baseCropConfig,
      ...stepCropConfig,
      region: stepCropConfig.region || baseCropConfig?.region,
      padding:
        stepCropConfig.padding !== undefined
          ? stepCropConfig.padding
          : baseCropConfig?.padding,
    };
  }

  // Use base config
  return baseCropConfig || { enabled: false };
}

/**
 * Check if Sharp is available
 * @returns {boolean}
 */
function isSharpAvailable() {
  try {
    require("sharp");
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  validateCropConfig,
  applyPaddingToRegion,
  scaleRegionByDPR,
  cropImageBuffer,
  cropImageFile,
  createCropConfigFromBoundingBox,
  mergeCropConfigs,
  isSharpAvailable,
};
