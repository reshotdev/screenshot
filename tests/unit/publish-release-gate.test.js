const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const publishPath = require.resolve("../../src/commands/publish");
const configPath = require.resolve("../../src/lib/config");
const releaseDoctorPath = require.resolve("../../src/lib/release-doctor");
const storageProvidersPath = require.resolve("../../src/lib/storage-providers");

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
  delete require.cache[publishPath];
  delete require.cache[configPath];
  delete require.cache[releaseDoctorPath];
  delete require.cache[storageProvidersPath];
});

describe("publish release gate", () => {
  it("fails before storage validation when the release doctor fails", async () => {
    const restores = [
      withMockedModule(configPath, {
        readConfig() {
          return {
            _metadata: { projectName: "Release Target" },
          };
        },
        readSettings() {
          throw new Error("no settings");
        },
      }),
      withMockedModule(releaseDoctorPath, {
        async runReleaseDoctor() {
          return {
            ok: false,
            reportPath: ".reshot/reports/release-doctor.json",
          };
        },
      }),
      withMockedModule(storageProvidersPath, {
        validateStorageConfig() {
          throw new Error("storage validation should not be reached");
        },
        getStorageSetupHelp() {
          return "";
        },
        createStorageProvider() {
          return null;
        },
        getStorageMode() {
          return "reshot";
        },
        isPlatformAvailable() {
          return true;
        },
      }),
    ];

    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => {
      logs.push(args.join(" "));
    };

    try {
      const publishCommand = require(publishPath);
      const result = await publishCommand({ noExit: true });

      assert.equal(result.success, false);
      assert.equal(result.releaseDoctor.success, false);
      assert.match(logs.join("\n"), /Release doctor failed/i);
    } finally {
      console.log = originalLog;
      restores.reverse().forEach((restore) => restore());
    }
  });
});