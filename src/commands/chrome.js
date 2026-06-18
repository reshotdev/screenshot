const chalk = require('chalk');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_PORT = process.env.RESHOT_CHROME_PORT || '9222';
const DEFAULT_URL = 'about:blank';

const MAC_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary'
];

const WIN_CANDIDATES = [
  path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe')
];

const LINUX_CANDIDATES = [
  'google-chrome-stable',
  'google-chrome',
  'chromium-browser',
  'chromium'
];

function getCandidates() {
  const platform = process.platform;

  if (platform === 'darwin') {
    return MAC_CANDIDATES;
  }

  if (platform === 'win32') {
    return WIN_CANDIDATES;
  }

  return LINUX_CANDIDATES;
}

function buildManualCommand(port) {
  if (process.platform === 'darwin') {
    return '/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=' + port;
  }

  if (process.platform === 'win32') {
    return '"C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe" --remote-debugging-port=' + port;
  }

  return `google-chrome --remote-debugging-port=${port}`;
}

function spawnChrome(executable, args) {
  return new Promise((resolve) => {
    let done = false;
    try {
      const child = spawn(executable, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });

      child.once('error', (error) => {
        if (done) return;
        done = true;
        resolve({ success: false, error });
      });

      child.unref();
      setTimeout(() => {
        if (!done) {
          done = true;
          resolve({ success: true });
        }
      }, 300);
    } catch (error) {
      resolve({ success: false, error });
    }
  });
}

async function chromeCommand(options = {}) {
  const port = options.port || DEFAULT_PORT;
  const targetUrl = options.url || DEFAULT_URL;
  const homeDir = os.homedir();
  const profileDir = path.join(homeDir, '.reshot', 'chrome-profile');

  await fs.ensureDir(profileDir);

  const chromeArgs = [
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-popup-blocking',
    '--disable-background-networking',
    '--disable-component-extensions-with-background-pages',
    `--user-data-dir=${profileDir}`
  ];

  if (targetUrl) {
    chromeArgs.push(targetUrl);
  }

  const candidates = getCandidates();
  const errors = [];

  for (const executable of candidates) {
    const isAbsolutePath = executable.includes('/') || executable.includes('\\');
    if (isAbsolutePath && !fs.existsSync(executable)) {
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const result = await spawnChrome(executable, chromeArgs);
    if (result.success) {
      console.log(chalk.green(`✔ Chrome launched with remote debugging on port ${port}`));
      console.log(chalk.gray('Keep this Chrome window open while you run `reshot record`.'));
      return;
    }

    errors.push({ executable, error: result.error });
  }

  console.error(chalk.red('✖ Unable to launch Chrome automatically.'));
  if (errors.length > 0) {
    errors.forEach(({ executable, error }) => {
      console.error(chalk.gray(`  • ${executable}: ${error?.message || 'not found'}`));
    });
  }

  console.log('');
  console.log(chalk.yellow('You can launch Chrome manually with:'));
  console.log(chalk.cyan(buildManualCommand(port)));
  console.log('');
  console.log(chalk.gray('After Chrome is running, continue with `reshot record`.'));
}

module.exports = chromeCommand;
