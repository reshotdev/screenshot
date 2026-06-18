/**
 * Integration test: _waitForCustomReady
 * Tests selector wait, JS expression wait, and timeout failure.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { CaptureEngine } = require('../../src/lib/capture-engine');
const { startServer, stopServer } = require('../fixtures/serve');

describe('_waitForCustomReady', () => {
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

  it('waits for selector to appear', async () => {
    const engine = new CaptureEngine({
      outputDir,
      viewport: { width: 1280, height: 720 },
      baseUrl,
      headless: true,
      logger: () => {},
    });

    try {
      await engine.init();
      await engine.goto('/custom-ready.html');

      // data-ready="true" appears after 1.5s
      const result = await engine._waitForCustomReady({
        selector: '[data-ready="true"]',
        timeout: 5000,
      });

      assert.equal(result.ready, true, 'Should detect ready selector');
    } finally {
      await engine.close().catch(() => {});
    }
  });

  it('waits for JS expression to become truthy', async () => {
    const engine = new CaptureEngine({
      outputDir,
      viewport: { width: 1280, height: 720 },
      baseUrl,
      headless: true,
      logger: () => {},
    });

    try {
      await engine.init();
      await engine.goto('/custom-ready.html');

      // window.__APP_READY becomes true after 1.5s
      const result = await engine._waitForCustomReady({
        expression: 'window.__APP_READY === true',
        timeout: 5000,
      });

      assert.equal(result.ready, true, 'Should detect JS expression');
    } finally {
      await engine.close().catch(() => {});
    }
  });

  it('returns failure on selector timeout', async () => {
    const engine = new CaptureEngine({
      outputDir,
      viewport: { width: 1280, height: 720 },
      baseUrl,
      headless: true,
      logger: () => {},
    });

    try {
      await engine.init();
      await engine.goto('/custom-ready.html');

      // Non-existent selector with very short timeout
      const result = await engine._waitForCustomReady({
        selector: '#nonexistent-element',
        timeout: 500,
      });

      assert.equal(result.ready, false, 'Should report not ready');
      assert.ok(result.reason.includes('not found'), `Reason should mention not found: ${result.reason}`);
    } finally {
      await engine.close().catch(() => {});
    }
  });

  it('returns failure when both selector and expression used together', async () => {
    const engine = new CaptureEngine({
      outputDir,
      viewport: { width: 1280, height: 720 },
      baseUrl,
      headless: true,
      logger: () => {},
    });

    try {
      await engine.init();
      await engine.goto('/custom-ready.html');

      // Nonexistent selector should fail before expression is checked
      const result = await engine._waitForCustomReady({
        selector: '#nonexistent-element',
        expression: 'window.__APP_READY === true',
        timeout: 500,
      });

      assert.equal(result.ready, false, 'Should report not ready');
      assert.ok(result.reason.includes('not found'), `Reason should mention not found: ${result.reason}`);
    } finally {
      await engine.close().catch(() => {});
    }
  });
});
