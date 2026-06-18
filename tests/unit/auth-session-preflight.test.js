const { beforeEach, afterEach, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { writeSessionArtifacts } = require("../../src/lib/record-cdp");
const { preflightAuthCheck } = require("../../src/lib/capture-script-runner");

describe("auth preflight session guard", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "reshot-auth-preflight-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("fails fast when the cached session belongs to another environment", async () => {
    const sessionPath = path.join(tempDir, "session-state.json");
    writeSessionArtifacts(
      sessionPath,
      {
        cookies: [
          {
            name: "sb",
            value: "abc",
            domain: ".staging.example.com",
            path: "/",
          },
        ],
        origins: [{ origin: "https://staging.example.com", localStorage: [] }],
      },
      {
        pageUrl: "https://staging.example.com/app/projects",
      },
    );

    const result = await preflightAuthCheck("https://preview.example.com", {
      storageStatePath: sessionPath,
      authCheckUrl: "/app/projects",
    });

    assert.equal(result.ok, false);
    assert.match(result.message, /does not match this environment/i);
    assert.match(result.message, /Run `reshot record`/i);
  });
});
