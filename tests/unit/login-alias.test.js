const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const cliPath = path.join(__dirname, "../../src/index.js");

describe("login command alias", () => {
  it("exposes top-level reshot login as an auth alias", () => {
    const result = spawnSync(process.execPath, [cliPath, "login", "--help"], {
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: reshot login/);
    assert.match(result.stdout, /Compatibility alias for `reshot auth`/);
  });
});
