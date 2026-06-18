const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");

const fs = require("fs-extra");
const {
  normalizeCommandOptions,
} = require("../../src/commands/compose");
const {
  assertUploadPackExists,
  packFromExistingOutputs,
} = require("../../src/lib/compose-pack");
const {
  buildDashboardUrl,
  humanizeName,
  readResponseHeader,
  resolveComposeProjectContext,
  unwrapApiResponse,
} = require("../../src/lib/compose-upload");

describe("compose command options", () => {
  it("normalizes Commander command instances into plain options", () => {
    const normalized = normalizeCommandOptions({
      opts() {
        return {
          out: "/tmp/ReviewDecision",
          skipRender: true,
        };
      },
    });

    assert.deepEqual(normalized, {
      out: "/tmp/ReviewDecision",
      skipRender: true,
    });
  });

  it("keeps already-plain options unchanged", () => {
    const options = {
      out: "/tmp/ReviewDecision",
      skipRender: true,
    };

    assert.equal(normalizeCommandOptions(options), options);
  });
});

describe("compose output packs", () => {
  it("discovers existing rendered outputs including optional gifs", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "compose-pack-"));

    try {
      const outBase = path.join(outputDir, "LoginHero.rendered");
      await fs.writeFile(`${outBase}.mp4`, "mp4");
      await fs.writeFile(`${outBase}.webm`, "webm");
      await fs.writeFile(`${outBase}.webp`, "poster");
      await fs.writeFile(`${outBase}.gif`, "gif");

      const pack = await packFromExistingOutputs(outBase);

      assert.deepEqual(pack, {
        mp4: `${outBase}.mp4`,
        webm: `${outBase}.webm`,
        poster: `${outBase}.webp`,
        gif: `${outBase}.gif`,
      });
      await assertUploadPackExists(pack, true);
    } finally {
      await fs.remove(outputDir);
    }
  });

  it("keeps the skip-render hint when existing outputs are missing", async () => {
    await assert.rejects(
      () => assertUploadPackExists({}, true),
      /Run `reshot compose <file>` first or remove --skip-render/,
    );
  });
});

describe("compose upload helpers", () => {
  it("resolves project context from environment, options, and settings", () => {
    const previousApiKey = process.env.RESHOT_API_KEY;
    const previousProjectId = process.env.RESHOT_PROJECT_ID;

    try {
      process.env.RESHOT_API_KEY = "rk_env";
      process.env.RESHOT_PROJECT_ID = "proj_env";

      assert.deepEqual(
        resolveComposeProjectContext({
          projectOption: "proj_option",
          settings: {
            apiKey: "rk_settings",
            projectId: "proj_settings",
          },
        }),
        {
          apiKey: "rk_env",
          projectId: "proj_option",
        },
      );
    } finally {
      restoreEnv("RESHOT_API_KEY", previousApiKey);
      restoreEnv("RESHOT_PROJECT_ID", previousProjectId);
    }
  });

  it("preserves upload response and display helper behavior", () => {
    assert.equal(
      buildDashboardUrl({ id: "comp_123" }, "https://reshot.dev/api", "proj_123"),
      "https://reshot.dev/app/projects/proj_123/compositions/comp_123",
    );
    assert.equal(humanizeName("LoginHero_clip"), "Login Hero clip");
    assert.deepEqual(unwrapApiResponse({ success: true, data: { id: "comp_123" } }), {
      id: "comp_123",
    });
    assert.equal(
      readResponseHeader(
        {
          "x-reshot-attribution-warning": "legacy-key-no-user-attribution",
        },
        "x-reshot-attribution-warning",
      ),
      "legacy-key-no-user-attribution",
    );
  });
});

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
