const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  generateVariantCombinations,
  getPlatformUrl,
  isPathWithinBase,
  isValidPathSegment,
} = require("../../src/lib/ui-api-helpers");

describe("ui-api helpers", () => {
  const originalApiBaseUrl = process.env.RESHOT_API_BASE_URL;

  beforeEach(() => {
    delete process.env.RESHOT_API_BASE_URL;
  });

  afterEach(() => {
    if (originalApiBaseUrl === undefined) {
      delete process.env.RESHOT_API_BASE_URL;
    } else {
      process.env.RESHOT_API_BASE_URL = originalApiBaseUrl;
    }
  });

  it("resolves platform URL from settings, env, then production default", () => {
    assert.equal(
      getPlatformUrl({ platformUrl: "http://localhost:3000" }),
      "http://localhost:3000",
    );

    process.env.RESHOT_API_BASE_URL = "https://staging.reshot.dev/api";
    assert.equal(getPlatformUrl({}), "https://staging.reshot.dev");

    delete process.env.RESHOT_API_BASE_URL;
    assert.equal(getPlatformUrl({}), "https://reshot.dev");
  });

  it("generates cartesian variant combinations for selected dimensions", () => {
    const combinations = generateVariantCombinations(
      {
        locale: { options: { en: {}, ko: {} } },
        theme: { options: { light: {}, dark: {} } },
        unused: { options: { admin: {} } },
      },
      ["locale", "theme"],
    );

    assert.deepEqual(combinations, [
      { locale: "en", theme: "light" },
      { locale: "en", theme: "dark" },
      { locale: "ko", theme: "light" },
      { locale: "ko", theme: "dark" },
    ]);
  });

  it("returns no variant combinations when dimensions are absent or empty", () => {
    assert.deepEqual(generateVariantCombinations(null, ["locale"]), []);
    assert.deepEqual(generateVariantCombinations({ locale: {} }, ["locale"]), []);
    assert.deepEqual(generateVariantCombinations({ locale: { options: {} } }, []), []);
  });

  it("rejects unsafe path segments", () => {
    assert.equal(isValidPathSegment("dashboard"), true);
    assert.equal(isValidPathSegment(""), false);
    assert.equal(isValidPathSegment("."), false);
    assert.equal(isValidPathSegment(".."), false);
    assert.equal(isValidPathSegment("../dashboard"), false);
    assert.equal(isValidPathSegment("nested/dashboard"), false);
    assert.equal(isValidPathSegment("nested\\dashboard"), false);
    assert.equal(isValidPathSegment("bad\0segment"), false);
  });

  it("requires resolved paths to stay inside the base directory", () => {
    const base = path.join("/tmp", "reshot-output");

    assert.equal(isPathWithinBase(path.join(base, "scenario"), base), true);
    assert.equal(isPathWithinBase(base, base), true);
    assert.equal(
      isPathWithinBase(path.join("/tmp", "reshot-output-sibling"), base),
      false,
    );
    assert.equal(isPathWithinBase(path.join(base, "..", "escape"), base), false);
  });
});
