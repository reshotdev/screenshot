// src/capture/index.ts
import { mkdir as mkdir2, writeFile as writeFile2 } from "fs/promises";
import { dirname as dirname2 } from "path";

// src/capture/resources.ts
var MAX_RESOURCE_BYTES = 4e6;
async function resolveResourceUris(page, urls) {
  const unique = [.../* @__PURE__ */ new Set([...urls])].filter((u) => u && !u.startsWith("data:"));
  const out = {};
  await Promise.all(
    unique.map(async (u) => {
      try {
        const resp = await page.request.get(u, { timeout: 8e3 });
        if (!resp.ok()) return;
        const buf = await resp.body();
        if (buf.length > MAX_RESOURCE_BYTES) return;
        const ct = resp.headers()["content-type"] || "application/octet-stream";
        out[u] = `data:${ct.split(";")[0]};base64,${buf.toString("base64")}`;
      } catch {
      }
    })
  );
  return out;
}
function inlineResolvedUris(html, dataUris) {
  let out = html;
  for (const [u, d] of Object.entries(dataUris)) {
    out = out.split(u).join(d);
    const escaped = u.replace(/&/g, "&amp;");
    if (escaped !== u) out = out.split(escaped).join(d);
  }
  return out;
}

// src/capture/m4-domsnapshot.ts
var PROPS = [
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "float",
  "clear",
  "z-index",
  "box-sizing",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "outline-width",
  "outline-style",
  "outline-color",
  "outline-offset",
  "color",
  "background-color",
  "background-image",
  "background-position",
  "background-size",
  "background-repeat",
  "background-origin",
  "background-clip",
  "background-attachment",
  "-webkit-background-clip",
  "-webkit-text-fill-color",
  "opacity",
  "visibility",
  "overflow-x",
  "overflow-y",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-stretch",
  "font-variant",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "text-align",
  "text-transform",
  "text-decoration",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-style",
  "text-shadow",
  "text-indent",
  "white-space",
  "word-break",
  "overflow-wrap",
  "vertical-align",
  "list-style",
  "direction",
  "writing-mode",
  "unicode-bidi",
  "box-shadow",
  "filter",
  "backdrop-filter",
  "mix-blend-mode",
  "isolation",
  "transform",
  "transform-origin",
  "perspective",
  "transform-style",
  "clip-path",
  "-webkit-clip-path",
  "mask",
  "-webkit-mask",
  "-webkit-mask-image",
  "flex-direction",
  "flex-wrap",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "order",
  "justify-content",
  "align-items",
  "align-content",
  "align-self",
  "justify-self",
  "gap",
  "row-gap",
  "column-gap",
  "grid-template-columns",
  "grid-template-rows",
  "grid-template-areas",
  "grid-column",
  "grid-row",
  "grid-auto-flow",
  "grid-auto-columns",
  "grid-auto-rows",
  "aspect-ratio",
  "object-fit",
  "object-position",
  "content",
  "border-collapse",
  "border-spacing",
  "table-layout"
];
var NOISE = /* @__PURE__ */ new Set(["auto", "normal", "none", ""]);
var SVG_TAGS = /* @__PURE__ */ new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "defs",
  "use",
  "symbol",
  "clippath",
  "lineargradient",
  "radialgradient",
  "stop",
  "mask",
  "pattern",
  "image",
  "marker",
  "filter",
  "fegaussianblur",
  "feoffset",
  "feblend",
  "femerge",
  "femergenode",
  "fecolormatrix",
  "fecomposite",
  "fedropshadow",
  "foreignobject",
  "title",
  "desc",
  "textpath"
]);
var VOID = /* @__PURE__ */ new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
var escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
var escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function harvestFontFaceInPage() {
  const sameOrigin = (u) => {
    try {
      return new URL(u, location.href).origin === location.origin;
    } catch {
      return false;
    }
  };
  const blocks = [];
  const tasks = [];
  const mime = (u) => /\.woff2/i.test(u) ? "woff2" : /\.woff/i.test(u) ? "woff" : /\.(ttf|truetype)/i.test(u) ? "truetype" : /\.(otf|opentype)/i.test(u) ? "opentype" : "woff2";
  async function toDataUri(abs) {
    try {
      const r = await fetch(abs, { mode: sameOrigin(abs) ? "same-origin" : "cors" });
      if (!r.ok) return null;
      const b = await r.blob();
      return await new Promise((res) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = () => res(null);
        fr.readAsDataURL(b);
      });
    } catch {
      return null;
    }
  }
  function fromText(cssText, base) {
    const re = /@font-face\s*\{([^}]*)\}/gi;
    let m;
    while (m = re.exec(cssText)) {
      const body = m[1] ?? "";
      const g = (p) => {
        const r = new RegExp(p + "\\s*:\\s*([^;]+)", "i").exec(body);
        return r ? (r[1] ?? "").trim() : "";
      };
      const um = g("src").match(/url\((['"]?)([^'")]+)\1\)/);
      if (!um) continue;
      let abs;
      try {
        abs = new URL(um[2], base).href;
      } catch {
        continue;
      }
      const idx = blocks.length;
      blocks.push(null);
      tasks.push(toDataUri(abs).then((d) => {
        if (d) blocks[idx] = `@font-face{font-family:${g("font-family")};font-style:${g("font-style") || "normal"};font-weight:${g("font-weight") || "normal"};font-display:block;src:url(${d}) format('${mime(abs)}');}`;
      }));
    }
  }
  function walk(sheet) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      if (sheet.href) tasks.push(fetch(sheet.href, { mode: "cors" }).then((r) => r.ok ? r.text() : "").then((t) => t && fromText(t, sheet.href)).catch(() => {
      }));
      return;
    }
    if (!rules) return;
    for (const rule of Array.from(rules)) {
      if (rule.type === CSSRule.IMPORT_RULE) {
        const ir = rule;
        let ok = false;
        try {
          ok = !!(ir.styleSheet && ir.styleSheet.cssRules);
        } catch {
        }
        if (ok && ir.styleSheet) walk(ir.styleSheet);
        else {
          let h = ir.href;
          try {
            h = new URL(ir.href, sheet.href || location.href).href;
          } catch {
          }
          if (h) tasks.push(fetch(h, { mode: "cors" }).then((r) => r.ok ? r.text() : "").then((t) => t && fromText(t, h)).catch(() => {
          }));
        }
      } else if (rule.type === CSSRule.FONT_FACE_RULE) {
        const fr = rule;
        const src = fr.style.getPropertyValue("src");
        if (!src) continue;
        const um = src.match(/url\((['"]?)([^'")]+)\1\)/);
        if (!um) continue;
        if (um[2].startsWith("data:")) {
          blocks.push(`@font-face{${fr.style.cssText}}`);
          continue;
        }
        let abs;
        try {
          abs = new URL(um[2], sheet.href || location.href).href;
        } catch {
          continue;
        }
        const fam = fr.style.getPropertyValue("font-family");
        const wt = fr.style.getPropertyValue("font-weight") || "normal";
        const st = fr.style.getPropertyValue("font-style") || "normal";
        const idx = blocks.length;
        blocks.push(null);
        tasks.push(toDataUri(abs).then((d) => {
          if (d) blocks[idx] = `@font-face{font-family:${fam};font-style:${st};font-weight:${wt};font-display:block;src:url(${d}) format('${mime(abs)}');}`;
        }));
      }
    }
  }
  for (const s of Array.from(document.styleSheets)) walk(s);
  return Promise.all(tasks).then(() => blocks.filter(Boolean).join("\n"));
}
async function snapshotM4(page) {
  const client = await page.context().newCDPSession(page);
  let snap;
  try {
    await client.send("DOMSnapshot.enable").catch(() => {
    });
    snap = await client.send("DOMSnapshot.captureSnapshot", {
      computedStyles: PROPS,
      includePaintOrder: true,
      includeDOMRects: true
    });
  } finally {
    await client.detach().catch(() => {
    });
  }
  const strings = snap.strings;
  const doc = snap.documents[0];
  const nodes = doc.nodes;
  const nodeType = nodes["nodeType"];
  const nodeName = nodes["nodeName"];
  const nodeValue = nodes["nodeValue"];
  const parentIndex = nodes["parentIndex"];
  const attributesArr = nodes["attributes"];
  const pseudoType = nodes["pseudoType"];
  const currentSourceURL = nodes["currentSourceURL"];
  const inputValue = nodes["inputValue"];
  const inputCheckedIndex = nodes.inputChecked?.index;
  const layout = doc.layout;
  const S = (i) => i != null && i >= 0 ? strings[i] : null;
  const styleByNode = /* @__PURE__ */ new Map();
  for (let j = 0; j < layout.nodeIndex.length; j++) {
    const nodeIdx = layout.nodeIndex[j];
    const styleArr = layout.styles[j];
    if (!styleArr) continue;
    let css = "";
    const bag = {};
    for (let p = 0; p < PROPS.length; p++) {
      const v = S(styleArr[p]);
      if (v == null) continue;
      bag[PROPS[p]] = v;
      if (NOISE.has(v)) continue;
      css += `${PROPS[p]}:${v};`;
    }
    styleByNode.set(nodeIdx, { css, bag });
  }
  const children = /* @__PURE__ */ new Map();
  for (let i = 0; i < parentIndex.length; i++) {
    const p = parentIndex[i];
    if (p < 0) continue;
    if (!children.has(p)) children.set(p, []);
    children.get(p).push(i);
  }
  function attrsOf(i) {
    const flat = attributesArr[i] || [];
    const m = /* @__PURE__ */ new Map();
    for (let k = 0; k + 1 < flat.length; k += 2) {
      const name = S(flat[k]);
      const val = S(flat[k + 1]);
      if (name != null) m.set(name, val ?? "");
    }
    return m;
  }
  const resourceUrls = /* @__PURE__ */ new Set();
  const baseURL = doc.baseURL != null ? S(doc.baseURL) : doc.documentURL != null ? S(doc.documentURL) : null;
  const absUrl = (u) => {
    if (!u || u.startsWith("data:")) return null;
    try {
      return new URL(u, baseURL || void 0).href;
    } catch {
      return null;
    }
  };
  function emit(i, inSvg) {
    const type = nodeType[i];
    if (type === 3) {
      const v = S(nodeValue[i]);
      return v != null ? escText(v) : "";
    }
    if (type === 8) return "";
    if (type !== 1) return (children.get(i) || []).map((c) => emit(c, inSvg)).join("");
    const rawName = S(nodeName[i]) || "div";
    const tag = rawName.toLowerCase();
    const pseudo = pseudoType && pseudoType[i] != null ? S(pseudoType[i]) : null;
    if (tag === "script" || tag === "noscript" || tag === "link" || tag === "meta" || tag === "base" || tag === "title") {
      return "";
    }
    const styleEntry = styleByNode.get(i);
    const bag = styleEntry ? styleEntry.bag : {};
    if (pseudo === "before" || pseudo === "after") {
      const content = bag["content"];
      if (!content || content === "none" || content === "normal") return "";
      const css2 = styleEntry ? styleEntry.css : "";
      const txt = String(content).replace(/^["']|["']$/g, "");
      const safeTxt = txt && txt !== "counter" && !txt.startsWith("url(") ? escText(txt) : "";
      return `<span data-pseudo="::${pseudo}" style="${escAttr(css2)}">${safeTxt}</span>`;
    }
    if (pseudo) return "";
    const nowSvg = inSvg || tag === "svg" || SVG_TAGS.has(tag);
    if (tag === "style") {
      const inner = (children.get(i) || []).map((c) => emit(c, false)).join("");
      return `<style>${inner}</style>`;
    }
    const attrs = attrsOf(i);
    let attrStr = "";
    for (const a of [
      "class",
      "id",
      "dir",
      "lang",
      "role",
      "viewBox",
      "width",
      "height",
      "d",
      "points",
      "x",
      "y",
      "x1",
      "y1",
      "x2",
      "y2",
      "cx",
      "cy",
      "r",
      "rx",
      "ry",
      "fill",
      "stroke",
      "stroke-width",
      "transform",
      "offset",
      "stop-color",
      "gradientUnits",
      "href",
      "xlink:href",
      "preserveAspectRatio",
      "clip-path",
      "aria-hidden"
    ]) {
      if (attrs.has(a)) attrStr += ` ${a}="${escAttr(attrs.get(a))}"`;
    }
    const css = styleEntry ? styleEntry.css : "";
    const bg = bag["background-image"];
    if (bg && bg.includes("url(")) {
      const m = bg.match(/url\((['"]?)(.*?)\1\)/);
      const abs = m && absUrl(m[2] ?? null);
      if (abs) resourceUrls.add(abs);
    }
    if (tag === "img") {
      const src = currentSourceURL && S(currentSourceURL[i]) || attrs.get("src") || "";
      const abs = absUrl(src);
      if (abs) {
        resourceUrls.add(abs);
        attrStr += ` src="${escAttr(abs)}"`;
      } else if (src) attrStr += ` src="${escAttr(src)}"`;
      if (attrs.has("alt")) attrStr += ` alt="${escAttr(attrs.get("alt"))}"`;
      return `<img${attrStr} style="${escAttr(css)}">`;
    }
    if (tag === "input" || tag === "textarea" || tag === "select") {
      const iv = inputValue && S(inputValue[i]);
      if (iv != null) attrStr += ` value="${escAttr(iv)}"`;
      if (inputCheckedIndex && inputCheckedIndex.includes(i)) attrStr += " checked";
      if (attrs.has("type")) attrStr += ` type="${escAttr(attrs.get("type"))}"`;
      if (attrs.has("placeholder")) attrStr += ` placeholder="${escAttr(attrs.get("placeholder"))}"`;
    }
    const styleAttr = css ? ` style="${escAttr(css)}"` : "";
    const open = `<${tag}${attrStr}${styleAttr}>`;
    if (VOID.has(tag)) return open;
    const kids = (children.get(i) || []).map((c) => emit(c, nowSvg)).join("");
    return `${open}${kids}</${tag}>`;
  }
  let htmlIdx = -1, bodyIdx = -1, headIdx = -1;
  for (let i = 0; i < nodeName.length; i++) {
    const nm = (S(nodeName[i]) || "").toLowerCase();
    if (nm === "html" && htmlIdx < 0) htmlIdx = i;
    if (nm === "body" && bodyIdx < 0) bodyIdx = i;
    if (nm === "head" && headIdx < 0) headIdx = i;
  }
  const htmlStyle = htmlIdx >= 0 && styleByNode.get(htmlIdx) ? styleByNode.get(htmlIdx).css : "";
  const bgColor = (htmlIdx >= 0 ? styleByNode.get(htmlIdx)?.bag["background-color"] : void 0) || (bodyIdx >= 0 ? styleByNode.get(bodyIdx)?.bag["background-color"] : void 0) || "#ffffff";
  let headStyles = "";
  if (headIdx >= 0) {
    for (const c of children.get(headIdx) || []) {
      if ((S(nodeName[c]) || "").toLowerCase() === "style") headStyles += emit(c, false);
    }
  }
  const bodyHtml = bodyIdx >= 0 ? emit(bodyIdx, false) : "";
  const fontFaceCss = await page.evaluate(harvestFontFaceInPage).catch(() => "");
  const dataUris = await resolveResourceUris(page, resourceUrls);
  let html = bodyHtml;
  for (const [u, d] of Object.entries(dataUris)) {
    html = html.split(`src="${escAttr(u)}"`).join(`src="${d}"`);
    html = html.split(u).join(d);
  }
  const out = `<!doctype html><html style="${escAttr(htmlStyle)}"><head><meta charset="utf-8"><meta name="viewport" content="width=${doc.contentWidth || ""}"><style>html,body{margin:0;background:${bgColor};}*{box-sizing:border-box;}[data-pseudo]{display:inline-block;}</style>` + (headStyles ? `<style>${headStyles}</style>` : "") + (fontFaceCss ? `<style>${fontFaceCss}</style>` : "") + `</head>${html}</html>`;
  return {
    method: "m4",
    html: out,
    scrolls: [{ sel: ":root", x: doc.scrollOffsetX || 0, y: doc.scrollOffsetY || 0 }],
    surfaces: [],
    notes: `CDP DOMSnapshot: ${layout.nodeIndex.length} laid-out nodes, ${Object.keys(dataUris).length} resources inlined; canvas/webgl/video are blind (structural method)`
  };
}

// src/capture/serialize.ts
function serializeHybridInPage() {
  const PROPS2 = [
    "display",
    "position",
    "top",
    "right",
    "bottom",
    "left",
    "float",
    "clear",
    "z-index",
    "box-sizing",
    "width",
    "height",
    "min-width",
    "min-height",
    "max-width",
    "max-height",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
    "border-top-style",
    "border-right-style",
    "border-bottom-style",
    "border-left-style",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-left-radius",
    "border-bottom-right-radius",
    "outline-width",
    "outline-style",
    "outline-color",
    "outline-offset",
    "color",
    "background-color",
    "background-image",
    "background-position",
    "background-size",
    "background-repeat",
    "background-origin",
    "background-clip",
    "background-attachment",
    "-webkit-background-clip",
    "-webkit-text-fill-color",
    "opacity",
    "visibility",
    "overflow",
    "overflow-x",
    "overflow-y",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "font-stretch",
    "font-variant",
    "line-height",
    "letter-spacing",
    "word-spacing",
    "text-align",
    "text-transform",
    "text-decoration",
    "text-decoration-color",
    "text-decoration-line",
    "text-decoration-style",
    "text-shadow",
    "text-indent",
    "white-space",
    "word-break",
    "overflow-wrap",
    "vertical-align",
    "list-style",
    "direction",
    "writing-mode",
    "unicode-bidi",
    "box-shadow",
    "filter",
    "backdrop-filter",
    "mix-blend-mode",
    "isolation",
    "transform",
    "transform-origin",
    "perspective",
    "transform-style",
    "clip-path",
    "-webkit-clip-path",
    "mask",
    "-webkit-mask",
    "-webkit-mask-image",
    "mask-image",
    "mask-position",
    "mask-size",
    "mask-repeat",
    "mask-mode",
    "mask-composite",
    "mask-clip",
    "mask-origin",
    "flex-direction",
    "flex-wrap",
    "flex-grow",
    "flex-shrink",
    "flex-basis",
    "order",
    "justify-content",
    "align-items",
    "align-content",
    "align-self",
    "gap",
    "row-gap",
    "column-gap",
    "grid-template-columns",
    "grid-template-rows",
    "grid-template-areas",
    "grid-column",
    "grid-row",
    "grid-auto-flow",
    "grid-auto-columns",
    "grid-auto-rows",
    "aspect-ratio",
    "object-fit",
    "object-position",
    "content",
    "border-collapse",
    "border-spacing",
    "table-layout"
  ];
  const SVGNS = "http://www.w3.org/2000/svg";
  const XLINKNS = "http://www.w3.org/1999/xlink";
  const sameOrigin = (url) => {
    try {
      return new URL(url, location.href).origin === location.origin;
    } catch {
      return false;
    }
  };
  const fetchTasks = [];
  const imgRefs = [];
  const bgUrls = [];
  let imgSeq = 0;
  const toAbs = (url) => {
    try {
      return new URL(url, location.href).href;
    } catch {
      return null;
    }
  };
  const styleCss = (el, pseudo) => {
    const cs = getComputedStyle(el, pseudo ?? null);
    let out = "";
    for (const p of PROPS2) {
      const v = cs.getPropertyValue(p);
      if (v && !(v === "none" && p !== "content") && v !== "auto" && v !== "normal") out += `${p}:${v};`;
    }
    return { out, cs };
  };
  const externalSymbols = /* @__PURE__ */ new Map();
  function inlineExternalUse(useEl) {
    const href = useEl.getAttribute("href") || useEl.getAttributeNS(XLINKNS, "href") || useEl.getAttribute("xlink:href") || "";
    if (!href || href.startsWith("#") || href.startsWith("data:")) return;
    const hashIdx = href.indexOf("#");
    if (hashIdx < 0) return;
    const fileUrl = href.slice(0, hashIdx);
    const symId = href.slice(hashIdx + 1);
    fetchTasks.push(
      (async () => {
        try {
          let abs;
          try {
            abs = new URL(fileUrl, location.href).href;
          } catch {
            return;
          }
          const resp = await fetch(abs, { mode: sameOrigin(abs) ? "same-origin" : "cors" });
          if (!resp.ok) return;
          const text = await resp.text();
          const doc = new DOMParser().parseFromString(text, "image/svg+xml");
          const sym = doc.getElementById(symId);
          if (sym) {
            externalSymbols.set(symId, sym.outerHTML);
            useEl.setAttribute("href", `#${symId}`);
          }
        } catch {
        }
      })()
    );
  }
  const fontFaceTasks = [];
  const fontFaceBlocks = [];
  const mimeForFont = (url) => {
    if (/\.woff2(\?|$)/i.test(url)) return "woff2";
    if (/\.woff(\?|$)/i.test(url)) return "woff";
    if (/\.(ttf|truetype)(\?|$)/i.test(url)) return "truetype";
    if (/\.(otf|opentype)(\?|$)/i.test(url)) return "opentype";
    return "woff2";
  };
  function emitFontFace(block) {
    return `@font-face{font-family:${block.family};font-style:${block.style || "normal"};font-weight:${block.weight || "normal"};${block.stretch ? `font-stretch:${block.stretch};` : ""}${block.unicodeRange ? `unicode-range:${block.unicodeRange};` : ""}font-display:${block.display || "block"};src:url(${block.dataUri}) format('${block.fmt}');}`;
  }
  function collectFontFaceFromCssText(cssText, baseHref) {
    const ffRe = /@font-face\s*\{([^}]*)\}/gi;
    let m;
    while (m = ffRe.exec(cssText)) {
      const body2 = m[1] ?? "";
      const get = (prop) => {
        const r = new RegExp(prop + "\\s*:\\s*([^;]+)", "i").exec(body2);
        return r ? (r[1] ?? "").trim() : "";
      };
      const src = get("src");
      const urlMatch = src.match(/url\((['"]?)([^'")]+)\1\)/);
      if (!urlMatch) continue;
      const url = urlMatch[2];
      const family = get("font-family");
      const idx = fontFaceBlocks.length;
      fontFaceBlocks.push(null);
      fontFaceTasks.push(
        (async () => {
          let abs;
          try {
            abs = new URL(url, baseHref || location.href).href;
          } catch {
            return;
          }
          try {
            const resp = await fetch(abs, { mode: sameOrigin(abs) ? "same-origin" : "cors" });
            if (!resp.ok) return;
            const blob = await resp.blob();
            const dataUri = await new Promise((res) => {
              const fr = new FileReader();
              fr.onload = () => res(fr.result);
              fr.onerror = () => res(null);
              fr.readAsDataURL(blob);
            });
            if (!dataUri) return;
            fontFaceBlocks[idx] = emitFontFace({
              family,
              style: get("font-style"),
              weight: get("font-weight"),
              stretch: get("font-stretch"),
              unicodeRange: get("unicode-range"),
              display: get("font-display"),
              dataUri,
              fmt: mimeForFont(abs)
            });
          } catch {
          }
        })()
      );
    }
  }
  function collectFontFaceRules(sheet) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      if (sheet.href) {
        fontFaceTasks.push(
          fetch(sheet.href, { mode: "cors" }).then((r) => r.ok ? r.text() : "").then((t) => {
            if (t) collectFontFaceFromCssText(t, sheet.href);
          }).catch(() => {
          })
        );
      }
      return;
    }
    if (!rules) return;
    for (const rule of Array.from(rules)) {
      if (rule.type === CSSRule.IMPORT_RULE) {
        const importRule = rule;
        let importedReadable = false;
        try {
          importedReadable = !!(importRule.styleSheet && importRule.styleSheet.cssRules);
        } catch {
          importedReadable = false;
        }
        if (importedReadable && importRule.styleSheet) {
          collectFontFaceRules(importRule.styleSheet);
        } else {
          let importHref = importRule.href;
          try {
            importHref = new URL(importRule.href, sheet.href || location.href).href;
          } catch {
          }
          if (importHref) {
            fontFaceTasks.push(
              fetch(importHref, { mode: "cors" }).then((r) => r.ok ? r.text() : "").then((t) => {
                if (t) collectFontFaceFromCssText(t, importHref);
              }).catch(() => {
              })
            );
          }
        }
      } else if (rule.type === CSSRule.FONT_FACE_RULE) {
        const ffRule = rule;
        const src = ffRule.style.getPropertyValue("src");
        if (!src) continue;
        const urlMatch = src.match(/url\((['"]?)([^'")]+)\1\)/);
        if (!urlMatch) continue;
        const url = urlMatch[2];
        const family = ffRule.style.getPropertyValue("font-family");
        const weight = ffRule.style.getPropertyValue("font-weight") || "normal";
        const style = ffRule.style.getPropertyValue("font-style") || "normal";
        const stretch = ffRule.style.getPropertyValue("font-stretch") || "";
        const unicodeRange = ffRule.style.getPropertyValue("unicode-range") || "";
        const display = ffRule.style.getPropertyValue("font-display") || "block";
        if (url.startsWith("data:")) {
          fontFaceBlocks.push(`@font-face{${ffRule.style.cssText}}`);
          continue;
        }
        const idx = fontFaceBlocks.length;
        fontFaceBlocks.push(null);
        fontFaceTasks.push(
          (async () => {
            let abs;
            try {
              abs = new URL(url, sheet.href || location.href).href;
            } catch {
              return;
            }
            try {
              const resp = await fetch(abs, { mode: sameOrigin(abs) ? "same-origin" : "cors" });
              if (!resp.ok) return;
              const blob = await resp.blob();
              const dataUri = await new Promise((res) => {
                const fr = new FileReader();
                fr.onload = () => res(fr.result);
                fr.onerror = () => res(null);
                fr.readAsDataURL(blob);
              });
              if (!dataUri) return;
              fontFaceBlocks[idx] = emitFontFace({
                family,
                style,
                weight,
                stretch,
                unicodeRange,
                display,
                dataUri,
                fmt: mimeForFont(abs)
              });
            } catch {
            }
          })()
        );
      }
    }
  }
  for (const sheet of Array.from(document.styleSheets)) collectFontFaceRules(sheet);
  const surfaces = [];
  let surfaceSeq = 0;
  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, vx: r.left, vy: r.top, w: r.width, h: r.height };
  }
  function withContainingBlock(style, pos) {
    const p = (pos || "").trim();
    if (p && p !== "static") return style;
    return `${style};position:relative`;
  }
  function tryCanvasDataUri(canvas) {
    try {
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }
  function tryVideoDataUri(video) {
    try {
      const c = document.createElement("canvas");
      c.width = video.videoWidth || video.clientWidth;
      c.height = video.videoHeight || video.clientHeight;
      if (!c.width || !c.height) return null;
      c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
      return c.toDataURL("image/png");
    } catch {
      return null;
    }
  }
  function isUnserializable(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "canvas") return "canvas";
    if (tag === "video") return "video";
    if (tag === "iframe") {
      const src = el.getAttribute("src") || "";
      if (src && !sameOrigin(src)) return "iframe";
    }
    return null;
  }
  function clone(el) {
    const kind = isUnserializable(el);
    if (kind) {
      const id = `hyb${surfaceSeq++}`;
      const rect = rectOf(el);
      let dataUri = null;
      if (kind === "canvas") dataUri = tryCanvasDataUri(el);
      else if (kind === "video") dataUri = tryVideoDataUri(el);
      const { out: out2, cs: pcs } = styleCss(el);
      const surface = {
        id,
        kind,
        rect,
        dataUri,
        needPlaywrightShot: !dataUri,
        clip: {
          borderRadius: pcs.getPropertyValue("border-top-left-radius") + " " + pcs.getPropertyValue("border-top-right-radius") + " " + pcs.getPropertyValue("border-bottom-right-radius") + " " + pcs.getPropertyValue("border-bottom-left-radius"),
          clipPath: pcs.getPropertyValue("clip-path")
        }
      };
      surfaces.push(surface);
      const ph = document.createElement("div");
      ph.setAttribute("data-hybrid-id", id);
      ph.setAttribute("style", withContainingBlock(out2, pcs.getPropertyValue("position")));
      return ph;
    }
    const tag = el.tagName.toLowerCase();
    if (el.namespaceURI === SVGNS || tag === "svg") {
      el.querySelectorAll("use").forEach((u) => inlineExternalUse(u));
      const frag = new DOMParser().parseFromString(
        `<svg xmlns="${SVGNS}" xmlns:xlink="${XLINKNS}">${el.outerHTML}</svg>`,
        "image/svg+xml"
      );
      const parsed = frag.documentElement.firstElementChild;
      const { out: cssText } = styleCss(el);
      if (parsed && cssText) parsed.setAttribute("style", (parsed.getAttribute("style") || "") + cssText);
      return parsed || document.createElementNS(SVGNS, "g");
    }
    const out = document.createElement(tag === "html" ? "div" : tag);
    const { out: css, cs } = styleCss(el);
    if (css) out.setAttribute("style", css);
    const bg = cs.getPropertyValue("background-image");
    if (bg && bg.includes("url(")) {
      const urlRe = /url\((['"]?)([^'")]+)\1\)/g;
      let bm;
      while (bm = urlRe.exec(bg)) {
        const u = bm[2];
        if (u && !u.startsWith("data:")) {
          const abs = toAbs(u);
          if (abs) bgUrls.push(abs);
        }
      }
    }
    for (const a of ["class", "id", "width", "height", "viewBox", "role", "dir", "lang"]) {
      if (el.hasAttribute(a)) out.setAttribute(a, el.getAttribute(a));
    }
    if (tag === "img") {
      const img = el;
      const src = img.currentSrc || img.src;
      if (img.alt) out.setAttribute("alt", img.alt);
      if (src) {
        if (src.startsWith("data:")) {
          out.setAttribute("src", src);
        } else {
          const abs = toAbs(src) || src;
          out.setAttribute("src", abs);
          const id = `img${imgSeq++}`;
          out.setAttribute("data-hybrid-img", id);
          imgRefs.push({ id, url: abs, rect: rectOf(el) });
        }
      }
      return out;
    }
    if (tag === "input" || tag === "textarea" || tag === "select") {
      const field = el;
      if (field.type) out.setAttribute("type", field.type);
      if (field.value != null) out.setAttribute("value", field.value);
      if (field.checked) out.setAttribute("checked", "");
      if (field.placeholder) out.setAttribute("placeholder", field.placeholder);
    }
    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(el, pseudo);
      const content = ps.getPropertyValue("content");
      if (content && content !== "none" && content !== "normal") {
        const { out: pcss } = styleCss(el, pseudo);
        const span = document.createElement("span");
        span.setAttribute("data-pseudo", pseudo);
        span.setAttribute("style", pcss);
        const txt = content.replace(/^["']|["']$/g, "");
        if (txt && txt !== "counter") span.textContent = txt;
        if (pseudo === "::before") out.insertBefore(span, out.firstChild);
        else out.appendChild(span);
      }
    }
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) out.appendChild(document.createTextNode(node.nodeValue ?? ""));
      else if (node.nodeType === Node.ELEMENT_NODE) {
        const child = node;
        const tn = child.tagName.toLowerCase();
        if (tn === "script" || tn === "noscript" || tn === "style" || tn === "link") continue;
        out.appendChild(clone(child));
      }
    }
    return out;
  }
  const scrolls = [
    { sel: ":root", x: window.scrollX, y: window.scrollY }
  ];
  document.querySelectorAll("*").forEach((el, i) => {
    if (el.scrollTop || el.scrollLeft) {
      el.setAttribute("data-m5-scroll", `${i}`);
      scrolls.push({ sel: `[data-m5-scroll="${i}"]`, x: el.scrollLeft, y: el.scrollTop });
    }
  });
  const body = clone(document.body);
  async function drainTasks() {
    let n = -1;
    while (fetchTasks.length + fontFaceTasks.length !== n) {
      n = fetchTasks.length + fontFaceTasks.length;
      await Promise.all([...fetchTasks, ...fontFaceTasks]);
    }
  }
  return drainTasks().then(() => {
    const rootStyle = styleCss(document.documentElement).out;
    const bgColor = getComputedStyle(document.documentElement).backgroundColor;
    const fontFaceCss = fontFaceBlocks.filter(Boolean).join("\n");
    let extDefs = "";
    if (externalSymbols.size) {
      extDefs = `<svg xmlns="${SVGNS}" width="0" height="0" style="position:absolute" aria-hidden="true">` + [...externalSymbols.values()].join("") + `</svg>`;
    }
    const payload = {
      rootStyle,
      bodyHtml: body.outerHTML,
      scrolls,
      surfaces,
      imgRefs,
      bgUrls,
      dpr: window.devicePixelRatio,
      vw: window.innerWidth,
      vh: window.innerHeight,
      lang: document.documentElement.lang || "",
      dir: document.documentElement.dir || "",
      bgColor,
      fontFaceCss,
      extDefs
    };
    return JSON.stringify(payload);
  });
}
function detectClosedShadowInPage() {
  const all = document.querySelectorAll("*");
  for (const el of Array.from(all)) {
    const tag = el.tagName.toLowerCase();
    if (!tag.includes("-")) continue;
    if (!customElements.get(tag)) continue;
    if (el.shadowRoot === null) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return true;
    }
  }
  return false;
}

// src/capture/m7-hybrid.ts
function injectIntoBody(bodyHtml, injected) {
  if (!injected) return bodyHtml;
  const m = bodyHtml.match(/^(\s*<body[^>]*>)/i);
  if (m) return bodyHtml.slice(0, m[0].length) + injected + bodyHtml.slice(m[0].length);
  return injected + bodyHtml;
}
function sidecarImg(s) {
  if (!s.dataUri) return "";
  const radius = s.clip?.borderRadius?.trim() ? `border-radius:${s.clip.borderRadius};` : "";
  const clipPath = s.clip?.clipPath && s.clip.clipPath !== "none" ? `clip-path:${s.clip.clipPath};` : "";
  const style = `position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;${radius}${clipPath}`;
  return `<img data-hybrid-sidecar="${s.id}" src="${s.dataUri}" style="${style}">`;
}
function injectSidecars(bodyHtml, surfaces) {
  let html = bodyHtml;
  for (const s of surfaces) {
    const img = sidecarImg(s);
    if (!img) continue;
    const re = new RegExp(`(<[a-zA-Z][^>]*\\bdata-hybrid-id="${s.id}"[^>]*>)`);
    if (re.test(html)) html = html.replace(re, `$1${img}`);
  }
  return html;
}
async function shotDataUri(page, rect) {
  try {
    const buf = await page.screenshot({
      clip: {
        x: Math.max(0, rect.vx),
        y: Math.max(0, rect.vy),
        width: Math.max(1, rect.w),
        height: Math.max(1, rect.h)
      }
    });
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
async function snapshotM7(page) {
  const payload = JSON.parse(await page.evaluate(serializeHybridInPage));
  const dataUris = await resolveResourceUris(page, [
    ...payload.imgRefs.map((r) => r.url),
    ...payload.bgUrls
  ]);
  for (const ref of payload.imgRefs) {
    if (dataUris[ref.url]) continue;
    if (ref.rect.w < 1 || ref.rect.h < 1) continue;
    const uri = await shotDataUri(page, ref.rect);
    if (uri) dataUris[ref.url] = uri;
  }
  for (const s of payload.surfaces) {
    if (s.dataUri) continue;
    s.dataUri = await shotDataUri(page, s.rect);
  }
  const bodyInlined = inlineResolvedUris(payload.bodyHtml, dataUris);
  const bodyWithDefs = injectIntoBody(bodyInlined, payload.extDefs || "");
  const bodyWithInjections = injectSidecars(bodyWithDefs, payload.surfaces);
  const html = `<!doctype html><html lang="${payload.lang}" dir="${payload.dir}" style="${payload.rootStyle}"><head><meta charset="utf-8"><meta name="viewport" content="width=${payload.vw}"><style>html,body{margin:0;background:${payload.bgColor || "#fff"};}*{box-sizing:border-box;}[data-hybrid-id]{position:relative;}</style>` + (payload.fontFaceCss ? `<style>${payload.fontFaceCss}</style>` : "") + `</head>${bodyWithInjections}</html>`;
  const surfaceMeta = payload.surfaces.map((s) => ({
    id: s.id,
    kind: s.kind,
    rect: s.rect,
    rasterized: Boolean(s.dataUri),
    via: s.needPlaywrightShot ? "playwright" : "inline"
  }));
  return {
    method: "m7",
    html,
    scrolls: payload.scrolls,
    surfaces: surfaceMeta,
    notes: `m5 DOM + ${Object.keys(dataUris).length} resources inlined (node-side) + ${surfaceMeta.filter((s) => s.rasterized).length}/${surfaceMeta.length} surfaces rasterized`
  };
}

// src/capture/remount.ts
import { chromium as chromium2 } from "playwright-core";

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

// src/render/playwright-driver.ts
var CHROMIUM_NOT_FOUND_MESSAGE = `\u2717 Chromium browser not found. Required for rendering compositions.

  Option 1 (recommended): npx playwright install chromium
  Option 2: set CHROME_PATH to your system Chrome (~200 MB savings)

Run one of the above and try again.`;
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
function safePlaywrightExecutablePath() {
  try {
    return chromium.executablePath();
  } catch {
    return void 0;
  }
}

// src/capture/remount.ts
var DEFAULT_CAPTURE_SETTINGS = {
  width: 1e3,
  height: 800,
  deviceScaleFactor: 2
};
var LAUNCH_ARGS = [
  "--force-color-profile=srgb",
  "--disable-lcd-text",
  "--font-render-hinting=none",
  "--disable-skia-runtime-opts",
  "--hide-scrollbars"
];
async function launchBrowser() {
  const executablePath = resolveChromiumExecutable();
  if (!executablePath) throw new ChromiumNotFoundError();
  return chromium2.launch({ headless: true, executablePath, args: LAUNCH_ARGS });
}
var KILL_ANIM_CSS = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;animation-play-state:paused!important;scroll-behavior:auto!important}";
async function settle(page) {
  await page.addStyleTag({ content: KILL_ANIM_CSS }).catch(() => {
  });
  await page.evaluate(async () => {
    try {
      if (document.fonts?.ready) await document.fonts.ready;
    } catch {
    }
    try {
      document.querySelectorAll("video,audio").forEach((m) => {
        const el = m;
        el.pause();
        if (Number.isFinite(el.duration)) el.currentTime = 0;
      });
    } catch {
    }
    try {
      for (const a of document.getAnimations()) {
        a.currentTime = 0;
        a.pause();
      }
    } catch {
    }
  }).catch(() => {
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))).catch(() => {
  });
}
async function viewportShot(page) {
  return page.screenshot({ type: "png" });
}
async function navigate(page, url, idleMs = 6e3) {
  const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: idleMs }).catch(() => {
  });
  await settleDynamicContent(page);
  await page.waitForTimeout(400);
  return resp;
}
async function settleDynamicContent(page, maxIters = 8, stepMs = 600) {
  let prev = -1;
  for (let i = 0; i < maxIters; i += 1) {
    const len = await page.evaluate(() => (document.body?.innerText || "").length).catch(() => prev);
    if (len === prev) return;
    prev = len;
    await page.waitForTimeout(stepMs);
  }
}
async function openPage(browser, settings, storageState) {
  const context = await browser.newContext({
    viewport: { width: settings.width, height: settings.height },
    deviceScaleFactor: settings.deviceScaleFactor,
    reducedMotion: "reduce",
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "UTC",
    ...storageState ? { storageState } : {}
  });
  return context.newPage();
}
async function remountScreenshot(html, scrolls, settings = DEFAULT_CAPTURE_SETTINGS) {
  const browser = await launchBrowser();
  try {
    const page = await openPage(browser, settings);
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts?.ready).catch(() => {
    });
    await restoreScroll(page, scrolls);
    await settle(page);
    return await viewportShot(page);
  } finally {
    await browser.close();
  }
}
async function restoreScroll(page, scrolls) {
  await page.evaluate((list) => {
    for (const s of list) {
      if (s.sel === ":root") {
        window.scrollTo(s.x, s.y);
        continue;
      }
      const el = document.querySelector(s.sel);
      if (el) {
        el.scrollLeft = s.x;
        el.scrollTop = s.y;
      }
    }
  }, scrolls).catch(() => {
  });
}
async function renderArtifactOffline(html, settings = DEFAULT_CAPTURE_SETTINGS) {
  const browser = await launchBrowser();
  try {
    const page = await openPage(browser, settings);
    const networkRequests = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.startsWith("http://") || url.startsWith("https://")) networkRequests.push(url);
    });
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts?.ready).catch(() => {
    });
    await settle(page);
    const png = await viewportShot(page);
    return { networkRequests, png };
  } finally {
    await browser.close();
  }
}
async function liveScreenshot(url, settings = DEFAULT_CAPTURE_SETTINGS) {
  const browser = await launchBrowser();
  try {
    const page = await openPage(browser, settings);
    await navigate(page, url);
    await settle(page);
    return await viewportShot(page);
  } finally {
    await browser.close();
  }
}

// src/capture/index.ts
function shouldFallbackToM4(signals) {
  if (signals.closedShadow) return true;
  const csp = (signals.csp ?? "").toLowerCase();
  if (!csp) return false;
  if (/(?:default-src|connect-src)\s+'none'/.test(csp)) return true;
  if (/connect-src\s+'self'(?:[^;]*)?(?:;|$)/.test(csp) && !/connect-src[^;]*https?:/.test(csp)) return true;
  return false;
}
async function captureDom(page, opts = {}) {
  let method;
  if (opts.forceMethod) {
    method = opts.forceMethod;
  } else {
    const closedShadow = await page.evaluate(detectClosedShadowInPage).catch(() => false);
    method = shouldFallbackToM4({ closedShadow, csp: opts.csp }) ? "m4" : "m7";
  }
  return method === "m4" ? snapshotM4(page) : snapshotM7(page);
}
async function writeArtifact(snapshot, basePath) {
  await mkdir2(dirname2(basePath), { recursive: true });
  const html = `${basePath}.dom.html`;
  const meta = `${basePath}.dom.meta.json`;
  await writeFile2(html, snapshot.html, "utf8");
  await writeFile2(
    meta,
    JSON.stringify(
      { method: snapshot.method, scrolls: snapshot.scrolls, surfaces: snapshot.surfaces, notes: snapshot.notes },
      null,
      2
    ),
    "utf8"
  );
  return { html, meta };
}
async function captureUrl(url, opts = {}) {
  const settings = opts.settings ?? DEFAULT_CAPTURE_SETTINGS;
  const browser = await launchBrowser();
  let snapshot;
  let method;
  let livePng;
  try {
    const page = await openPage(browser, settings, opts.storageState);
    const resp = await navigate(page, url);
    await settle(page);
    livePng = await page.screenshot({ type: "png" });
    const csp = opts.csp ?? resp?.headers()["content-security-policy"] ?? null;
    snapshot = await captureDom(page, { forceMethod: opts.forceMethod, csp });
    method = snapshot.method;
  } finally {
    await browser.close();
  }
  const remountPng = await remountScreenshot(snapshot.html, snapshot.scrolls, settings);
  return { snapshot, method, livePng, remountPng };
}
export {
  DEFAULT_CAPTURE_SETTINGS,
  captureDom,
  captureUrl,
  launchBrowser,
  liveScreenshot,
  navigate,
  openPage,
  remountScreenshot,
  renderArtifactOffline,
  settle,
  shouldFallbackToM4,
  writeArtifact
};
//# sourceMappingURL=capture.mjs.map