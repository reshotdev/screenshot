/**
 * Unit tests for style-engine.js
 * Tests config validation, merging, SVG generation, DPI scaling,
 * gradient parsing, canvas bounds, and the compositing pipeline.
 * Uses Sharp for image buffer operations (same dependency as production code).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_STYLE_CONFIG,
  SHADOW_PRESETS,
  FRAME_HEIGHT,
  MAX_CANVAS_DIM,
  MIN_FRAME_WIDTH,
  validateStyleConfig,
  mergeStyleConfig,
  generateMacOSTitleBar,
  generateWindowsTitleBar,
  resolveBackground,
  applyStyle,
  isStyleAvailable,
} = require("../../src/lib/style-engine");

// ─── validateStyleConfig ────────────────────────────────────

describe("validateStyleConfig", () => {
  it("accepts default config", () => {
    const result = validateStyleConfig(DEFAULT_STYLE_CONFIG);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it("accepts valid custom config", () => {
    const result = validateStyleConfig({
      frame: "macos",
      shadow: "large",
      padding: 60,
      background: "#f5f5f5",
      borderRadius: 12,
    });
    assert.equal(result.valid, true);
  });

  it("rejects invalid frame", () => {
    const result = validateStyleConfig({ frame: "linux" });
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes("frame"));
  });

  it("rejects invalid shadow", () => {
    const result = validateStyleConfig({ shadow: "huge" });
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes("shadow"));
  });

  it("rejects padding out of range", () => {
    assert.equal(validateStyleConfig({ padding: -1 }).valid, false);
    assert.equal(validateStyleConfig({ padding: 250 }).valid, false);
  });

  it("rejects borderRadius out of range", () => {
    assert.equal(validateStyleConfig({ borderRadius: -1 }).valid, false);
    assert.equal(validateStyleConfig({ borderRadius: 150 }).valid, false);
  });

  it("accepts transparent background", () => {
    assert.equal(
      validateStyleConfig({ background: "transparent" }).valid,
      true
    );
  });

  it("accepts hex background", () => {
    assert.equal(validateStyleConfig({ background: "#ff0000" }).valid, true);
    assert.equal(validateStyleConfig({ background: "#fff" }).valid, true);
    assert.equal(validateStyleConfig({ background: "#ff000080" }).valid, true);
  });

  it("accepts linear-gradient background", () => {
    assert.equal(
      validateStyleConfig({
        background: "linear-gradient(135deg, #667eea, #764ba2)",
      }).valid,
      true
    );
  });

  it("rejects invalid background string", () => {
    const result = validateStyleConfig({ background: "red" });
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes("background"));
  });

  it("rejects null input", () => {
    const result = validateStyleConfig(null);
    assert.equal(result.valid, false);
  });
});

// ─── mergeStyleConfig ───────────────────────────────────────

describe("mergeStyleConfig", () => {
  it("returns global config when no overrides", () => {
    const global = { ...DEFAULT_STYLE_CONFIG, frame: "macos" };
    const result = mergeStyleConfig(global, undefined);
    assert.deepEqual(result, global);
  });

  it("flat-replaces individual fields", () => {
    const global = { ...DEFAULT_STYLE_CONFIG };
    const overrides = { frame: "windows", padding: 80 };
    const result = mergeStyleConfig(global, overrides);
    assert.equal(result.frame, "windows");
    assert.equal(result.padding, 80);
    assert.equal(result.shadow, DEFAULT_STYLE_CONFIG.shadow); // Unchanged
  });

  it("handles null global config", () => {
    const overrides = { frame: "macos" };
    const result = mergeStyleConfig(null, overrides);
    assert.equal(result.frame, "macos");
    assert.equal(result.shadow, DEFAULT_STYLE_CONFIG.shadow); // From default
  });

  it("ignores undefined override values", () => {
    const global = { ...DEFAULT_STYLE_CONFIG, frame: "macos" };
    const overrides = { frame: undefined, padding: 60 };
    const result = mergeStyleConfig(global, overrides);
    assert.equal(result.frame, "macos"); // Not overridden
    assert.equal(result.padding, 60);
  });
});

// ─── SVG generation ─────────────────────────────────────────

describe("generateMacOSTitleBar", () => {
  it("generates valid SVG buffer", () => {
    const svg = generateMacOSTitleBar(1280);
    assert.ok(Buffer.isBuffer(svg));
    const text = svg.toString("utf-8");
    assert.ok(text.includes("<svg"));
    assert.ok(text.includes("width=\"1280\""));
    assert.ok(text.includes(`height="${FRAME_HEIGHT}"`));
  });

  it("includes traffic light circles", () => {
    const text = generateMacOSTitleBar(1280).toString("utf-8");
    assert.ok(text.includes("#ff5f57")); // Red
    assert.ok(text.includes("#febc2e")); // Yellow
    assert.ok(text.includes("#28c840")); // Green
  });

  it("supports dark mode", () => {
    const light = generateMacOSTitleBar(1280, false).toString("utf-8");
    const dark = generateMacOSTitleBar(1280, true).toString("utf-8");
    assert.ok(light.includes("#e8e8e8")); // Light background
    assert.ok(dark.includes("#2d2d2d")); // Dark background
  });

  it("scales by DPI factor", () => {
    const svg1x = generateMacOSTitleBar(1280, false, 1).toString("utf-8");
    const svg2x = generateMacOSTitleBar(1280, false, 2).toString("utf-8");

    // At 2x, frame height should be doubled
    assert.ok(svg1x.includes(`height="${FRAME_HEIGHT}"`));
    assert.ok(svg2x.includes(`height="${FRAME_HEIGHT * 2}"`));

    // Traffic light radius should also be doubled
    const r1x = 6; // TRAFFIC_LIGHT_RADIUS
    const r2x = 12;
    assert.ok(svg1x.includes(`r="${r1x}"`));
    assert.ok(svg2x.includes(`r="${r2x}"`));
  });
});

describe("generateWindowsTitleBar", () => {
  it("generates valid SVG buffer", () => {
    const svg = generateWindowsTitleBar(1280);
    assert.ok(Buffer.isBuffer(svg));
    const text = svg.toString("utf-8");
    assert.ok(text.includes("<svg"));
    assert.ok(text.includes("width=\"1280\""));
  });

  it("includes window controls", () => {
    const text = generateWindowsTitleBar(1280).toString("utf-8");
    // Should have minimize, maximize, and close button groups
    assert.ok(text.includes("Minimize"));
    assert.ok(text.includes("Maximize"));
    assert.ok(text.includes("Close"));
  });

  it("scales by DPI factor", () => {
    const svg1x = generateWindowsTitleBar(1280, false, 1).toString("utf-8");
    const svg2x = generateWindowsTitleBar(1280, false, 2).toString("utf-8");

    // At 2x, frame height should be doubled
    assert.ok(svg1x.includes(`height="${FRAME_HEIGHT}"`));
    assert.ok(svg2x.includes(`height="${FRAME_HEIGHT * 2}"`));
  });
});

// ─── resolveBackground ──────────────────────────────────────

describe("resolveBackground", () => {
  it("resolves transparent", async () => {
    const result = await resolveBackground("transparent", 100, 100);
    assert.equal(result.alpha, 0);
  });

  it("resolves null as transparent", async () => {
    const result = await resolveBackground(null, 100, 100);
    assert.equal(result.alpha, 0);
  });

  it("resolves hex color", async () => {
    const result = await resolveBackground("#ff0000", 100, 100);
    assert.equal(result.r, 255);
    assert.equal(result.g, 0);
    assert.equal(result.b, 0);
    assert.equal(result.alpha, 1);
  });

  it("resolves short hex", async () => {
    const result = await resolveBackground("#fff", 100, 100);
    assert.equal(result.r, 255);
    assert.equal(result.g, 255);
    assert.equal(result.b, 255);
  });

  it("resolves hex with alpha", async () => {
    const result = await resolveBackground("#ff000080", 100, 100);
    assert.equal(result.r, 255);
    assert.ok(Math.abs(result.alpha - 0.502) < 0.01);
  });

  it("falls back to transparent for invalid value", async () => {
    const result = await resolveBackground("rgb(255,0,0)", 100, 100);
    assert.equal(result.alpha, 0);
  });
});

// ─── Constants ──────────────────────────────────────────────

describe("Style engine constants", () => {
  it("exports MAX_CANVAS_DIM", () => {
    assert.equal(typeof MAX_CANVAS_DIM, "number");
    assert.equal(MAX_CANVAS_DIM, 16384);
  });

  it("exports MIN_FRAME_WIDTH", () => {
    assert.equal(typeof MIN_FRAME_WIDTH, "number");
    assert.equal(MIN_FRAME_WIDTH, 100);
  });
});

// ─── applyStyle (integration) ───────────────────────────────

describe("applyStyle", () => {
  // Skip these tests if Sharp is not available
  if (!isStyleAvailable()) {
    it("skips when Sharp is not available", () => {
      assert.ok(true);
    });
    return;
  }

  const sharp = require("sharp");

  /** Create a simple test PNG buffer */
  async function createTestImage(width = 100, height = 80) {
    return sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
  }

  it("returns input unchanged when style is disabled", async () => {
    const input = await createTestImage();
    const result = await applyStyle(input, { enabled: false });
    assert.deepEqual(result, input);
  });

  it("returns input unchanged when all features are off", async () => {
    const input = await createTestImage();
    const result = await applyStyle(input, {
      enabled: true,
      frame: "none",
      shadow: "none",
      padding: 0,
      borderRadius: 0,
    });
    assert.deepEqual(result, input);
  });

  it("adds padding (expands canvas)", async () => {
    const input = await createTestImage(100, 80);
    const result = await applyStyle(input, {
      enabled: true,
      frame: "none",
      shadow: "none",
      padding: 20,
      background: "transparent",
      borderRadius: 0,
    });

    const meta = await sharp(result).metadata();
    // Should be at least 100 + 20*2 = 140 wide
    assert.ok(meta.width >= 140, `Expected width >= 140, got ${meta.width}`);
    assert.ok(meta.height >= 120, `Expected height >= 120, got ${meta.height}`);
  });

  it("scales padding by DPR", async () => {
    const input = await createTestImage(200, 100);
    const result1x = await applyStyle(input, {
      enabled: true,
      frame: "none",
      shadow: "none",
      padding: 20,
      background: "transparent",
      borderRadius: 0,
    }, null, 1);
    const result2x = await applyStyle(input, {
      enabled: true,
      frame: "none",
      shadow: "none",
      padding: 20,
      background: "transparent",
      borderRadius: 0,
    }, null, 2);

    const meta1x = await sharp(result1x).metadata();
    const meta2x = await sharp(result2x).metadata();

    // 2x DPR should produce bigger canvas (padding is 40px instead of 20px)
    assert.ok(meta2x.width > meta1x.width, `Expected 2x width (${meta2x.width}) > 1x width (${meta1x.width})`);
    assert.ok(meta2x.height > meta1x.height, `Expected 2x height > 1x height`);
  });

  it("adds macOS frame (increases height)", async () => {
    const input = await createTestImage(200, 100);
    const result = await applyStyle(input, {
      enabled: true,
      frame: "macos",
      shadow: "none",
      padding: 0,
      background: "transparent",
      borderRadius: 0,
    });

    const meta = await sharp(result).metadata();
    // Height should increase by FRAME_HEIGHT
    assert.ok(
      meta.height >= 100 + FRAME_HEIGHT,
      `Expected height >= ${100 + FRAME_HEIGHT}, got ${meta.height}`
    );
  });

  it("scales frame height by DPR=2", async () => {
    const input = await createTestImage(200, 100);
    const result2x = await applyStyle(input, {
      enabled: true,
      frame: "macos",
      shadow: "none",
      padding: 0,
      background: "transparent",
      borderRadius: 0,
    }, null, 2);

    const meta2x = await sharp(result2x).metadata();
    // Frame height at 2x should be FRAME_HEIGHT * 2
    assert.ok(
      meta2x.height >= 100 + FRAME_HEIGHT * 2,
      `Expected height >= ${100 + FRAME_HEIGHT * 2}, got ${meta2x.height}`
    );
  });

  it("adds shadow (increases canvas)", async () => {
    const input = await createTestImage(100, 80);
    const result = await applyStyle(input, {
      enabled: true,
      frame: "none",
      shadow: "medium",
      padding: 0,
      background: "transparent",
      borderRadius: 0,
    });

    const meta = await sharp(result).metadata();
    // Shadow should expand the canvas
    assert.ok(meta.width > 100, `Expected width > 100, got ${meta.width}`);
    assert.ok(meta.height > 80, `Expected height > 80, got ${meta.height}`);
  });

  it("applies full pipeline (frame + shadow + padding + radius)", async () => {
    const input = await createTestImage(200, 150);
    const result = await applyStyle(input, {
      enabled: true,
      frame: "macos",
      shadow: "large",
      padding: 40,
      background: "#f5f5f5",
      borderRadius: 8,
    });

    const meta = await sharp(result).metadata();
    // Result should be significantly larger than input
    assert.ok(meta.width > 200, `Expected width > 200, got ${meta.width}`);
    assert.ok(meta.height > 150 + FRAME_HEIGHT, `Expected height > ${150 + FRAME_HEIGHT}, got ${meta.height}`);
    // Should be a valid PNG
    assert.equal(meta.format, "png");
  });

  it("handles gradient background", async () => {
    const input = await createTestImage(100, 80);
    const result = await applyStyle(input, {
      enabled: true,
      frame: "none",
      shadow: "none",
      padding: 20,
      background: "linear-gradient(135deg, #667eea, #764ba2)",
      borderRadius: 0,
    });

    const meta = await sharp(result).metadata();
    assert.equal(meta.format, "png");
    assert.ok(meta.width >= 140);
  });

  it("handles gradient with rgba colors", async () => {
    const input = await createTestImage(100, 80);
    // This should not throw — the gradient parser should handle rgba()
    const result = await applyStyle(input, {
      enabled: true,
      frame: "none",
      shadow: "none",
      padding: 20,
      background: "linear-gradient(to top right, rgba(255,0,0,0.5) 30%, #764ba2)",
      borderRadius: 0,
    });

    const meta = await sharp(result).metadata();
    assert.equal(meta.format, "png");
  });

  it("uses dark mode frame colors when _darkMode is set", async () => {
    const input = await createTestImage(200, 100);
    // Should not throw — dark mode just changes SVG colors
    const result = await applyStyle(input, {
      enabled: true,
      frame: "macos",
      shadow: "none",
      padding: 0,
      background: "transparent",
      borderRadius: 0,
      _darkMode: true,
    });

    const meta = await sharp(result).metadata();
    assert.equal(meta.format, "png");
    assert.ok(meta.height >= 100 + FRAME_HEIGHT);
  });

  it("skips frame for narrow images (< MIN_FRAME_WIDTH)", async () => {
    const input = await createTestImage(50, 80);
    const result = await applyStyle(input, {
      enabled: true,
      frame: "macos",
      shadow: "none",
      padding: 20,
      background: "transparent",
      borderRadius: 0,
    });

    const meta = await sharp(result).metadata();
    // Frame should be skipped — height should NOT include frame
    // The image should just have padding applied
    assert.ok(meta.width >= 90, `Expected width >= 90, got ${meta.width}`); // 50 + 20*2
    // Height should NOT include frame height since frame was skipped
    assert.ok(meta.height < 80 + FRAME_HEIGHT + 40, `Frame should have been skipped for narrow image`);
  });

  it("gracefully handles errors in style processing", async () => {
    // Pass an invalid buffer
    const result = await applyStyle(Buffer.from("not-a-png"), {
      enabled: true,
      frame: "macos",
      shadow: "medium",
      padding: 40,
    });
    // Should return the input buffer unchanged
    assert.deepEqual(result, Buffer.from("not-a-png"));
  });
});
