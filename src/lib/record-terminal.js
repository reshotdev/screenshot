// record-terminal.js - Terminal hotkey handling for record command
const readline = require('readline');
const chalk = require('chalk');

/**
 * Set up terminal hotkey listener with raw mode
 * @param {Object} sessionState - Recording session state
 * @param {Function} onCapture - Callback when 'C' is pressed
 * @returns {Function} Cleanup function to restore terminal
 */
function setupTerminalHotkeys(sessionState, onCapture) {
  if (!process.stdin.isTTY) {
    console.warn(chalk.yellow('⚠ Terminal is not in TTY mode, hotkeys may not work'));
    return () => {};
  }
  
  const rl = readline.createInterface({
    input: process.stdin,
    escapeCodeTimeout: 50
  });
  
  readline.emitKeypressEvents(process.stdin, rl);
  process.stdin.setRawMode(true);
  
  // Print hotkey instructions
  console.log(chalk.cyan('🎯 Recording Controls:'));
  console.log(chalk.gray('  Navigate to the state you want, then press C to capture (screenshot or clip).'));
  console.log(chalk.gray('  Press Q - Quit and save the visual'));
  console.log(chalk.gray('  Press Ctrl+C - Quit without saving\n'));
  
  console.log(chalk.green('✔ Setup complete. When you are ready, press C to start capturing.\n'));
  
  const keypressHandler = (str, key) => {
    if (!key) return;
    
    // Ctrl+C - hard quit
    if (key.ctrl && key.name === 'c') {
      console.log(chalk.yellow('\n\n⚠ Interrupted. Exiting without saving...'));
      sessionState.quit = true;
      sessionState.saveOnQuit = false;
      if (sessionState.onChange) {
        sessionState.onChange();
      }
      return;
    }
    
    // Q - quit and save
    if (key.name === 'q' && !key.ctrl) {
      console.log(chalk.cyan('\n\n📝 Quitting recording session...'));
      sessionState.quit = true;
      sessionState.saveOnQuit = true;
      if (sessionState.onChange) {
        sessionState.onChange();
      }
      return;
    }
    
    // C - capture (screenshot or clip)
    if (key.name === 'c' && !key.ctrl) {
      // Check if we're stopping a clip recording
      if (sessionState.mode === 'recording-clip') {
        console.log(chalk.cyan('\n\n🛑 Stopping clip recording...'));
        sessionState.stopClipRecording = true;
        if (sessionState.onChange) {
          sessionState.onChange();
        }
        return;
      }
      
      // Otherwise, start capture flow
      if (sessionState.mode === 'normal') {
        if (sessionState.phase === 'idle') {
          sessionState.phase = 'capturing';
        }
        console.log(chalk.cyan('\n\n📸 Starting capture flow...'));
        if (onCapture) {
          // Let the capture flow manage terminal settings as needed.
          onCapture().catch((error) => {
            console.error(chalk.red('Capture error:'), error.message);
          });
        }
      }
    }
  };
  
  process.stdin.on('keypress', keypressHandler);
  
  // Return cleanup function
  return () => {
    process.stdin.removeListener('keypress', keypressHandler);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    rl.close();
  };
}

/**
 * Main event loop that waits for session to complete
 * @param {Object} sessionState - Recording session state
 */
async function runEventLoop(sessionState) {
  return new Promise((resolve) => {
    sessionState.onChange = () => {
      if (sessionState.quit) {
        resolve();
      }
    };
    
    // Keep process alive
    const interval = setInterval(() => {
      if (sessionState.quit) {
        clearInterval(interval);
      }
    }, 100);
  });
}

module.exports = {
  setupTerminalHotkeys,
  runEventLoop
};

