// src/render/render.ts
import { createHash } from "crypto";
import { mkdir as mkdir3, readFile, rm as rm3, writeFile as writeFile3 } from "fs/promises";
import { tmpdir as tmpdir2 } from "os";
import { basename, dirname as dirname3, extname, join as join2, resolve } from "path";
import { fileURLToPath, pathToFileURL as pathToFileURL2 } from "url";
import * as esbuild from "esbuild";

// src/render/playwright-driver.ts
import { existsSync } from "fs";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { pathToFileURL } from "url";
import { chromium } from "playwright-core";

// src/render/ffmpeg-transcode.ts
import { execFile } from "child_process";
import { promisify } from "util";
var execFileAsync = promisify(execFile);
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
    if (candidate && existsSync(candidate)) return candidate;
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
  await mkdir(dirname(outBase), { recursive: true });
  const tempDir = await mkdtemp(join(tmpdir(), "compose-record-"));
  const wantMp4 = formats.includes("mp4");
  const wantWebm = formats.includes("webm");
  const wantPoster = formats.includes("poster");
  const wantGif = formats.includes("gif");
  const mp4Path = wantMp4 ? `${outBase}.mp4` : wantGif ? join(tempDir, "gif-source.mp4") : void 0;
  const webmPath = wantWebm ? `${outBase}.webm` : void 0;
  const encoders = [];
  if (mp4Path) encoders.push(spawnEncoder(mp4EncodeArgs(fps, mp4Path)));
  if (webmPath) encoders.push(spawnEncoder(webmEncodeArgs(fps, webmPath)));
  const browser = await chromium.launch({ headless: true, executablePath });
  let posterFrame;
  let totalFrames = 0;
  try {
    const context = await browser.newContext({ viewport: size, deviceScaleFactor });
    const page = await context.newPage();
    await page.addInitScript(SEEK_CLOCK_SCRIPT);
    const htmlPath = join(tempDir, "index.html");
    await writeFile(htmlPath, html, "utf8");
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
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
    await rm(tempDir, { recursive: true, force: true });
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
    await rm(tempDir, { recursive: true, force: true });
  }
  async function firstFrameFallback() {
    throw new Error(`Poster requested but no frame was captured (frames=${totalFrames}).`);
  }
}
function spawnEncoder(args) {
  const proc = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
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
    const proc = spawn(
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
  const tempDir = await mkdtemp(join(tmpdir(), "compose-frames-"));
  const browser = await chromium.launch({ headless: true, executablePath });
  const frames = [];
  try {
    const context = await browser.newContext({ viewport: size, deviceScaleFactor });
    const page = await context.newPage();
    await page.addInitScript(SEEK_CLOCK_SCRIPT);
    const htmlPath = join(tempDir, "index.html");
    await writeFile(htmlPath, html, "utf8");
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
    await waitForVideos(page);
    await playVideos(page);
    await stepFrames(page, durationMs, fps, async (frame) => {
      frames.push(frame);
    });
    await context.close();
    return frames;
  } finally {
    await browser.close();
    await rm(tempDir, { recursive: true, force: true });
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
    return chromium.executablePath();
  } catch {
    return void 0;
  }
}

// src/render/concat.ts
import { mkdir as mkdir2, rm as rm2, writeFile as writeFile2 } from "fs/promises";
import { dirname as dirname2 } from "path";
import { execFile as execFile2 } from "child_process";
import { promisify as promisify2 } from "util";
var execFileAsync2 = promisify2(execFile2);
async function concatMp4Segments(inputs, output) {
  await mkdir2(dirname2(output), { recursive: true });
  const listPath = `${output}.concat.txt`;
  const list = inputs.map((input) => `file '${input.replaceAll("'", "'\\''")}'`).join("\n");
  await writeFile2(listPath, list, "utf8");
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
    await rm2(listPath, { force: true });
  }
}

// src/render/render.ts
var DEFAULT_SIZE = { width: 1920, height: 1080 };
var DEFAULT_FORMATS = ["mp4", "webm", "poster"];
var DEFAULT_DURATION_MS = 3e3;
var MAX_DURATION_MS = 6e4;
async function compileCompositionFile(compositionPath) {
  const absolutePath = resolve(compositionPath);
  const node = await loadComposition(absolutePath);
  return addCompositionBaseHref(await compileRuntimeToHtml(node), absolutePath);
}
async function render(compositionPath, options = {}) {
  const absolutePath = resolve(compositionPath);
  const slug = options.slug ?? basename(absolutePath, extname(absolutePath));
  const outBase = resolve(options.out ?? join2(process.cwd(), slug));
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
  await mkdir3(dirname3(outBase), { recursive: true });
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
  const runtime = await import(pathToFileURL2(resolveRuntimeEntry("index.mjs")).href);
  return runtime.compileToHtml(node);
}
async function loadComposition(compositionPath) {
  const source = await readFile(compositionPath, "utf8");
  const transformed = await esbuild.transform(source, {
    loader: "tsx",
    jsx: "automatic",
    jsxImportSource: "@reshot/compose",
    format: "esm",
    sourcemap: "inline",
    sourcefile: compositionPath
  });
  const hash = createHash("sha256").update(compositionPath).update(source).digest("hex").slice(0, 16);
  const tempPath = join2(tmpdir2(), `compose-${hash}.mjs`);
  const code = rewriteComposeImports(transformed.code);
  try {
    await writeFile3(tempPath, code, "utf8");
    const moduleUrl = `${pathToFileURL2(tempPath).href}?t=${Date.now()}`;
    const mod = await import(moduleUrl);
    const exported = mod.default;
    const node = typeof exported === "function" ? exported() : exported;
    if (!node) {
      throw new Error("Composition file must default-export a Composition function.");
    }
    return node;
  } finally {
    await rm3(tempPath, { force: true });
  }
}
function rewriteComposeImports(code) {
  const replacements = {
    "@reshot/compose": pathToFileURL2(resolveRuntimeEntry("index.mjs")).href,
    "@reshot/compose/jsx-runtime": pathToFileURL2(
      resolveRuntimeEntry("jsx-runtime.mjs")
    ).href,
    "@reshot/compose/jsx-dev-runtime": pathToFileURL2(
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
  const currentDir = typeof __dirname === "string" ? __dirname : dirname3(fileURLToPath(import.meta.url));
  return join2(currentDir, fileName);
}
function addCompositionBaseHref(html, compositionPath) {
  const baseHref = pathToFileURL2(`${dirname3(compositionPath)}/`).href;
  return html.replace("<head>", `<head><base href="${baseHref}">`);
}
function inferDurationMs(html) {
  const match = html.match(/data-duration-ms="(\d+(?:\.\d+)?)"/);
  if (!match) return void 0;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : void 0;
}
export {
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
};
//# sourceMappingURL=render.mjs.map