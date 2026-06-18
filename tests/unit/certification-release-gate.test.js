const { beforeEach, afterEach, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const certificationPath = require.resolve("../../src/lib/certification");
const configPath = require.resolve("../../src/lib/config");
const releaseDoctorPath = require.resolve("../../src/lib/release-doctor");
const runCommandPath = require.resolve("../../src/commands/run");
const publishPath = require.resolve("../../src/commands/publish");

function withMockedModule(modulePath, exports) {
  const previous = require.cache[modulePath];
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };

  return () => {
    if (previous) {
      require.cache[modulePath] = previous;
    } else {
      delete require.cache[modulePath];
    }
  };
}

describe("certification release gate", () => {
  let originalCwd;
  let tempDir;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "reshot-certify-gate-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    delete require.cache[certificationPath];
    delete require.cache[configPath];
    delete require.cache[releaseDoctorPath];
    delete require.cache[runCommandPath];
    delete require.cache[publishPath];
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("stops certification before capture when release doctor fails", async () => {
    let runCalled = false;
    let publishCalled = false;

    const restores = [
      withMockedModule(configPath, {
        readConfig() {
          return {
            target: { displayName: "Release Target", tier: "certified" },
            scenarios: [{ key: "dashboard" }],
          };
        },
        getCertifiedScenarioKeys() {
          return ["dashboard"];
        },
      }),
      withMockedModule(releaseDoctorPath, {
        async runReleaseDoctor() {
          return {
            ok: false,
            summary: {
              blockingIssues: [{ code: "run-preflight", message: "baseUrl down" }],
              advisories: [],
            },
          };
        },
      }),
      withMockedModule(runCommandPath, async () => {
        runCalled = true;
        return { success: true, results: [] };
      }),
      withMockedModule(publishPath, async () => {
        publishCalled = true;
        return { success: true };
      }),
    ];

    try {
      const { runCertification } = require(certificationPath);
      const report = await runCertification({ scenarioKeys: ["dashboard"] });

      assert.equal(report.ok, false);
      assert.equal(report.releaseDoctor.ok, false);
      assert.equal(report.capture.skipped, true);
      assert.equal(report.publishVerification.skipped, true);
      assert.equal(runCalled, false);
      assert.equal(publishCalled, false);
    } finally {
      restores.reverse().forEach((restore) => restore());
    }
  });
});