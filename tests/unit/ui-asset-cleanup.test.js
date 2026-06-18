const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  countFilesRecursive,
  deleteAllOutputAssets,
  deleteScenarioAssetDirectories,
} = require("../../src/lib/ui-asset-cleanup");
const { isPathWithinBase } = require("../../src/lib/ui-api-helpers");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "reshot-asset-cleanup-"));
}

function writeFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

describe("ui asset cleanup", () => {
  it("counts files recursively", () => {
    const root = makeTempDir();
    writeFile(path.join(root, "one.png"));
    writeFile(path.join(root, "nested", "two.png"));
    writeFile(path.join(root, "nested", "deep", "three.webm"));

    assert.equal(countFilesRecursive(root), 3);
  });

  it("deletes all output assets while preserving the output directory", () => {
    const root = makeTempDir();
    writeFile(path.join(root, "scenario-a", "latest", "desktop.png"));
    writeFile(path.join(root, "scenario-b", "latest", "mobile.png"));

    assert.equal(deleteAllOutputAssets(root), 2);
    assert.equal(fs.existsSync(root), true);
    assert.deepEqual(fs.readdirSync(root), []);
  });

  it("returns zero when output directory is missing", () => {
    assert.equal(deleteAllOutputAssets(path.join(makeTempDir(), "missing")), 0);
  });

  it("deletes only requested scenario directories inside output", () => {
    const root = makeTempDir();
    writeFile(path.join(root, "scenario-a", "latest", "desktop.png"));
    writeFile(path.join(root, "scenario-a", "history", "mobile.png"));
    writeFile(path.join(root, "scenario-b", "latest", "desktop.png"));

    const result = deleteScenarioAssetDirectories(
      root,
      ["scenario-a", "missing"],
      isPathWithinBase,
    );

    assert.deepEqual(result, { deletedScenarios: 1, deletedFiles: 2 });
    assert.equal(fs.existsSync(path.join(root, "scenario-a")), false);
    assert.equal(fs.existsSync(path.join(root, "scenario-b")), true);
  });

  it("skips scenario paths that escape the output directory", () => {
    const root = makeTempDir();
    const sibling = `${root}-sibling`;
    writeFile(path.join(root, "safe", "asset.png"));
    writeFile(path.join(sibling, "asset.png"));

    const result = deleteScenarioAssetDirectories(
      root,
      ["..", path.basename(sibling), "safe"],
      isPathWithinBase,
    );

    assert.deepEqual(result, { deletedScenarios: 1, deletedFiles: 1 });
    assert.equal(fs.existsSync(sibling), true);
  });
});
