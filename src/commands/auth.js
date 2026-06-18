const axios = require("axios");
const chalk = require("chalk");
const http = require("http");
// `open` and `ora` are ESM-only in the versions we use; when required from CommonJS
// their callable export is exposed on the `default` property.
const openModule = require("open");
const open = openModule.default || openModule;
const oraModule = require("ora");
const ora = oraModule.default || oraModule;

const { writeSettings, SETTINGS_PATH, SETTINGS_DIR } = require("../lib/config");
const { getApiBaseUrl } = require("../lib/api-client");
const pkg = require("../../package.json");

const DEFAULT_CALLBACK_PORT = 3721;
const POLL_INTERVAL_MS = 2000;
const DEFAULT_AUTH_TIMEOUT_MS = 15 * 60 * 1000;

const unwrapResponse = (payload) => {
  if (!payload) {
    return {};
  }
  if (typeof payload === "object" && "data" in payload) {
    return payload.data;
  }
  return payload;
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startLocalStatusServer(requestedPort, options = {}) {
  const { explicit = false } = options;

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Reshot CLI Authentication</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 2rem; background: #0b1727; color: #f4f6fb; }
      .card { max-width: 640px; margin: 0 auto; background: #111f33; border-radius: 16px; padding: 2rem; box-shadow: 0 20px 45px rgba(0,0,0,0.45); }
      h1 { font-size: 1.5rem; margin-top: 0; }
      p { line-height: 1.5; color: #d3d9e6; }
      code { background: rgba(255,255,255,0.08); padding: 0.15rem 0.35rem; border-radius: 6px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Waiting for CLI confirmation…</h1>
      <p>Your browser session is connected to the Reshot CLI. You can close this tab once the CLI confirms that authentication is complete.</p>
      <p>If you closed the terminal prompt, run <code>reshot auth</code> again to start a new session.</p>
    </div>
  </body>
</html>`
      );
    });

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        // If the user explicitly requested this port via env, surface a clear,
        // actionable error. Otherwise, just bubble up the code so the caller
        // can fall back to another port.
        if (explicit) {
          const err = new Error(
            `Port ${requestedPort} is already in use. Set RESHOT_CLI_CALLBACK_PORT to a free port and retry.`
          );
          err.code = error.code;
          return reject(err);
        }

        const err = new Error(error.message);
        err.code = error.code;
        return reject(err);
      }

      reject(error);
    });

    server.listen(requestedPort, () => {
      const address = server.address();
      const actualPort =
        typeof address === "object" &&
        address &&
        typeof address.port === "number"
          ? address.port
          : requestedPort;

      resolve({ server, port: actualPort });
    });
  });
}

async function waitForCompletion(
  apiBaseUrl,
  authToken,
  expiresAtIso,
  options = {},
) {
  const httpClient = options.httpClient || axios;
  const spinnerFactory = options.spinnerFactory || ora;
  const expiresAt = expiresAtIso
    ? Date.parse(expiresAtIso)
    : Date.now() + 5 * 60 * 1000;
  const timeoutMs = Math.max(
    1,
    Number(options.timeoutMs || DEFAULT_AUTH_TIMEOUT_MS),
  );
  const deadline = Math.min(expiresAt, Date.now() + timeoutMs);
  const statusSpinner = spinnerFactory("Waiting for browser authentication…").start();

  try {
    while (Date.now() < deadline) {
      const statusResponse = await httpClient.get(`${apiBaseUrl}/auth/cli/status`, {
        params: { token: authToken },
      });
      const payload = unwrapResponse(statusResponse.data);
      const status = payload.status;

      if (status === "completed" && payload.project?.apiKey) {
        statusSpinner.succeed("Browser authentication confirmed");
        return payload;
      }

      if (status === "expired") {
        throw new Error(
          "Authentication token expired. Run `reshot auth` again."
        );
      }

      if (status === "invalid") {
        throw new Error("Authentication session invalid. Start a new session.");
      }

      await wait(POLL_INTERVAL_MS);
    }

    throw new Error(
      "Authentication timed out before completion. Re-run `reshot auth` and use the printed auth URL if the browser handoff stalls.",
    );
  } catch (error) {
    statusSpinner.fail("Browser authentication failed");
    throw error;
  }
}

async function verifyApiKey(apiBaseUrl, apiKey, httpClient = axios) {
  await httpClient.get(`${apiBaseUrl}/auth/cli/verify`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
}

async function authCommand(options = {}) {
  // Support non-interactive auth via environment variables
  const envApiKey = options.apiKey || process.env.RESHOT_API_KEY;
  const envProjectId = options.projectId || process.env.RESHOT_PROJECT_ID;
  const httpClient = options.httpClient || axios;
  const openFn = options.openFn || open;
  const writeSettingsFn = options.writeSettingsFn || writeSettings;
  const startLocalStatusServerFn =
    options.startLocalStatusServerFn || startLocalStatusServer;
  const waitForCompletionFn = options.waitForCompletionFn || waitForCompletion;
  const verifyApiKeyFn = options.verifyApiKeyFn || verifyApiKey;
  const spinnerFactory = options.spinnerFactory || ora;
  const timeoutMs = Number(options.timeoutMs || DEFAULT_AUTH_TIMEOUT_MS);
  if (envApiKey && envProjectId) {
    const platformUrl = process.env.RESHOT_PLATFORM_URL || "https://reshot.dev";
    writeSettingsFn({
      projectId: envProjectId,
      apiKey: envApiKey,
      platformUrl,
      linkedAt: new Date().toISOString(),
      cliVersion: pkg.version,
    });
    console.log(chalk.green("✔ Authenticated via environment variables"));
    console.log(chalk.gray(`  Project: ${envProjectId}`));
    console.log(chalk.gray(`  Platform: ${platformUrl}`));
    return {
      mode: "cloud-connected",
      projectId: envProjectId,
      platformUrl,
    };
  }

  // The browser approval flow requires an interactive session (a human approves
  // in the browser while the CLI polls). With no TTY and no env credentials we
  // would otherwise open a browser nobody sees and poll for up to 15 minutes —
  // i.e. hang. Detect that and exit promptly with actionable guidance.
  const stdinIsInteractive =
    typeof options.isInteractive === "boolean"
      ? options.isInteractive
      : Boolean(process.stdin && process.stdin.isTTY);
  if (!stdinIsInteractive) {
    console.error(
      chalk.red("✖ `reshot auth` needs an interactive terminal."),
    );
    console.error(
      chalk.gray(
        "  Run it in an interactive shell to approve in the browser, or set",
      ),
    );
    console.error(
      chalk.gray(
        "  RESHOT_API_KEY and RESHOT_PROJECT_ID for non-interactive (CI) auth.",
      ),
    );
    const err = new Error("Interactive terminal required for browser auth");
    err.code = "ENOTTY";
    throw err;
  }

  const apiBaseUrl = options.apiBaseUrl || getApiBaseUrl();
  const explicitPortEnv =
    process.env.RESHOT_CLI_CALLBACK_PORT || "";
  const basePort = parseInt(explicitPortEnv || `${DEFAULT_CALLBACK_PORT}`, 10);
  const hasExplicitPort = Boolean(explicitPortEnv);

  let localServer;
  let callbackPort;
  const spinner = spinnerFactory("Requesting authentication session…").start();

  try {
    if (hasExplicitPort) {
      // Respect an explicitly configured port and fail fast with a clear error
      // if it is not available.
      const { server, port } = await startLocalStatusServerFn(basePort, {
        explicit: true,
      });
      localServer = server;
      callbackPort = port;
    } else {
      // Default behaviour: try the default port first for a stable experience,
      // but automatically fall back to any available port so users never have
      // to think about port conflicts.
      try {
        const { server, port } = await startLocalStatusServerFn(basePort);
        localServer = server;
        callbackPort = port;
      } catch (error) {
        if (error && error.code === "EADDRINUSE") {
          const { server, port } = await startLocalStatusServerFn(0);
          localServer = server;
          callbackPort = port;
          console.log(
            chalk.gray(
              `Callback port ${basePort} is in use; using available port ${callbackPort} instead.`
            )
          );
        } else {
          throw error;
        }
      }
    }

    const initiatePayload = {
      callbackPort,
      clientVersion: pkg.version,
      ...(options.projectId ? { projectId: options.projectId } : {}),
    };

    const initiateResponse = await httpClient.post(
      `${apiBaseUrl}/auth/cli/initiate`,
      initiatePayload,
      { headers: { "Content-Type": "application/json" } }
    );

    const payload = unwrapResponse(initiateResponse.data);
    const { authUrl, authToken, expiresAt } = payload;

    if (!authUrl || !authToken) {
      throw new Error("Authentication session did not return a URL or token.");
    }

    spinner.succeed("Authentication session created");
    console.log(chalk.gray(`Token expires at ${expiresAt || "unknown time"}`));
    console.log(chalk.gray(`Settings will be stored in ${SETTINGS_PATH}`));
    console.log(chalk.gray("Auth URL:"));
    console.log(chalk.cyan(authUrl));
    console.log(
      chalk.gray(
        "If the browser did not open, copy the URL above into a browser and complete the approval flow there.",
      ),
    );

    let browserOpened = false;
    try {
      await openFn(authUrl, { wait: false });
      browserOpened = true;
      console.log(
        chalk.blue(
          "A browser window has been opened. Approve the session there to continue.",
        )
      );
    } catch (error) {
      console.log(
        chalk.yellow(
          `Could not open a browser automatically: ${error.message}`,
        ),
      );
      console.log(
        chalk.gray(
          "Continue by opening the auth URL manually. The CLI will keep waiting for approval.",
        ),
      );
    }

    const status = await waitForCompletionFn(apiBaseUrl, authToken, expiresAt, {
      httpClient,
      spinnerFactory,
      timeoutMs,
    });
    await verifyApiKeyFn(apiBaseUrl, status.project.apiKey, httpClient);

    // Derive platformUrl from apiBaseUrl (remove /api suffix)
    const platformUrl = apiBaseUrl.replace(/\/api\/?$/, '') || 'https://reshot.dev';

    writeSettingsFn({
      projectId: status.project.id,
      projectName: status.project.name,
      apiKey: status.project.apiKey,
      platformUrl: platformUrl,
      workspace: status.project.workspace || null,
      workspaceName: status.project.workspace?.name || null,
      linkedAt: new Date().toISOString(),
      cliVersion: pkg.version,
      user: status.user
        ? {
            id: status.user.id,
            email: status.user.email,
            fullName: status.user.fullName,
          }
        : null,
      settingsDir: SETTINGS_DIR,
    });

    console.log();
    console.log(
      chalk.green(
        `✔ Reshot CLI is now linked to ${
          status.project.workspace?.name || "your workspace"
        } / ${status.project.name}`
      )
    );
    console.log(chalk.gray(`Settings saved to ${SETTINGS_PATH}`));
    console.log(chalk.gray("Mode: cloud-connected"));
    return {
      mode: "cloud-connected",
      browserOpened,
      authUrl,
      projectId: status.project.id,
      projectName: status.project.name,
      platformUrl,
    };
  } finally {
    if (localServer) {
      localServer.close();
    }
  }
}

module.exports = authCommand;
module.exports.waitForCompletion = waitForCompletion;
module.exports.verifyApiKey = verifyApiKey;
module.exports.startLocalStatusServer = startLocalStatusServer;
