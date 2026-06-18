const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  countAssets,
  detectVariants,
  formatTimestampFolder,
  isTimestampFolder,
  listScenarioVersions,
} = require("../../src/lib/ui-output-versions");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "reshot-output-versions-"));
}

function writeFile(filePath, content = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function localTimestampIso(value) {
  const [date, time] = value.split("_");
  const [year, month, day] = date.split("-");
  const [hour, min, sec] = time.split("-");

  return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`).toISOString();
}

describe("ui output versions", () => {
  it("detects timestamp folders", () => {
    assert.equal(isTimestampFolder("2026-05-26_10-30-45"), true);
    assert.equal(isTimestampFolder("latest"), false);
    assert.equal(isTimestampFolder("2026-05-26"), false);
  });

  it("counts supported assets recursively", () => {
    const root = makeTempDir();
    writeFile(path.join(root, "desktop.png"));
    writeFile(path.join(root, "nested", "mobile.JPG"));
    writeFile(path.join(root, "nested", "clip.webm"));
    writeFile(path.join(root, "notes.txt"));

    assert.equal(countAssets(root), 3);
  });

  it("detects variant folders containing assets", () => {
    const root = makeTempDir();
    writeFile(path.join(root, "light", "desktop.png"));
    writeFile(path.join(root, "dark", "notes.txt"));
    writeFile(path.join(root, "ko", "nested", "mobile.png"));

    assert.deepEqual(detectVariants(root), [
      { name: "ko", assetCount: 1 },
      { name: "light", assetCount: 1 },
    ]);
  });

  it("formats timestamp folders using existing local-time semantics", () => {
    const formatted = formatTimestampFolder("2026-05-26_10-30-45");

    assert.equal(formatted.date, localTimestampIso("2026-05-26_10-30-45"));
    assert.equal(typeof formatted.label, "string");
  });

  it("lists timestamp versions newest first with variants and manifest metadata", () => {
    const scenarioDir = makeTempDir();
    writeFile(path.join(scenarioDir, "2026-05-01_09-00-00", "light", "a.png"));
    writeFile(path.join(scenarioDir, "2026-05-03_10-00-00", "dark", "b.png"));
    writeFile(
      path.join(scenarioDir, "2026-05-03_10-00-00", "manifest.json"),
      JSON.stringify({ privacy: { enabled: true }, style: { frame: "macos" } }),
    );

    const versions = listScenarioVersions(scenarioDir);

    assert.equal(versions[0].timestamp, "2026-05-03_10-00-00");
    assert.equal(versions[0].isLatest, true);
    assert.equal(versions[0].assetCount, 1);
    assert.deepEqual(versions[0].variants, [{ name: "dark", assetCount: 1 }]);
    assert.deepEqual(versions[0].privacy, { enabled: true });
    assert.deepEqual(versions[0].style, { frame: "macos" });
    assert.equal(versions[1].timestamp, "2026-05-01_09-00-00");
    assert.equal(versions[1].isLatest, false);
  });

  it("adds latest and default folders only when they contain assets", () => {
    const scenarioDir = makeTempDir();
    const now = new Date("2026-05-26T00:00:00.000Z");
    writeFile(path.join(scenarioDir, "latest", "desktop.png"));
    fs.mkdirSync(path.join(scenarioDir, "default"), { recursive: true });

    assert.deepEqual(listScenarioVersions(scenarioDir, now), [
      {
        timestamp: "latest",
        label: "Latest",
        date: "2026-05-26T00:00:00.000Z",
        assetCount: 1,
        isLatest: true,
        variants: [],
        hasVariants: false,
      },
    ]);
  });
});
