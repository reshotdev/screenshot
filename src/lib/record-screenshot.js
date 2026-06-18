// record-screenshot.js - Screenshot capture flow with cropping
const chalk = require("chalk");
const inquirer = require("inquirer");
const path = require("path");
const fs = require("fs-extra");
const express = require("express");
const { updateBrowserMode } = require("./record-browser-injection");
const { saveScenarioProgress } = require("./record-config");

/**
 * Start screenshot capture flow
 * @param {Object} sessionState - Recording session state
 * @param {Page} page - Playwright page object
 */
async function startCaptureFlow(sessionState, page) {
  const { captureType } = await inquirer.prompt([
    {
      type: "list",
      name: "captureType",
      message: "What do you want to capture?",
      choices: [
        { name: "Single-Step Screenshot (PNG)", value: "screenshot" },
        { name: "Multi-Step Animated Clip (GIF/MP4)", value: "clip" },
      ],
    },
  ]);

  if (captureType === "screenshot") {
    const screenshotStep = await captureScreenshotInteractive(
      sessionState,
      page
    );
    await registerScreenshotStep(sessionState, page, screenshotStep);
  } else if (captureType === "clip") {
    const { startClipRecording } = require("./record-clip");
    await startClipRecording(sessionState, page);
  }
}

/**
 * Capture screenshot with optional element selection and cropping
 * @param {Object} sessionState - Recording session state
 * @param {Page} page - Playwright page object
 * @param {Object} options - Additional options
 * @param {boolean} options.uiMode - If true, skip inquirer prompts
 * @param {string} options.areaType - 'full' or 'element' (required if uiMode)
 * @param {string} options.selector - Element selector (if areaType is 'element')
 * @param {string} options.outputFilename - Output filename
 * @param {Object} options.clip - Crop box coordinates
 */
async function captureScreenshotInteractive(sessionState, page, options = {}) {
  const {
    uiMode = false,
    selector: providedSelector,
    clip: providedClip,
    outputFilename: providedFilename,
  } = options;
  let { areaType: providedAreaType } = options;

  let areaType = providedAreaType;

  if (!uiMode) {
    // CLI mode - use inquirer
    const answers = await inquirer.prompt([
      {
        type: "list",
        name: "areaType",
        message: "What area should be captured?",
        choices: [
          { name: "Full Page", value: "full" },
          { name: "Select a Specific Element", value: "element" },
        ],
      },
    ]);
    areaType = answers.areaType;
  } else {
    // UI mode - use provided options or defaults
    areaType = areaType || "full";
  }

  let selector = providedSelector || null;

  if (areaType === "element" && !selector) {
    if (uiMode) {
      // In UI mode without selector, default to full page
      console.log(
        chalk.yellow(
          "[Recorder] Element mode without selector, falling back to full page"
        )
      );
      areaType = "full";
    } else {
      // Set mode to element selection
      sessionState.mode = "select-element-for-screenshot";
      sessionState.pendingCapture = { selector: null };

      await updateBrowserMode(page, "select-element-for-screenshot");

      console.log(
        chalk.cyan(
          "\n  Return to your browser and click on the element you want to capture...\n"
        )
      );

      // Wait for element to be selected
      await new Promise((resolve) => {
        sessionState.onElementSelected = resolve;
      });

      selector = sessionState.pendingCapture.selector;
      await updateBrowserMode(page, "normal");
    }
  }

  // Get output filename
  let outputFilename = providedFilename;

  if (!outputFilename && !uiMode) {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "outputFilename",
        message: "Output filename:",
        default: `${sessionState.visualKey}-view.png`,
      },
    ]);
    outputFilename = answers.outputFilename;
  } else if (!outputFilename) {
    outputFilename = `${sessionState.visualKey}-${Date.now()}.png`;
  }

  // Capture temporary screenshot
  const tempDir = path.join(process.cwd(), ".reshot", "tmp");
  fs.ensureDirSync(tempDir);
  const tempImagePath = path.join(tempDir, `temp-screenshot-${Date.now()}.png`);

  if (areaType === "full") {
    await page.screenshot({ path: tempImagePath, fullPage: true });
  } else {
    const element = await page.locator(selector).first();
    await element.screenshot({ path: tempImagePath });
  }

  console.log(chalk.green(`  ✔ Screenshot captured\n`));

  // Ask about cropping (only in CLI mode unless clip is provided)
  let cropConfig = null;
  let cropBox = providedClip || null;

  if (!uiMode && !cropBox) {
    const { wantsCrop } = await inquirer.prompt([
      {
        type: "confirm",
        name: "wantsCrop",
        message:
          "Do you want to crop this screenshot (e.g., to focus on a specific modal or element)?",
        default: false,
      },
    ]);

    if (wantsCrop) {
      cropConfig = await runCropperServer(tempImagePath, page);

      // Check if the cropper returned the new format or legacy format
      if (cropConfig && cropConfig.region) {
        // New format with full crop config
        console.log(
          chalk.green(
            `\n  ✔ Crop defined: ${JSON.stringify(cropConfig.region)}`
          )
        );
        if (cropConfig.persistToScenario) {
          console.log(
            chalk.cyan(
              `     → Will apply to all subsequent captures in this scenario\n`
            )
          );
        } else {
          console.log("");
        }
        // Convert region to clip format for backward compatibility
        cropBox = cropConfig.region;
      } else if (cropConfig && cropConfig.x !== undefined) {
        // Legacy format - just x, y, width, height
        cropBox = cropConfig;
        cropConfig = {
          enabled: true,
          region: cropBox,
          scaleMode: "none",
          preserveAspectRatio: true,
          persistToScenario: false,
        };
        console.log(
          chalk.green(`\n  ✔ Crop defined: ${JSON.stringify(cropBox)}\n`)
        );
      }
    }
  }

  // Clean up temp image
  fs.removeSync(tempImagePath);

  // Get device scale factor from page
  let deviceScaleFactor = null;
  try {
    deviceScaleFactor = await page.evaluate(() => window.devicePixelRatio || 1);
  } catch (error) {
    // Fallback to 1 if evaluation fails
    deviceScaleFactor = 1;
  }

  // Generate stable step ID
  const stepId = `${sessionState.visualKey}-${Date.now()}-${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  // Create screenshot step with full metadata
  const screenshotStep = {
    action: "screenshot",
    key: buildCaptureKey(sessionState.visualKey, outputFilename),
    path: outputFilename,
    id: stepId,
    deviceScaleFactor: deviceScaleFactor !== 1 ? deviceScaleFactor : undefined,
  };

  if (selector) {
    screenshotStep.selector = selector;
    // Add default selector padding (can be customized later)
    // Default to 10px padding on all sides
    screenshotStep.selectorPadding = {
      top: 10,
      right: 10,
      bottom: 10,
      left: 10,
    };
  }

  // Handle crop configuration
  if (cropConfig && cropConfig.enabled) {
    // Use the new crop format
    screenshotStep.crop = {
      enabled: true,
      region: cropConfig.region,
      scaleMode: cropConfig.scaleMode || "none",
      preserveAspectRatio: cropConfig.preserveAspectRatio !== false,
    };

    if (cropConfig.padding) {
      screenshotStep.crop.padding = cropConfig.padding;
    }

    // Flag to indicate this crop should be persisted to scenario level
    if (cropConfig.persistToScenario) {
      screenshotStep._persistCropToScenario = true;
    }
  } else if (cropBox) {
    // Legacy format - convert to clip
    screenshotStep.clip = cropBox;
  }

  return screenshotStep;
}

/**
 * Run cropper mini-server with HTML UI
 * @param {string} tempImagePath - Path to temporary screenshot
 * @param {Page} page - Playwright page object for opening cropper UI
 * @returns {Promise<Object>} Crop box coordinates
 */
async function runCropperServer(tempImagePath, page) {
  return new Promise((resolve, reject) => {
    const app = express();
    app.use(express.json());

    let cropResult = null;
    let cropperPage = null;

    // Serve cropper HTML
    app.get("/", (req, res) => {
      const htmlPath = path.join(__dirname, "../../web/cropper/index.html");
      res.sendFile(htmlPath);
    });

    // Serve temp image
    app.get("/image", (req, res) => {
      res.sendFile(tempImagePath);
    });

    // Receive crop coordinates
    app.post("/crop", (req, res) => {
      cropResult = req.body;
      res.json({ ok: true });

      // Close cropper and resolve
      setTimeout(async () => {
        if (cropperPage) {
          await cropperPage.close();
        }
        server.close();
        resolve(cropResult);
      }, 500);
    });

    // Start server on ephemeral port
    const server = app.listen(0, async () => {
      const port = server.address().port;
      const url = `http://localhost:${port}`;

      console.log(chalk.cyan(`\n  Opening cropper UI at ${url}...\n`));

      try {
        // Open cropper in new tab
        const context = page.context();
        cropperPage = await context.newPage();
        await cropperPage.goto(url);
      } catch (error) {
        server.close();
        reject(error);
      }
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      if (!cropResult) {
        server.close();
        if (cropperPage) {
          cropperPage.close();
        }
        reject(new Error("Cropper timeout"));
      }
    }, 5 * 60 * 1000);
  });
}

function buildCaptureKey(visualKey, filename) {
  const base = filename
    .replace(path.extname(filename), "")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .toLowerCase()
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const sanitized = base || `capture-${Date.now()}`;
  return `${visualKey}-${sanitized}`.replace(/-+/g, "-");
}

async function registerScreenshotStep(sessionState, page, screenshotStep) {
  sessionState.capturedSteps.push(screenshotStep);
  await saveScenarioProgress(sessionState, page, { finalize: false });
  console.log(
    chalk.green(
      `  ✔ Screenshot step added: ${sessionState.visualKey}/${screenshotStep.key} → ${screenshotStep.path}\n`
    )
  );
}

module.exports = {
  startCaptureFlow,
  captureScreenshot: captureScreenshotInteractive,
  captureScreenshotInteractive,
};
