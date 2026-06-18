const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  collectForbiddenText,
  assertForbiddenTextAbsent,
  normalizeVisibleText,
} = require("../../src/lib/capture-script-runner");

describe("quality gates", () => {
  it("merges global and scenario-level forbidden text without duplicates", () => {
    const merged = collectForbiddenText(
      { forbidText: ["Loading image", "Image unavailable"] },
      { quality: { forbidText: ["No results found", "Loading image"] } },
    );

    assert.deepEqual(merged, [
      "Loading image",
      "Image unavailable",
      "No results found",
    ]);
  });

  it("normalizes visible text for resilient matching", () => {
    assert.equal(
      normalizeVisibleText("  Loading\n   image... "),
      "loading image...",
    );
  });

  it("fails when forbidden text is visible in the page body", async () => {
    const page = {
      async evaluate(fn) {
        void fn;
        return "Everything loaded except for Loading image...";
      },
    };

    await assert.rejects(
      () => assertForbiddenTextAbsent(page, ["Loading image"]),
      /Forbidden visible text detected/i,
    );
  });
});
