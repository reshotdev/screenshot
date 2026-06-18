// style-engine.js - Image beautification via Sharp compositing
// Transforms raw screenshots into polished, marketing-ready assets with
// window frames, shadows, rounded corners, and custom backgrounds.
// PNG only (video styling is V2).

const chalk = require("chalk");

let sharp;
try {
  sharp = require("sharp");
} catch (_e) {
  sharp = null;
}

/**
 * Default style configuration
 */
const DEFAULT_STYLE_CONFIG = {
  enabled: false,
  frame: "none",
  shadow: "none",
  padding: 0,
  background: "transparent",
  borderRadius: 0,
};

/**
 * Shadow presets: { offsetX, offsetY, blur, spread, opacity }
 */
const SHADOW_PRESETS = {
  none: null,
  small: { blur: 10, spread: 2, offsetY: 4, opacity: 0.15 },
  medium: { blur: 20, spread: 4, offsetY: 8, opacity: 0.2 },
  large: { blur: 40, spread: 8, offsetY: 16, opacity: 0.25 },
};

/**
 * Frame title bar heights (in CSS pixels, will be scaled)
 */
const FRAME_HEIGHT = 36;
const TRAFFIC_LIGHT_RADIUS = 6;
const TRAFFIC_LIGHT_GAP = 8;
const TRAFFIC_LIGHT_LEFT = 14;

/**
 * Validate a style configuration object.
 *
 * @param {Object} config
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateStyleConfig(config) {
  const errors = [];

  if (!config || typeof config !== "object") {
    return { valid: false, errors: ["Style config must be an object"] };
  }

  if (config.frame && !["none", "macos", "windows"].includes(config.frame)) {
    errors.push(
      `Invalid frame "${config.frame}". Valid: none, macos, windows`
    );
  }

  if (config.shadow && !SHADOW_PRESETS.hasOwnProperty(config.shadow)) {
    errors.push(
      `Invalid shadow "${config.shadow}". Valid: ${Object.keys(SHADOW_PRESETS).join(", ")}`
    );
  }

  if (config.padding !== undefined) {
    if (
      typeof config.padding !== "number" ||
      config.padding < 0 ||
      config.padding > 200
    ) {
      errors.push("padding must be a number between 0 and 200");
    }
  }

  if (config.borderRadius !== undefined) {
    if (
      typeof config.borderRadius !== "number" ||
      config.borderRadius < 0 ||
      config.borderRadius > 100
    ) {
      errors.push("borderRadius must be a number between 0 and 100");
    }
  }

  if (config.background !== undefined) {
    if (typeof config.background !== "string") {
      errors.push("background must be a string");
    } else if (config.background !== "transparent") {
      // Validate hex or linear-gradient
      const isHex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(
        config.background
      );
      const isGradient = config.background.startsWith("linear-gradient(");
      if (!isHex && !isGradient) {
        errors.push(
          'background must be "transparent", a hex color, or a linear-gradient()'
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Merge global style config with scenario overrides.
 * Style uses flat override (not additive like privacy).
 *
 * @param {Object} globalConfig
 * @param {Object} [overrides]
 * @returns {Object}
 */
function mergeStyleConfig(globalConfig, overrides) {
  if (!overrides) return { ...globalConfig };
  if (!globalConfig) return { ...DEFAULT_STYLE_CONFIG, ...overrides };

  // Filter undefined values
  const cleanOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, v]) => v !== undefined)
  );

  return { ...globalConfig, ...cleanOverrides };
}

/**
 * Maximum canvas dimension — Sharp/libvips can't handle larger without running out of memory.
 */
const MAX_CANVAS_DIM = 16384;

/**
 * Minimum width for frame rendering — below this, title bar elements won't fit.
 */
const MIN_FRAME_WIDTH = 100;

/**
 * Generate a macOS-style title bar SVG.
 *
 * @param {number} width - Width in pixels (already DPI-scaled)
 * @param {boolean} [darkMode=false]
 * @param {number} [scale=1] - DPI scale factor for element sizing
 * @returns {Buffer} SVG as Buffer
 */
function generateMacOSTitleBar(width, darkMode = false, scale = 1) {
  const bgColor = darkMode ? "#2d2d2d" : "#e8e8e8";
  const borderColor = darkMode ? "#3d3d3d" : "#d0d0d0";
  const h = FRAME_HEIGHT * scale;
  const r = TRAFFIC_LIGHT_RADIUS * scale;
  const gap = TRAFFIC_LIGHT_GAP * scale;
  const left = TRAFFIC_LIGHT_LEFT * scale;
  const cy = h / 2;
  const startX = left + r;
  const cornerR = 8 * scale;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}">
  <rect width="${width}" height="${h}" fill="${bgColor}" rx="${cornerR}" ry="${cornerR}"/>
  <rect x="0" y="${cornerR}" width="${width}" height="${h - cornerR}" fill="${bgColor}"/>
  <line x1="0" y1="${h - 0.5}" x2="${width}" y2="${h - 0.5}" stroke="${borderColor}" stroke-width="1"/>
  <circle cx="${startX}" cy="${cy}" r="${r}" fill="#ff5f57"/>
  <circle cx="${startX + r * 2 + gap}" cy="${cy}" r="${r}" fill="#febc2e"/>
  <circle cx="${startX + (r * 2 + gap) * 2}" cy="${cy}" r="${r}" fill="#28c840"/>
</svg>`;

  return Buffer.from(svg);
}

/**
 * Generate a Windows-style title bar SVG.
 *
 * @param {number} width - Width in pixels (already DPI-scaled)
 * @param {boolean} [darkMode=false]
 * @param {number} [scale=1] - DPI scale factor for element sizing
 * @returns {Buffer} SVG as Buffer
 */
function generateWindowsTitleBar(width, darkMode = false, scale = 1) {
  const bgColor = darkMode ? "#2d2d2d" : "#f0f0f0";
  const btnColor = darkMode ? "#aaa" : "#666";
  const closeBtnColor = darkMode ? "#aaa" : "#666";
  const btnWidth = 46 * scale;
  const h = FRAME_HEIGHT * scale;
  const rightEdge = width;

  // Icon geometry scaled
  const minX1 = 18 * scale;
  const minX2 = 28 * scale;
  const maxX = 17 * scale;
  const maxW = 12 * scale;
  const maxH = 10 * scale;
  const closeX1 = 19 * scale;
  const closeX2 = 27 * scale;
  const closeOff = 4 * scale;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}">
  <rect width="${width}" height="${h}" fill="${bgColor}"/>
  <!-- Minimize -->
  <g transform="translate(${rightEdge - btnWidth * 3}, 0)">
    <rect width="${btnWidth}" height="${h}" fill="transparent"/>
    <line x1="${minX1}" y1="${h / 2}" x2="${minX2}" y2="${h / 2}" stroke="${btnColor}" stroke-width="1"/>
  </g>
  <!-- Maximize -->
  <g transform="translate(${rightEdge - btnWidth * 2}, 0)">
    <rect width="${btnWidth}" height="${h}" fill="transparent"/>
    <rect x="${maxX}" y="${h / 2 - maxH / 2}" width="${maxW}" height="${maxH}" fill="none" stroke="${btnColor}" stroke-width="1"/>
  </g>
  <!-- Close -->
  <g transform="translate(${rightEdge - btnWidth}, 0)">
    <rect width="${btnWidth}" height="${h}" fill="transparent"/>
    <line x1="${closeX1}" y1="${h / 2 - closeOff}" x2="${closeX2}" y2="${h / 2 + closeOff}" stroke="${closeBtnColor}" stroke-width="1"/>
    <line x1="${closeX2}" y1="${h / 2 - closeOff}" x2="${closeX1}" y2="${h / 2 + closeOff}" stroke="${closeBtnColor}" stroke-width="1"/>
  </g>
</svg>`;

  return Buffer.from(svg);
}

/**
 * Generate a shadow layer as an SVG, then blur it with Sharp.
 *
 * @param {number} contentWidth - Width of the content (including frame)
 * @param {number} contentHeight - Height of the content (including frame)
 * @param {Object} shadowConfig - Shadow preset config
 * @param {number} borderRadius
 * @returns {Promise<Buffer>} Shadow layer as PNG buffer
 */
async function generateShadowLayer(
  contentWidth,
  contentHeight,
  shadowConfig,
  borderRadius
) {
  if (!sharp || !shadowConfig) return null;

  const { blur, spread, offsetY, opacity } = shadowConfig;
  // Extra padding around shadow for blur to spread into
  const extra = blur * 2 + spread;
  const totalWidth = contentWidth + extra * 2;
  const totalHeight = contentHeight + extra * 2 + offsetY;

  const rx = Math.min(borderRadius, contentWidth / 2, contentHeight / 2);
  const alphaHex = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, "0");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}">
  <rect x="${extra}" y="${extra + offsetY}" width="${contentWidth}" height="${contentHeight}" rx="${rx}" ry="${rx}" fill="#000000${alphaHex}"/>
</svg>`;

  const shadowBuffer = await sharp(Buffer.from(svg))
    .blur(blur)
    .png()
    .toBuffer();

  return { buffer: shadowBuffer, extra, offsetY };
}

/**
 * Parse a background value into a Sharp-compatible format.
 * Supports: "transparent", hex colors, linear-gradient()
 *
 * @param {string} background
 * @param {number} width
 * @param {number} height
 * @returns {Promise<{ channels: number, background: Object }|Buffer>}
 */
async function resolveBackground(background, width, height) {
  if (!background || background === "transparent") {
    return { r: 0, g: 0, b: 0, alpha: 0 };
  }

  // Hex color
  const hexMatch = background.match(
    /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i
  );
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16),
      alpha: hexMatch[4] ? parseInt(hexMatch[4], 16) / 255 : 1,
    };
  }

  // Short hex
  const shortHexMatch = background.match(
    /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i
  );
  if (shortHexMatch) {
    return {
      r: parseInt(shortHexMatch[1] + shortHexMatch[1], 16),
      g: parseInt(shortHexMatch[2] + shortHexMatch[2], 16),
      b: parseInt(shortHexMatch[3] + shortHexMatch[3], 16),
      alpha: 1,
    };
  }

  // Linear gradient - render as SVG
  const gradientMatch = background.match(
    /^linear-gradient\((.+)\)$/i
  );
  if (gradientMatch && sharp) {
    try {
      return await renderGradientBackground(gradientMatch[1], width, height);
    } catch (_e) {
      // Fall back to transparent
      return { r: 0, g: 0, b: 0, alpha: 0 };
    }
  }

  // Fallback
  return { r: 0, g: 0, b: 0, alpha: 0 };
}

/**
 * Split a gradient body into parts, respecting parentheses depth.
 * e.g. "135deg, rgba(255,0,0,0.5) 30%, #764ba2" → ["135deg", "rgba(255,0,0,0.5) 30%", "#764ba2"]
 *
 * @param {string} body
 * @returns {string[]}
 */
function splitGradientParts(body) {
  const parts = [];
  let depth = 0;
  let current = "";

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;

    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Direction keyword → angle mapping (including diagonals).
 */
const DIRECTION_ANGLES = {
  "to right": 90,
  "to left": 270,
  "to bottom": 180,
  "to top": 0,
  "to top right": 45,
  "to right top": 45,
  "to bottom right": 135,
  "to right bottom": 135,
  "to bottom left": 225,
  "to left bottom": 225,
  "to top left": 315,
  "to left top": 315,
};

/**
 * Render a CSS linear-gradient as a PNG buffer via SVG.
 *
 * @param {string} gradientBody - The content inside linear-gradient(...)
 * @param {number} width
 * @param {number} height
 * @returns {Promise<Buffer>} PNG buffer
 */
async function renderGradientBackground(gradientBody, width, height) {
  const parts = splitGradientParts(gradientBody);
  let angle = 180; // default: top to bottom
  let colorStops = parts;

  // Check if first part is an angle or direction keyword
  const angleMatch = parts[0].match(/^(\d+)deg$/);
  if (angleMatch) {
    angle = parseInt(angleMatch[1], 10);
    colorStops = parts.slice(1);
  } else if (DIRECTION_ANGLES.hasOwnProperty(parts[0])) {
    angle = DIRECTION_ANGLES[parts[0]];
    colorStops = parts.slice(1);
  }

  // Convert angle to SVG gradient coordinates
  const rad = ((angle - 90) * Math.PI) / 180;
  const x1 = Math.round(50 - Math.cos(rad) * 50);
  const y1 = Math.round(50 - Math.sin(rad) * 50);
  const x2 = Math.round(50 + Math.cos(rad) * 50);
  const y2 = Math.round(50 + Math.sin(rad) * 50);

  // Build SVG stops — handle explicit percentage offsets and rgba() colors
  const stops = colorStops
    .map((stop, i) => {
      // Extract trailing percentage: "rgba(255,0,0,0.5) 30%" → color="rgba(255,0,0,0.5)", pct="30%"
      const pctMatch = stop.match(/^(.+?)\s+(\d+(?:\.\d+)?%)\s*$/);
      let color, offset;
      if (pctMatch) {
        color = pctMatch[1].trim();
        offset = pctMatch[2];
      } else {
        color = stop.trim();
        offset = colorStops.length > 1
          ? `${Math.round((i / (colorStops.length - 1)) * 100)}%`
          : "0%";
      }
      return `<stop offset="${offset}" stop-color="${color}"/>`;
    })
    .join("\n    ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bg" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">
    ${stops}
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Apply rounded corners to an image buffer using an SVG mask.
 *
 * @param {Buffer} buffer - Input PNG buffer
 * @param {number} borderRadius
 * @param {number} width
 * @param {number} height
 * @returns {Promise<Buffer>}
 */
async function roundCorners(buffer, borderRadius, width, height) {
  if (!borderRadius || borderRadius <= 0 || !sharp) return buffer;

  const r = Math.min(borderRadius, width / 2, height / 2);

  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" rx="${r}" ry="${r}" fill="white"/>
</svg>`
  );

  return sharp(buffer)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

/**
 * Apply the full style pipeline to a screenshot buffer.
 *
 * Pipeline order:
 * 1. Round corners on the screenshot
 * 2. Add window frame (title bar composited on top)
 * 3. Generate shadow layer
 * 4. Compose everything onto padded background canvas
 *
 * @param {Buffer} inputBuffer - Raw PNG screenshot
 * @param {Object} styleConfig - Style configuration
 * @param {Function} [logger] - Logging function
 * @returns {Promise<Buffer>} Beautified PNG buffer
 */
async function applyStyle(inputBuffer, styleConfig, logger, dpr = 1) {
  if (!sharp) {
    if (logger) {
      logger(
        chalk.yellow(
          "  ⚠ Sharp not available, skipping style processing. Run: npm install sharp"
        )
      );
    }
    return inputBuffer;
  }

  if (!styleConfig || !styleConfig.enabled) {
    return inputBuffer;
  }

  const {
    frame = "none",
    shadow = "none",
    padding = 0,
    background = "transparent",
    borderRadius = 0,
  } = styleConfig;

  // If everything is disabled/default, skip processing
  if (
    frame === "none" &&
    shadow === "none" &&
    padding === 0 &&
    borderRadius === 0
  ) {
    return inputBuffer;
  }

  try {
    const metadata = await sharp(inputBuffer).metadata();
    const imgWidth = metadata.width;
    const imgHeight = metadata.height;

    // Canvas size guard — prevent out-of-memory on huge images
    if (imgWidth > MAX_CANVAS_DIM || imgHeight > MAX_CANVAS_DIM) {
      if (logger) {
        logger(chalk.yellow(`  ⚠ Image too large for style processing (${imgWidth}x${imgHeight}), skipping`));
      }
      return inputBuffer;
    }

    // Min-width guard — title bar elements won't fit on tiny images
    if ((frame === "macos" || frame === "windows") && imgWidth < MIN_FRAME_WIDTH) {
      if (logger) {
        logger(chalk.yellow(`  ⚠ Image too narrow for ${frame} frame (${imgWidth}px < ${MIN_FRAME_WIDTH}px), skipping frame`));
      }
      // Continue without frame
      return applyStyle(inputBuffer, { ...styleConfig, frame: "none" }, logger, dpr);
    }

    // Scale CSS-pixel constants by DPR for retina-accurate rendering
    const scaledPadding = Math.round(padding * dpr);
    const scaledBorderRadius = Math.round(borderRadius * dpr);

    // Detect dark mode from config metadata
    const darkMode = styleConfig._darkMode || false;

    // --- Step 1: Round corners on screenshot (only when no frame — frame gets its own rounding) ---
    let contentBuffer = inputBuffer;
    if (scaledBorderRadius > 0 && frame === "none") {
      contentBuffer = await roundCorners(
        contentBuffer,
        scaledBorderRadius,
        imgWidth,
        imgHeight
      );
    }

    // --- Step 2: Add window frame ---
    let frameHeight = 0;
    let framedBuffer = contentBuffer;

    if (frame === "macos" || frame === "windows") {
      frameHeight = Math.round(FRAME_HEIGHT * dpr);
      const titleBarSvg =
        frame === "macos"
          ? generateMacOSTitleBar(imgWidth, darkMode, dpr)
          : generateWindowsTitleBar(imgWidth, darkMode, dpr);

      const titleBarBuffer = await sharp(titleBarSvg).png().toBuffer();

      // Create a canvas for frame + content
      const framedHeight = imgHeight + frameHeight;
      framedBuffer = await sharp({
        create: {
          width: imgWidth,
          height: framedHeight,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([
          { input: titleBarBuffer, top: 0, left: 0 },
          { input: contentBuffer, top: frameHeight, left: 0 },
        ])
        .png()
        .toBuffer();

      // Round the outer corners of the framed composite
      if (scaledBorderRadius > 0) {
        framedBuffer = await roundCorners(
          framedBuffer,
          scaledBorderRadius,
          imgWidth,
          framedHeight
        );
      }
    }

    const framedMeta = await sharp(framedBuffer).metadata();
    const contentWidth = framedMeta.width;
    const contentHeight = framedMeta.height;

    // --- Step 3: Shadow (scaled by DPR) ---
    const rawShadowConfig = SHADOW_PRESETS[shadow] || null;
    const shadowConfig = rawShadowConfig ? {
      blur: Math.round(rawShadowConfig.blur * dpr),
      spread: Math.round(rawShadowConfig.spread * dpr),
      offsetY: Math.round(rawShadowConfig.offsetY * dpr),
      opacity: rawShadowConfig.opacity,
    } : null;
    const shadowResult = shadowConfig
      ? await generateShadowLayer(
          contentWidth,
          contentHeight,
          shadowConfig,
          scaledBorderRadius
        )
      : null;

    // --- Step 4: Background + padding ---
    // Calculate final canvas dimensions
    const shadowExtra = shadowResult ? shadowResult.extra : 0;
    const shadowOffsetY = shadowResult ? shadowResult.offsetY : 0;
    const canvasWidth = contentWidth + scaledPadding * 2 + shadowExtra * 2;
    const canvasHeight =
      contentHeight + scaledPadding * 2 + shadowExtra * 2 + shadowOffsetY;

    // Resolve background color/gradient
    const bgColor = await resolveBackground(background, canvasWidth, canvasHeight);

    // Create the final canvas
    let canvas;
    if (Buffer.isBuffer(bgColor)) {
      // Gradient background - use the rendered gradient as base
      canvas = sharp(bgColor).resize(canvasWidth, canvasHeight);
    } else {
      canvas = sharp({
        create: {
          width: canvasWidth,
          height: canvasHeight,
          channels: 4,
          background: bgColor,
        },
      });
    }

    // Build composite layers
    const composites = [];

    // Shadow layer (behind content)
    if (shadowResult) {
      composites.push({
        input: shadowResult.buffer,
        top: scaledPadding,
        left: scaledPadding,
      });
    }

    // Content (framed screenshot)
    const contentLeft = scaledPadding + shadowExtra;
    const contentTop = scaledPadding + shadowExtra;
    composites.push({
      input: framedBuffer,
      top: contentTop,
      left: contentLeft,
    });

    const finalBuffer = await canvas.composite(composites).png().toBuffer();

    return finalBuffer;
  } catch (error) {
    if (logger) {
      logger(
        chalk.yellow(`  ⚠ Style processing failed: ${error.message}`)
      );
    }
    return inputBuffer;
  }
}

/**
 * Check if Sharp is available for style processing.
 * @returns {boolean}
 */
function isStyleAvailable() {
  return sharp !== null;
}

module.exports = {
  DEFAULT_STYLE_CONFIG,
  SHADOW_PRESETS,
  FRAME_HEIGHT,
  MAX_CANVAS_DIM,
  MIN_FRAME_WIDTH,
  validateStyleConfig,
  mergeStyleConfig,
  generateMacOSTitleBar,
  generateWindowsTitleBar,
  generateShadowLayer,
  resolveBackground,
  roundCorners,
  applyStyle,
  isStyleAvailable,
};
