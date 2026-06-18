const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const commandPath = require.resolve("../../src/commands/doctor-release");
const libPath = require.resolve("../../src/lib/release-doctor");

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
  delete require.cache[commandPath];
  delete require.cache[libPath];
});

describe("doctor release command", () => {
  it("prints structured JSON output from the composed release doctor", async () => {
    const originalExitCode = process.exitCode;
    const restore = withMockedModule(libPath, {
      async runReleaseDoctor() {
        return {
          ok: false,
          reportPath: ".reshot/reports/release-doctor.json",
          runPreflight: { ok: false },
          targetDoctor: { ok: true, skipped: false },
          docsAssetMap: { ok: true, skipped: false },
          summary: {
            blockingIssues: [{ scope: "run-preflight", message: "baseUrl down" }],
            advisories: [],
          },
        };
      },
    });

    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => {
      logs.push(args.join(" "));
    };

    try {
      const doctorReleaseCommand = require(commandPath);
      const report = await doctorReleaseCommand({ json: true });

      assert.equal(report.ok, false);
      assert.match(logs.join("\n"), /"blockingIssues"/);
      assert.match(logs.join("\n"), /baseUrl down/);
      assert.equal(process.exitCode, 1);
    } finally {
      process.exitCode = originalExitCode;
      console.log = originalLog;
      restore();
    }
  });
});