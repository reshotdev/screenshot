const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  promoteLastGotoUrl,
} = require("../../src/lib/capture-script-runner");

describe("promoteLastGotoUrl", () => {
  it("promotes a new navigated URL for retry recovery", () => {
    const restoredUrl = promoteLastGotoUrl(
      "http://localhost:3000/scenarios",
      "http://localhost:3000/scenarios/platform-project-dashboard"
    );

    assert.equal(
      restoredUrl,
      "http://localhost:3000/scenarios/platform-project-dashboard"
    );
  });

  it("keeps the previous restoration URL for blank or unchanged pages", () => {
    assert.equal(
      promoteLastGotoUrl("http://localhost:3000/scenarios", "about:blank"),
      "http://localhost:3000/scenarios"
    );

    assert.equal(
      promoteLastGotoUrl(
        "http://localhost:3000/scenarios",
        "http://localhost:3000/scenarios"
      ),
      "http://localhost:3000/scenarios"
    );
  });
});
