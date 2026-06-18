/**
 * Integration test: Auth redirect detection
 * goto() should throw when server redirects to /login
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { CaptureEngine } = require('../../src/lib/capture-engine');
const { startServer, stopServer } = require('../fixtures/serve');

describe('CaptureEngine auth redirect detection', () => {
  let server, baseUrl, outputDir;

  before(async () => {
    const result = await startServer();
    server = result.server;
    baseUrl = result.baseUrl;
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reshot-test-'));
  });

  after(async () => {
    if (server) await stopServer(server);
    if (outputDir) await fs.remove(outputDir).catch(() => {});
  });

  it('throws on 302 redirect to /login', async () => {
    const engine = new CaptureEngine({
      outputDir,
      viewport: { width: 1280, height: 720 },
      baseUrl,
      headless: true,
      logger: () => {},
    });

    try {
      await engine.init();
      // /app/dashboard should redirect 302 → /login
      await assert.rejects(
        () => engine.goto('/app/dashboard'),
        (err) => {
          assert.ok(
            err.message.includes('Auth redirect') || err.message.includes('auth'),
            `Expected auth error, got: ${err.message}`,
          );
          return true;
        },
      );
    } finally {
      await engine.close().catch(() => {});
    }
  });

  it('does not throw for normal pages', async () => {
    const engine = new CaptureEngine({
      outputDir,
      viewport: { width: 1280, height: 720 },
      baseUrl,
      headless: true,
      logger: () => {},
    });

    try {
      await engine.init();
      // / is a normal page, should not throw
      await engine.goto('/');
      const title = await engine.page.title();
      assert.equal(title, 'Test Dashboard');
    } finally {
      await engine.close().catch(() => {});
    }
  });
});
