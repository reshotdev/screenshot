const { afterEach, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");

const modulePath = require.resolve("../../src/lib/run-manifest");

let tempDir = null;
let originalCwd = null;

afterEach(async () => {
  if (originalCwd) {
    process.chdir(originalCwd);
    originalCwd = null;
  }
  delete require.cache[modulePath];
  if (tempDir) {
    await fs.remove(tempDir);
    tempDir = null;
  }
});

describe("run manifest helpers", () => {
  it("persists and resolves the latest successful run manifest", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "reshot-run-manifest-"));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    const {
      writeRunManifest,
      getLatestSuccessfulRunManifest,
      LATEST_RUN_MANIFEST_PATH,
    } = require(modulePath);

    writeRunManifest({
      runId: "failed-run",
      success: false,
      scenarios: [{ key: "alpha", success: false, outputDir: "/tmp/alpha" }],
    });

    writeRunManifest({
      runId: "successful-run",
      success: true,
      scenarios: [{ key: "beta", success: true, outputDir: "/tmp/beta" }],
    });

    const latest = getLatestSuccessfulRunManifest();
    assert.equal(latest.runId, "successful-run");
    assert.equal(latest.success, true);
    assert.equal(latest.scenarios[0].outputDir, "/tmp/beta");

    const latestFile = await fs.readJson(LATEST_RUN_MANIFEST_PATH);
    assert.equal(latestFile.runId, "successful-run");
  });
});
