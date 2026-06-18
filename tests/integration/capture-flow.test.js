/**
 * Integration test: CaptureEngine lifecycle
 * init → goto → click → type → capture → close
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { CaptureEngine } = require('../../src/lib/capture-engine');
const { startServer, stopServer } = require('../fixtures/serve');

describe('CaptureEngine capture flow', () => {
  let server, baseUrl, outputDir, engine;

  before(async () => {
    const result = await startServer();
    server = result.server;
    baseUrl = result.baseUrl;
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reshot-test-'));
  });

  after(async () => {
    if (engine) await engine.close().catch(() => {});
    if (server) await stopServer(server);
    if (outputDir) await fs.remove(outputDir).catch(() => {});
  });

  it('completes full capture lifecycle', async () => {
    engine = new CaptureEngine({
      outputDir,
      viewport: { width: 1280, height: 720 },
      baseUrl,
      headless: true,
      logger: () => {}, // silent
    });

    // Init browser
    await engine.init();
    assert.ok(engine.page, 'page should be initialized');

    // Navigate to dashboard
    await engine.goto('/');
    const title = await engine.page.title();
    assert.equal(title, 'Test Dashboard');

    // Click button
    await engine.click('#action-btn');
    const status = await engine.page.locator('#status').textContent();
    assert.equal(status, 'Button clicked!');

    // Type into input
    await engine.type('#search-input', 'hello world');
    const value = await engine.page.locator('#search-input').inputValue();
    assert.equal(value, 'hello world');

    // Capture screenshot
    const captureName = 'dashboard-test';
    await engine.capture(captureName);

    // Verify the asset was recorded
    const assets = engine.getAssets();
    assert.ok(assets.length > 0, 'should have captured at least one asset');

    // Verify PNG file exists on disk
    const pngFiles = (await fs.readdir(outputDir)).filter(f => f.endsWith('.png'));
    assert.ok(pngFiles.length > 0, 'should have at least one PNG file');

    // Close browser
    await engine.close();
    engine = null;
  });
});
