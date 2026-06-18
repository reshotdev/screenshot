// polished-clip.js - Three-stage HTML overlay pipeline for polished video clips
// Based on test/412/polished_clip_runner.js
const { chromium } = require("playwright");
const fs = require("fs-extra");
const path = require("path");
const { spawn } = require("child_process");
const { buildLaunchOptions } = require("./ci-detect");
const { resolveSecretsInString } = require("./secrets");

// Debug mode - set RESHOT_DEBUG=1 or RESHOT_DEBUG=video to enable verbose logging
const DEBUG =
  process.env.RESHOT_DEBUG === "1" || process.env.RESHOT_DEBUG === "video";

function debug(...args) {
  if (DEBUG) {
    console.log("    [DEBUG]", ...args);
  }
}

/**
 * Check if ffmpeg is installed
 */
function checkFFmpeg() {
  try {
    const ffmpegProcess = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    return new Promise((resolve) => {
      ffmpegProcess.on("close", (code) => {
        resolve(code === 0);
      });
    });
  } catch (e) {
    return false;
  }
}

/**
 * Run ffmpeg command
 */
function runFFmpeg(args, description) {
  return new Promise((resolve, reject) => {
    console.log(`    ${description}`);
    const ffmpegProcess = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    ffmpegProcess.stderr.on("data", (data) => {
      const output = data.toString();
      stderr += output;
      if (output.includes("time=")) {
        const match = output.match(/time=([^\s]+)/);
        if (match) {
          process.stdout.write(`\r    Progress: ${match[1]}`);
        }
      }
    });

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ffmpegProcess.kill();
        reject(new Error(`FFmpeg timeout: ${description}`));
      }
    }, 2 * 60 * 1000); // 2 minute timeout

    ffmpegProcess.on("close", (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      if (code === 0) {
        console.log("\n    ✔ Complete");
        resolve();
      } else {
        console.error("\n    ❌ FFmpeg failed with code:", code);
        console.error("    Last 500 chars:", stderr.slice(-500));
        reject(new Error(`FFmpeg failed: ${description}`));
      }
    });
  });
}

/**
 * Generate overlay HTML for animations
 */
function generateOverlayHtml(events, mainBoundingBox, enhancements) {
  const width = Math.round(mainBoundingBox.width);
  const height = Math.round(mainBoundingBox.height);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      width: ${width}px;
      height: ${height}px;
      background: #00ff00; /* Green screen for chroma key */
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .click-highlight {
      position: absolute;
      background: rgba(255, 255, 0, 0.5);
      border: 2px solid rgba(255, 255, 0, 0.8);
      border-radius: 4px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.1s ease-in-out;
    }
    .click-highlight.visible {
      opacity: 1;
    }
    .subtitle-container {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 60px;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease-in-out;
    }
    .subtitle-container.visible {
      opacity: 1;
    }
    .subtitle-text {
      color: white;
      font-size: 24px;
      text-align: center;
      padding: 0 20px;
    }
  </style>
</head>
<body>
  ${
    enhancements.clickHighlight
      ? events
          .filter((e) => e.action === "click")
          .map((event, i) => {
            return `  <div class="click-highlight" id="highlight-${i}" 
         style="left: ${event.elementBox.x}px; top: ${event.elementBox.y}px; 
                width: ${event.elementBox.width}px; height: ${event.elementBox.height}px;"></div>
`;
          })
          .join("")
      : ""
  }
  
  ${
    enhancements.subtitles
      ? `
  <div class="subtitle-container" id="subtitle-container">
    <div class="subtitle-text" id="subtitle-text"></div>
  </div>
  `
      : ""
  }

  <script>
    const events = ${JSON.stringify(events)};
    const enhancements = ${JSON.stringify(enhancements)};
    
    // Schedule click highlights
    ${
      enhancements.clickHighlight
        ? `
    events.filter(e => e.action === 'click').forEach((event, idx) => {
      const highlight = document.getElementById('highlight-' + idx);
      if (!highlight) return;
      
      setTimeout(() => {
        highlight.classList.add('visible');
        setTimeout(() => {
          highlight.classList.remove('visible');
        }, 500);
      }, event.timestamp * 1000);
    });
    `
        : ""
    }
    
    // Schedule subtitles
    ${
      enhancements.subtitles
        ? `
    const subtitleContainer = document.getElementById('subtitle-container');
    const subtitleText = document.getElementById('subtitle-text');
    
    if (subtitleContainer && subtitleText) {
      events.forEach((event, idx) => {
        const startTime = event.timestamp * 1000;
        const nextEvent = events[idx + 1];
        const endTime = nextEvent ? nextEvent.timestamp * 1000 : (event.timestamp + 2) * 1000;
        const duration = endTime - startTime;
        
        setTimeout(() => {
          subtitleText.textContent = event.subtitle;
          subtitleContainer.classList.add('visible');
          
          setTimeout(() => {
            subtitleContainer.classList.remove('visible');
          }, duration);
        }, startTime);
      });
    }
    `
        : ""
    }
  </script>
</body>
</html>`;
}

/**
 * Run polished clip pipeline
 * @param {Object} options - Run options
 * @param {string} options.url - URL to navigate to
 * @param {Object} options.clipStep - Clip step configuration
 * @param {string} options.outputDir - Directory to save output file
 */
async function runPolishedClip({ url, clipStep, outputDir }) {
  debug("Starting polished clip recording");
  debug(`URL: ${url}`);
  debug(`Output directory: ${outputDir}`);
  debug(`Clip selector: ${clipStep.selector}`);

  // Check ffmpeg
  const hasFFmpeg = await checkFFmpeg();
  if (!hasFFmpeg) {
    throw new Error(
      "ffmpeg is not installed. Please install it to create video clips."
    );
  }
  debug("ffmpeg check passed");

  const tempDir = path.join(process.cwd(), ".reshot", "tmp");
  debug(`Temp directory: ${tempDir}`);
  fs.ensureDirSync(tempDir);

  const finalVideoPath = path.join(outputDir, clipStep.path);
  const rawVideoPath = path.join(tempDir, "temp_raw_video.webm");
  const timelinePath = path.join(tempDir, "timeline.json");
  const overlayHtmlPath = path.join(tempDir, "overlay.html");
  const croppedVideoPath = path.join(tempDir, "cropped_video.mp4");
  debug(`Final video path: ${finalVideoPath}`);

  // ============================================
  // STAGE 1: CAPTURE PHASE
  // ============================================
  console.log("    === Stage 1: Capturing video and timeline ===");

  debug("Launching browser...");
  const browser = await chromium.launch(buildLaunchOptions({ headless: true }));
  debug("Creating context with video recording...");
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: tempDir, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  debug(`Navigating to ${url}...`);
  await page.goto(url);
  await page.waitForTimeout(500);

  const mainElement = await page.locator(clipStep.selector).first();
  const mainBoundingBox = await mainElement.boundingBox();
  debug(`Main element bounding box: ${JSON.stringify(mainBoundingBox)}`);

  if (!mainBoundingBox) {
    throw new Error(
      `Could not find element with selector: ${clipStep.selector}`
    );
  }

  const events = [];
  const startTime = Date.now();

  // ============================================
  // SENTINEL CAPTURE SETUP
  // ============================================
  const sentinelDir = path.join(
    outputDir,
    path.dirname(clipStep.path),
    "sentinels"
  );
  fs.ensureDirSync(sentinelDir);
  const sentinelPaths = [];

  /**
   * Capture a sentinel frame of the main element
   * @param {number} index - Step index
   * @returns {Promise<string>} Path to saved sentinel
   */
  async function captureSentinel(index) {
    const sentinelPath = path.join(sentinelDir, `step-${index}.png`);
    await mainElement.screenshot({ path: sentinelPath });
    sentinelPaths.push({ index, path: sentinelPath });
    return sentinelPath;
  }

  // Capture initial state BEFORE any actions
  await captureSentinel(0);
  console.log("    ✔ Captured initial sentinel frame");

  // Execute steps and capture timeline
  for (let stepIdx = 0; stepIdx < clipStep.steps.length; stepIdx++) {
    const subStep = clipStep.steps[stepIdx];
    const element = await page.locator(subStep.selector).first();
    const boundingBox = await element.boundingBox();
    if (!boundingBox) {
      throw new Error(
        `Could not find element with selector: ${subStep.selector}`
      );
    }
    const timestamp = (Date.now() - startTime) / 1000;

    // Store event with relative coordinates
    events.push({
      action: subStep.action,
      timestamp,
      subtitle:
        subStep.subtitle ||
        (subStep.action === "type"
          ? `Entering text into ${subStep.selector}`
          : `Clicking ${subStep.selector}`),
      elementBox: {
        x: boundingBox.x - mainBoundingBox.x,
        y: boundingBox.y - mainBoundingBox.y,
        width: boundingBox.width,
        height: boundingBox.height,
      },
    });

    if (subStep.action === "type") {
      const text = resolveSecretsInString(subStep.text);
      debug(`Typing into ${subStep.selector}: "${text.substring(0, 20)}..."`);
      await page.type(subStep.selector, text, { delay: 100 });
      await page.waitForTimeout(500);
    } else if (subStep.action === "click") {
      debug(`Clicking on ${subStep.selector}`);
      await page.click(subStep.selector);
      await page.waitForTimeout(500);
    }

    // Capture sentinel frame AFTER action
    await captureSentinel(stepIdx + 1);
  }

  console.log(`    ✔ Captured ${sentinelPaths.length} sentinel frames`);

  debug("Waiting before closing context...");
  await page.waitForTimeout(2000);
  debug("Closing context to finalize video...");
  await context.close();
  console.log("    ✔ Video recorded and timeline captured");

  // Wait for video file
  debug("Waiting for video file to be written...");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const videoFiles = fs.readdirSync(tempDir).filter((f) => f.endsWith(".webm"));
  debug(`Found ${videoFiles.length} video files: ${videoFiles.join(", ")}`);
  if (videoFiles.length === 0) {
    const allFiles = fs.readdirSync(tempDir);
    debug(`All files in temp dir: ${allFiles.join(", ")}`);
    throw new Error("No video file was created");
  }
  const recordedVideoPath = path.join(
    tempDir,
    videoFiles[videoFiles.length - 1]
  );
  const recordedVideoFilename = videoFiles[videoFiles.length - 1];
  const videoSize = fs.statSync(recordedVideoPath).size;
  debug(
    `Using video file: ${recordedVideoPath} (${(videoSize / 1024).toFixed(
      1
    )} KB)`
  );

  // Save timeline.json
  fs.writeFileSync(timelinePath, JSON.stringify(events, null, 2));
  console.log(`    ✔ Timeline saved`);

  // Crop the raw video to the main element
  console.log("    --- Cropping video to element bounds ---");
  await runFFmpeg(
    [
      "-i",
      recordedVideoPath,
      "-vf",
      `crop=${Math.round(mainBoundingBox.width)}:${Math.round(
        mainBoundingBox.height
      )}:${Math.round(mainBoundingBox.x)}:${Math.round(mainBoundingBox.y)}`,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-y",
      croppedVideoPath,
    ],
    "Cropping..."
  );

  // ============================================
  // STAGE 2: OVERLAY GENERATION PHASE
  // ============================================
  let finalOverlayPath = null;
  const enhancements = clipStep.enhancements || {};

  if (enhancements.clickHighlight || enhancements.subtitles) {
    console.log("    === Stage 2: Generating HTML overlay ===");

    // Generate overlay.html
    const overlayHtml = generateOverlayHtml(
      events,
      mainBoundingBox,
      enhancements
    );
    fs.writeFileSync(overlayHtmlPath, overlayHtml);
    console.log(`    ✔ Overlay HTML generated`);

    // Record the overlay HTML as a video
    console.log("    --- Recording overlay animations ---");
    const overlayContext = await browser.newContext({
      viewport: {
        width: Math.round(mainBoundingBox.width),
        height: Math.round(mainBoundingBox.height),
      },
      recordVideo: {
        dir: tempDir,
        size: {
          width: Math.round(mainBoundingBox.width),
          height: Math.round(mainBoundingBox.height),
        },
      },
    });
    const overlayPage = await overlayContext.newPage();

    // Load the HTML file and wait for it to be ready
    await overlayPage.goto(`file://${path.resolve(overlayHtmlPath)}`, {
      waitUntil: "networkidle",
    });
    await overlayPage.waitForTimeout(500);

    // Wait for animations to complete
    const maxTimestamp = Math.max(
      ...events.map((e, idx) => {
        const nextEvent = events[idx + 1];
        return nextEvent ? nextEvent.timestamp : e.timestamp + 2;
      })
    );
    const videoDuration = Math.max(maxTimestamp + 2, 5);

    console.log(
      `    Waiting ${videoDuration.toFixed(1)}s for overlay animations...`
    );
    await overlayPage.waitForTimeout(videoDuration * 1000);

    await overlayContext.close();
    console.log("    ✔ Overlay video recorded");

    // Wait and find overlay video
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const allVideoFiles = fs
      .readdirSync(tempDir)
      .filter((f) => f.endsWith(".webm"));
    const overlayVideoFiles = allVideoFiles.filter(
      (f) => f !== recordedVideoFilename
    );
    if (overlayVideoFiles.length === 0) {
      throw new Error("No overlay video file was created");
    }
    finalOverlayPath = path.join(
      tempDir,
      overlayVideoFiles[overlayVideoFiles.length - 1]
    );
    console.log(`    ✔ Overlay video found`);
  }

  // ============================================
  // STAGE 3: COMPOSITING PHASE
  // ============================================
  if (enhancements.clickHighlight || enhancements.subtitles) {
    console.log("    === Stage 3: Compositing videos ===");

    // Use chroma key to make green background transparent, then overlay
    await runFFmpeg(
      [
        "-i",
        croppedVideoPath,
        "-i",
        finalOverlayPath,
        "-filter_complex",
        "[1:v]chromakey=0x00ff00:0.1:0.2[ckout];[0:v][ckout]overlay=0:0:shortest=1",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-y",
        finalVideoPath,
      ],
      "Compositing with chroma key..."
    );
  } else {
    // No enhancements, just copy the cropped video
    fs.copyFileSync(croppedVideoPath, finalVideoPath);
  }

  // Clean up
  console.log("    --- Cleaning up temporary files ---");
  try {
    if (fs.existsSync(recordedVideoPath)) fs.unlinkSync(recordedVideoPath);
    if (fs.existsSync(croppedVideoPath)) fs.unlinkSync(croppedVideoPath);
    if (fs.existsSync(timelinePath)) fs.unlinkSync(timelinePath);
    if (fs.existsSync(overlayHtmlPath)) fs.unlinkSync(overlayHtmlPath);
    const overlayFiles = fs
      .readdirSync(tempDir)
      .filter((f) => f.includes("overlay") || f.endsWith(".webm"));
    overlayFiles.forEach((f) => {
      try {
        fs.unlinkSync(path.join(tempDir, f));
      } catch (e) {}
    });
    if (fs.readdirSync(tempDir).length === 0) {
      fs.rmdirSync(tempDir);
    }
  } catch (e) {
    console.warn(
      "    Warning: Some temp files could not be deleted:",
      e.message
    );
  }

  console.log(`    ✔ Polished video clip saved to ${finalVideoPath}`);
  await browser.close();
}

module.exports = {
  runPolishedClip,
};
