const { afterEach, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");

const publishPath = require.resolve("../../src/commands/publish");

let tempDir = null;

afterEach(async () => {
  delete require.cache[publishPath];
  if (tempDir) {
    await fs.remove(tempDir);
    tempDir = null;
  }
});

describe("publish manifest scope", () => {
  it("collects screenshots only from the latest successful run directories", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "reshot-publish-scope-"));
    const outputDir = path.join(tempDir, ".reshot", "output");
    const selectedDir = path.join(outputDir, "platform-dashboard", "2026-04-09_10-00-00", "theme-light");
    const skippedDir = path.join(outputDir, "workspace-visuals", "2026-01-01_00-00-00", "theme-light");

    await fs.ensureDir(selectedDir);
    await fs.ensureDir(skippedDir);
    await fs.writeFile(path.join(selectedDir, "step-0-initial.png"), "selected");
    await fs.writeFile(path.join(skippedDir, "step-0-initial.png"), "skipped");

    const {
      resolveManifestScopedScreenshotFiles,
    } = require(publishPath);

    const scoped = resolveManifestScopedScreenshotFiles(outputDir, {
      success: true,
      scenarios: [
        {
          key: "platform-dashboard",
          success: true,
          outputDir: path.join(outputDir, "platform-dashboard", "2026-04-09_10-00-00", "theme-light"),
        },
      ],
    });

    assert.equal(scoped.screenshotFiles.length, 1);
    assert.match(scoped.screenshotFiles[0], /platform-dashboard/);
    assert.doesNotMatch(scoped.screenshotFiles[0], /workspace-visuals/);
  });
});
