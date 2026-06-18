const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const fs = require('fs-extra');
const { chromium } = require('playwright');

const {
  createClipMetadataRecorder,
  writeClipMetadata,
} = require('../src/lib/record-clip');
const {
  buildVideoMetadata,
  normalizeVideoTargetName,
} = require('../src/lib/capture-script-runner');
const {
  deriveSlug,
  parseFormats,
  parseSize,
  resolveCapturePath,
  runCompose,
  runComposePush,
} = require('../src/commands/compose');

test('record-clip metadata writes timeline events and resolved targets', async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'record-clip-meta-'));
  const server = await startFixtureServer();
  let browser = null;

  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: resolveChromiumExecutable(),
    });
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.goto(server.url);

    const recorder = createClipMetadataRecorder({
      slug: 'login',
      captureSize: { width: 800, height: 600 },
    });
    recorder.logEvent('workflow_start');
    await page.click('#next');
    recorder.logEvent('opened_form', { selector: '#email' });

    const metadataPath = await writeClipMetadata({
      page,
      outputDir,
      slug: recorder.slug,
      captureSize: recorder.captureSize,
      timeline: recorder.timeline,
      targets: {
        email_input: {
          selector: '#email',
          navigate: [{ clickText: 'Show target', waitMs: 25 }],
        },
      },
    });

    const metadata = await fs.readJson(metadataPath);
    assert.equal(metadata.slug, 'login');
    assert.equal(metadata.version, 1);
    assert.deepEqual(metadata.captureSize, { width: 800, height: 600 });
    assert.equal(metadata.timeline.length, 2);
    assert.equal(metadata.timeline[0].type, 'workflow_start');
    assert.equal(metadata.timeline[1].type, 'opened_form');
    assert.equal(typeof metadata.timeline[0].tMs, 'number');
    assert.equal(typeof metadata.targets.email_input.x, 'number');
    assert.equal(typeof metadata.targets.email_input.y, 'number');
    assert.ok(metadata.targets.email_input.w > 0);
    assert.ok(metadata.targets.email_input.h > 0);
  } finally {
    if (browser) {
      await browser.close();
    }
    await server.close();
    await fs.remove(outputDir);
  }
});

test('summary-video metadata uses timeline, targets, and 24fps defaults', () => {
  assert.equal(normalizeVideoTargetName("[data-testid='new-project-button']"), 'new_project_button');

  const metadata = buildVideoMetadata(
    [
      {
        action: 'click',
        timestamp: 1.25,
        subtitle: 'Create project',
        target: "[data-testid='new-project-button']",
        elementBox: { x: 10, y: 20, width: 120, height: 40 },
      },
      {
        action: 'type',
        timestamp: 2.5,
        target: '#project-name',
      },
    ],
    [{ index: 0, label: 'Created', path: '/tmp/summary-video-frame-0.png' }],
    { width: 1440, height: 900 },
    24,
  );

  assert.equal(metadata.frameRate, 24);
  assert.deepEqual(metadata.viewport, { width: 1440, height: 900 });
  assert.equal(metadata.timeline.length, 2);
  assert.equal(metadata.timeline[0].type, 'click');
  assert.equal(metadata.timeline[0].tMs, 1250);
  assert.equal(metadata.timeline[0].target, 'new_project_button');
  assert.deepEqual(metadata.targets.new_project_button, {
    x: 10,
    y: 20,
    width: 120,
    height: 40,
  });
  assert.equal(metadata.sentinels[0].filename, 'summary-video-frame-0.png');
});

test('compose command validates required metadata and capture files', async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compose-command-'));

  try {
    const composePath = path.join(outputDir, 'LoginHero.compose.tsx');
    await fs.writeFile(composePath, 'export default function LoginHero() { return null; }\n');

    await assert.rejects(
      () => runCompose(composePath, {}, { renderModule: fakeRenderModule() }),
      /Missing metadata file for slug "LoginHero"/,
    );

    await fs.writeJson(path.join(outputDir, 'LoginHero.metadata.json'), {
      slug: 'LoginHero',
      version: 1,
      captureSize: { width: 1440, height: 900 },
      timeline: [],
      targets: {},
    });

    await assert.rejects(
      () => runCompose(composePath, {}, { renderModule: fakeRenderModule() }),
      /Missing workflow capture for slug "LoginHero"/,
    );

    await assert.rejects(
      () => runCompose(composePath, { slug: 'unknown' }, { renderModule: fakeRenderModule() }),
      /Missing metadata file for slug "unknown"/,
    );
  } finally {
    await fs.remove(outputDir);
  }
});

test('compose command resolves defaults and calls renderer', async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compose-command-'));

  try {
    const composePath = path.join(outputDir, 'LoginHero.compose.tsx');
    const capturePath = path.join(outputDir, 'workflow-capture-LoginHero.mp4');
    await fs.writeFile(composePath, 'export default function LoginHero() { return null; }\n');
    await fs.writeJson(path.join(outputDir, 'LoginHero.metadata.json'), {
      slug: 'LoginHero',
      version: 1,
      captureSize: { width: 1440, height: 900 },
      timeline: [],
      targets: {},
    });
    await fs.writeFile(capturePath, '');

    let call = null;
    const result = await runCompose(
      composePath,
      { gif: true },
      {
        renderModule: {
          render(file, options) {
            call = { file, options, env: { ...process.env } };
            return {
              pack: {
                mp4: `${options.out}.mp4`,
                webm: `${options.out}.webm`,
                poster: `${options.out}.webp`,
                gif: `${options.out}.gif`,
              },
              durationMs: 1000,
            };
          },
        },
      },
    );

    assert.equal(call.file, composePath);
    assert.equal(call.options.slug, 'LoginHero');
    assert.deepEqual(call.options.size, { width: 1440, height: 900 });
    assert.deepEqual(call.options.formats, ['mp4', 'webm', 'poster', 'gif']);
    assert.equal(call.env.RESHOT_COMPOSE_METADATA_PATH, path.join(outputDir, 'LoginHero.metadata.json'));
    assert.equal(call.env.RESHOT_COMPOSE_CAPTURE_PATH, capturePath);
    assert.equal(result.pack.mp4, path.join(outputDir, 'LoginHero.composed.mp4'));
  } finally {
    await fs.remove(outputDir);
  }
});

test('compose command parses args and declared capture paths', () => {
  assert.equal(deriveSlug('/tmp/LoginHero.compose.tsx'), 'LoginHero');
  assert.deepEqual(parseSize('1440x900'), { width: 1440, height: 900 });
  assert.deepEqual(parseFormats('mp4, poster', true), ['mp4', 'poster', 'gif']);
  assert.throws(() => parseSize('wide'), /Invalid --size/);
  assert.throws(() => parseFormats('mov'), /Unknown compose format/);
  assert.equal(
    resolveCapturePath({
      metadata: { capturePath: './captures/custom.mp4' },
      compositionDir: '/tmp/compositions',
      slug: 'LoginHero',
    }),
    path.join('/tmp/compositions', 'captures/custom.mp4'),
  );
});

test('compose push uploads source, metadata, and rendered pack as multipart', async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compose-push-'));
  const server = await startUploadServer();
  const previousApiKey = process.env.RESHOT_API_KEY;
  const previousProjectId = process.env.RESHOT_PROJECT_ID;

  try {
    delete process.env.RESHOT_API_KEY;
    delete process.env.RESHOT_PROJECT_ID;

    const composePath = path.join(outputDir, 'LoginHero.compose.tsx');
    const metadataPath = path.join(outputDir, 'LoginHero.metadata.json');
    const capturePath = path.join(outputDir, 'workflow-capture-LoginHero.mp4');
    const outBase = path.join(outputDir, 'custom-pack', 'LoginHero.rendered');
    await fs.ensureDir(path.dirname(outBase));
    await fs.writeFile(composePath, 'export default function LoginHero() { return <div />; }\n');
    await fs.writeJson(metadataPath, {
      slug: 'LoginHero',
      version: 1,
      captureSize: { width: 1440, height: 900 },
      timeline: [],
      targets: {},
    });
    await fs.writeFile(capturePath, 'capture');
    await fs.writeFile(`${outBase}.mp4`, 'mp4');
    await fs.writeFile(`${outBase}.webm`, 'webm');
    await fs.writeFile(`${outBase}.webp`, 'poster');
    await fs.writeFile(`${outBase}.gif`, 'gif');

    const result = await runComposePush(
      composePath,
      { skipRender: true, name: 'Login Hero', project: 'proj_test', out: outBase, autoApprove: true },
      {
        apiBaseUrl: `${server.url}/api`,
        settings: { apiKey: 'rk_test_local' },
      },
    );

    const upload = server.requests[0];
    assert.equal(upload.method, 'POST');
    assert.equal(upload.url, '/api/projects/proj_test/compositions');
    assert.equal(upload.headers.authorization, 'Bearer rk_test_local');
    assert.match(upload.headers['content-type'], /^multipart\/form-data; boundary=/);
    assert.match(upload.body, /name="name"/);
    assert.match(upload.body, /Login Hero/);
    assert.match(upload.body, /name="slug"/);
    assert.match(upload.body, /LoginHero/);
    assert.match(upload.body, /name="source_tsx"/);
    assert.match(upload.body, /export default function LoginHero/);
    assert.match(upload.body, /name="metadata_json"/);
    assert.match(upload.body, /"captureSize"/);
    assert.match(upload.body, /name="auto_approve"/);
    assert.match(upload.body, /true/);
    assert.match(upload.body, /name="rendered_mp4"; filename="LoginHero\.rendered\.mp4"/);
    assert.match(upload.body, /name="rendered_webm"; filename="LoginHero\.rendered\.webm"/);
    assert.match(upload.body, /name="rendered_poster"; filename="LoginHero\.rendered\.webp"/);
    assert.match(upload.body, /name="rendered_gif"; filename="LoginHero\.rendered\.gif"/);
    assert.equal(
      result.dashboardUrl,
      `${server.url}/app/projects/proj_test/compositions/comp_123`,
    );
    assert.equal(
      result.response.publicUrls.live.mp4,
      'https://reshot.dev/public/c/acme-docs/LoginHero/latest.mp4',
    );

    server.nextHeaders = {
      'x-reshot-attribution-warning': 'legacy-key-no-user-attribution',
    };
    const warningResult = await runComposePush(
      composePath,
      { skipRender: true, name: 'Login Hero', project: 'proj_test', out: outBase },
      {
        apiBaseUrl: `${server.url}/api`,
        settings: { apiKey: 'rk_test_local' },
      },
    );
    assert.equal(
      warningResult.response.attributionWarning,
      'legacy-key-no-user-attribution',
    );
  } finally {
    restoreEnv('RESHOT_API_KEY', previousApiKey);
    restoreEnv('RESHOT_PROJECT_ID', previousProjectId);
    await server.close();
    await fs.remove(outputDir);
  }
});

function startFixtureServer() {
  const html = `<!doctype html>
    <html>
      <body>
        <button id="next">Show target</button>
        <input id="email" value="demo@example.com" style="display:block;margin:40px;width:240px;height:36px" />
      </body>
    </html>`;

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function startUploadServer() {
  const requests = [];
  const state = { nextHeaders: null };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      res.writeHead(200, {
        'content-type': 'application/json',
        ...(state.nextHeaders || {}),
      });
      state.nextHeaders = null;
      res.end(JSON.stringify({
        success: true,
        data: {
          id: 'comp_123',
          publicUrls: {
            embed: 'https://reshot.dev/public/c/acme-docs/LoginHero',
            live: {
              mp4: 'https://reshot.dev/public/c/acme-docs/LoginHero/latest.mp4',
              webm: 'https://reshot.dev/public/c/acme-docs/LoginHero/latest.webm',
              poster: 'https://reshot.dev/public/c/acme-docs/LoginHero/poster.webp',
            },
            pinned: {
              mp4: 'https://reshot.dev/public/c/acme-docs/LoginHero/v/render_1.mp4',
              webm: 'https://reshot.dev/public/c/acme-docs/LoginHero/v/render_1.webm',
              poster: 'https://reshot.dev/public/c/acme-docs/LoginHero/v/render_1.webp',
            },
          },
        },
      }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        set nextHeaders(headers) {
          state.nextHeaders = headers;
        },
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function resolveChromiumExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function fakeRenderModule() {
  return {
    render() {
      throw new Error('render should not be called');
    },
  };
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
