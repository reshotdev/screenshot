const { beforeEach, afterEach, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const configModulePath = require.resolve("../../src/lib/config");

describe("config validation", () => {
  let originalCwd;
  let tempDir;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "reshot-config-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    delete require.cache[configModulePath];
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("flags invalid baseUrl and unknown scenario keys", () => {
    fs.writeFileSync(
      path.join(tempDir, "reshot.config.json"),
      JSON.stringify(
        {
          baseUrl: "localhost:3000",
          scenarios: [
            {
              key: "dashboard",
              name: "Dashboard",
              url: "/app",
              steps: [{ action: "screenshot", key: "dashboard" }],
            },
          ],
        },
        null,
        2,
      ),
    );

    const config = require(configModulePath);
    const result = config.validateConfig({ scenarioKeys: ["missing"] });

    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /baseUrl must use http:\/\/ or https:\/\//i);
    assert.match(result.errors.join("\n"), /Unknown scenario key\(s\): missing/i);
  });

  it("flags unresolved URL variables and missing certified readiness", () => {
    fs.writeFileSync(
      path.join(tempDir, "reshot.config.json"),
      JSON.stringify(
        {
          baseUrl: "https://reshot.dev",
          target: {
            tier: "certified",
          },
          scenarios: [
            {
              key: "dashboard",
              name: "Dashboard",
              url: "/app/projects/{{PROJECT_ID}}/dashboard",
              captureClass: "live-auth",
              steps: [{ action: "screenshot", key: "dashboard" }],
            },
          ],
        },
        null,
        2,
      ),
    );

    const config = require(configModulePath);
    const result = config.validateConfig({ scenarioKeys: ["dashboard"] });

    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /Unresolved URL variable\(s\): dashboard:PROJECT_ID/i);
    assert.match(result.errors.join("\n"), /Deterministic readiness is required/i);
  });

  it("passes when required variables and readiness contract are present", () => {
    fs.mkdirSync(path.join(tempDir, ".reshot"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, ".reshot", "settings.json"),
      JSON.stringify(
        {
          projectId: "project_123",
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(tempDir, "reshot.config.json"),
      JSON.stringify(
        {
          baseUrl: "https://reshot.dev",
          target: {
            tier: "certified",
          },
          scenarios: [
            {
              key: "dashboard",
              name: "Dashboard",
              url: "/app/projects/{{PROJECT_ID}}/dashboard",
              readySelector: "[data-testid='dashboard']",
              captureClass: "live-auth",
              steps: [{ action: "screenshot", key: "dashboard" }],
            },
          ],
        },
        null,
        2,
      ),
    );

    const config = require(configModulePath);
    const result = config.validateConfig({ scenarioKeys: ["dashboard"] });

    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.details.unresolvedVariables, []);
    assert.equal(result.details.authScenarioCount, 1);
    assert.equal(result.details.liveAuthScenarioCount, 1);
  });

  it("distinguishes fixture auth from live auth in validation details", () => {
    fs.writeFileSync(
      path.join(tempDir, "reshot.config.json"),
      JSON.stringify(
        {
          baseUrl: "https://reshot.dev",
          scenarios: [
            {
              key: "fixture-dashboard",
              name: "Fixture Dashboard",
              url: "/app/fixture-dashboard",
              captureClass: "fixture-auth",
              steps: [{ action: "screenshot", key: "dashboard" }],
            },
          ],
        },
        null,
        2,
      ),
    );

    const config = require(configModulePath);
    const result = config.validateConfig({ scenarioKeys: ["fixture-dashboard"] });

    assert.equal(result.valid, true);
    assert.equal(result.details.authScenarioCount, 1);
    assert.equal(result.details.liveAuthScenarioCount, 0);
  });
});