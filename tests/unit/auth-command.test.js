const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const authCommand = require("../../src/commands/auth");

function createSpinnerFactory() {
  return () => ({
    start() {
      return {
        succeed() {},
        fail() {},
      };
    },
  });
}

async function withCapturedConsole(task) {
  const logs = [];
  const originalLog = console.log;

  console.log = (...args) => {
    logs.push(args.join(" "));
  };

  try {
    const result = await task();
    return { result, output: logs.join("\n") };
  } finally {
    console.log = originalLog;
  }
}

describe("auth command UX", () => {
  it("links non-interactively from explicit project and token options", async () => {
    const savedSettings = [];
    const { result, output } = await withCapturedConsole(() =>
      authCommand({
        projectId: "project_onboarding",
        apiKey: "p_init_test",
        writeSettingsFn: (value) => {
          savedSettings.push(value);
        },
      }),
    );

    assert.equal(result.mode, "cloud-connected");
    assert.equal(result.projectId, "project_onboarding");
    assert.equal(savedSettings.length, 1);
    assert.equal(savedSettings[0].projectId, "project_onboarding");
    assert.equal(savedSettings[0].apiKey, "p_init_test");
    assert.match(output, /Authenticated via environment variables/);
  });

  it("prints the auth URL and falls back cleanly when the browser cannot be opened", async () => {
    const savedSettings = [];
    let initiatePayload = null;
    const { result, output } = await withCapturedConsole(() =>
      authCommand({
        apiBaseUrl: "https://reshot.dev/api",
        projectId: "project_123",
        isInteractive: true,
        httpClient: {
          async post(_url, payload) {
            initiatePayload = payload;
            return {
              data: {
                authUrl: "https://reshot.dev/auth/cli?token=test-token",
                authToken: "test-token",
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
              },
            };
          },
        },
        openFn: async () => {
          throw new Error("browser unavailable");
        },
        startLocalStatusServerFn: async () => ({
          server: { close() {} },
          port: 3721,
        }),
        waitForCompletionFn: async () => ({
          project: {
            id: "project_123",
            name: "Launch Project",
            apiKey: "pk_live_test",
            workspace: {
              id: "workspace_1",
              name: "Launch Workspace",
            },
          },
          user: {
            id: "user_1",
            email: "hello@reshot.dev",
            fullName: "Reshot User",
          },
        }),
        verifyApiKeyFn: async () => {},
        writeSettingsFn: (value) => {
          savedSettings.push(value);
        },
        spinnerFactory: createSpinnerFactory(),
      }),
    );

    assert.equal(result.mode, "cloud-connected");
    assert.equal(result.browserOpened, false);
    assert.equal(initiatePayload.projectId, "project_123");
    assert.equal(savedSettings.length, 1);
    assert.match(output, /Auth URL:/);
    assert.match(output, /https:\/\/reshot\.dev\/auth\/cli\?token=test-token/);
    assert.match(output, /copy the URL above into a browser/i);
    assert.match(output, /could not open a browser automatically/i);
  });

  it("reports a successful browser handoff when the browser opens", async () => {
    const { result, output } = await withCapturedConsole(() =>
      authCommand({
        apiBaseUrl: "https://reshot.dev/api",
        isInteractive: true,
        httpClient: {
          async post() {
            return {
              data: {
                authUrl: "https://reshot.dev/auth/cli?token=test-token",
                authToken: "test-token",
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
              },
            };
          },
        },
        openFn: async () => {},
        startLocalStatusServerFn: async () => ({
          server: { close() {} },
          port: 3721,
        }),
        waitForCompletionFn: async () => ({
          project: {
            id: "project_123",
            name: "Launch Project",
            apiKey: "pk_live_test",
            workspace: {
              id: "workspace_1",
              name: "Launch Workspace",
            },
          },
          user: null,
        }),
        verifyApiKeyFn: async () => {},
        writeSettingsFn: () => {},
        spinnerFactory: createSpinnerFactory(),
      }),
    );

    assert.equal(result.browserOpened, true);
    assert.match(output, /A browser window has been opened/i);
  });

  it("exits promptly with guidance when there is no interactive terminal", async () => {
    await assert.rejects(
      () =>
        withCapturedConsole(() =>
          authCommand({
            apiBaseUrl: "https://reshot.dev/api",
            isInteractive: false,
            // Provide mocks that would otherwise drive the browser flow; the
            // non-interactive guard must short-circuit before reaching them.
            startLocalStatusServerFn: async () => {
              throw new Error("should not start a server without a TTY");
            },
            openFn: async () => {
              throw new Error("should not open a browser without a TTY");
            },
            spinnerFactory: createSpinnerFactory(),
          }),
        ),
      /Interactive terminal required for browser auth/i,
    );
  });

  it("times out with actionable guidance instead of hanging silently", async () => {
    await assert.rejects(
      () =>
        authCommand.waitForCompletion(
          "https://reshot.dev/api",
          "test-token",
          new Date(Date.now() - 1_000).toISOString(),
          {
            httpClient: {
              async get() {
                return { data: { status: "pending" } };
              },
            },
            spinnerFactory: createSpinnerFactory(),
            timeoutMs: 5,
          },
        ),
      /Authentication timed out before completion\. Re-run `reshot auth`/i,
    );
  });
});
