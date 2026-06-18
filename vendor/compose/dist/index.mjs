// src/jsx-runtime.ts
var Fragment = /* @__PURE__ */ Symbol("Fragment");
function normalizeChildren(value) {
  if (value == null || value === false || value === true) return [];
  if (Array.isArray(value)) return value.flatMap(normalizeChildren);
  return [value];
}
function jsx(type, props, key) {
  const nextProps = props ?? {};
  const { children, ...rest } = nextProps;
  return {
    $$compose: true,
    type,
    props: rest,
    children: normalizeChildren(children),
    key
  };
}
function jsxs(type, props, key) {
  return jsx(type, props, key);
}
var jsxDEV = jsx;

// src/timeline/context.ts
var WorkflowContextProvider = /* @__PURE__ */ Symbol(
  "WorkflowContextProvider"
);
var workflowStack = [];
function createWorkflowProvider(value, children) {
  return {
    $$compose: true,
    type: WorkflowContextProvider,
    props: { value },
    children: normalizeChildren(children)
  };
}
function withWorkflowContext(value, fn) {
  workflowStack.push(value);
  try {
    return fn();
  } finally {
    workflowStack.pop();
  }
}
function getWorkflowContext() {
  return workflowStack[workflowStack.length - 1];
}
function useWorkflowContext() {
  const context = getWorkflowContext();
  if (!context) {
    throw new Error(
      "Compose primitive used outside <Composition>. Wrap the tree in <Composition workflow={...}>."
    );
  }
  return context;
}

// src/compile/jsx-to-html.ts
var VOID_ELEMENTS = /* @__PURE__ */ new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);
var UNITLESS_CSS = /* @__PURE__ */ new Set([
  "aspectRatio",
  "columnCount",
  "flex",
  "flexGrow",
  "flexShrink",
  "fontWeight",
  "lineHeight",
  "opacity",
  "order",
  "scale",
  "zIndex",
  "zoom"
]);
function compile(node) {
  const context = { styles: [] };
  return {
    html: renderNode(node, context),
    styles: context.styles
  };
}
function compileToHtml(node) {
  return compile(node).html;
}
function isComposeElement(value) {
  return typeof value === "object" && value !== null && value.$$compose === true;
}
function childrenProp(children) {
  if (children.length === 0) return void 0;
  if (children.length === 1) return children[0];
  return children;
}
function renderNode(node, context) {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string") return escapeText(node);
  if (typeof node === "number") return escapeText(String(node));
  if (Array.isArray(node)) {
    return node.map((child) => renderNode(child, context)).join("");
  }
  if (!isComposeElement(node)) return "";
  if (node.type === Fragment) {
    return node.children.map((child) => renderNode(child, context)).join("");
  }
  if (node.type === WorkflowContextProvider) {
    const value = node.props.value;
    return withWorkflowContext(
      value,
      () => node.children.map((child) => renderNode(child, context)).join("")
    );
  }
  if (typeof node.type === "function") {
    const component = node.type;
    const rendered = component({
      ...node.props,
      children: childrenProp(node.children)
    });
    return renderNode(rendered, context);
  }
  if (typeof node.type !== "string") return "";
  const attrs = serializeAttrs(node.props);
  if (VOID_ELEMENTS.has(node.type)) {
    return `<${node.type}${attrs} />`;
  }
  if (node.type === "style") {
    const css = rawTextContent(node.children);
    context.styles.push(css);
    return `<style${attrs}>${css}</style>`;
  }
  if (node.type === "script") {
    return `<script${attrs}>${rawTextContent(node.children)}</script>`;
  }
  const inner = node.children.map((child) => renderNode(child, context)).join("");
  return `<${node.type}${attrs}>${inner}</${node.type}>`;
}
function serializeAttrs(props) {
  const attrs = [];
  for (const [rawName, rawValue] of Object.entries(props)) {
    if (rawName === "children" || rawName === "key" || rawName === "ref") {
      continue;
    }
    if (rawValue == null || rawValue === false) continue;
    const name = attrName(rawName);
    if (rawValue === true) {
      attrs.push(name);
      continue;
    }
    if (name === "style" && typeof rawValue === "object") {
      const css = styleObjectToString(rawValue);
      if (css) attrs.push(`style="${escapeAttr(css)}"`);
      continue;
    }
    attrs.push(`${name}="${escapeAttr(String(rawValue))}"`);
  }
  return attrs.length === 0 ? "" : ` ${attrs.join(" ")}`;
}
function attrName(name) {
  switch (name) {
    case "charSet":
      return "charset";
    case "className":
      return "class";
    case "crossOrigin":
      return "crossorigin";
    case "autoPlay":
      return "autoplay";
    case "htmlFor":
      return "for";
    case "playsInline":
      return "playsinline";
    default:
      return name;
  }
}
function styleObjectToString(style) {
  const parts = [];
  for (const [key, value] of Object.entries(style)) {
    if (value == null || value === false) continue;
    const cssName = key.startsWith("--") ? key : camelToKebab(key);
    const cssValue = typeof value === "number" && !UNITLESS_CSS.has(key) ? `${value}px` : String(value);
    parts.push(`${cssName}: ${cssValue}`);
  }
  return parts.join("; ");
}
function rawTextContent(nodes) {
  return nodes.map((node) => {
    if (node == null || node === false || node === true) return "";
    if (typeof node === "string" || typeof node === "number") {
      return String(node);
    }
    if (Array.isArray(node)) return rawTextContent(node);
    return "";
  }).join("");
}
function camelToKebab(value) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}
function escapeText(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// src/primitives/Composition.tsx
var BASE_STAGE_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; width: 100%; min-height: 100%; background: transparent; }
body.stage {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #111827;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.reshot-compose-stage {
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
}
.reshot-frame {
  --reshot-frame-chrome-height: 0px;
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
  background: #ffffff;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.reshot-frame--minimal,
.reshot-frame--browser-light,
.reshot-frame--browser-dark {
  --reshot-frame-chrome-height: 32px;
  width: min(calc(100vw - 48px), 1440px);
  height: min(calc(100vh - 48px), 900px);
  border: 1px solid rgba(15, 23, 42, 0.16);
  border-radius: 10px;
}
.reshot-frame__chrome {
  height: var(--reshot-frame-chrome-height);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.1);
  background: #f8fafc;
}
.reshot-frame--browser-dark .reshot-frame__chrome {
  border-bottom-color: rgba(255, 255, 255, 0.12);
  background: rgba(17, 24, 39, 0.92);
}
.reshot-frame__traffic {
  display: flex;
  gap: 7px;
}
.reshot-frame__traffic span {
  width: 11px;
  height: 11px;
  border-radius: 999px;
  display: block;
}
.reshot-frame__traffic span:nth-child(1) { background: #ff5f57; }
.reshot-frame__traffic span:nth-child(2) { background: #febc2e; }
.reshot-frame__traffic span:nth-child(3) { background: #28c840; }
.reshot-frame__url {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  color: #475569;
  font: 500 11px ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reshot-frame--browser-dark .reshot-frame__url {
  color: #cbd5e1;
}
.reshot-frame__viewport {
  position: absolute;
  top: var(--reshot-frame-chrome-height);
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  background: #ffffff;
}
.reshot-frame__media-layer {
  position: absolute;
  inset: 0;
  transform-origin: top left;
  will-change: transform;
}
.reshot-frame__media {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  background: #ffffff;
}
.reshot-frame__media--cover {
  object-fit: cover;
}
.reshot-frame__overlays {
  position: absolute;
  inset: 0;
  pointer-events: none;
  transform-origin: top left;
  will-change: transform;
}
.reshot-product-film {
  width: 100%;
  height: 100%;
}
.reshot-annotation {
  position: absolute;
  z-index: 4;
  opacity: 0;
  pointer-events: none;
  color: #0f172a;
}
.reshot-annotation__ring {
  position: absolute;
  inset: 0;
  border: 2px solid currentColor;
  border-radius: 8px;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.82);
}
.reshot-annotation__label {
  position: absolute;
  left: 0;
  top: 100%;
  margin-top: 8px;
  max-width: 260px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(15, 23, 42, 0.14);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
  font: 600 12px/1.25 -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
}
.reshot-annotation--success { color: #147a3d; }
.reshot-annotation--warning { color: #9a5b00; }
.reshot-annotation--danger { color: #b4232d; }
.reshot-annotation--edge {
  width: auto !important;
  height: auto !important;
  max-width: 320px;
}
.reshot-annotation--edge .reshot-annotation__ring {
  display: none;
}
.reshot-annotation--edge .reshot-annotation__label {
  position: static;
  margin: 0;
}
@keyframes annotationIn {
  0% { opacity: 0; transform: translateY(4px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes annotationOut {
  0% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-4px); }
}
`;
function Composition({
  workflow,
  slug = "composition",
  capturePath,
  durationMs,
  children
}) {
  const resolvedCapturePath = capturePath ?? (typeof workflow.capturePath === "string" ? workflow.capturePath : void 0);
  const resolvedDuration = durationMs ?? workflow.durationMs;
  return createWorkflowProvider(
    { workflow, slug, capturePath: resolvedCapturePath },
    /* @__PURE__ */ jsxs("html", { lang: "en", children: [
      /* @__PURE__ */ jsxs("head", { children: [
        /* @__PURE__ */ jsx("meta", { charSet: "utf-8" }),
        /* @__PURE__ */ jsx("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
        /* @__PURE__ */ jsx("title", { children: slug }),
        /* @__PURE__ */ jsx("style", { children: BASE_STAGE_CSS })
      ] }),
      /* @__PURE__ */ jsxs("body", { className: "stage", children: [
        /* @__PURE__ */ jsx(
          "main",
          {
            className: "reshot-compose-stage",
            "data-slug": slug,
            "data-duration-ms": resolvedDuration,
            children
          }
        ),
        /* @__PURE__ */ jsx("script", { children: "window.__RESHOT_COMPOSE_READY__ = true;" })
      ] })
    ] })
  );
}

// src/primitives/Frame.tsx
function Frame({
  chrome = "none",
  url = "app.reshot.dev",
  src,
  fit = "contain",
  children
}) {
  const context = useWorkflowContext();
  const mediaSrc = src ?? context.capturePath ?? "";
  const isStillImage = /\.(?:png|jpe?g|webp|gif|avif|svg)(?:[?#].*)?$/i.test(
    mediaSrc
  );
  const showChrome = chrome !== "none";
  const mediaClassName = `reshot-frame__media${fit === "cover" ? " reshot-frame__media--cover" : ""}`;
  return /* @__PURE__ */ jsxs("div", { className: `reshot-frame reshot-frame--${chrome}`, "data-product-surface": "true", children: [
    showChrome ? /* @__PURE__ */ jsxs("div", { className: "reshot-frame__chrome", children: [
      /* @__PURE__ */ jsxs("div", { className: "reshot-frame__traffic", "aria-hidden": "true", children: [
        /* @__PURE__ */ jsx("span", {}),
        /* @__PURE__ */ jsx("span", {}),
        /* @__PURE__ */ jsx("span", {})
      ] }),
      /* @__PURE__ */ jsx("div", { className: "reshot-frame__url", children: url })
    ] }) : null,
    /* @__PURE__ */ jsxs("div", { className: "reshot-frame__viewport", children: [
      /* @__PURE__ */ jsx("div", { className: "reshot-frame__media-layer", children: isStillImage ? /* @__PURE__ */ jsx(
        "img",
        {
          className: mediaClassName,
          src: mediaSrc,
          alt: "",
          "aria-hidden": "true"
        }
      ) : /* @__PURE__ */ jsx(
        "video",
        {
          className: mediaClassName,
          src: mediaSrc,
          autoPlay: true,
          muted: true,
          playsInline: true,
          preload: "auto"
        }
      ) }),
      /* @__PURE__ */ jsx("div", { className: "reshot-frame__overlays", children })
    ] })
  ] });
}

// src/render/scene-driver.ts
var SCENE_ROOT_CLASS = "reshot-scene-root";
function mountSceneInPage() {
  const w = window;
  const payload = w.__RESHOT_SCENE__;
  if (!payload || w.__RESHOT_SCENE_MOUNTED__) return;
  const root = document.querySelector(
    "[data-reshot-scene='1'].reshot-scene-root"
  );
  if (!root) return;
  const doc = new DOMParser().parseFromString(payload.html, "text/html");
  const dir = doc.documentElement.getAttribute("dir");
  const scopeSel = "[data-reshot-scene='1'].reshot-scene-root";
  const scopeRule = (rule) => {
    if (rule instanceof CSSFontFaceRule) return rule.cssText;
    if (rule instanceof CSSStyleRule) {
      const selectors = rule.selectorText.split(",").map((sel) => {
        const s = sel.trim();
        if (/^(html|body|:root)$/i.test(s)) return scopeSel;
        const stripped = s.replace(/^\s*(html|body|:root)\b\s*/i, "");
        return `${scopeSel} ${stripped || "*"}`.trim();
      });
      return `${selectors.join(", ")}{${rule.style.cssText}}`;
    }
    return rule.cssText;
  };
  const collected = [];
  for (const styleEl of Array.from(doc.head.querySelectorAll("style"))) {
    const probe = document.createElement("style");
    probe.textContent = styleEl.textContent || "";
    document.head.appendChild(probe);
    const sheet = probe.sheet;
    try {
      if (sheet) {
        for (const rule of Array.from(sheet.cssRules)) collected.push(scopeRule(rule));
      } else {
        collected.push(styleEl.textContent || "");
      }
    } finally {
      probe.remove();
    }
  }
  const scopedStyle = document.createElement("style");
  scopedStyle.setAttribute("data-reshot-scene-styles", "1");
  scopedStyle.textContent = collected.join("\n");
  document.head.appendChild(scopedStyle);
  if (payload.viewport) {
    root.style.width = `${payload.viewport.width}px`;
    root.style.height = `${payload.viewport.height}px`;
  } else {
    root.style.width = "100%";
    root.style.height = "100%";
  }
  root.style.position = "absolute";
  root.style.top = "0";
  root.style.left = "0";
  root.style.overflow = "hidden";
  if (dir) root.setAttribute("dir", dir);
  const bodyWrap = document.createElement("div");
  bodyWrap.setAttribute("data-reshot-scene-body", "1");
  bodyWrap.style.position = "absolute";
  bodyWrap.style.inset = "0";
  while (doc.body && doc.body.firstChild) {
    bodyWrap.appendChild(document.adoptNode(doc.body.firstChild));
  }
  root.appendChild(bodyWrap);
  for (const s of payload.scrolls || []) {
    if (s.sel === ":root") {
      bodyWrap.scrollLeft = s.x;
      bodyWrap.scrollTop = s.y;
      continue;
    }
    const el = bodyWrap.querySelector(s.sel);
    if (el) {
      el.scrollLeft = s.x;
      el.scrollTop = s.y;
    }
  }
  w.__RESHOT_SCENE_MOUNTED__ = true;
}
var MOUNT_SCENE_SOURCE = `(${mountSceneInPage.toString()})();`;
function sceneCameraInPage() {
  const w = window;
  const cfg = w.__RESHOT_SCENE_CAMERA__;
  if (!cfg || cfg.keyframes.length === 0) return;
  const layer = document.querySelector(
    ".reshot-frame__media-layer--scene"
  );
  if (!layer) return;
  const kfs = cfg.keyframes.slice().sort((a, b) => a.tMs - b.tMs);
  const applyViewport = (x, y, zoom) => {
    const rect = layer.getBoundingClientRect();
    const scaleX = cfg.source.width > 0 ? rect.width / cfg.source.width : 1;
    const scaleY = cfg.source.height > 0 ? rect.height / cfg.source.height : 1;
    const tx = Math.round(-x * scaleX * zoom * 100) / 100;
    const ty = Math.round(-y * scaleY * zoom * 100) / 100;
    const z = Math.round(zoom * 1e3) / 1e3;
    layer.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`;
  };
  const first = kfs[0];
  const lastKf = kfs[kfs.length - 1];
  const viewportAt = (t) => {
    if (t <= first.tMs) return first;
    if (t >= lastKf.tMs) return lastKf;
    for (let i = 1; i < kfs.length; i++) {
      const b = kfs[i];
      if (t <= b.tMs) {
        const a = kfs[i - 1];
        if (b.isHardCut) return a;
        const span = b.tMs - a.tMs;
        const f = span > 0 ? (t - a.tMs) / span : 1;
        return {
          x: a.x + (b.x - a.x) * f,
          y: a.y + (b.y - a.y) * f,
          zoom: a.zoom + (b.zoom - a.zoom) * f
        };
      }
    }
    return lastKf;
  };
  applyViewport(first.x, first.y, first.zoom);
  const tick = () => {
    const t = w.performance.now();
    const v = viewportAt(t);
    applyViewport(v.x, v.y, v.zoom);
    w.requestAnimationFrame(tick);
  };
  w.requestAnimationFrame(tick);
}
var SCENE_CAMERA_SOURCE = `(${sceneCameraInPage.toString()})();`;
function buildSceneCameraScript(config) {
  if (!config || config.keyframes.length === 0) return "";
  const json = JSON.stringify(config).replace(/<\/(script)/gi, "<\\/$1");
  return `window.__RESHOT_SCENE_CAMERA__ = ${json};
${SCENE_CAMERA_SOURCE}`;
}
function sceneMotionInPage() {
  const w = window;
  const cfg = w.__RESHOT_SCENE_MOTION__;
  if (!cfg || !cfg.instructions || cfg.instructions.length === 0) return;
  const layer = document.querySelector(".reshot-frame__media-layer--scene");
  if (!layer) return;
  const ease = (x) => {
    const c = x < 0 ? 0 : x > 1 ? 1 : x;
    return 1 - Math.pow(1 - c, 3);
  };
  const q8 = (a) => String(Math.round((a < 0 ? 0 : a > 1 ? 1 : a) * 255) / 255);
  const rectRel = (el, lr) => {
    const r = el.getBoundingClientRect();
    return { top: r.top - lr.top, left: r.left - lr.left, width: r.width, height: r.height };
  };
  const setBox = (el, top, left, width, height) => {
    el.style.top = Math.round(top) + "px";
    el.style.left = Math.round(left) + "px";
    el.style.width = Math.round(width) + "px";
    el.style.height = Math.round(height) + "px";
  };
  const resolveButton = (body) => {
    const cands = body.querySelectorAll("button, [role='button'], a[href]");
    let best = null;
    let bestScore = 0;
    for (let i = 0; i < cands.length; i++) {
      const r = cands[i].getBoundingClientRect();
      if (r.width < 40 || r.height < 18 || r.width > 480) continue;
      const score = r.width * r.height + r.left + (2e3 - r.top);
      if (score > bestScore) {
        bestScore = score;
        best = cands[i];
      }
    }
    return best;
  };
  const resolveRows = (body, target, max) => {
    let container = null;
    if (target && target !== "auto") {
      container = body.querySelector(target);
    } else {
      let best = null;
      let bestScore = 0;
      let fallback = null;
      let fallbackKids = 0;
      const all = body.getElementsByTagName("*");
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        const kids2 = el.children;
        if (kids2.length > fallbackKids) {
          fallbackKids = kids2.length;
          fallback = el;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width < 200 || rect.height < 80) continue;
        let rowCount = 0;
        for (let j = 0; j < kids2.length; j++) {
          const kr = kids2[j].getBoundingClientRect();
          if (kr.height >= 24 && kr.height <= 320 && kr.width >= rect.width * 0.5) rowCount++;
        }
        if (rowCount >= 3) {
          const score = rowCount * rect.width * Math.min(rect.height, 1200);
          if (score > bestScore) {
            bestScore = score;
            best = el;
          }
        }
      }
      container = best || (fallbackKids >= 3 ? fallback : null);
    }
    if (!container) return [];
    const out = [];
    const kids = container.children;
    for (let i = 0; i < kids.length && out.length < max; i++) {
      const el = kids[i];
      const r = el.getBoundingClientRect();
      if (r.height >= 16 && r.width >= 60) out.push(el);
    }
    return out;
  };
  const resolveInput = (body, target) => {
    if (target && target !== "auto") return body.querySelector(target);
    const cands = body.querySelectorAll(
      "input[type='text'], input[type='search'], input:not([type]), textarea, [contenteditable='true']"
    );
    for (let i = 0; i < cands.length; i++) {
      const r = cands[i].getBoundingClientRect();
      if (r.width >= 80 && r.height >= 16) return cands[i];
    }
    return null;
  };
  const parseNum = (s) => {
    const m = (s || "").replace(/[^0-9.\-]/g, "");
    if (!m || m === "-" || m === ".") return null;
    const n = Number(m);
    return Number.isFinite(n) ? n : null;
  };
  const resolveNumber = (body, target) => {
    if (target && target !== "auto") return body.querySelector(target);
    let best = null;
    let bestScore = 0;
    const all = body.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (el.children.length !== 0) continue;
      const txt = (el.textContent || "").trim();
      if (!/^[$£€]?\s?-?\d[\d,]*(\.\d+)?%?$/.test(txt)) continue;
      if (parseNum(txt) === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 12 || r.height < 12) continue;
      const score = r.width * r.height;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  };
  const groupInt = (n) => {
    const neg = n < 0;
    let s = String(Math.abs(Math.round(n)));
    let out = "";
    while (s.length > 3) {
      out = "," + s.slice(-3) + out;
      s = s.slice(0, -3);
    }
    return (neg ? "-" : "") + s + out;
  };
  const fmtNum = (n, format) => {
    if (format === "currency") return "$" + groupInt(n);
    if (format === "percent") return groupInt(n) + "%";
    return groupInt(n);
  };
  let states = null;
  const makeOverlay = (css) => {
    const el = document.createElement("div");
    el.setAttribute("data-reshot-motion", "1");
    el.style.cssText = "position:absolute;pointer-events:none;z-index:9;opacity:0;" + css;
    layer.appendChild(el);
    return el;
  };
  const buildStates = (body) => {
    const out = [];
    const lr = layer.getBoundingClientRect();
    for (const inst of cfg.instructions) {
      if (inst.type === "reveal") {
        const rows = resolveRows(body, inst.target || "auto", inst.max || 12);
        if (rows.length === 0) continue;
        const lastStart = inst.startMs + (rows.length - 1) * (inst.stagger || 80);
        const perRowDur = Math.max(160, Math.min(600, inst.endMs - lastStart));
        for (const row of rows) {
          row.style.opacity = "0";
          row.style.transform = "translateY(" + Math.round(inst.distancePx || 12) + "px)";
        }
        out.push({ type: "reveal", inst, rows, perRowDur });
      } else if (inst.type === "highlight") {
        const rows = resolveRows(body, inst.target || "auto", inst.rows || 8);
        if (rows.length === 0) continue;
        const geom = rows.map((r) => rectRel(r, lr));
        const el = makeOverlay("border-radius:8px;background:rgba(88,101,242,0.12);border:2px solid rgb(88,101,242);");
        out.push({ type: "highlight", inst, geom, el });
      } else if (inst.type === "cursor") {
        const targetEl = typeof inst.to === "string" && inst.to !== "auto" ? body.querySelector(inst.to) : resolveButton(body);
        if (!targetEl) continue;
        const tr = rectRel(targetEl, lr);
        const target = { x: Math.round(tr.left + tr.width / 2), y: Math.round(tr.top + tr.height / 2) };
        const start = { x: Math.round(lr.width * (inst.fromXFrac ?? 0.5)), y: Math.round(lr.height * (inst.fromYFrac ?? 0.92)) };
        const cursorEl = makeOverlay("width:24px;height:24px;");
        cursorEl.innerHTML = "<svg width='24' height='24' viewBox='0 0 24 24'><path d='M4 2 L4 19 L8.4 14.6 L11.6 21 L14 19.9 L10.8 13.6 L17 13.6 Z' fill='#0b1220' stroke='#fff' stroke-width='1.3' stroke-linejoin='round'/></svg>";
        const ringEl = inst.click ? makeOverlay("border:2px solid rgba(88,101,242,0.9);border-radius:50%;") : null;
        out.push({ type: "cursor", inst, start, target, cursorEl, ringEl });
      } else if (inst.type === "type") {
        const el = resolveInput(body, inst.target || "auto");
        if (!el) continue;
        const isInput = el.tagName === "INPUT" || el.tagName === "TEXTAREA";
        if (isInput) el.value = "";
        else el.textContent = "";
        out.push({ type: "type", inst, el, isInput });
      } else if (inst.type === "countUp") {
        const el = resolveNumber(body, inst.target || "auto");
        if (!el) continue;
        const original = el.textContent || "";
        const parsed = parseNum(original);
        const to = typeof inst.to === "number" ? inst.to : parsed;
        if (to === null || to === void 0) continue;
        out.push({ type: "countUp", inst, el, to, original });
      } else if (inst.type === "scrollTo") {
        const content = inst.target && inst.target !== "auto" ? body.querySelector(inst.target) : body;
        if (!content) continue;
        const cTop = content.getBoundingClientRect().top;
        let offset;
        if (typeof inst.to === "string" && inst.to !== "auto") {
          const toEl = content.querySelector(inst.to);
          if (!toEl) continue;
          offset = Math.max(0, Math.round(toEl.getBoundingClientRect().top - cTop));
        } else {
          offset = Math.max(0, Math.round(content.scrollHeight - layer.getBoundingClientRect().height));
        }
        if (offset <= 0) continue;
        out.push({ type: "scrollTo", inst, el: content, offset });
      } else if (inst.type === "populate") {
        const rows = resolveRows(body, inst.target || "auto", inst.max || 12);
        if (rows.length === 0) continue;
        const lastStart = inst.startMs + (rows.length - 1) * (inst.stagger || 80);
        const perRowDur = Math.max(160, Math.min(600, inst.endMs - lastStart));
        for (const row of rows) {
          row.style.opacity = "0";
          row.style.transform = "translateX(" + Math.round(inst.distancePx || 16) + "px)";
        }
        out.push({ type: "populate", inst, rows, perRowDur });
      }
    }
    return out;
  };
  const applyReveal = (s, t) => {
    for (let i = 0; i < s.rows.length; i++) {
      const p = (t - (s.inst.startMs + i * (s.inst.stagger || 80))) / s.perRowDur;
      if (p >= 1) {
        s.rows[i].style.opacity = "";
        s.rows[i].style.transform = "";
      } else {
        const e = ease(p);
        s.rows[i].style.opacity = q8(e);
        s.rows[i].style.transform = "translateY(" + Math.round((1 - e) * (s.inst.distancePx || 12)) + "px)";
      }
    }
  };
  const applyHighlight = (s, t) => {
    const inst = s.inst, g = s.geom, pad = inst.padPx ?? 6;
    if (t < inst.startMs || t > inst.endMs) {
      s.el.style.opacity = "0";
      return;
    }
    const steps = Math.min(g.length - 1, (inst.rows || 8) - 1);
    let a = g[0], b = g[0], frac = 0;
    if (inst.walk && steps > 0) {
      const fpos = Math.min(1, (t - inst.startMs) / Math.max(1, inst.endMs - inst.startMs)) * steps;
      const idx = Math.min(steps, Math.floor(fpos));
      frac = ease(fpos - idx);
      a = g[idx];
      b = g[Math.min(steps, idx + 1)];
    }
    const top = a.top + (b.top - a.top) * frac;
    const left = Math.min(a.left, b.left);
    const width = Math.max(a.width, b.width);
    const height = a.height + (b.height - a.height) * frac;
    setBox(s.el, top - pad, left - pad, width + pad * 2, height + pad * 2);
    const fin = Math.min(1, (t - inst.startMs) / 150);
    const fout = Math.min(1, (inst.endMs - t) / 150);
    s.el.style.opacity = q8(0.9 * Math.max(0, Math.min(fin, fout)));
  };
  const applyCursor = (s, t) => {
    const inst = s.inst;
    if (t < inst.startMs || t > inst.endMs) {
      s.cursorEl.style.opacity = "0";
      if (s.ringEl) s.ringEl.style.opacity = "0";
      return;
    }
    const moveEnd = inst.click ? inst.startMs + (inst.endMs - inst.startMs) * 0.7 : inst.endMs;
    const e = ease(Math.min(1, (t - inst.startMs) / Math.max(1, moveEnd - inst.startMs)));
    const x = Math.round(s.start.x + (s.target.x - s.start.x) * e);
    const y = Math.round(s.start.y + (s.target.y - s.start.y) * e);
    s.cursorEl.style.left = x + "px";
    s.cursorEl.style.top = y + "px";
    s.cursorEl.style.opacity = q8(0.97 * Math.min(1, (t - inst.startMs) / 120));
    if (s.ringEl) {
      if (t >= moveEnd) {
        const cp = Math.min(1, (t - moveEnd) / Math.max(1, inst.endMs - moveEnd));
        const r = Math.round(10 + cp * 26);
        setBox(s.ringEl, s.target.y - r, s.target.x - r, r * 2, r * 2);
        s.ringEl.style.opacity = q8((1 - cp) * 0.8);
      } else {
        s.ringEl.style.opacity = "0";
      }
    }
  };
  const applyType = (s, t) => {
    const inst = s.inst;
    const text = inst.text || "";
    let shown;
    if (t < inst.startMs) shown = "";
    else if (t >= inst.endMs) shown = text;
    else {
      const n = Math.round(text.length * Math.min(1, (t - inst.startMs) / Math.max(1, inst.endMs - inst.startMs)));
      shown = text.slice(0, n);
    }
    const typing = t >= inst.startMs && t < inst.endMs;
    const caret = inst.caret !== false && typing && Math.floor(t / 250) % 2 === 0 ? "|" : "";
    if (s.isInput) s.el.value = shown + (caret ? caret : "");
    else s.el.textContent = shown + caret;
  };
  const applyCountUp = (s, t) => {
    const inst = s.inst;
    if (t >= inst.endMs) {
      s.el.textContent = s.original;
      return;
    }
    if (t < inst.startMs) {
      s.el.textContent = fmtNum(inst.from || 0, inst.format || "number");
      return;
    }
    const from = inst.from || 0;
    const v = from + (s.to - from) * ease(Math.min(1, (t - inst.startMs) / Math.max(1, inst.endMs - inst.startMs)));
    s.el.textContent = fmtNum(v, inst.format || "number");
  };
  const applyScrollTo = (s, t) => {
    const inst = s.inst;
    const p = t <= inst.startMs ? 0 : t >= inst.endMs ? 1 : ease((t - inst.startMs) / Math.max(1, inst.endMs - inst.startMs));
    const y = Math.round(s.offset * p);
    s.el.style.transform = y === 0 ? "" : "translateY(" + -y + "px)";
  };
  const applyPopulate = (s, t) => {
    for (let i = 0; i < s.rows.length; i++) {
      const p = (t - (s.inst.startMs + i * (s.inst.stagger || 80))) / s.perRowDur;
      if (p >= 1) {
        s.rows[i].style.opacity = "";
        s.rows[i].style.transform = "";
      } else {
        const e = ease(p);
        s.rows[i].style.opacity = q8(e);
        s.rows[i].style.transform = "translateX(" + Math.round((1 - e) * (s.inst.distancePx || 16)) + "px)";
      }
    }
  };
  const apply = (t) => {
    if (!states) return;
    for (const s of states) {
      if (s.type === "reveal") applyReveal(s, t);
      else if (s.type === "highlight") applyHighlight(s, t);
      else if (s.type === "cursor") applyCursor(s, t);
      else if (s.type === "type") applyType(s, t);
      else if (s.type === "countUp") applyCountUp(s, t);
      else if (s.type === "scrollTo") applyScrollTo(s, t);
      else applyPopulate(s, t);
    }
  };
  const tick = () => {
    if (states === null) {
      const body = document.querySelector("[data-reshot-scene-body='1']");
      if (!body) {
        w.requestAnimationFrame(tick);
        return;
      }
      states = buildStates(body);
    }
    apply(w.performance.now());
    w.requestAnimationFrame(tick);
  };
  w.requestAnimationFrame(tick);
}
var SCENE_MOTION_SOURCE = `(${sceneMotionInPage.toString()})();`;
function buildSceneMotionScript(config) {
  if (!config || config.instructions.length === 0) return "";
  const json = JSON.stringify(config).replace(/<\/(script)/gi, "<\\/$1");
  return `window.__RESHOT_SCENE_MOTION__ = ${json};
${SCENE_MOTION_SOURCE}`;
}
function buildSceneMountScript(artifact) {
  const payload = {
    html: artifact.html,
    scrolls: artifact.scrolls ?? [],
    viewport: artifact.viewport
  };
  const json = JSON.stringify(payload).replace(/<\/(script)/gi, "<\\/$1");
  return `window.__RESHOT_SCENE__ = ${json};
${MOUNT_SCENE_SOURCE}`;
}

// src/primitives/camera-solver.ts
import {
  solveCameraPath
} from "@reshot/motion-core";

// src/timeline/beat-timing.ts
var DEFAULT_DURATION_MS = 1800;
function resolveBeatTiming(at, until, timeline) {
  const startIndex = findTimelineIndex(at, timeline);
  if (startIndex === -1) {
    throw new Error(`Timeline event "${at}" was not found.`);
  }
  const startEvent = timeline[startIndex];
  if (!startEvent) {
    throw new Error(`Timeline event "${at}" was not found.`);
  }
  const startMs = eventTimeMs(startEvent, at);
  const endMs = until ? eventTimeMs(findTimelineEvent(until, timeline), until) : nextEventTimeMs(startIndex, timeline) ?? startMs + DEFAULT_DURATION_MS;
  if (endMs <= startMs) {
    throw new Error(
      `Timeline event "${until ?? "next"}" must be after "${at}".`
    );
  }
  return {
    startMs,
    endMs,
    durationMs: endMs - startMs
  };
}
function findTimelineEvent(key, timeline) {
  const event = timeline[findTimelineIndex(key, timeline)];
  if (!event) {
    throw new Error(`Timeline event "${key}" was not found.`);
  }
  return event;
}
function findTimelineIndex(key, timeline) {
  return timeline.findIndex((event) => eventMatches(event, key));
}
function eventMatches(event, key) {
  return ["id", "name", "type", "key", "label", "slug"].some(
    (field) => event[field] === key
  );
}
function nextEventTimeMs(startIndex, timeline) {
  for (const event of timeline.slice(startIndex + 1)) {
    const time = maybeEventTimeMs(event);
    if (typeof time === "number") return time;
  }
  return void 0;
}
function eventTimeMs(event, key) {
  const time = maybeEventTimeMs(event);
  if (typeof time !== "number") {
    throw new Error(`Timeline event "${key}" is missing a numeric tMs value.`);
  }
  return time;
}
function maybeEventTimeMs(event) {
  for (const field of ["tMs", "timestampMs", "timeMs", "ms"]) {
    const value = event[field];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return void 0;
}

// src/timeline/source-to-frame.ts
var DEFAULT_SOURCE = { width: 1440, height: 900 };
var DEFAULT_FRAME_VIDEO = { width: 1280, height: 800 };
var DEFAULT_FRAME_BAR_H = 36;
function sourceToFrame(rect, source = DEFAULT_SOURCE, frame = DEFAULT_FRAME_VIDEO, barH = DEFAULT_FRAME_BAR_H) {
  const scaleX = frame.width / source.width;
  const scaleY = frame.height / source.height;
  return {
    x: rect.x * scaleX,
    y: barH + rect.y * scaleY,
    w: rect.w * scaleX,
    h: rect.h * scaleY
  };
}

// src/primitives/product-film-utils.ts
var DEFAULT_STAGE = { width: 1440, height: 900 };
function timingFor(at, until, timeline) {
  return resolveBeatTiming(at, until, timeline);
}
function readTargetRect(workflow, target) {
  const value = workflow.targets?.[target];
  if (!isRecord(value)) {
    throw new Error(`Annotation target "${target}" was not found.`);
  }
  const rect = {
    x: numberField(value, "x"),
    y: numberField(value, "y"),
    width: numberField(value, "width") ?? numberField(value, "w"),
    height: numberField(value, "height") ?? numberField(value, "h")
  };
  if (typeof rect.x !== "number" || typeof rect.y !== "number" || typeof rect.width !== "number" || typeof rect.height !== "number") {
    throw new Error(
      `Annotation target "${target}" must include numeric x, y, width/height fields.`
    );
  }
  return rect;
}
function readSourceSize(workflow) {
  return sizeFromUnknown(workflow.source) ?? sizeFromUnknown(workflow.captureSize) ?? DEFAULT_SOURCE;
}
function frameRectFor(rect, source, chrome = "none") {
  const frame = chrome === "none" ? DEFAULT_STAGE : DEFAULT_FRAME_VIDEO;
  return sourceToFrame(
    { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    source,
    frame,
    chrome === "none" ? 0 : DEFAULT_FRAME_BAR_H
  );
}
function fullStageScale(source) {
  return {
    scaleX: DEFAULT_STAGE.width / source.width,
    scaleY: DEFAULT_STAGE.height / source.height
  };
}
function cssPx(value) {
  return `${Math.round(value * 100) / 100}px`;
}
function stableClassPart(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function sizeFromUnknown(value) {
  if (!isRecord(value)) return void 0;
  const width = numberField(value, "width");
  const height = numberField(value, "height");
  if (typeof width !== "number" || typeof height !== "number") return void 0;
  return { width, height };
}
function numberField(value, field) {
  const candidate = value[field];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : void 0;
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}

// src/primitives/camera-solver.ts
var DEFAULT_CAMERA_SOLVER_SETTINGS = {
  mode: "cinematic",
  damping: 0.55,
  padding: 2.4
};
function solveProductFilmCameraPath(steps, workflow, options = {}) {
  const source = readSourceSize(workflow);
  const timedSteps = steps.map((step) => ({
    step,
    timing: timingFor(step.at, step.until, workflow.timeline ?? [])
  }));
  if (timedSteps.length === 0) {
    return { source, timedSteps, solved: [] };
  }
  const solverInput = timedSteps.map(({ step, timing }) => ({
    id: step.id,
    action: step.camera === "wide" ? "navigate" : step.id,
    bounds: targetBoundsForStep(step, workflow, source, options),
    durationMs: Math.max(1, timing.durationMs),
    transitionDurationMs: 0,
    camera: { strategy: cameraStrategy(step.camera) }
  }));
  const solved = solveCameraPath({
    steps: solverInput,
    imageWidth: source.width,
    imageHeight: source.height,
    settings: {
      mode: options.settings?.mode ?? DEFAULT_CAMERA_SOLVER_SETTINGS.mode,
      damping: options.settings?.damping ?? DEFAULT_CAMERA_SOLVER_SETTINGS.damping,
      padding: options.settings?.padding ?? DEFAULT_CAMERA_SOLVER_SETTINGS.padding
    },
    sampleIntervalMs: options.sampleIntervalMs
  });
  return { source, timedSteps, solved };
}
function cameraStrategy(camera) {
  if (camera === "wide") return "wide";
  if (camera === "hold") return "fix";
  return "auto";
}
function targetBoundsForStep(step, workflow, source, options) {
  const target = step.target;
  const shouldReadTarget = typeof target === "string" && step.camera !== "wide" && (step.camera !== "hold" || options.includeHoldTargetBounds === true);
  if (shouldReadTarget) {
    return readTargetRect(workflow, target);
  }
  return { x: 0, y: 0, width: source.width, height: source.height };
}

// src/primitives/scene-camera.ts
function solveSceneCameraPath(steps, workflow, options = {}) {
  const { source, timedSteps, solved } = solveProductFilmCameraPath(
    steps,
    workflow,
    options
  );
  if (timedSteps.length === 0) {
    return { keyframes: [], source };
  }
  const firstStartMs = timedSteps[0]?.timing.startMs ?? 0;
  const keyframes = solved.map((frame) => ({
    tMs: firstStartMs + frame.timeMs,
    x: frame.viewport.x,
    y: frame.viewport.y,
    zoom: frame.viewport.zoom,
    isHardCut: frame.isHardCut
  }));
  return { keyframes, source };
}
function solveSceneCameraFromContext(steps, options) {
  const { workflow } = useWorkflowContext();
  return solveSceneCameraPath(steps, workflow, {
    ...options,
    sampleIntervalMs: options?.sampleIntervalMs ?? 1e3 / 60
  });
}

// src/primitives/scene-motion.ts
function solveSceneMotion(steps, workflow, options = {}) {
  const timeline = workflow.timeline ?? [];
  const instructions = steps.map((step) => {
    const timing = timingFor(step.at, step.until, timeline);
    if (step.type === "highlight") {
      return {
        type: "highlight",
        target: step.target ?? "auto",
        startMs: timing.startMs,
        endMs: timing.endMs,
        walk: step.walk ?? true,
        rows: Math.max(1, step.rows ?? 8),
        padPx: Math.max(0, step.padPx ?? 6)
      };
    }
    if (step.type === "cursor") {
      return {
        type: "cursor",
        to: step.to ?? "auto",
        startMs: timing.startMs,
        endMs: timing.endMs,
        click: step.click ?? true,
        fromXFrac: step.from?.x ?? 0.5,
        fromYFrac: step.from?.y ?? 0.92
      };
    }
    if (step.type === "type") {
      return {
        type: "type",
        target: step.target ?? "auto",
        startMs: timing.startMs,
        endMs: timing.endMs,
        text: step.text ?? "",
        caret: step.caret ?? true
      };
    }
    if (step.type === "countUp") {
      return {
        type: "countUp",
        target: step.target ?? "auto",
        startMs: timing.startMs,
        endMs: timing.endMs,
        from: step.from ?? 0,
        to: step.to ?? null,
        format: step.format ?? "number"
      };
    }
    if (step.type === "scrollTo") {
      return {
        type: "scrollTo",
        target: step.target ?? "auto",
        to: step.to ?? null,
        startMs: timing.startMs,
        endMs: timing.endMs
      };
    }
    if (step.type === "populate") {
      return {
        type: "populate",
        target: step.target ?? "auto",
        startMs: timing.startMs,
        endMs: timing.endMs,
        stagger: Math.max(0, step.stagger ?? 80),
        distancePx: Math.max(0, step.distancePx ?? 16),
        max: Math.max(1, step.max ?? 12)
      };
    }
    return {
      type: "reveal",
      target: step.target ?? "auto",
      startMs: timing.startMs,
      endMs: timing.endMs,
      stagger: Math.max(0, step.stagger ?? options.defaultStagger ?? 80),
      distancePx: Math.max(0, step.distancePx ?? options.defaultDistancePx ?? 12),
      max: Math.max(1, step.max ?? options.defaultMax ?? 12)
    };
  });
  return { instructions };
}
function solveSceneMotionFromContext(steps, options) {
  const { workflow } = useWorkflowContext();
  return solveSceneMotion(steps, workflow, options);
}

// src/primitives/Scene.tsx
function Scene({
  artifact,
  chrome = "none",
  url = "app.reshot.dev",
  camera,
  cameraOptions,
  motion,
  motionOptions,
  children
}) {
  const showChrome = chrome !== "none";
  const mountScript = buildSceneMountScript(artifact);
  const cameraPath = camera && camera.length > 0 ? solveSceneCameraFromContext(camera, cameraOptions) : void 0;
  const cameraScript = buildSceneCameraScript(cameraPath);
  const motionConfig = motion && motion.length > 0 ? solveSceneMotionFromContext(motion, motionOptions) : void 0;
  const motionScript = buildSceneMotionScript(motionConfig);
  return /* @__PURE__ */ jsxs("div", { className: `reshot-frame reshot-frame--${chrome}`, "data-product-surface": "true", children: [
    showChrome ? /* @__PURE__ */ jsxs("div", { className: "reshot-frame__chrome", children: [
      /* @__PURE__ */ jsxs("div", { className: "reshot-frame__traffic", "aria-hidden": "true", children: [
        /* @__PURE__ */ jsx("span", {}),
        /* @__PURE__ */ jsx("span", {}),
        /* @__PURE__ */ jsx("span", {})
      ] }),
      /* @__PURE__ */ jsx("div", { className: "reshot-frame__url", children: url })
    ] }) : null,
    /* @__PURE__ */ jsxs("div", { className: "reshot-frame__viewport", children: [
      /* @__PURE__ */ jsx("style", { children: ".reshot-frame__media-layer--scene{will-change:auto}" }),
      /* @__PURE__ */ jsxs("div", { className: "reshot-frame__media-layer reshot-frame__media-layer--scene", children: [
        /* @__PURE__ */ jsx(
          "div",
          {
            className: SCENE_ROOT_CLASS,
            "data-reshot-scene": "1",
            "aria-hidden": "true"
          }
        ),
        /* @__PURE__ */ jsx("script", { children: mountScript }),
        cameraScript ? /* @__PURE__ */ jsx("script", { children: cameraScript }) : null,
        motionScript ? /* @__PURE__ */ jsx("script", { children: motionScript }) : null
      ] }),
      /* @__PURE__ */ jsx("div", { className: "reshot-frame__overlays", children })
    ] })
  ] });
}

// src/primitives/Annotation.tsx
var ANNOTATION_IN_MS = 180;
var ANNOTATION_OUT_MS = 140;
function Annotation({
  at,
  until,
  target,
  edge,
  chrome = "none",
  tone = "neutral",
  label,
  children
}) {
  if (!target && !edge) {
    throw new Error("Annotation requires either a target or an explicit edge placement.");
  }
  const { workflow } = useWorkflowContext();
  const timing = timingFor(at, until, workflow.timeline ?? []);
  const className = `reshot-annotation-timing-${stableClassPart(
    target ?? edge ?? at
  )}-${stableClassPart(at)}`;
  const content = children ?? label;
  const timingStyle = /* @__PURE__ */ jsx("style", { children: `
.${className} {
  animation:
    annotationIn ${ANNOTATION_IN_MS}ms ${timing.startMs}ms ease-out forwards,
    annotationOut ${ANNOTATION_OUT_MS}ms ${timing.endMs}ms ease-in forwards;
}
` });
  if (target) {
    const source = readSourceSize(workflow);
    const frameRect = frameRectFor(readTargetRect(workflow, target), source, chrome);
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      timingStyle,
      /* @__PURE__ */ jsxs(
        "div",
        {
          className: `reshot-annotation reshot-annotation--${tone} ${className}`,
          "data-annotation-target": target,
          style: {
            left: cssPx(frameRect.x),
            top: cssPx(frameRect.y),
            width: cssPx(frameRect.w),
            height: cssPx(frameRect.h)
          },
          children: [
            /* @__PURE__ */ jsx("span", { className: "reshot-annotation__ring" }),
            content ? /* @__PURE__ */ jsx("span", { className: "reshot-annotation__label", children: content }) : null
          ]
        }
      )
    ] });
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    timingStyle,
    /* @__PURE__ */ jsx(
      "div",
      {
        className: `reshot-annotation reshot-annotation--edge reshot-annotation--${tone} ${className}`,
        "data-annotation-edge": edge,
        style: edgeStyle(edge),
        children: content ? /* @__PURE__ */ jsx("span", { className: "reshot-annotation__label", children: content }) : null
      }
    )
  ] });
}
function edgeStyle(edge) {
  const inset = "20px";
  switch (edge) {
    case "top-right":
      return { top: inset, right: inset };
    case "bottom-left":
      return { bottom: inset, left: inset };
    case "bottom-right":
      return { bottom: inset, right: inset };
    case "top-left":
    default:
      return { top: inset, left: inset };
  }
}

// src/primitives/FocusPath.tsx
function FocusPath({ steps, className }) {
  const { workflow, slug } = useWorkflowContext();
  const focusClass = className ?? `reshot-focus-${stableClassPart(slug)}-${steps.length}`;
  const { source, timedSteps, solved } = solveProductFilmCameraPath(
    steps,
    workflow,
    { includeHoldTargetBounds: true }
  );
  if (timedSteps.length === 0) {
    return /* @__PURE__ */ jsx("div", { "data-focus-path": focusClass, hidden: true });
  }
  const firstStartMs = timedSteps[0]?.timing.startMs ?? 0;
  const totalMs = Math.max(
    1,
    timedSteps[timedSteps.length - 1]?.timing.endMs ?? workflow.durationMs ?? 1
  );
  const keyframes = solved.map((frame) => {
    const absoluteMs = firstStartMs + frame.timeMs;
    const percent = Math.max(0, Math.min(100, absoluteMs / totalMs * 100));
    return `${percent.toFixed(3)}% { transform: ${transformFor(
      frame.viewport.x,
      frame.viewport.y,
      frame.viewport.zoom,
      source.width,
      source.height
    )}; }`;
  }).join("\n");
  const firstTransform = solved[0] ? transformFor(
    solved[0].viewport.x,
    solved[0].viewport.y,
    solved[0].viewport.zoom,
    source.width,
    source.height
  ) : "translate(0px, 0px) scale(1)";
  const last = solved[solved.length - 1];
  const lastTransform = last ? transformFor(
    last.viewport.x,
    last.viewport.y,
    last.viewport.zoom,
    source.width,
    source.height
  ) : firstTransform;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("style", { children: `
.${focusClass} .reshot-frame__media-layer,
.${focusClass} .reshot-frame__overlays {
  transform: ${firstTransform};
  animation: ${focusClass}-camera ${totalMs}ms linear forwards;
}
@keyframes ${focusClass}-camera {
0% { transform: ${firstTransform}; }
${keyframes}
100% { transform: ${lastTransform}; }
}
` }),
    /* @__PURE__ */ jsx("div", { "data-focus-path": focusClass, hidden: true })
  ] });
}
function transformFor(x, y, zoom, sourceWidth, sourceHeight) {
  const { scaleX, scaleY } = fullStageScale({
    width: sourceWidth,
    height: sourceHeight
  });
  const tx = Math.round(-x * scaleX * zoom * 100) / 100;
  const ty = Math.round(-y * scaleY * zoom * 100) / 100;
  const roundedZoom = Math.round(zoom * 1e3) / 1e3;
  return `translate(${tx}px, ${ty}px) scale(${roundedZoom})`;
}

// src/primitives/ProductFilm.tsx
function ProductFilm({
  src,
  url,
  chrome = "none",
  fit = "contain",
  steps,
  children
}) {
  const { slug } = useWorkflowContext();
  const focusClass = `reshot-product-film-${stableClassPart(slug)}`;
  const annotations = steps.filter((step) => step.target && step.label).map((step) => /* @__PURE__ */ jsx(
    Annotation,
    {
      at: step.at,
      until: step.until,
      target: step.target,
      chrome,
      tone: step.tone,
      children: step.label
    }
  ));
  return /* @__PURE__ */ jsx("div", { className: `reshot-product-film ${focusClass}`, children: /* @__PURE__ */ jsxs(Frame, { chrome, url, src, fit, children: [
    /* @__PURE__ */ jsx(FocusPath, { steps, className: focusClass }),
    annotations,
    children
  ] }) });
}
export {
  Annotation,
  Composition,
  DEFAULT_FRAME_BAR_H,
  DEFAULT_FRAME_VIDEO,
  DEFAULT_SOURCE,
  FocusPath,
  Fragment,
  Frame,
  ProductFilm,
  Scene,
  buildSceneCameraScript,
  buildSceneMotionScript,
  compile,
  compileToHtml,
  getWorkflowContext,
  jsx,
  jsxDEV,
  jsxs,
  resolveBeatTiming,
  solveSceneCameraFromContext,
  solveSceneCameraPath,
  solveSceneMotion,
  solveSceneMotionFromContext,
  sourceToFrame,
  useWorkflowContext
};
//# sourceMappingURL=index.mjs.map