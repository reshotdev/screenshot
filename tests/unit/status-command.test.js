const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const statusPath = require.resolve("../../src/commands/status");
const configPath = require.resolve("../../src/lib/config");
const apiClientPath = require.resolve("../../src/lib/api-client");

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

afterEach(() => {
  delete require.cache[statusPath];
  delete require.cache[configPath];
  delete require.cache[apiClientPath];
});

describe("status command JSON output", () => {
  it("returns structured issues instead of crashing when auth is missing", async () => {
    const originalExitCode = process.exitCode;
    const restores = [
      withMockedModule(configPath, {
        getModeInfo() {
          return { isStandalone: true, features: { mode: "standalone" } };
        },
        readConfigLenient() {
          return {
            baseUrl: "https://reshot.dev",
            assetDir: ".reshot/output",
            scenarios: [],
          };
        },
        validateConfig() {
          return { valid: true, errors: [], warnings: [], details: {} };
        },
        readSettings() {
          throw new Error("no settings");
        },
      }),
      withMockedModule(apiClientPath, {
        async getSyncJobs() {
          return { jobs: [] };
        },
        async getDrifts() {
          return { drifts: [], stats: {} };
        },
      }),
    ];

    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => {
      logs.push(args.join(" "));
    };

    try {
      const statusCommand = require(statusPath);
      const report = await statusCommand({ json: true });

      assert.equal(report.ok, false);
      assert.equal(report.auth.hasApiKey, false);
      assert.match(logs.join("\n"), /"issues"/);
      assert.match(logs.join("\n"), /API key not found/i);
    } finally {
      process.exitCode = originalExitCode;
      console.log = originalLog;
      restores.reverse().forEach((restore) => restore());
    }
  });
});