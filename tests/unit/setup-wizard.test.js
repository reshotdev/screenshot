const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const setupWizardPath = require.resolve("../../src/commands/setup-wizard");
const configPath = require.resolve("../../src/lib/config");
const inquirerPath = require.resolve("inquirer");
const authPath = require.resolve("../../src/commands/auth");

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

describe("setup wizard existing-project flows", () => {
  let originalCwd;
  let tempDir;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "reshot-setup-test-"));
    process.chdir(tempDir);
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "setup-test" }, null, 2),
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    delete require.cache[setupWizardPath];
    delete require.cache[configPath];
    delete require.cache[inquirerPath];
    delete require.cache[authPath];
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("supports re-linking an already configured project", async () => {
    let readSettingsCount = 0;
    let authCalls = 0;
    const restores = [
      withMockedModule(inquirerPath, {
        prompt: async () => ({ action: "reauth" }),
      }),
      withMockedModule(configPath, {
        readSettings() {
          readSettingsCount += 1;
          if (readSettingsCount === 1) {
            return {
              apiKey: "pk_live_old",
              projectId: "project_old",
              projectName: "Old Project",
            };
          }

          return {
            apiKey: "pk_live_new",
            projectId: "project_new",
            projectName: "Launch Project",
          };
        },
        configExists() {
          return false;
        },
        readConfig() {
          throw new Error("config should not be read");
        },
      }),
      withMockedModule(authPath, async () => {
        authCalls += 1;
        return { mode: "cloud-connected" };
      }),
    ];

    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => {
      logs.push(args.join(" "));
    };

    try {
      const setupWizard = require(setupWizardPath);
      await setupWizard();
    } finally {
      console.log = originalLog;
      restores.reverse().forEach((restore) => restore());
    }

    assert.equal(authCalls, 1);
    assert.match(logs.join("\n"), /Launch Project/);
    assert.match(logs.join("\n"), /Mode: cloud-connected/);
  });

  it("uses project and token options for non-interactive onboarding setup", async () => {
    let authOptions = null;
    const restores = [
      withMockedModule(authPath, async (options) => {
        authOptions = options;
        const config = require(configPath);
        config.writeSettings({
          apiKey: options.apiKey,
          projectId: options.projectId,
          projectName: "Onboarding Project",
        });
        return { mode: "cloud-connected" };
      }),
    ];

    try {
      const setupWizard = require(setupWizardPath);
      await setupWizard({
        project: "project_onboarding",
        token: "p_init_test",
        noStudio: true,
      });
    } finally {
      restores.reverse().forEach((restore) => restore());
    }

    assert.deepEqual(authOptions, {
      projectId: "project_onboarding",
      apiKey: "p_init_test",
    });

    const config = JSON.parse(
      fs.readFileSync(path.join(tempDir, "reshot.config.json"), "utf8"),
    );
    assert.equal(config.projectId, "project_onboarding");
  });

  it("skips the Studio prompt in local-only mode when --no-studio is used", async () => {
    const prompts = [];
    const restores = [
      withMockedModule(inquirerPath, {
        prompt: async (questions) => {
          prompts.push(questions[0]?.name || "unknown");
          return { customAssetDir: ".reshot/output" };
        },
      }),
    ];

    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => {
      logs.push(args.join(" "));
    };

    try {
      const setupWizard = require(setupWizardPath);
      await setupWizard({ offline: true, noStudio: true });
    } finally {
      console.log = originalLog;
      restores.reverse().forEach((restore) => restore());
    }

    assert.deepEqual(prompts, ["customAssetDir"]);
    assert.match(logs.join("\n"), /Studio launch skipped/i);
  });
});
