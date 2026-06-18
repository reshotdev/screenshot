// record-clip.js - Clip recording flow with subtitle editor
const chalk = require('chalk');
const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs-extra');
const express = require('express');
const { chromium } = require('playwright');
const { updateBrowserMode } = require('./record-browser-injection');
const { runPolishedClip } = require('./polished-clip');
const { saveScenarioProgress } = require('./record-config');
const { resolveTargets } = require('./resolve-targets');
const { captureDomArtifact } = require('./dom-capture');

/**
 * Start clip recording flow
 * @param {Object} sessionState - Recording session state
 * @param {Page} page - Playwright page object
 */
async function startClipRecording(sessionState, page, config = {}) {
  const metadataRecorder = config.emitMetadata
    ? createClipMetadataRecorder({
        slug: config.slug || sessionState.visualKey,
        captureSize: config.captureSize || { width: 1280, height: 720 },
      })
    : null;

  if (metadataRecorder) {
    sessionState.logEvent = metadataRecorder.logEvent;
    metadataRecorder.logEvent('workflow_start');
  }

  // Ask about container element
  const { useContainer } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'useContainer',
      message: 'Do you want to record within a specific container element?',
      default: true
    }
  ]);
  
  let selector = null;
  
  if (useContainer) {
    // If the user has already interacted with the page, offer to reuse the
    // last captured selector as the clip container to avoid forcing them to
    // "record" the same area twice.
    const lastStepWithSelector = Array.isArray(sessionState.capturedSteps)
      ? [...sessionState.capturedSteps].reverse().find((step) => step && step.selector)
      : null;

    if (lastStepWithSelector && lastStepWithSelector.selector) {
      const { reuseLastSelector } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'reuseLastSelector',
          message: `Use the last captured element as the container for this clip? (${lastStepWithSelector.selector})`,
          default: true
        }
      ]);

      if (reuseLastSelector) {
        selector = lastStepWithSelector.selector;
      }
    }

    // If we still don't have a selector (no prior steps or user declined),
    // fall back to interactive selection in the browser.
    if (!selector) {
      sessionState.mode = 'select-element-for-clip';
      sessionState.pendingCapture = { selector: null };
      
      await updateBrowserMode(page, 'select-element-for-clip');
      
      console.log(
        chalk.cyan(
          '\n  Click once on the container element you want this clip anchored to, then return to the terminal.\n'
        )
      );
      
      // Wait for element to be selected
      await new Promise((resolve) => {
        sessionState.onElementSelected = resolve;
      });
      
      selector = sessionState.pendingCapture.selector;
      await updateBrowserMode(page, 'normal');
    }
  }
  
  // Get output filename
  const { outputFilename } = await inquirer.prompt([
    {
      type: 'input',
      name: 'outputFilename',
      message: 'Output clip filename:',
      default: `${sessionState.visualKey}-clip.mp4`
    }
  ]);
  
  // Initialize recording state
  if (sessionState.phase !== 'capturing') {
    sessionState.phase = 'capturing';
  }
  sessionState.mode = 'recording-clip';
  sessionState.clipEvents = [];
  sessionState.recordingStart = Date.now();
  sessionState.clipSelector = selector;
  sessionState.clipFilename = outputFilename;
  
  await updateBrowserMode(page, 'recording-clip');
  
  // Explicitly resume stdin and set to raw mode immediately so 'C' hotkey is caught.
  if (process.stdin && process.stdin.isTTY) {
    process.stdin.resume();
    try {
      process.stdin.setRawMode(true);
    } catch (error) {
      console.warn(chalk.yellow('⚠ Unable to re-enable terminal raw mode for clip controls'));
    }
  }

  console.log(chalk.green(`\n  🎥 Recording started... Perform your actions. Press 'C' again in terminal to stop. (Hotkeys active)\n`));
  
  // Start video recording in a new context
  const tempDir = path.join(process.cwd(), '.reshot', 'tmp');
  fs.ensureDirSync(tempDir);
  
  const browser = page.context().browser();
  const recordingContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: tempDir, size: { width: 1280, height: 720 } }
  });
  
  const recordingPage = await recordingContext.newPage();
  await recordingPage.goto(page.url());
  
  // Store recording context in session state
  sessionState.recordingContext = recordingContext;
  sessionState.recordingPage = recordingPage;
  
  // Set up action replay handler to sync video with real user actions
  sessionState.replayActionToRecording = async (action, selector, text) => {
    if (metadataRecorder) {
      metadataRecorder.logEvent(action, { selector, text });
    }

    try {
      if (action === 'click') {
        await recordingPage.click(selector);
      } else if (action === 'type') {
        await recordingPage.fill(selector, text);
      }
    } catch (error) {
      // Silently fail replay - video may not match exactly but timeline will be correct
      console.warn(chalk.yellow(`  ⚠ Could not replay ${action} to recording context: ${error.message}`));
    }
  };
  
  // Wait for user to press 'C' again to stop
  // (handled by terminal hotkey listener which sets sessionState.stopClipRecording)
  await new Promise((resolve) => {
    const checkStop = setInterval(() => {
      if (sessionState.stopClipRecording) {
        clearInterval(checkStop);
        resolve();
      }
    }, 100);
  });
  
  // Stop recording
  await recordingContext.close();
  await updateBrowserMode(page, 'normal');
  
  console.log(chalk.green(`\n  ✔ Recording stopped. Processing clip...\n`));
  
  // Wait for video file
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const videoFiles = fs.readdirSync(tempDir).filter(f => f.endsWith('.webm'));
  if (videoFiles.length === 0) {
    throw new Error('No video file was created');
  }
  const rawVideoPath = path.join(tempDir, videoFiles[videoFiles.length - 1]);
  
  // Add element bounding boxes to clip events
  for (const event of sessionState.clipEvents) {
    try {
      const element = await page.locator(event.selector).first();
      const boundingBox = await element.boundingBox();
      if (boundingBox) {
        event.elementBox = boundingBox;
      }
    } catch (error) {
      console.warn(chalk.yellow(`  ⚠ Could not get bounding box for ${event.selector}`));
    }
  }
  
  // Open subtitle editor
  const finalEvents = await runSubtitleEditor(sessionState.clipEvents, rawVideoPath, page);
  
  console.log(chalk.green(`\n  ✔ Subtitles edited. Creating polished clip...\n`));
  
  // Enhance events with enhancements flag
  const { enableEnhancements } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'enableEnhancements',
      message: 'Enable click highlights and subtitles in the final clip?',
      default: true
    }
  ]);
  
  // Get device scale factor from page
  let deviceScaleFactor = null;
  try {
    deviceScaleFactor = await page.evaluate(() => window.devicePixelRatio || 1);
  } catch (error) {
    // Fallback to 1 if evaluation fails
    deviceScaleFactor = 1;
  }
  
  // Generate stable step ID
  const stepId = `${sessionState.visualKey}-clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Create clip step for config with full metadata
  const clipStep = {
    action: 'clip',
    key: buildClipKey(sessionState.visualKey, outputFilename),
    selector: selector || 'body',
    path: outputFilename,
    id: stepId,
    deviceScaleFactor: deviceScaleFactor !== 1 ? deviceScaleFactor : undefined,
    selectorPadding: selector ? {
      top: 10,
      right: 10,
      bottom: 10,
      left: 10,
    } : undefined,
    enhancements: {
      clickHighlight: enableEnhancements,
      subtitles: enableEnhancements
    },
    steps: finalEvents.map(e => ({
      action: e.action,
      selector: e.selector,
      text: e.text,
      subtitle: e.subtitle
    }))
  };
  
  sessionState.capturedSteps.push(clipStep);
  await saveScenarioProgress(sessionState, page, { finalize: false });

  if (metadataRecorder) {
    await writeClipMetadata({
      page,
      outputDir: config.outputDir || sessionState.outputDir || process.cwd(),
      slug: metadataRecorder.slug,
      captureSize: metadataRecorder.captureSize,
      timeline: metadataRecorder.timeline,
      targets: config.targets,
    });
  }
  
  // Clean up temp video
  fs.removeSync(rawVideoPath);
  
  // Reset recording state
  sessionState.mode = 'normal';
  sessionState.clipEvents = null;
  sessionState.recordingStart = null;
  sessionState.stopClipRecording = false;
  if (metadataRecorder) {
    delete sessionState.logEvent;
  }
  
  console.log(
    chalk.green(
      `  ✔ Clip step added: ${sessionState.visualKey}/${clipStep.key} → ${clipStep.path}\n`
    )
  );
}

function createClipMetadataRecorder({ slug, captureSize }) {
  const startedAt = Date.now();
  const timeline = [];

  return {
    slug,
    captureSize,
    timeline,
    logEvent(type, payload = {}) {
      timeline.push({
        tMs: Date.now() - startedAt,
        type,
        payload,
      });
    },
  };
}

async function writeClipMetadata({
  page,
  outputDir,
  slug,
  captureSize,
  timeline,
  targets,
}) {
  const resolvedTargets = targets ? await resolveTargets(page, targets) : {};

  // Tier-3: alongside the video, emit a self-contained DOM reconstruction
  // artifact (<slug>.dom.html + sidecars) for eligible screens. Additive and
  // best-effort — it must never break the video path, so failures are swallowed.
  await fs.ensureDir(outputDir);
  const domArtifact = await captureDomArtifact({ page, outputDir, slug });

  const metadata = {
    slug,
    version: 1,
    captureSize,
    timeline,
    targets: resolvedTargets,
    ...(domArtifact ? { domArtifact } : {}),
  };
  const metadataPath = path.join(outputDir, `${slug}.metadata.json`);
  await fs.writeJson(metadataPath, metadata, { spaces: 2 });
  return metadataPath;
}

/**
 * Run subtitle editor mini-server
 * @param {Array} events - Clip events with timestamps
 * @param {string} videoPath - Path to recorded video
 * @param {Page} page - Playwright page object
 * @returns {Promise<Array>} Edited events
 */
async function runSubtitleEditor(events, videoPath, page) {
  return new Promise((resolve, reject) => {
    const app = express();
    app.use(express.json());
    
    let editedEvents = null;
    let editorPage = null;
    
    // Serve subtitle editor HTML
    app.get('/', (req, res) => {
      const htmlPath = path.join(__dirname, '../../web/subtitle-editor/index.html');
      res.sendFile(htmlPath);
    });
    
    // Serve video
    app.get('/video', (req, res) => {
      res.sendFile(videoPath);
    });
    
    // Get timeline
    app.get('/timeline', (req, res) => {
      res.json(events);
    });
    
    // Save edited timeline
    app.post('/timeline', (req, res) => {
      editedEvents = req.body;
      res.json({ ok: true });
      
      // Close editor and resolve
      setTimeout(async () => {
        if (editorPage) {
          await editorPage.close();
        }
        server.close();
        resolve(editedEvents);
      }, 500);
    });
    
    // Start server
    const server = app.listen(0, async () => {
      const port = server.address().port;
      const url = `http://localhost:${port}`;
      
      console.log(chalk.cyan(`\n  Opening subtitle editor at ${url}...\n`));
      
      try {
        const context = page.context();
        editorPage = await context.newPage();
        await editorPage.goto(url);
      } catch (error) {
        server.close();
        reject(error);
      }
    });
    
    // Timeout after 10 minutes
    setTimeout(() => {
      if (!editedEvents) {
        server.close();
        if (editorPage) {
          editorPage.close();
        }
        reject(new Error('Subtitle editor timeout'));
      }
    }, 10 * 60 * 1000);
  });
}

function buildClipKey(visualKey, filename) {
  const base = filename
    .replace(path.extname(filename), '')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const sanitized = base || `clip-${Date.now()}`;
  return `${visualKey}-${sanitized}`.replace(/-+/g, '-');
}

module.exports = {
  createClipMetadataRecorder,
  startClipRecording,
  writeClipMetadata
};
