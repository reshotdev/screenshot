/**
 * Test fixture server for CLI integration tests.
 * Serves static pages and provides auth redirect simulation.
 *
 * Usage:
 *   const { startServer, stopServer } = require('./serve');
 *   const { server, port, baseUrl } = await startServer();
 *   // ... run tests ...
 *   await stopServer(server);
 */

const express = require('express');
const path = require('path');

const PAGES_DIR = path.join(__dirname, 'pages');

/**
 * Start a test server on an OS-assigned port.
 * @returns {Promise<{server: import('http').Server, port: number, baseUrl: string}>}
 */
function startServer() {
  return new Promise((resolve, reject) => {
    const app = express();

    // Serve static fixture pages
    app.use(express.static(PAGES_DIR));

    // Auth redirect: /app/* routes redirect to /login
    app.get('/app/*', (_req, res) => {
      res.redirect(302, '/login');
    });

    // Login route serves login.html
    app.get('/login', (_req, res) => {
      res.sendFile(path.join(PAGES_DIR, 'login.html'));
    });

    const server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' ? addr.port : 0;
      resolve({
        server,
        port,
        baseUrl: `http://localhost:${port}`,
      });
    });

    server.on('error', reject);
  });
}

/**
 * Stop the test server.
 * @param {import('http').Server} server
 * @returns {Promise<void>}
 */
function stopServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

module.exports = { startServer, stopServer };
