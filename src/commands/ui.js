// ui.js - Launch Reshot management web UI
const express = require("express");
const cors = require("cors");
const path = require("path");
const chalk = require("chalk");
const { spawn } = require("child_process");
const fs = require("fs-extra");
const http = require("http");
const { Server: SocketIOServer } = require("socket.io");
// `open` is ESM-only in the version we use; when required from CommonJS
// its callable export is exposed on the `default` property.
const openModule = require("open");
const open = openModule.default || openModule;
const getPortModule = require("get-port");
const getPort = getPortModule.default || getPortModule;
const { readSettings, readConfig, configExists } = require("../lib/config");
const { attachApiRoutes } = require("../lib/ui-api");
const RecorderService = require("../lib/recorder-service");

/**
 * Build the frontend if it doesn't exist
 */
async function ensureFrontendBuilt(managerDir, staticDir) {
  const indexHtmlPath = path.join(staticDir, "index.html");

  if (fs.existsSync(indexHtmlPath)) {
    return true;
  }

  console.log(chalk.cyan("\n📦 Building Reshot Studio UI (web/manager)...\n"));

  // Check if node_modules exists, if not run npm install
  const nodeModulesPath = path.join(managerDir, "node_modules");
  if (!fs.existsSync(nodeModulesPath)) {
    console.log(chalk.gray("Installing dependencies..."));
    await runCommand("npm", ["install"], { cwd: managerDir, stdio: "inherit" });
  }

  // Run build
  console.log(chalk.gray("Building frontend..."));
  const buildSuccess = await runCommand("npm", ["run", "build"], {
    cwd: managerDir,
    stdio: "inherit",
  });

  if (!buildSuccess || !fs.existsSync(indexHtmlPath)) {
    console.error(
      chalk.red("\n❌ Failed to build frontend."),
      "\nYou can manually build it by running:",
      chalk.cyan("  npm run ui:build"),
      "\nOr from the web/manager directory:",
      chalk.cyan("  cd web/manager && npm install && npm run build\n")
    );
    process.exit(1);
  }

  console.log(chalk.green("✔ Frontend built successfully\n"));
  return true;
}

/**
 * Run a command and wait for it to complete
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      ...options,
      shell: process.platform === "win32",
    });

    child.on("close", (code) => {
      resolve(code === 0);
    });

    child.on("error", (error) => {
      console.error(chalk.red(`Failed to run ${command}:`), error.message);
      resolve(false);
    });
  });
}

module.exports = async function uiCommand(options = {}) {
  const requestedPort = parseInt(options.port || "4300", 10);
  const host = options.host || "127.0.0.1";
  const shouldOpen = options.open !== false; // Default to true, allow --no-open flag

  // Find an available port, preferring the requested port
  const port = await getPort({ port: requestedPort });

  if (port !== requestedPort) {
    console.log(
      chalk.yellow(
        `⚠ Port ${requestedPort} is in use. Using port ${port} instead.`
      )
    );
  }

  // 1) Try to read settings, but allow degraded mode
  let settings = null;
  let isAuthenticated = false;
  try {
    settings = readSettings();
    isAuthenticated = !!(settings?.apiKey && settings?.projectId);
  } catch (error) {
    console.warn(
      chalk.yellow("⚠ Warning:"),
      "No CLI settings found. Some features may be limited."
    );
    console.warn(
      chalk.gray(
        "  Run `reshot auth` to authenticate and unlock full functionality.\n"
      )
    );
  }

  // 2) Check if config exists, but allow UI to start anyway (it can pull from platform)
  let config = null;
  if (configExists()) {
    try {
      config = readConfig();
    } catch (error) {
      console.warn(
        chalk.yellow("Warning:"),
        "Config file exists but is invalid. UI will allow you to fix it or pull from platform."
      );
    }
  } else {
    console.log(
      chalk.yellow("Info:"),
      "No reshot.config.json found. Use the UI to pull config from platform or create a new one."
    );
  }

  // 3) Ensure frontend is built
  const managerDir = path.join(__dirname, "..", "..", "web", "manager");
  const staticDir = path.join(managerDir, "dist");

  try {
    await ensureFrontendBuilt(managerDir, staticDir);
  } catch (error) {
    console.error(chalk.red("Failed to build frontend:"), error.message);
    process.exit(1);
  }

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  // Create HTTP server and Socket.io instance
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Create RecorderService instance with Socket.io
  const recorderService = new RecorderService({
    io,
    logger: console.log,
  });

  // 4) Attach JSON API routes (pass settings, io, and recorderService)
  attachApiRoutes(app, { settings, io, recorderService });

  // Socket.io connection handling
  io.on("connection", (socket) => {
    console.log(chalk.gray("[Socket.io] Client connected"));

    // Send current recorder status on connect
    socket.emit("recorder:status", recorderService.getStatus());
    socket.emit("recorder:steps", { steps: recorderService.getSteps() });

    socket.on("disconnect", () => {
      console.log(chalk.gray("[Socket.io] Client disconnected"));
    });
  });

  // 5) Serve static frontend
  app.use(express.static(staticDir));
  app.get("*", (req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });

  httpServer.listen(port, host, () => {
    const url = `http://${host}:${port}`;
    console.log(chalk.cyan("\n✨ Reshot Studio is running"));
    console.log(chalk.gray(`   Local studio website: ${chalk.underline(url)}`));
    console.log(chalk.gray(`   Recording controls: Available via Socket.io`));
    console.log(chalk.gray(`   Press Ctrl+C to stop the server\n`));

    // Auto-open browser unless --no-open flag is set
    if (shouldOpen) {
      setTimeout(() => {
        open(url).catch((err) => {
          // Silently fail if browser can't be opened
          console.warn(
            chalk.yellow("Could not auto-open browser. Please open manually:"),
            url
          );
        });
      }, 500);
    }
  });

  // Graceful shutdown helper
  let isShuttingDown = false;
  async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(chalk.gray(`\n\nShutting down Reshot Studio (${signal})...`));

    // Force exit after 3 seconds if graceful shutdown hangs
    const forceExitTimer = setTimeout(() => {
      console.log(chalk.yellow("Force exiting..."));
      process.exit(0);
    }, 3000);

    // Clean up recorder session if active
    try {
      await recorderService.forceCleanup();
    } catch (e) {
      // Ignore cleanup errors
    }

    // Close all socket.io connections first (this is key!)
    try {
      io.close();
    } catch (e) {
      // Ignore
    }

    // Now close the HTTP server
    httpServer.close(() => {
      clearTimeout(forceExitTimer);
      console.log(chalk.green("✔ Server closed"));
      process.exit(0);
    });
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Keep process alive
  return new Promise(() => {});
};
