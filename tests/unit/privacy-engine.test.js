/**
 * Unit tests for privacy-engine.js
 * Tests CSS generation, config merging, validation, selector isolation,
 * and injection result objects.
 * No browser required — pure function tests.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_PRIVACY_CONFIG,
  PRIVACY_STYLE_ATTR,
  normalizeSelector,
  validatePrivacyConfig,
  mergePrivacyConfig,
  generatePrivacyCSS,
  generatePrivacyInitScript,
  validateCSSSelector,
  pausePrivacyReinjection,
  resumePrivacyReinjection,
} = require("../../src/lib/privacy-engine");

// ─── normalizeSelector ──────────────────────────────────────

describe("normalizeSelector", () => {
  it("normalizes a plain string selector", () => {
    const result = normalizeSelector(".email", "redact", 8);
    assert.deepEqual(result, {
      selector: ".email",
      method: "redact",
      blurRadius: 8,
    });
  });

  it("normalizes an object selector with overrides", () => {
    const result = normalizeSelector(
      { selector: ".avatar", method: "blur", blurRadius: 12 },
      "redact",
      8
    );
    assert.deepEqual(result, {
      selector: ".avatar",
      method: "blur",
      blurRadius: 12,
    });
  });

  it("uses defaults when object has no overrides", () => {
    const result = normalizeSelector({ selector: ".name" }, "hide", 10);
    assert.deepEqual(result, {
      selector: ".name",
      method: "hide",
      blurRadius: 10,
    });
  });

  it("returns null for empty string", () => {
    assert.equal(normalizeSelector("", "redact", 8), null);
    assert.equal(normalizeSelector("   ", "redact", 8), null);
  });

  it("returns null for invalid input", () => {
    assert.equal(normalizeSelector(null, "redact", 8), null);
    assert.equal(normalizeSelector(42, "redact", 8), null);
    assert.equal(normalizeSelector({}, "redact", 8), null);
  });
});

// ─── validatePrivacyConfig ──────────────────────────────────

describe("validatePrivacyConfig", () => {
  it("accepts a valid config", () => {
    const result = validatePrivacyConfig({
      enabled: true,
      method: "blur",
      blurRadius: 12,
      selectors: [".email", { selector: ".avatar", method: "hide" }],
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it("accepts default config", () => {
    const result = validatePrivacyConfig(DEFAULT_PRIVACY_CONFIG);
    assert.equal(result.valid, true);
  });

  it("rejects invalid method", () => {
    const result = validatePrivacyConfig({ method: "scramble" });
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes("scramble"));
  });

  it("rejects blurRadius out of range", () => {
    const result = validatePrivacyConfig({ blurRadius: 0 });
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes("blurRadius"));

    const result2 = validatePrivacyConfig({ blurRadius: 200 });
    assert.equal(result2.valid, false);
  });

  it("rejects non-array selectors", () => {
    const result = validatePrivacyConfig({ selectors: ".email" });
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes("array"));
  });

  it("rejects empty selector strings", () => {
    const result = validatePrivacyConfig({ selectors: [""] });
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes("empty"));
  });

  it("rejects selector object without .selector", () => {
    const result = validatePrivacyConfig({
      selectors: [{ method: "blur" }],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes("selector"));
  });

  it("rejects null input", () => {
    const result = validatePrivacyConfig(null);
    assert.equal(result.valid, false);
  });
});

// ─── validateCSSSelector ────────────────────────────────────

describe("validateCSSSelector", () => {
  it("accepts valid CSS selectors", () => {
    assert.equal(validateCSSSelector(".email").valid, true);
    assert.equal(validateCSSSelector("#user-name").valid, true);
    assert.equal(validateCSSSelector("[data-testid='avatar']").valid, true);
    assert.equal(validateCSSSelector(".parent > .child").valid, true);
    assert.equal(validateCSSSelector("div.class:nth-child(2)").valid, true);
  });

  it("rejects HTML tags (injection attempt)", () => {
    assert.equal(validateCSSSelector("</style><script>alert(1)</script>").valid, false);
    assert.equal(validateCSSSelector("<div>").valid, false);
  });

  it("rejects CSS block characters", () => {
    assert.equal(validateCSSSelector(".foo { color: red }").valid, false);
    assert.equal(validateCSSSelector(".foo; .bar").valid, false);
  });

  it("rejects selectors over 500 characters", () => {
    const long = ".a".repeat(300);
    assert.equal(validateCSSSelector(long).valid, false);
  });

  it("rejects empty and non-string input", () => {
    assert.equal(validateCSSSelector("").valid, false);
    assert.equal(validateCSSSelector("   ").valid, false);
    assert.equal(validateCSSSelector(null).valid, false);
    assert.equal(validateCSSSelector(42).valid, false);
  });
});

// ─── mergePrivacyConfig ─────────────────────────────────────

describe("mergePrivacyConfig", () => {
  it("returns global config when no overrides", () => {
    const global = {
      enabled: true,
      method: "redact",
      blurRadius: 8,
      selectors: [".email"],
    };
    const result = mergePrivacyConfig(global, undefined);
    assert.deepEqual(result, global);
  });

  it("merges selectors additively", () => {
    const global = {
      enabled: true,
      method: "redact",
      blurRadius: 8,
      selectors: [".email"],
    };
    const overrides = { selectors: [".avatar"] };
    const result = mergePrivacyConfig(global, overrides);
    assert.deepEqual(result.selectors, [".email", ".avatar"]);
  });

  it("deduplicates selectors by normalized string", () => {
    const global = {
      enabled: true,
      method: "redact",
      blurRadius: 8,
      selectors: [".email", ".avatar"],
    };
    const overrides = { selectors: [".email", ".phone"] };
    const result = mergePrivacyConfig(global, overrides);
    // .email appears in both — should only be in result once
    assert.equal(result.selectors.length, 3);
    assert.deepEqual(result.selectors, [".email", ".avatar", ".phone"]);
  });

  it("deduplicates object selectors by .selector string", () => {
    const global = {
      enabled: true,
      method: "redact",
      blurRadius: 8,
      selectors: [{ selector: ".email", method: "redact" }],
    };
    const overrides = { selectors: [{ selector: ".email", method: "blur" }] };
    const result = mergePrivacyConfig(global, overrides);
    // Dedup: first occurrence wins
    assert.equal(result.selectors.length, 1);
    assert.equal(result.selectors[0].method, "redact");
  });

  it("overrides method and blurRadius", () => {
    const global = {
      enabled: true,
      method: "redact",
      blurRadius: 8,
      selectors: [".email"],
    };
    const overrides = { method: "blur", blurRadius: 16 };
    const result = mergePrivacyConfig(global, overrides);
    assert.equal(result.method, "blur");
    assert.equal(result.blurRadius, 16);
    assert.deepEqual(result.selectors, [".email"]); // Selectors unchanged
  });

  it("overrides enabled flag", () => {
    const global = { enabled: true, method: "redact", selectors: [] };
    const overrides = { enabled: false };
    const result = mergePrivacyConfig(global, overrides);
    assert.equal(result.enabled, false);
  });

  it("handles null global config", () => {
    const overrides = { method: "blur", selectors: [".avatar"] };
    const result = mergePrivacyConfig(null, overrides);
    assert.equal(result.method, "blur");
    assert.deepEqual(result.selectors, [".avatar"]);
  });
});

// ─── generatePrivacyCSS ─────────────────────────────────────

describe("generatePrivacyCSS", () => {
  it("generates redact CSS", () => {
    const css = generatePrivacyCSS({
      method: "redact",
      blurRadius: 8,
      selectors: [".email"],
    });
    assert.ok(css.includes(".email"));
    assert.ok(css.includes("color: transparent"));
    assert.ok(css.includes("background-color: currentColor"));
  });

  it("generates blur CSS", () => {
    const css = generatePrivacyCSS({
      method: "blur",
      blurRadius: 12,
      selectors: [".avatar"],
    });
    assert.ok(css.includes(".avatar"));
    assert.ok(css.includes("filter: blur(12px)"));
  });

  it("generates hide CSS", () => {
    const css = generatePrivacyCSS({
      method: "hide",
      selectors: [".sidebar"],
    });
    assert.ok(css.includes("visibility: hidden"));
  });

  it("generates remove CSS", () => {
    const css = generatePrivacyCSS({
      method: "remove",
      selectors: [".ad-banner"],
    });
    assert.ok(css.includes("display: none"));
  });

  it("handles mixed selector formats", () => {
    const css = generatePrivacyCSS({
      method: "redact",
      blurRadius: 8,
      selectors: [
        ".email",
        { selector: ".avatar", method: "blur", blurRadius: 16 },
      ],
    });
    assert.ok(css.includes(".email"));
    assert.ok(css.includes("color: transparent")); // Default for .email
    assert.ok(css.includes(".avatar"));
    assert.ok(css.includes("filter: blur(16px)")); // Override for .avatar
  });

  it("generates separate rules per selector", () => {
    const css = generatePrivacyCSS({
      method: "redact",
      blurRadius: 8,
      selectors: [".a", ".b", ".c"],
    });
    const rules = css.split("\n").filter((l) => l.trim());
    assert.equal(rules.length, 3);
  });

  it("skips invalid selectors without breaking others", () => {
    const css = generatePrivacyCSS({
      method: "redact",
      blurRadius: 8,
      selectors: [".valid", "</style><script>xss</script>", ".also-valid"],
    });
    // The HTML-injection selector should be skipped
    assert.ok(css.includes(".valid"));
    assert.ok(css.includes(".also-valid"));
    assert.ok(!css.includes("<script>"));
    // Should have 2 rules (invalid one skipped)
    const rules = css.split("\n").filter((l) => l.trim());
    assert.equal(rules.length, 2);
  });

  it("returns empty string for no selectors", () => {
    assert.equal(generatePrivacyCSS({ selectors: [] }), "");
    assert.equal(generatePrivacyCSS(null), "");
    assert.equal(generatePrivacyCSS({}), "");
  });
});

// ─── generatePrivacyInitScript ──────────────────────────────

describe("generatePrivacyInitScript", () => {
  it("returns CSS string for valid config", () => {
    const result = generatePrivacyInitScript({
      enabled: true,
      method: "blur",
      blurRadius: 8,
      selectors: [".email"],
    });
    assert.ok(result.includes("filter: blur"));
  });

  it("returns null when disabled", () => {
    assert.equal(
      generatePrivacyInitScript({ enabled: false, selectors: [".email"] }),
      null
    );
  });

  it("returns null for empty selectors", () => {
    assert.equal(
      generatePrivacyInitScript({ enabled: true, selectors: [] }),
      null
    );
  });
});

// ─── PRIVACY_STYLE_ATTR constant ────────────────────────────

describe("PRIVACY_STYLE_ATTR", () => {
  it("is exported and is a string", () => {
    assert.equal(typeof PRIVACY_STYLE_ATTR, "string");
    assert.ok(PRIVACY_STYLE_ATTR.length > 0);
    assert.equal(PRIVACY_STYLE_ATTR, "data-reshot-privacy");
  });
});

// ─── pausePrivacyReinjection / resumePrivacyReinjection ─────

describe("pausePrivacyReinjection", () => {
  it("sets and clears the pause flag on a mock page", () => {
    const mockPage = {};
    assert.equal(mockPage._reshotPrivacyPaused, undefined);

    pausePrivacyReinjection(mockPage);
    assert.equal(mockPage._reshotPrivacyPaused, true);

    resumePrivacyReinjection(mockPage);
    assert.equal(mockPage._reshotPrivacyPaused, false);
  });
});

// ─── injectPrivacyMasking return type ───────────────────────

describe("injectPrivacyMasking return type", () => {
  // We can't test actual browser injection in unit tests, but we can test
  // that the function returns the right shape for non-injection paths

  const { injectPrivacyMasking } = require("../../src/lib/privacy-engine");

  it("returns success for disabled config", async () => {
    const result = await injectPrivacyMasking(null, { enabled: false }, null);
    assert.equal(result.success, true);
    assert.equal(result.injectedCount, 0);
  });

  it("returns success for empty selectors", async () => {
    const result = await injectPrivacyMasking(null, { enabled: true, selectors: [] }, null);
    assert.equal(result.success, true);
    assert.equal(result.injectedCount, 0);
  });

  it("returns success for null config", async () => {
    const result = await injectPrivacyMasking(null, null, null);
    assert.equal(result.success, true);
  });
});
