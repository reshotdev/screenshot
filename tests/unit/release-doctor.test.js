const { beforeEach, afterEach, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const releaseDoctorModulePath = require.resolve("../../src/lib/release-doctor");
const runCommandPath = require.resolve("../../src/commands/run");
const certificationPath = require.resolve("../../src/lib/certification");
const configPath = require.resolve("../../src/lib/config");

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

describe("release doctor", () => {
  let originalCwd;
  let tempDir;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "reshot-release-doctor-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    delete require.cache[releaseDoctorModulePath];
    delete require.cache[runCommandPath];
    delete require.cache[certificationPath];
    delete require.cache[configPath];
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("flags stale docs asset maps and surfaces report failures", async () => {
    fs.mkdirSync(path.join(tempDir, "app", "src", "data"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "app", "src", "data", "reshot-assets.json"),
      JSON.stringify(
        {
          meta: {
            projectId: "project_123",
            exportedAt: "2026-01-01T00:00:00.000Z",
            totalVisuals: 1,
            totalAssets: 1,
            totalSteps: 1,
          },
          assets: {
            dashboard: {
              overview: {
                default: {
                  type: "image/png",
                  alt: "Dashboard Overview",
                  src: "https://example.com/not-cdn.png",
                  steps: [
                    {
                      step: "overview",
                      src: "https://example.com/not-cdn-step.png",
                      type: "image/png",
                      width: 1280,
                      height: 720,
                    },
                  ],
                },
              },
            },
          },
        },
        null,
        2,
      ),
    );

    const restores = [
      withMockedModule(configPath, {
        readConfig() {
          return { target: { tier: "certified", displayName: "Release Target" } };
        },
      }),
      withMockedModule(runCommandPath, {
        async buildRunPreflightReport() {
          return { ok: true, errors: [], warnings: [] };
        },
      }),
      withMockedModule(certificationPath, {
        async runDoctorTarget() {
          return {
            ok: true,
            summary: { blockingIssues: [], advisories: [] },
          };
        },
      }),
    ];

    try {
      const { runReleaseDoctor } = require(releaseDoctorModulePath);
      const report = await runReleaseDoctor({});

      assert.equal(report.ok, false);
      assert.equal(report.docsAssetMap.skipped, false);
      assert.match(report.docsAssetMap.issues.join("\n"), /stale/i);
      assert.match(report.docsAssetMap.issues.join("\n"), /cdn\.reshot\.dev/i);
      assert.equal(fs.existsSync(report.reportPath), true);
    } finally {
      restores.reverse().forEach((restore) => restore());
    }
  });

  it("skips docs checks when no asset map is present and target is non-certified", async () => {
    const restores = [
      withMockedModule(configPath, {
        readConfig() {
          return { target: { tier: "custom", displayName: "Local Target" } };
        },
      }),
      withMockedModule(runCommandPath, {
        async buildRunPreflightReport() {
          return { ok: true, errors: [], warnings: [] };
        },
      }),
      withMockedModule(certificationPath, {
        async runDoctorTarget() {
          throw new Error("should not be called");
        },
      }),
    ];

    try {
      const { runReleaseDoctor } = require(releaseDoctorModulePath);
      const report = await runReleaseDoctor({ scenarioKeys: ["dashboard"] });

      assert.equal(report.ok, true);
      assert.equal(report.targetDoctor.skipped, true);
      assert.equal(report.docsAssetMap.skipped, true);
      assert.deepEqual(report.scenarioKeys, ["dashboard"]);
    } finally {
      restores.reverse().forEach((restore) => restore());
    }
  });
});