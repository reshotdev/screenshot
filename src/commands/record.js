// record.js - Interactive scenario recording via CDP
const chalk = require('chalk');
const { connectToActivePage } = require('../lib/record-cdp');
const { setupBrowserActionListener, updateBrowserMode } = require('../lib/record-browser-injection');
const { setupTerminalHotkeys, runEventLoop } = require('../lib/record-terminal');
const { startCaptureFlow } = require('../lib/record-screenshot');
const { startClipRecording } = require('../lib/record-clip');
const { showVisualSelectionMenu, finalizeScenarioAndWriteConfig } = require('../lib/record-config');

/**
 * Main record command
 * @param {string|undefined} title - Optional title for the visual (e.g., "Admin Dashboard")
 */
async function recordCommand(title) {
  console.log(chalk.cyan('🎬 Starting interactive recording session...\n'));
  
  let cleanup = null;
  let browser = null;
  
  try {
    // Step 1: Connect to browser via CDP
    const { browser: connectedBrowser, page } = await connectToActivePage();
    browser = connectedBrowser;
    
    // Step 2: Visual selection and session initialization
    const { visualKey, existingScenario } = await showVisualSelectionMenu(page, title);
    
    const existingScenarioSnapshot = existingScenario
      ? JSON.parse(JSON.stringify(existingScenario))
      : null;

    const sessionState = {
      visualKey,
      capturedSteps: [],
      existingScenario: existingScenarioSnapshot,
      savedStepCount: 0,
      mode: 'normal',
      phase: 'idle',
      pendingCapture: null,
      quit: false,
      saveOnQuit: true,
      clipEvents: null,
      recordingStart: null,
      stopClipRecording: false,
      onChange: null,
      onElementSelected: null
    };
    
    console.log(chalk.green(`\n✔ Visual: ${visualKey}\n`));
    
    // Step 3: Inject browser action listener
    await setupBrowserActionListener(page, sessionState);
    
    // Step 4: Set up terminal hotkeys
    cleanup = setupTerminalHotkeys(sessionState, async () => {
      // Capture flow callback
      try {
        if (sessionState.mode === 'normal') {
          await startCaptureFlow(sessionState, page);
        }
      } catch (error) {
        console.error(chalk.red('Capture error:'), error.message);
      }
    });
    
    // Step 5: Run main event loop
    await runEventLoop(sessionState);
    
    // Step 6: Finalize and save config
    if (cleanup) cleanup();
    
    await finalizeScenarioAndWriteConfig(sessionState, page);
    sessionState.phase = 'finished';
    
    // Close browser connection
    await browser.close();
    
    console.log(chalk.cyan('👋 Recording session ended.\n'));
    
  } catch (error) {
    if (cleanup) cleanup();
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}

module.exports = recordCommand;

