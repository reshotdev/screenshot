const { before, after, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");

const { startServer, stopServer } = require("../fixtures/serve");

function loadFreshCertificationModules() {
  const configPath = require.resolve("../../src/lib/config");
  const certificationPath = require.resolve("../../src/lib/certification");
  delete require.cache[configPath];
  delete require.cache[certificationPath];
  return require("../../src/lib/certification");
}

describe("doctor target integration", () => {
  let server;
  let baseUrl;
  let tempDir;
  let originalCwd;

  before(async () => {
    const started = await startServer();
    server = started.server;
    baseUrl = started.baseUrl;
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "reshot-doctor-"));
    originalCwd = process.cwd();
  });

  after(async () => {
    process.chdir(originalCwd);
    if (server) await stopServer(server);
    if (tempDir) await fs.remove(tempDir).catch(() => {});
  });

  it("passes for a certified scenario with deterministic readiness", async () => {
    await fs.writeJson(
      path.join(tempDir, "reshot.config.json"),
      {
        baseUrl,
        target: {
          key: "fixture-app",
          displayName: "Fixture App",
          tier: "certified",
          owner: "Tests",
          baseUrl,
          captureSafe: false,
          defaultAuthMode: "public",
          certificationScenarioKeys: ["ready-page"],
        },
        scenarios: [
          {
            key: "ready-page",
            name: "Ready Page",
            url: "/custom-ready.html",
            captureClass: "public",
            ready: {
              selector: "[data-ready='true']",
              expression: "window.__APP_READY === true",
            },
            requiredRoutes: ["/custom-ready.html"],
            requiredSelectors: ["#content"],
            expectedArtifacts: ["loaded"],
            steps: [
              { action: "waitForSelector", selector: "[data-ready='true']" },
              { action: "screenshot", key: "loaded" },
            ],
          },
        ],
      },
      { spaces: 2 },
    );

    process.chdir(tempDir);
    const { runDoctorTarget } = loadFreshCertificationModules();
    const report = await runDoctorTarget();

    assert.equal(report.ok, true);
    assert.equal(report.routeAudits[0].ok, true);
    assert.equal(report.readinessAudits[0].ok, true);
  });

  it("fails certified scenarios that rely only on sleeps", async () => {
    await fs.writeJson(
      path.join(tempDir, "reshot.config.json"),
      {
        baseUrl,
        target: {
          key: "fixture-app",
          displayName: "Fixture App",
          tier: "certified",
          owner: "Tests",
          baseUrl,
          captureSafe: false,
          defaultAuthMode: "public",
          certificationScenarioKeys: ["sleepy-page"],
        },
        scenarios: [
          {
            key: "sleepy-page",
            name: "Sleepy Page",
            url: "/index.html",
            captureClass: "public",
            requiredRoutes: ["/index.html"],
            requiredSelectors: ["#action-btn"],
            steps: [
              { action: "wait", ms: 250 },
              { action: "screenshot", key: "hero" },
            ],
          },
        ],
      },
      { spaces: 2 },
    );

    process.chdir(tempDir);
    const { runDoctorTarget } = loadFreshCertificationModules();
    const report = await runDoctorTarget();

    assert.equal(report.ok, false);
    assert.equal(report.readinessAudits[0].contractOk, false);
    assert.match(
      report.readinessAudits[0].contractFailure,
      /readiness contract/i,
    );
  });
});
