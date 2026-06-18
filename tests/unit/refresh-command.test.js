const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { shouldFailOnError } = require("../../src/commands/refresh");

describe("refresh --fail-on-error (CI gating)", () => {
  it("returns false without the flag, even when errors > 0", () => {
    assert.equal(shouldFailOnError({}, { errors: 3 }), false);
  });
  it("returns false with the flag when there are no errors", () => {
    assert.equal(shouldFailOnError({ failOnError: true }, { errors: 0 }), false);
  });
  it("returns true with the flag when errors > 0", () => {
    assert.equal(shouldFailOnError({ failOnError: true }, { errors: 2 }), true);
  });
  it("is null-safe (missing result/options)", () => {
    assert.equal(shouldFailOnError(undefined, undefined), false);
    assert.equal(shouldFailOnError({ failOnError: true }, undefined), false);
  });
});
