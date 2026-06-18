"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/render/render.ts
var render_exports = {};
__export(render_exports, {
  ChromiumNotFoundError: () => ChromiumNotFoundError,
  DEFAULT_DEVICE_SCALE_FACTOR: () => DEFAULT_DEVICE_SCALE_FACTOR,
  DEFAULT_FRAME_RATE: () => DEFAULT_FRAME_RATE,
  captureFrameBuffers: () => captureFrameBuffers,
  compileCompositionFile: () => compileCompositionFile,
  concatMp4Segments: () => concatMp4Segments,
  frameCountFor: () => frameCountFor,
  recordHtml: () => recordHtml,
  render: () => render,
  resolveChromiumExecutable: () => resolveChromiumExecutable
});
module.exports = __toCommonJS(render_exports);
var import_node_crypto = require("crypto");
var import_promises3 = require("fs/promises");
var import_node_os2 = require("os");
var import_node_path3 = require("path");
var import_node_url2 = require("url");
var esbuild = __toESM(require("esbuild"), 1);

// src/render/playwright-driver.ts
var import_node_fs = require("fs");
var import_promises = require("fs/promises");
var import_node_child_process2 = require("child_process");
var import_node_os = require("os");
var import_node_path = require("path");
var import_node_url = require("url");
var import_playwright_core = require("playwright-core");

// src/render/ffmpeg-transcode.ts
var import_node_child_process = require("child_process");
var import_node_util = require("util");
var execFileAsync = (0, import_node_util.promisify)(import_node_child_process.execFile);
async function transcodeGif(input, output) {
  await runFfmpeg([
    "-y",
    "-i",
    input,
    "-vf",
    "fps=12,scale=640:-1:flags=lanczos",
    output
  ]);
  return output;
}
async function runFfmpeg(args) {
  try {
    await execFileAsync("ffmpeg", args, { maxBuffer: 1024 * 1024 * 16 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`ffmpeg failed: ${message}`);
  }
}

// src/render/playwright-driver.ts
var DEFAULT_FRAME_RATE = 60;
var DEFAULT_DEVICE_SCALE_FACTOR = 2;
var CHROMIUM_NOT_FOUND_MESSAGE = `\u2717 Chromium browser not found. Required for rendering compositions.

  Option 1 (recommended): npx playwright install chromium
  Option 2: set CHROME_PATH to your system Chrome (~200 MB savings)

Run one of the above and try again.`;
var SEEK_CLOCK_SCRIPT = `(() => {
  let vt = 0;
  const realRAF = window.requestAnimationFrame.bind(window);
  let queue = new Map();
  let nextId = 1;
  window.requestAnimationFrame = (cb) => { const id = nextId++; queue.set(id, cb); return id; };
  window.cancelAnimationFrame = (id) => { queue.delete(id); };
  performance.now = () => vt;
  Date.now = () => vt;
  window.__composeSeek = (tMs) => {
    vt = tMs;
    const pending = queue; queue = new Map();
    for (const cb of pending.values()) { try { cb(tMs); } catch (e) {} }
  };
  // Real-rAF paint flush (double-rAF) so a screenshot captures the post-seek frame.
  window.__composeFlush = () => new Promise((resolve) => realRAF(() => realRAF(() => resolve())));
})();`;
var ChromiumNotFoundError = class extends Error {
  constructor() {
    super(CHROMIUM_NOT_FOUND_MESSAGE);
    this.name = "ChromiumNotFoundError";
  }
};
function resolveChromiumExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    safePlaywrightExecutablePath()
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate && (0, import_node_fs.existsSync)(candidate)) return candidate;
  }
  return void 0;
}
function frameCountFor(durationMs, fps) {
  return Math.max(1, Math.ceil(durationMs / 1e3 * fps));
}
async function stepFrames(page, durationMs, fps, onFrame) {
  const frames = frameCountFor(durationMs, fps);
  for (let index = 0; index < frames; index += 1) {
    const tMs = index / fps * 1e3;
    await seekVideos(page, tMs / 1e3);
    await seekDocumentAnimations(page, tMs);
    await page.evaluate((t) => window.__composeSeek?.(t), tMs);
    await page.evaluate(() => window.__composeFlush?.());
    const frame = await page.screenshot({ type: "png" });
    await onFrame(frame, index);
  }
  return frames;
}
async function recordHtml(options) {
  const {
    html,
    durationMs,
    size,
    formats,
    outBase,
    fps = DEFAULT_FRAME_RATE,
    deviceScaleFactor = DEFAULT_DEVICE_SCALE_FACTOR
  } = options;
  const executablePath = resolveChromiumExecutable();
  if (!executablePath) throw new ChromiumNotFoundError();
  await (0, import_promises.mkdir)((0, import_node_path.dirname)(outBase), { recursive: true });
  const tempDir = await (0, import_promises.mkdtemp)((0, import_node_path.join)((0, import_node_os.tmpdir)(), "compose-record-"));
  const wantMp4 = formats.includes("mp4");
  const wantWebm = formats.includes("webm");
  const wantPoster = formats.includes("poster");
  const wantGif = formats.includes("gif");
  const mp4Path = wantMp4 ? `${outBase}.mp4` : wantGif ? (0, import_node_path.join)(tempDir, "gif-source.mp4") : void 0;
  const webmPath = wantWebm ? `${outBase}.webm` : void 0;
  const encoders = [];
  if (mp4Path) encoders.push(spawnEncoder(mp4EncodeArgs(fps, mp4Path)));
  if (webmPath) encoders.push(spawnEncoder(webmEncodeArgs(fps, webmPath)));
  const browser = await import_playwright_core.chromium.launch({ headless: true, executablePath });
  let posterFrame;
  let totalFrames = 0;
  try {
    const context = await browser.newContext({ viewport: size, deviceScaleFactor });
    const page = await context.newPage();
    await page.addInitScript(SEEK_CLOCK_SCRIPT);
    const htmlPath = (0, import_node_path.join)(tempDir, "index.html");
    await (0, import_promises.writeFile)(htmlPath, html, "utf8");
    await page.goto((0, import_node_url.pathToFileURL)(htmlPath).href, { waitUntil: "networkidle" });
    await waitForVideos(page);
    await playVideos(page);
    const frames = frameCountFor(durationMs, fps);
    const posterIndex = Math.floor(frames / 2);
    totalFrames = await stepFrames(page, durationMs, fps, async (frame, index) => {
      if (index === posterIndex) posterFrame = frame;
      await Promise.all(encoders.map((encoder) => writeFrame(encoder, frame)));
    });
    await context.close();
  } catch (error) {
    for (const encoder of encoders) encoder.proc.kill();
    await (0, import_promises.rm)(tempDir, { recursive: true, force: true });
    throw error;
  } finally {
    await browser.close();
  }
  try {
    for (const encoder of encoders) encoder.stdin.end();
    await Promise.all(encoders.map((encoder) => encoder.done));
    const pack = {};
    if (wantMp4 && mp4Path) pack.mp4 = mp4Path;
    if (wantWebm && webmPath) pack.webm = webmPath;
    if (wantPoster) pack.poster = await encodePoster(posterFrame ?? await firstFrameFallback(), `${outBase}.webp`);
    if (wantGif && mp4Path) pack.gif = await transcodeGif(mp4Path, `${outBase}.gif`);
    return pack;
  } finally {
    await (0, import_promises.rm)(tempDir, { recursive: true, force: true });
  }
  async function firstFrameFallback() {
    throw new Error(`Poster requested but no frame was captured (frames=${totalFrames}).`);
  }
}
function spawnEncoder(args) {
  const proc = (0, import_node_child_process2.spawn)("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
  const stdin = proc.stdin;
  if (!stdin) throw new Error("ffmpeg stdin pipe unavailable.");
  let stderr = "";
  proc.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
    if (stderr.length > 8192) stderr = stderr.slice(-8192);
  });
  const done = new Promise((resolve2, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve2();
      else reject(new Error(`ffmpeg encoder exited with code ${code}:
${stderr}`));
    });
  });
  stdin.on("error", () => {
  });
  return { proc, stdin, done };
}
function writeFrame(encoder, frame) {
  return new Promise((resolve2, reject) => {
    encoder.stdin.write(frame, (error) => error ? reject(error) : resolve2());
  });
}
function mp4EncodeArgs(fps, output) {
  return [
    "-y",
    "-f",
    "image2pipe",
    "-framerate",
    String(fps),
    "-i",
    "-",
    "-c:v",
    "libx264",
    "-crf",
    "18",
    "-preset",
    "medium",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    output
  ];
}
function webmEncodeArgs(fps, output) {
  return [
    "-y",
    "-f",
    "image2pipe",
    "-framerate",
    String(fps),
    "-i",
    "-",
    "-c:v",
    "libvpx-vp9",
    "-b:v",
    "0",
    "-crf",
    "32",
    "-pix_fmt",
    "yuv420p",
    output
  ];
}
function encodePoster(frame, output) {
  return new Promise((resolve2, reject) => {
    const proc = (0, import_node_child_process2.spawn)(
      "ffmpeg",
      ["-y", "-f", "image2pipe", "-i", "-", "-frames:v", "1", "-c:v", "libwebp", "-quality", "85", output],
      { stdio: ["pipe", "ignore", "pipe"] }
    );
    let stderr = "";
    proc.stderr?.on("data", (chunk) => stderr += String(chunk));
    proc.on("error", reject);
    proc.on("close", (code) => code === 0 ? resolve2(output) : reject(new Error(`poster ffmpeg exited ${code}:
${stderr}`)));
    proc.stdin.on("error", () => {
    });
    proc.stdin.end(frame);
  });
}
async function captureFrameBuffers(options) {
  const {
    html,
    durationMs,
    size,
    fps = DEFAULT_FRAME_RATE,
    deviceScaleFactor = DEFAULT_DEVICE_SCALE_FACTOR
  } = options;
  const executablePath = resolveChromiumExecutable();
  if (!executablePath) throw new ChromiumNotFoundError();
  const tempDir = await (0, import_promises.mkdtemp)((0, import_node_path.join)((0, import_node_os.tmpdir)(), "compose-frames-"));
  const browser = await import_playwright_core.chromium.launch({ headless: true, executablePath });
  const frames = [];
  try {
    const context = await browser.newContext({ viewport: size, deviceScaleFactor });
    const page = await context.newPage();
    await page.addInitScript(SEEK_CLOCK_SCRIPT);
    const htmlPath = (0, import_node_path.join)(tempDir, "index.html");
    await (0, import_promises.writeFile)(htmlPath, html, "utf8");
    await page.goto((0, import_node_url.pathToFileURL)(htmlPath).href, { waitUntil: "networkidle" });
    await waitForVideos(page);
    await playVideos(page);
    await stepFrames(page, durationMs, fps, async (frame) => {
      frames.push(frame);
    });
    await context.close();
    return frames;
  } finally {
    await browser.close();
    await (0, import_promises.rm)(tempDir, { recursive: true, force: true });
  }
}
async function playVideos(page) {
  const failures = await page.evaluate(async () => {
    const videos = Array.from(document.querySelectorAll("video"));
    const errors = [];
    await Promise.all(
      videos.map(async (video) => {
        if (!video.currentSrc) return;
        video.currentTime = 0;
        try {
          await video.play();
        } catch (error) {
          errors.push({
            src: video.currentSrc,
            message: error instanceof Error ? error.message : String(error)
          });
        }
      })
    );
    return errors;
  });
  if (failures.length > 0) {
    const summary = failures.map((f) => `  - ${f.src}: ${f.message}`).join("\n");
    throw new Error(`Composition video(s) failed to play; render would be black:
${summary}`);
  }
}
async function seekVideos(page, currentTimeSeconds) {
  await page.evaluate(async (currentTime) => {
    const videos = Array.from(document.querySelectorAll("video"));
    await Promise.all(
      videos.map(
        (video) => new Promise((resolve2) => {
          if (!video.currentSrc) {
            resolve2();
            return;
          }
          const done = () => resolve2();
          const timeout = window.setTimeout(done, 250);
          video.addEventListener(
            "seeked",
            () => {
              window.clearTimeout(timeout);
              done();
            },
            { once: true }
          );
          video.currentTime = currentTime;
        })
      )
    );
  }, currentTimeSeconds);
}
async function seekDocumentAnimations(page, currentTimeMs) {
  await page.evaluate((currentTime) => {
    for (const animation of document.documentElement.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = currentTime;
    }
  }, currentTimeMs);
}
async function waitForVideos(page) {
  await page.waitForFunction(
    () => {
      const videos = Array.from(document.querySelectorAll("video"));
      return videos.every((video) => !video.currentSrc || video.readyState >= 2);
    },
    void 0,
    { timeout: 8e3 }
  );
}
function safePlaywrightExecutablePath() {
  try {
    return import_playwright_core.chromium.executablePath();
  } catch {
    return void 0;
  }
}

// src/render/concat.ts
var import_promises2 = require("fs/promises");
var import_node_path2 = require("path");
var import_node_child_process3 = require("child_process");
var import_node_util2 = require("util");
var execFileAsync2 = (0, import_node_util2.promisify)(import_node_child_process3.execFile);
async function concatMp4Segments(inputs, output) {
  await (0, import_promises2.mkdir)((0, import_node_path2.dirname)(output), { recursive: true });
  const listPath = `${output}.concat.txt`;
  const list = inputs.map((input) => `file '${input.replaceAll("'", "'\\''")}'`).join("\n");
  await (0, import_promises2.writeFile)(listPath, list, "utf8");
  try {
    await execFileAsync2("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-r",
      "30",
      output
    ]);
    return output;
  } finally {
    await (0, import_promises2.rm)(listPath, { force: true });
  }
}

// src/render/render.ts
var import_meta = {};
var DEFAULT_SIZE = { width: 1920, height: 1080 };
var DEFAULT_FORMATS = ["mp4", "webm", "poster"];
var DEFAULT_DURATION_MS = 3e3;
var MAX_DURATION_MS = 6e4;
async function compileCompositionFile(compositionPath) {
  const absolutePath = (0, import_node_path3.resolve)(compositionPath);
  const node = await loadComposition(absolutePath);
  return addCompositionBaseHref(await compileRuntimeToHtml(node), absolutePath);
}
async function render(compositionPath, options = {}) {
  const absolutePath = (0, import_node_path3.resolve)(compositionPath);
  const slug = options.slug ?? (0, import_node_path3.basename)(absolutePath, (0, import_node_path3.extname)(absolutePath));
  const outBase = (0, import_node_path3.resolve)(options.out ?? (0, import_node_path3.join)(process.cwd(), slug));
  const formats = options.formats ?? DEFAULT_FORMATS;
  const html = await compileCompositionFile(absolutePath);
  let durationMs;
  if (options.durationMs !== void 0) {
    durationMs = options.durationMs;
  } else {
    const inferred = inferDurationMs(html) ?? DEFAULT_DURATION_MS;
    if (inferred > MAX_DURATION_MS) {
      throw new Error(
        `Inferred composition duration ${inferred}ms exceeds ${MAX_DURATION_MS}ms cap. Fix data-duration-ms in the composition or pass --duration to render this on purpose.`
      );
    }
    durationMs = inferred;
  }
  await (0, import_promises3.mkdir)((0, import_node_path3.dirname)(outBase), { recursive: true });
  const pack = await recordHtml({
    html,
    durationMs,
    size: options.size ?? DEFAULT_SIZE,
    formats,
    outBase,
    fps: options.fps,
    deviceScaleFactor: options.deviceScaleFactor
  });
  return { pack, durationMs };
}
async function compileRuntimeToHtml(node) {
  const runtime = await import((0, import_node_url2.pathToFileURL)(resolveRuntimeEntry("index.mjs")).href);
  return runtime.compileToHtml(node);
}
async function loadComposition(compositionPath) {
  const source = await (0, import_promises3.readFile)(compositionPath, "utf8");
  const transformed = await esbuild.transform(source, {
    loader: "tsx",
    jsx: "automatic",
    jsxImportSource: "@reshot/compose",
    format: "esm",
    sourcemap: "inline",
    sourcefile: compositionPath
  });
  const hash = (0, import_node_crypto.createHash)("sha256").update(compositionPath).update(source).digest("hex").slice(0, 16);
  const tempPath = (0, import_node_path3.join)((0, import_node_os2.tmpdir)(), `compose-${hash}.mjs`);
  const code = rewriteComposeImports(transformed.code);
  try {
    await (0, import_promises3.writeFile)(tempPath, code, "utf8");
    const moduleUrl = `${(0, import_node_url2.pathToFileURL)(tempPath).href}?t=${Date.now()}`;
    const mod = await import(moduleUrl);
    const exported = mod.default;
    const node = typeof exported === "function" ? exported() : exported;
    if (!node) {
      throw new Error("Composition file must default-export a Composition function.");
    }
    return node;
  } finally {
    await (0, import_promises3.rm)(tempPath, { force: true });
  }
}
function rewriteComposeImports(code) {
  const replacements = {
    "@reshot/compose": (0, import_node_url2.pathToFileURL)(resolveRuntimeEntry("index.mjs")).href,
    "@reshot/compose/jsx-runtime": (0, import_node_url2.pathToFileURL)(
      resolveRuntimeEntry("jsx-runtime.mjs")
    ).href,
    "@reshot/compose/jsx-dev-runtime": (0, import_node_url2.pathToFileURL)(
      resolveRuntimeEntry("jsx-dev-runtime.mjs")
    ).href
  };
  let next = code;
  for (const [specifier, replacement] of Object.entries(replacements)) {
    next = next.replaceAll(`from "${specifier}"`, `from "${replacement}"`);
    next = next.replaceAll(`from '${specifier}'`, `from "${replacement}"`);
    next = next.replaceAll(`import("${specifier}")`, `import("${replacement}")`);
    next = next.replaceAll(`import('${specifier}')`, `import("${replacement}")`);
  }
  return next;
}
function resolveRuntimeEntry(fileName) {
  const currentDir = typeof __dirname === "string" ? __dirname : (0, import_node_path3.dirname)((0, import_node_url2.fileURLToPath)(import_meta.url));
  return (0, import_node_path3.join)(currentDir, fileName);
}
function addCompositionBaseHref(html, compositionPath) {
  const baseHref = (0, import_node_url2.pathToFileURL)(`${(0, import_node_path3.dirname)(compositionPath)}/`).href;
  return html.replace("<head>", `<head><base href="${baseHref}">`);
}
function inferDurationMs(html) {
  const match = html.match(/data-duration-ms="(\d+(?:\.\d+)?)"/);
  if (!match) return void 0;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : void 0;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ChromiumNotFoundError,
  DEFAULT_DEVICE_SCALE_FACTOR,
  DEFAULT_FRAME_RATE,
  captureFrameBuffers,
  compileCompositionFile,
  concatMp4Segments,
  frameCountFor,
  recordHtml,
  render,
  resolveChromiumExecutable
});
//# sourceMappingURL=render.cjs.map