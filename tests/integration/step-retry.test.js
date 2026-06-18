/**
 * Integration test: retryInteractiveStep
 * Element absent on first load → reload → element appears → success
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { CaptureEngine } = require('../../src/lib/capture-engine');
const { retryInteractiveStep } = require('../../src/lib/capture-script-runner');
const { startServer, stopServer } = require('../fixtures/serve');

describe('retryInteractiveStep', () => {
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

  it('retries after reload when element is initially absent', async () => {
    const engine = new CaptureEngine({
      outputDir,
      viewport: { width: 1280, height: 720 },
      baseUrl,
      headless: true,
      logger: () => {},
    });

    try {
      await engine.init();
      // Navigate first, then clear sessionStorage for clean state
      await engine.goto('/delayed-element.html');
      await engine.page.evaluate(() => sessionStorage.clear());

      // Reload so we're on first "clean" load (counter=0, no button)
      await engine.page.reload({ waitUntil: 'domcontentloaded' });

      // Button should NOT be visible on first load
      const btnVisible = await engine.page
        .locator('#delayed-btn')
        .isVisible({ timeout: 1000 })
        .catch(() => false);
      assert.equal(btnVisible, false, 'Button should not be visible on first load');

      // retryInteractiveStep should fail first, reload, then succeed
      const result = await retryInteractiveStep(
        engine,
        'click',
        { target: '#delayed-btn' },
        {
          lastGotoUrl: `${baseUrl}/delayed-element.html`,
          variantConfig: null,
          logger: () => {},
        },
      );

      assert.equal(result.success, true, 'Retry should succeed');
      assert.equal(result.retried, true, 'Should have retried');
    } finally {
      await engine.close().catch(() => {});
    }
  });

  it('returns failure when no lastGotoUrl available', async () => {
    const engine = new CaptureEngine({
      outputDir,
      viewport: { width: 1280, height: 720 },
      baseUrl,
      headless: true,
      logger: () => {},
    });

    try {
      await engine.init();
      await engine.goto('/');

      // Try to click a nonexistent element with no lastGotoUrl
      const result = await retryInteractiveStep(
        engine,
        'click',
        { target: '#nonexistent-element' },
        {
          lastGotoUrl: null,
          variantConfig: null,
          logger: () => {},
        },
      );

      assert.equal(result.success, false, 'Should fail without lastGotoUrl');
      assert.equal(result.retried, true, 'Should indicate retry was attempted');
    } finally {
      await engine.close().catch(() => {});
    }
  });
});
