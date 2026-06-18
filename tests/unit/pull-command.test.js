const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");

const fs = require("fs-extra");

const pullCommand = require("../../src/commands/pull");
const config = require("../../src/lib/config");
const apiClient = require("../../src/lib/api-client");

async function withTempCwd(task) {
  const originalCwd = process.cwd();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "reshot-pull-"));
  process.chdir(dir);
  try {
    return await task(dir);
  } finally {
    process.chdir(originalCwd);
    await fs.remove(dir);
  }
}

async function withCapturedConsole(task) {
  const logs = [];
  const warnings = [];
  const originalLog = console.log;
  const originalWarn = console.warn;

  console.log = (...args) => logs.push(args.join(" "));
  console.warn = (...args) => warnings.push(args.join(" "));

  try {
    const result = await task();
    return { result, output: logs.join("\n"), warnings: warnings.join("\n") };
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
}

describe("pull command", () => {
  it("lets RESHOT_PROJECT_ID override config metadata project id", async () => {
    const originalProjectId = process.env.RESHOT_PROJECT_ID;
    const originalReadConfig = config.readConfig;
    const originalReadSettings = config.readSettings;
    const originalExportVisuals = apiClient.exportVisuals;

    try {
      process.env.RESHOT_PROJECT_ID = "proj_env";
      let requestedProjectId = null;

      config.readConfig = () => ({
        projectId: "proj_config",
        _metadata: { projectId: "proj_meta" },
      });
      config.readSettings = () => ({
        apiKey: "rk_test",
        projectId: "proj_auth",
        platformUrl: "https://reshot.dev",
      });
      apiClient.exportVisuals = async (projectId) => {
        requestedProjectId = projectId;
        return {
          assets: {
            docs: {
              hero: {
                default: {
                  src: "https://cdn.reshot.dev/v1/assets/proj_env/docs/hero?context=default",
                  type: "image/png",
                  alt: "Hero",
                },
              },
            },
          },
          meta: { projectId },
        };
      };

      await withTempCwd(async () => {
        const { result, warnings } = await withCapturedConsole(() =>
          pullCommand({
            format: "json",
            output: "reshot-assets.json",
            noExit: true,
          }),
        );

        assert.equal(result.success, true);
        assert.equal(requestedProjectId, "proj_env");
        assert.match(warnings, /active project is proj_env/);
        assert.ok(await fs.pathExists("reshot-assets.json"));
      });
    } finally {
      if (originalProjectId === undefined) {
        delete process.env.RESHOT_PROJECT_ID;
      } else {
        process.env.RESHOT_PROJECT_ID = originalProjectId;
      }
      config.readConfig = originalReadConfig;
      config.readSettings = originalReadSettings;
      apiClient.exportVisuals = originalExportVisuals;
    }
  });
});
