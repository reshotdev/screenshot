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

// src/verify/index.ts
var verify_exports = {};
__export(verify_exports, {
  CALIBRATION_PROVENANCE: () => CALIBRATION_PROVENANCE,
  PIXELMATCH_THRESHOLD: () => PIXELMATCH_THRESHOLD,
  PIXEL_DIFF_MAX: () => PIXEL_DIFF_MAX,
  SSIM_MIN: () => SSIM_MIN,
  assertDeterministic: () => assertDeterministic,
  checkDeterminism: () => checkDeterminism,
  computeSsim: () => computeSsim,
  cropPng: () => cropPng,
  decodePng: () => decodePng,
  diffFiles: () => diffFiles,
  diffImages: () => diffImages,
  laplacianVariance: () => laplacianVariance,
  loadPng: () => loadPng,
  renderProofHtml: () => renderProofHtml,
  verdict: () => verdict,
  writeProof: () => writeProof
});
module.exports = __toCommonJS(verify_exports);

// src/verify/diff.ts
var import_promises = require("fs/promises");
var import_node_path = require("path");
var import_pixelmatch = __toESM(require("pixelmatch"), 1);
var import_pngjs = require("pngjs");
var import_ssim = require("ssim.js");
var PIXELMATCH_THRESHOLD = 0.1;
function toRgba(png) {
  return {
    data: new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length),
    width: png.width,
    height: png.height
  };
}
async function loadPng(path) {
  return toRgba(import_pngjs.PNG.sync.read(await (0, import_promises.readFile)(path)));
}
function decodePng(buffer) {
  return toRgba(import_pngjs.PNG.sync.read(buffer));
}
function assertSameSize(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `Image dimensions differ: ${a.width}x${a.height} vs ${b.width}x${b.height}. The calibrated diff requires same-settings captures; resize upstream before diffing.`
    );
  }
}
function computeSsim(a, b) {
  const result = (0, import_ssim.ssim)(
    { data: a.data, width: a.width, height: a.height },
    { data: b.data, width: b.width, height: b.height },
    { ssim: "fast" }
  );
  return roundTo(result.mssim, 4);
}
function diffImages(a, b) {
  assertSameSize(a, b);
  const { width, height } = a;
  const heatmap = new import_pngjs.PNG({ width, height });
  const diffPixels = (0, import_pixelmatch.default)(a.data, b.data, heatmap.data, width, height, {
    threshold: PIXELMATCH_THRESHOLD,
    includeAA: false,
    alpha: 0.3,
    diffColor: [255, 0, 0]
  });
  const pixelDiffPct = roundTo(diffPixels / (width * height) * 100, 4);
  return {
    pixelDiffPct,
    ssim: computeSsim(a, b),
    width,
    height,
    diffPixels,
    heatmapPng: import_pngjs.PNG.sync.write(heatmap)
  };
}
async function diffFiles(refPath, recPath, opts = {}) {
  const [ref, rec] = await Promise.all([loadPng(refPath), loadPng(recPath)]);
  const result = diffImages(ref, rec);
  if (opts.heatmapPath) {
    await (0, import_promises.mkdir)((0, import_node_path.dirname)(opts.heatmapPath), { recursive: true });
    await (0, import_promises.writeFile)(opts.heatmapPath, result.heatmapPng);
  }
  return result;
}
function roundTo(value, places) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// src/verify/thresholds.ts
var CALIBRATION_PROVENANCE = "single-rater (jake), provisional \u2014 70 pairs, honesty 3/3, kappa n/a (n=1)";
var PIXEL_DIFF_MAX = 1.82335;
var SSIM_MIN = 0.9905;
function verdict(metrics) {
  const pixelOk = metrics.pixelDiffPct <= PIXEL_DIFF_MAX;
  const ssimOk = metrics.ssim >= SSIM_MIN;
  const reason = pixelOk && ssimOk ? "both" : pixelOk ? "pixelDiff" : ssimOk ? "ssim" : "neither";
  return {
    pass: pixelOk || ssimOk,
    reason,
    primaryMetric: "pixelDiff",
    pixelDiffPct: metrics.pixelDiffPct,
    ssim: metrics.ssim,
    thresholds: { pixelDiffMax: PIXEL_DIFF_MAX, ssimMin: SSIM_MIN },
    provenance: CALIBRATION_PROVENANCE
  };
}

// src/verify/determinism.ts
var import_node_crypto = require("crypto");
function sha256(buffers) {
  const hash = (0, import_node_crypto.createHash)("sha256");
  for (const buffer of buffers) hash.update(buffer);
  return hash.digest("hex");
}
async function checkDeterminism(produce, runs = 2) {
  if (runs < 2) throw new Error("Determinism check needs at least 2 runs.");
  const allRuns = [];
  for (let i = 0; i < runs; i += 1) {
    allRuns.push(await produce());
  }
  const frameCount = allRuns[0]?.length ?? 0;
  for (const run of allRuns) {
    if (run.length !== frameCount) {
      throw new Error(
        `Non-determinism: runs produced different frame counts (${run.length} vs ${frameCount}).`
      );
    }
  }
  const runHashes = allRuns.map(sha256);
  const byteIdentical = runHashes.every((h) => h === runHashes[0]);
  let maxFramePixelDiff = 0;
  if (!byteIdentical) {
    const base = allRuns[0];
    for (let r = 1; r < allRuns.length; r += 1) {
      const other = allRuns[r];
      for (let f = 0; f < frameCount; f += 1) {
        const a = base[f];
        const b = other[f];
        if (a.equals(b)) continue;
        const { pixelDiffPct } = diffImages(decodePng(a), decodePng(b));
        if (pixelDiffPct > maxFramePixelDiff) maxFramePixelDiff = pixelDiffPct;
      }
    }
  }
  return { runs, frameCount, byteIdentical, maxFramePixelDiff, runHashes };
}
async function assertDeterministic(produce, runs = 2) {
  const result = await checkDeterminism(produce, runs);
  if (!result.byteIdentical) {
    throw new Error(
      `Render is non-deterministic: maxFramePixelDiff=${result.maxFramePixelDiff}% over ${result.frameCount} frames (hashes: ${result.runHashes.join(", ")}).`
    );
  }
  return result;
}

// src/verify/proof.ts
var import_promises2 = require("fs/promises");
var import_node_path2 = require("path");
var STYLE = `
:root{color-scheme:light dark}
body{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:24px;background:#0b0d10;color:#e6e9ef}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 10px;color:#9aa4b2}
.sub{color:#9aa4b2;margin:0 0 16px}
.verdict{display:inline-block;padding:6px 14px;border-radius:8px;font-weight:600;letter-spacing:.02em}
.pass{background:#0f3d23;color:#5ee08f;border:1px solid #1d6b3f}
.fail{background:#3d0f14;color:#ff7a85;border:1px solid #6b1d27}
table{border-collapse:collapse;width:100%;margin:8px 0}
td,th{border:1px solid #1f2630;padding:8px 10px;text-align:left;vertical-align:top}
th{color:#9aa4b2;font-weight:600}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:10px 0}
.cell{border:1px solid #1f2630;border-radius:8px;padding:8px;background:#11151b}
.cell h3{margin:0 0 6px;font-size:12px;color:#9aa4b2;font-weight:600}
img{max-width:100%;height:auto;display:block;border-radius:4px;background:#000}
.contact{display:flex;flex-wrap:wrap;gap:4px}.contact img{width:120px}
video{max-width:100%;border-radius:8px;background:#000}
.m{font-variant-numeric:tabular-nums}
.ok{color:#5ee08f}.no{color:#ff7a85}
.note{color:#6b7686;font-size:12px;margin-top:24px;border-top:1px solid #1f2630;padding-top:12px}
.fail-box{background:#1a0e10;border:1px solid #6b1d27;border-radius:8px;padding:12px;margin:10px 0}
`;
var escape = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
var dataUri = (buffer, mime = "image/png") => `data:${mime};base64,${buffer.toString("base64")}`;
function pairBlock(pair) {
  const metric = pair.pixelDiffPct === void 0 && pair.ssim === void 0 ? "" : `<p class="m">pixelDiff <b class="${pair.pass === false ? "no" : "ok"}">${pair.pixelDiffPct ?? "\u2014"}%</b> &nbsp; SSIM <b>${pair.ssim ?? "\u2014"}</b>` + (pair.pass === void 0 ? "" : ` &nbsp; ${pair.pass ? '<span class="ok">PASS</span>' : '<span class="no">FAIL</span>'}`) + `</p>`;
  const heatmapCell = pair.heatmap ? `<div class="cell"><h3>diff heatmap</h3><img src="${dataUri(pair.heatmap)}"/></div>` : "";
  return `<h2>${escape(pair.label)}</h2>${metric}<div class="grid">
    <div class="cell"><h3>${escape(pair.aCaption ?? "reconstruction")}</h3><img src="${dataUri(pair.a)}"/></div>
    <div class="cell"><h3>${escape(pair.bCaption ?? "ground truth")}</h3><img src="${dataUri(pair.b)}"/></div>
    ${heatmapCell}
  </div>`;
}
function renderProofHtml(opts) {
  const parts = [];
  parts.push(`<h1>${escape(opts.title)}</h1>`);
  if (opts.subtitle) parts.push(`<p class="sub">${escape(opts.subtitle)}</p>`);
  if (opts.verdict) {
    const v = opts.verdict;
    parts.push(
      `<span class="verdict ${v.pass ? "pass" : "fail"}">${v.pass ? "INDISTINGUISHABLE" : "DISTINGUISHABLE"} \u2014 pixelDiff ${v.pixelDiffPct}% (max ${v.thresholds.pixelDiffMax}%), SSIM ${v.ssim} (min ${v.thresholds.ssimMin}), via ${v.reason}</span>`
    );
  }
  if (opts.failure) {
    const f = opts.failure;
    parts.push(
      `<div class="fail-box"><b>Failure detail.</b> ` + [
        f.frameIndex !== void 0 ? `frame #${f.frameIndex}` : "",
        f.selector ? `selector <code>${escape(f.selector)}</code>` : "",
        f.note ? escape(f.note) : ""
      ].filter(Boolean).join(" \xB7 ") + `</div>`
    );
  }
  if (opts.metrics?.length) {
    parts.push(
      `<h2>metrics</h2><table><tr><th>metric</th><th>value</th></tr>` + opts.metrics.map(
        (m) => `<tr><td>${escape(m.label)}</td><td class="m ${m.pass === void 0 ? "" : m.pass ? "ok" : "no"}">${escape(m.value)}</td></tr>`
      ).join("") + `</table>`
    );
  }
  for (const chart of opts.charts ?? []) parts.push(chart);
  for (const pair of opts.pairs ?? []) parts.push(pairBlock(pair));
  if (opts.video) {
    parts.push(
      `<h2>render</h2><video controls autoplay loop muted src="${dataUri(opts.video.data, opts.video.mime)}"></video>`
    );
  }
  if (opts.frames?.length) {
    parts.push(
      `<h2>frame contact-sheet (${opts.frames.length})</h2><div class="contact">` + opts.frames.map((f) => `<img src="${dataUri(f)}"/>`).join("") + `</div>`
    );
  }
  if (opts.note) parts.push(`<p class="note">${escape(opts.note)}</p>`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(opts.title)}</title><style>${STYLE}</style></head><body>${parts.join("\n")}</body></html>`;
}
async function writeProof(opts) {
  await (0, import_promises2.mkdir)(opts.outDir, { recursive: true });
  const htmlPath = (0, import_node_path2.join)(opts.outDir, "index.html");
  await (0, import_promises2.writeFile)(htmlPath, renderProofHtml(opts), "utf8");
  return htmlPath;
}

// src/verify/sharpness.ts
var import_pngjs2 = require("pngjs");
function decode(buffer) {
  const png = import_pngjs2.PNG.sync.read(buffer);
  return { data: png.data, width: png.width, height: png.height };
}
function lumaAt(data, idx) {
  return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
}
function laplacianVariance(pngBuffer, region) {
  const { data, width, height } = decode(pngBuffer);
  const x0 = Math.max(1, Math.floor(region.x));
  const y0 = Math.max(1, Math.floor(region.y));
  const x1 = Math.min(width - 1, Math.floor(region.x + region.width));
  const y1 = Math.min(height - 1, Math.floor(region.y + region.height));
  if (x1 <= x0 || y1 <= y0) return 0;
  const lap = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const c = (y * width + x) * 4;
      const up = ((y - 1) * width + x) * 4;
      const down = ((y + 1) * width + x) * 4;
      const left = (y * width + (x - 1)) * 4;
      const right = (y * width + (x + 1)) * 4;
      const value = 4 * lumaAt(data, c) - lumaAt(data, up) - lumaAt(data, down) - lumaAt(data, left) - lumaAt(data, right);
      lap.push(value);
    }
  }
  if (lap.length === 0) return 0;
  let mean = 0;
  for (const v of lap) mean += v;
  mean /= lap.length;
  let variance = 0;
  for (const v of lap) variance += (v - mean) * (v - mean);
  variance /= lap.length;
  return variance;
}
function cropPng(pngBuffer, region) {
  const png = import_pngjs2.PNG.sync.read(pngBuffer);
  const x0 = Math.max(0, Math.floor(region.x));
  const y0 = Math.max(0, Math.floor(region.y));
  const w = Math.min(png.width - x0, Math.floor(region.width));
  const h = Math.min(png.height - y0, Math.floor(region.height));
  const out = new import_pngjs2.PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = ((y + y0) * png.width + (x + x0)) * 4;
      const dst = (y * w + x) * 4;
      out.data[dst] = png.data[src];
      out.data[dst + 1] = png.data[src + 1];
      out.data[dst + 2] = png.data[src + 2];
      out.data[dst + 3] = png.data[src + 3];
    }
  }
  return import_pngjs2.PNG.sync.write(out);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CALIBRATION_PROVENANCE,
  PIXELMATCH_THRESHOLD,
  PIXEL_DIFF_MAX,
  SSIM_MIN,
  assertDeterministic,
  checkDeterminism,
  computeSsim,
  cropPng,
  decodePng,
  diffFiles,
  diffImages,
  laplacianVariance,
  loadPng,
  renderProofHtml,
  verdict,
  writeProof
});
//# sourceMappingURL=verify.cjs.map