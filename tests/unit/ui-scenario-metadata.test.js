const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  addScenarioMetadata,
  countAssetsInLatestDir,
  parseTimestampDirName,
  readScenarioOutputMetadata,
} = require("../../src/lib/ui-scenario-metadata");

function localTimestampIso(value) {
  const [date, time] = value.split("_");
  const [year, month, day] = date.split("-");
  const [hour, min, sec] = time.split("-");

  return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`).toISOString();
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "reshot-scenario-metadata-"));
}

describe("ui scenario metadata", () => {
  it("parses timestamp directory names safely", () => {
    assert.equal(
      parseTimestampDirName("2026-05-26_10-30-45").toISOString(),
      localTimestampIso("2026-05-26_10-30-45"),
    );
    assert.equal(parseTimestampDirName("latest"), null);
    assert.equal(parseTimestampDirName("2026-05-26"), null);
  });

  it("counts supported assets in latest output", () => {
    const root = makeTempDir();
    const latestDir = path.join(root, "latest");
    fs.mkdirSync(latestDir, { recursive: true });
    fs.writeFileSync(path.join(latestDir, "desktop.png"), "");
    fs.writeFileSync(path.join(latestDir, "mobile.JPG"), "");
    fs.writeFileSync(path.join(latestDir, "clip.webm"), "");
    fs.writeFileSync(path.join(latestDir, "notes.txt"), "");

    assert.equal(countAssetsInLatestDir(latestDir), 3);
  });

  it("reads output timestamps and latest asset count", () => {
    const root = makeTempDir();
    const scenarioDir = path.join(root, "checkout-flow");
    fs.mkdirSync(path.join(scenarioDir, "2026-05-01_09-00-00"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(scenarioDir, "2026-05-03_11-15-30"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(scenarioDir, "latest"), { recursive: true });
    fs.writeFileSync(path.join(scenarioDir, "latest", "hero.png"), "");

    assert.deepEqual(readScenarioOutputMetadata(root, "checkout-flow"), {
      createdAt: localTimestampIso("2026-05-01_09-00-00"),
      lastRunAt: localTimestampIso("2026-05-03_11-15-30"),
      assetCount: 1,
    });
  });

  it("merges job history and sorts the most recently run scenarios first", () => {
    const root = makeTempDir();
    fs.mkdirSync(path.join(root, "alpha", "2026-05-01_09-00-00"), {
      recursive: true,
    });

    const scenarios = [
      { key: "alpha", name: "Alpha" },
      { key: "beta", name: "Beta" },
    ];
    const jobs = [
      {
        type: "run",
        params: { scenarioKeys: ["beta"] },
        createdAt: "2026-05-04T08:00:00.000Z",
        completedAt: "2026-05-04T08:02:00.000Z",
        status: "success",
      },
      {
        type: "publish",
        params: { scenarioKeys: ["alpha"] },
        createdAt: "2026-05-06T08:00:00.000Z",
        status: "success",
      },
    ];

    const result = addScenarioMetadata(scenarios, jobs, root);

    assert.equal(result[0].key, "beta");
    assert.deepEqual(result[0]._metadata, {
      createdAt: "2026-05-04T08:00:00.000Z",
      lastRunAt: "2026-05-04T08:02:00.000Z",
      lastRunStatus: "success",
      assetCount: 0,
    });
    assert.equal(result[1].key, "alpha");
    assert.equal(result[1]._metadata.lastRunStatus, null);
  });
});
