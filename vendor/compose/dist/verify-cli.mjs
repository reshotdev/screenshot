#!/usr/bin/env node

// src/verify/cli.ts
import { basename, resolve } from "path";

// src/verify/diff.ts
import { readFile, mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { ssim as ssimFn } from "ssim.js";
var PIXELMATCH_THRESHOLD = 0.1;
function toRgba(png) {
  return {
    data: new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length),
    width: png.width,
    height: png.height
  };
}
async function loadPng(path) {
  return toRgba(PNG.sync.read(await readFile(path)));
}
function assertSameSize(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `Image dimensions differ: ${a.width}x${a.height} vs ${b.width}x${b.height}. The calibrated diff requires same-settings captures; resize upstream before diffing.`
    );
  }
}
function computeSsim(a, b) {
  const result = ssimFn(
    { data: a.data, width: a.width, height: a.height },
    { data: b.data, width: b.width, height: b.height },
    { ssim: "fast" }
  );
  return roundTo(result.mssim, 4);
}
function diffImages(a, b) {
  assertSameSize(a, b);
  const { width, height } = a;
  const heatmap = new PNG({ width, height });
  const diffPixels = pixelmatch(a.data, b.data, heatmap.data, width, height, {
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
    heatmapPng: PNG.sync.write(heatmap)
  };
}
async function diffFiles(refPath, recPath, opts = {}) {
  const [ref, rec] = await Promise.all([loadPng(refPath), loadPng(recPath)]);
  const result = diffImages(ref, rec);
  if (opts.heatmapPath) {
    await mkdir(dirname(opts.heatmapPath), { recursive: true });
    await writeFile(opts.heatmapPath, result.heatmapPng);
  }
  return result;
}
function roundTo(value, places) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// src/verify/cli.ts
import { PNG as PNG2 } from "pngjs";

// src/verify/proof.ts
import { mkdir as mkdir2, writeFile as writeFile2 } from "fs/promises";
import { join } from "path";
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
  await mkdir2(opts.outDir, { recursive: true });
  const htmlPath = join(opts.outDir, "index.html");
  await writeFile2(htmlPath, renderProofHtml(opts), "utf8");
  return htmlPath;
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

// src/verify/cli.ts
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      flags[arg.slice(2)] = argv[i + 1] ?? "";
      i += 1;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}
async function pngToBuffer(path) {
  const img = await loadPng(path);
  const png = new PNG2({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length);
  return PNG2.sync.write(png);
}
async function cmdDiff(positional, flags) {
  const [refPath, recPath] = positional;
  if (!refPath || !recPath) {
    console.error("usage: verify diff <reconstruction.png> <ground-truth.png> [--out <dir>]");
    return 2;
  }
  const result = await diffFiles(resolve(recPath), resolve(refPath));
  const v = verdict(result);
  const line = `${v.pass ? "PASS" : "FAIL"}  pixelDiff=${result.pixelDiffPct}% ssim=${result.ssim}  -> ${v.pass ? "indistinguishable" : "distinguishable"} (gate: <=${v.thresholds.pixelDiffMax}% OR >=${v.thresholds.ssimMin}) [${v.provenance}]`;
  console.log(line);
  if (flags.out) {
    const outDir = resolve(flags.out);
    const [a, b] = await Promise.all([pngToBuffer(resolve(recPath)), pngToBuffer(resolve(refPath))]);
    const htmlPath = await writeProof({
      title: `diff: ${basename(recPath)} vs ${basename(refPath)}`,
      outDir,
      verdict: v,
      pairs: [
        {
          label: "reconstruction vs ground truth",
          a,
          aCaption: basename(recPath),
          b,
          bCaption: basename(refPath),
          heatmap: result.heatmapPng,
          pixelDiffPct: result.pixelDiffPct,
          ssim: result.ssim,
          pass: v.pass
        }
      ],
      note: `Calibration is provisional: ${v.provenance}.`
    });
    console.log(`proof: ${htmlPath}`);
  }
  return v.pass ? 0 : 1;
}
async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  switch (command) {
    case "diff":
      return cmdDiff(positional, flags);
    default:
      console.error(`unknown command: ${command ?? "(none)"}
usage: verify diff <a.png> <b.png> [--out <dir>]`);
      return 2;
  }
}
main().then((code) => process.exit(code)).catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(2);
});
//# sourceMappingURL=verify-cli.mjs.map