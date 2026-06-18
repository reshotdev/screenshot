// Phase 5 auto-update — the refresh orchestrator (the differentiator).
//
// For each composition with a stored spec: recapture its source screen, run the
// calibrated capture-time gate, and decide vs the prior accepted render's
// structure signature:
//   - skip   : recapture is reference-identical (idempotent no-op).
//   - publish: data changed, still eligible + structure-stable + reconstruction
//              within the calibrated bar -> re-render + upload AUTO-APPROVED;
//              compositions.live_render_id advances; reference frame advances.
//   - flag   : redesign / lost eligibility / unfaithful reconstruction -> upload
//              as PENDING (the existing route enqueues a COMPOSITION review item);
//              live_render_id and the accepted reference are left UNCHANGED.
//
// The publish/flag mechanics reuse the existing compositions upload route
// (auto_approve toggles APPROVED+live-swap vs PENDING+review-item) and the
// existing composition-review queue — Phase 5 feeds them, it does not replace
// them. All injected deps are overridable for tests/capstones.

const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const fs = require("fs-extra");
const compose = require("../../commands/compose");
const apiClient = require("../api-client");
const specStore = require("./spec");
const { composeDistDir } = require("../compose-runtime");

// The Phase 4 <Scene> render template — one template serves every eligible
// composition; the authored camera + captured artifact arrive via env/sidecar.
const SCENE_TEMPLATE = path.resolve(__dirname, "scene-runtime.compose.tsx");

// Load the ESM build via dynamic import: pixelmatch v7 (used by the verify diff)
// is ESM-only and its default export does not survive the bundled CJS interop, so
// the .mjs is the reliable entrypoint even from this CommonJS module.
async function loadAutoUpdate() {
  return import(pathToFileURL(path.join(composeDistDir(), "auto-update.mjs")).href);
}

function captureSettings(spec) {
  const v = spec.source && spec.source.viewport;
  if (!v) return undefined;
  return {
    width: v.width,
    height: v.height,
    deviceScaleFactor: v.deviceScaleFactor || 2,
  };
}

// Load compose's published render + capture entrypoints as ESM (same reason as
// loadAutoUpdate: the .mjs build is the reliable cross-interop entrypoint).
async function loadComposeScene() {
  const composeDist = composeDistDir();
  const render = await import(pathToFileURL(path.join(composeDist, "render.mjs")).href);
  const capture = await import(pathToFileURL(path.join(composeDist, "capture.mjs")).href);
  return { render: render.render, writeArtifact: capture.writeArtifact };
}

// A composition renders as a crisp <Scene> only when (a) it explicitly opted in
// with an authored camera (`spec.scene.camera`) and/or in-scene motion
// (`spec.scene.motion`), AND (b) the live evaluation routed this recapture to
// "reconstruction" (eligible + within the calibrated bar), AND (c) we actually
// captured the DOM artifact this run, AND (d) — for MOTION, which binds to anchors —
// the recapture is still `animatable` (anchors stable). Any miss → video. This is
// the fail-safe seam: a drifted/ineligible screen never animates the wrong elements.
function sceneEligible(spec, evaluation) {
  if (!spec || !spec.scene || !evaluation || !evaluation.snapshot) return false;
  if (!evaluation.decision || evaluation.decision.route !== "reconstruction") return false;
  const hasCamera = Array.isArray(spec.scene.camera) && spec.scene.camera.length > 0;
  const hasMotion = Array.isArray(spec.scene.motion) && spec.scene.motion.length > 0;
  if (!hasCamera && !hasMotion) return false;
  // Anchor-stability fail-safe: authored motion binds to the screen's anchors, so a
  // recapture whose anchors drifted (classification.animatable === false) must NOT
  // be animated — route to video. Camera-only comps don't bind to anchors → exempt.
  if (hasMotion && evaluation.classification && evaluation.classification.animatable === false) return false;
  return true;
}

function restoreEnv(key, prev) {
  if (prev === undefined) delete process.env[key];
  else process.env[key] = prev;
}

// Render the recaptured DOM artifact as a vector-crisp <Scene> driven by the
// composition's authored camera move, through the published Phase 1 pipeline.
async function renderScene(spec, evaluation, deps = {}) {
  const { render, writeArtifact } = deps.composeScene || (await loadComposeScene());
  const v = (spec.source && spec.source.viewport) || (spec.scene && spec.scene.viewport) || {};
  const dpr = v.deviceScaleFactor || 2;
  const viewport = {
    width: v.width || evaluation.snapshot.viewport?.width,
    height: v.height || evaluation.snapshot.viewport?.height,
  };
  const durationMs = spec.scene.durationMs || 2200;

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `reshot-scene-${spec.compositionId}-`));
  const { html: artifactPath } = await writeArtifact(evaluation.snapshot, path.join(tmp, "scene"));
  const demoPath = path.join(tmp, "scene.demo.json");
  await fs.writeFile(
    demoPath,
    JSON.stringify({
      viewport,
      durationMs,
      scrolls: evaluation.snapshot.scrolls || [],
      timeline: spec.scene.timeline,
      targets: spec.scene.targets,
      camera: spec.scene.camera,
      cameraOptions: spec.scene.cameraOptions,
      motion: spec.scene.motion,
      motionOptions: spec.scene.motionOptions,
    }),
    "utf8",
  );

  const prevArtifact = process.env.RESHOT_SCENE_ARTIFACT;
  const prevDemo = process.env.RESHOT_SCENE_DEMO;
  process.env.RESHOT_SCENE_ARTIFACT = artifactPath;
  process.env.RESHOT_SCENE_DEMO = demoPath;
  try {
    const result = await render(SCENE_TEMPLATE, {
      out: spec.outBase,
      slug: spec.slug,
      size: { width: viewport.width, height: viewport.height },
      durationMs,
      deviceScaleFactor: dpr,
      formats: ["mp4", "webm", "poster"],
    });
    return result.pack || {};
  } finally {
    restoreEnv("RESHOT_SCENE_ARTIFACT", prevArtifact);
    restoreEnv("RESHOT_SCENE_DEMO", prevDemo);
  }
}

// The existing video render path (a captured-video <Frame> composition).
async function renderVideo(spec) {
  if (!spec.composePath) {
    throw new Error(`Composition ${spec.compositionId} spec has no composePath to re-render`);
  }
  const v = spec.source && spec.source.viewport;
  const size = v ? { width: v.width, height: v.height } : undefined;
  const result = await compose.runCompose(spec.composePath, {
    out: spec.outBase,
    size: size ? `${size.width}x${size.height}` : undefined,
  });
  return result.pack || {};
}

// Phase 4 flip: render eligible compositions as a crisp <Scene>, with the video
// render as the guaranteed fallback. A scene render that throws OR produces no clip
// silently degrades to video — "on any doubt, route to video; never ship a broken
// or blurry clip as crisp."
async function defaultRender(spec, deps = {}, evaluation = null) {
  const renderSceneFn = deps.renderScene || renderScene;
  const renderVideoFn = deps.renderVideo || renderVideo;
  if (sceneEligible(spec, evaluation)) {
    try {
      const pack = await renderSceneFn(spec, evaluation, deps);
      if (pack && (pack.mp4 || pack.webm)) return pack;
      console.warn(
        `[auto-update] scene render produced no clip for ${spec.compositionId}; routing to video fallback`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[auto-update] scene render failed for ${spec.compositionId}; routing to video fallback: ${message}`,
      );
    }
  }
  return renderVideoFn(spec);
}

// Reconciliation (handoff Task C, Option A): the platform's live_render_id is the
// source of truth for what is published. When a human approves a previously
// FLAGGED candidate in the dashboard, the platform advances live_render_id but our
// local spec still carries the stale `pendingFlag` — so without this the loop would
// keep returning "awaiting human review" forever (refreshComposition's flag-dedup),
// and the composition's baseline would never advance. `fetchLiveState` reads the
// composition's current live_render_id + render statuses so each run can adopt an
// out-of-band human decision before deciding.
async function defaultFetchLiveState(spec, deps = {}) {
  const apiBaseUrl = deps.apiBaseUrl || apiClient.getApiBaseUrl();
  const apiKey =
    process.env.RESHOT_API_KEY ||
    compose.resolveComposeProjectContext({ projectOption: spec.projectId }).apiKey;
  const headers = { authorization: `Bearer ${apiKey}` };
  const compsRes = await fetch(`${apiBaseUrl}/projects/${spec.projectId}/compositions`, { headers });
  const comps = (await compsRes.json()).compositions || [];
  const liveRenderId = comps.find((c) => c.id === spec.compositionId)?.live_render_id || null;
  const rendersRes = await fetch(
    `${apiBaseUrl}/projects/${spec.projectId}/compositions/${spec.compositionId}/renders`,
    { headers },
  );
  const renders = (await rendersRes.json()).renders || [];
  return { liveRenderId, renders: renders.map((r) => ({ id: r.id, status: r.status })) };
}

// Adopt an out-of-band human decision recorded on the platform. Returns a mode tag
// when it adopted (so the summary can report it), or null when there was nothing to
// reconcile. Adopting means: make the now-live structure the accepted baseline
// (advance reference.signature + reference frame to the current recapture) and clear
// the outstanding flag, so the very next decision is a clean skip rather than a
// perpetual "awaiting human review".
async function reconcilePendingFlag(spec, evaluation, deps, now) {
  if (!spec.pendingFlag) return null;
  const fetchLiveState = deps.fetchLiveState || defaultFetchLiveState;
  let state;
  try {
    state = await fetchLiveState(spec, deps);
  } catch {
    // Reconciliation is best-effort: if the platform is unreachable we fall back
    // to the existing fail-safe flag-dedup (no bad publish, just no adoption).
    return null;
  }
  if (!state) return null;

  const flagged = (state.renders || []).find((r) => r.id === spec.pendingFlag.renderId);
  const humanApproved = flagged && flagged.status === "APPROVED";
  const liveIsFlagged = state.liveRenderId && state.liveRenderId === spec.pendingFlag.renderId;

  if (humanApproved || liveIsFlagged) {
    spec.reference = {
      signature: spec.pendingFlag.signature,
      capturedAt: now,
      adoptedFrom: "human-approval",
      adoptedRenderId: spec.pendingFlag.renderId,
    };
    spec.liveRenderId = state.liveRenderId || spec.pendingFlag.renderId;
    spec.pendingFlag = null;
    if (evaluation.remountPng) {
      await specStore.writeReferencePng(spec.compositionId, evaluation.remountPng);
    }
    await specStore.writeSpec(spec);
    return { mode: "human-approval", liveRenderId: spec.liveRenderId };
  }
  return null;
}

async function defaultUpload(spec, pack, { autoApprove }) {
  const ctx = await compose.resolveComposeContext(spec.composePath, {});
  const apiBaseUrl = apiClient.getApiBaseUrl();
  const apiKey =
    process.env.RESHOT_API_KEY ||
    (compose.resolveComposeProjectContext({ projectOption: spec.projectId }).apiKey);
  return compose.uploadComposition({
    apiBaseUrl,
    apiKey,
    projectId: spec.projectId,
    name: spec.name || compose.deriveSlug(spec.composePath),
    slug: spec.slug || ctx.slug,
    sourceTsx: await fs.readFile(ctx.compositionPath, "utf8"),
    metadataJson: await fs.readFile(ctx.metadataPath, "utf8"),
    pack,
    autoApprove,
  });
}

async function refreshComposition(spec, deps = {}) {
  const au = deps.autoUpdate || (await loadAutoUpdate());
  const evaluate = deps.evaluate || au.evaluateUrl;
  const render = deps.render || defaultRender;
  const upload = deps.upload || defaultUpload;
  const now = new Date().toISOString();

  // Re-resolve auth each run (sessions/demo state may rotate) so the loop can
  // recapture authenticated /app screens, not just public pages.
  const storageState = await resolveStorageState(spec.source && spec.source.auth, spec.source.url, deps);
  const evaluation = await evaluate(spec.source.url, { settings: captureSettings(spec), storageState });

  // Reconcile any out-of-band human decision (Task C): if the previously-flagged
  // candidate was approved in the dashboard, adopt it as the new baseline BEFORE
  // deciding — otherwise the flag-dedup below would loop "awaiting human review"
  // forever and this composition's baseline would never advance again.
  const reconciled = await reconcilePendingFlag(spec, evaluation, deps, now);

  // Did the source screen change vs the accepted reference frame?
  let refDiff = null;
  let changed = true;
  const referencePng = await specStore.readReferencePng(spec.compositionId);
  if (referencePng && evaluation.remountPng) {
    refDiff = au.diffImages(au.decodePng(evaluation.remountPng), au.decodePng(referencePng));
    changed = !au.isUnchanged(refDiff);
  }

  const decision = au.decideUpdate({
    prevSignature: (spec.reference && spec.reference.signature) || null,
    evaluation,
    changed,
  });

  const summary = {
    compositionId: spec.compositionId,
    slug: spec.slug,
    route: evaluation.decision.route,
    eligible: decision.eligible,
    qualityPass: decision.qualityPass,
    structureStable: decision.structureStable,
    metrics: decision.metrics,
    referenceDiffPct: refDiff ? refDiff.pixelDiffPct : null,
    reason: decision.reason,
    reconciled: reconciled ? reconciled.mode : null,
  };

  if (decision.action === "skip") {
    return { ...summary, action: "skip", rendered: false, reviewItemCreated: false };
  }

  // Flag idempotence: the same outstanding redesign is not re-flagged while a
  // human review is still pending for it.
  if (
    decision.action === "flag" &&
    spec.pendingFlag &&
    au.signatureSimilarity(spec.pendingFlag.signature, decision.signature) >= au.STRUCTURE_STABLE_MIN
  ) {
    return {
      ...summary,
      action: "skip",
      rendered: false,
      reviewItemCreated: false,
      reason: "already flagged; awaiting human review (idempotent)",
    };
  }

  // Clean-data publish sub-gate (Phase 4.6): never AUTO-PUBLISH a clip whose
  // captured screen carries messy/empty/placeholder data or leaked PII. Only the
  // PUBLISH (auto-approve) path is gated — flags still go to human review — and only
  // when we have a snapshot (reconstruction-eligible) and the comp didn't disable it.
  // A dirty screen → SKIP (keep the last good clip live, reference unchanged): never
  // render or upload a dirty clip. The guard surfaces dirty data; it does not fix it.
  if (
    decision.action === "publish" &&
    evaluation.snapshot &&
    !(spec.cleanData && spec.cleanData.disabled)
  ) {
    const guard = deps.checkCleanData || au.checkCleanData;
    if (typeof guard === "function") {
      const cleanData = guard({ html: evaluation.snapshot.html }, (spec.cleanData && spec.cleanData.config) || {});
      if (cleanData && !cleanData.clean) {
        return {
          ...summary,
          action: "skip",
          rendered: false,
          reviewItemCreated: false,
          reason: `clean-data guard: ${cleanData.reasons.join("; ")}`,
        };
      }
    }
  }

  const pack = await render(spec, deps, evaluation);
  const uploaded = await upload(spec, pack, { autoApprove: decision.action === "publish" }, deps);
  const renderId = (uploaded && (uploaded.render?.id || uploaded.render_id)) || null;

  if (decision.action === "publish") {
    if (evaluation.remountPng) {
      await specStore.writeReferencePng(spec.compositionId, evaluation.remountPng);
    }
    spec.reference = { signature: decision.signature, capturedAt: now };
    spec.pendingFlag = null;
    spec.liveRenderId = renderId || spec.liveRenderId || null;
    await specStore.writeSpec(spec);
    return {
      ...summary,
      action: "publish",
      rendered: true,
      reviewItemCreated: false,
      renderId,
      liveRenderId: spec.liveRenderId,
    };
  }

  // flag
  spec.pendingFlag = { signature: decision.signature, renderId, flaggedAt: now };
  await specStore.writeSpec(spec);
  return {
    ...summary,
    action: "flag",
    rendered: true,
    reviewItemCreated: true,
    renderId,
  };
}

// Validate a scene config (the `spec.scene` that makes the loop render a crisp
// <Scene>+motion clip instead of the video fallback). Pure → unit-testable. Needs a
// non-empty camera and/or motion array (else sceneEligible falls back to video).
function validateSceneConfig(scene) {
  if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
    throw new Error("scene config must be a JSON object");
  }
  const hasCamera = Array.isArray(scene.camera) && scene.camera.length > 0;
  const hasMotion = Array.isArray(scene.motion) && scene.motion.length > 0;
  if (!hasCamera && !hasMotion) {
    throw new Error("scene config needs a non-empty `camera` and/or `motion` array (else the loop renders video)");
  }
  const MOTION_TYPES = new Set(["reveal", "highlight", "cursor"]);
  for (const step of scene.motion || []) {
    if (!step || !MOTION_TYPES.has(step.type)) {
      throw new Error(`scene motion step has invalid type ${JSON.stringify(step && step.type)} (expected reveal|highlight|cursor)`);
    }
    if (!step.at) throw new Error(`scene motion step ${JSON.stringify(step.id || "?")} is missing "at"`);
  }
  for (const step of scene.camera || []) {
    if (!step || !step.at) throw new Error(`scene camera step ${JSON.stringify((step && step.id) || "?")} is missing "at"`);
  }
  return scene;
}

// Attach/update the scene config on an ALREADY-enrolled composition, so the loop
// renders it as a crisp <Scene>+motion clip. Use after --register (or to iterate on
// the motion) without recapturing the baseline.
async function setScene(compositionId, scene) {
  if (!compositionId) throw new Error("--set-scene requires --composition <id>");
  const validated = validateSceneConfig(scene);
  let spec;
  try {
    spec = await specStore.readSpec(compositionId);
  } catch {
    spec = null;
  }
  if (!spec) throw new Error(`No spec for composition ${compositionId} — enroll it with --register first.`);
  spec.scene = validated;
  await specStore.writeSpec(spec);
  return { compositionId, updated: true, mode: validated.motion ? "scene+motion" : "scene" };
}

// Build a Playwright storageState (cookies + per-origin localStorage) so the capture
// pipeline can reach authenticated /app screens. Stored on the spec as `source.auth`
// and re-resolved on every recapture, so the daily loop stays authenticated too.
// Modes:
//   { mode: "demo-bootstrap", bootstrapUrl?, email? } — POST the demo bootstrap and
//      synthesize the demo session (turnkey for local/seeded dev).
//   { mode: "storage-state", path } — load a Playwright storageState JSON exported
//      from a real session (the production-grade path).
async function resolveStorageState(auth, sourceUrl, deps = {}) {
  if (!auth || !auth.mode) return undefined;
  if (auth.mode === "storage-state") {
    if (!auth.path) throw new Error("auth.mode 'storage-state' requires a path");
    return JSON.parse(await fs.readFile(auth.path, "utf8"));
  }
  if (auth.mode === "demo-bootstrap") {
    const doFetch = deps.fetch || globalThis.fetch;
    if (!doFetch) throw new Error("global fetch unavailable (need Node 18+) for demo-bootstrap auth");
    const parsed = new URL(sourceUrl);
    const bootstrapUrl = auth.bootstrapUrl || `${parsed.origin}/api/internal/demo/bootstrap`;
    const email = auth.email || "demo@example.com";
    const resp = await doFetch(bootstrapUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!resp.ok) {
      throw new Error(`demo bootstrap failed: HTTP ${resp.status} at ${bootstrapUrl} (is the seeded app running?)`);
    }
    const state = (await resp.json()).data;
    const authStateCache = JSON.stringify({
      data: {
        user: {
          id: state.user.id, email: state.user.email, fullName: state.user.fullName,
          workspaceId: state.workspace.id, workspace: state.workspace, role: "OWNER",
          onboardingStatus: "COMPLETED",
        },
        isAuthenticated: true,
        needsOnboarding: false,
        workspaces: [{ ...state.workspace, role: "OWNER" }],
      },
      timestamp: Date.now(),
    });
    const cookie = (name, value) => ({
      name, value, domain: parsed.hostname, path: "/", expires: -1, httpOnly: false, secure: parsed.protocol === "https:", sameSite: "Lax",
    });
    return {
      cookies: [cookie("test-user-email", state.user.email), cookie("reshot-demo-mode", "true")],
      origins: [
        {
          origin: parsed.origin,
          localStorage: [
            { name: "reshot-demo-mode", value: "true" },
            { name: "auth_state_cache", value: authStateCache },
          ],
        },
      ],
    };
  }
  throw new Error(`unknown auth.mode: ${JSON.stringify(auth.mode)} (expected demo-bootstrap | storage-state)`);
}

// Enroll an existing composition into the auto-update loop: capture its source
// screen once to record the accepted baseline (structure signature + reference
// frame), and persist the spec so future `reshot refresh` runs are reproducible.
// The spec/`spec.js` error message references `--register`; this is it.
// `scene` (optional) attaches the crisp <Scene>+motion render config at enroll time.
// `auth` (optional) lets the capture reach authenticated screens (see resolveStorageState).
async function registerComposition(
  { compositionId, projectId, url, viewport, composePath, slug, name, outBase, scene, auth } = {},
  deps = {},
) {
  if (!compositionId) throw new Error("--register requires --composition <id>");
  if (!projectId) throw new Error("--register requires --project <id> (or RESHOT_PROJECT_ID)");
  if (!url) throw new Error("--register requires --url <sourceScreenUrl>");

  const au = deps.autoUpdate || (await loadAutoUpdate());
  const evaluate = deps.evaluate || au.evaluateUrl;
  const settings = viewport
    ? { width: viewport.width, height: viewport.height, deviceScaleFactor: viewport.deviceScaleFactor || 2 }
    : undefined;

  const storageState = await resolveStorageState(auth, url, deps);
  const evaluation = await evaluate(url, { settings, storageState });
  if (!evaluation.classification.eligible) {
    throw new Error(
      `Source screen is not reconstruction-eligible, cannot enroll: ${evaluation.classification.reasons.join("; ")}` +
        (auth ? "" : " (if this is an authenticated screen, pass --demo-auth or --storage-state)"),
    );
  }

  const spec = {
    compositionId,
    projectId,
    slug,
    name,
    composePath,
    outBase,
    source: { url, viewport: settings, ...(auth ? { auth } : {}) },
    reference: { signature: au.structureSignature(evaluation.classification), capturedAt: new Date().toISOString() },
    pendingFlag: null,
  };
  if (scene !== undefined) spec.scene = validateSceneConfig(scene);
  await specStore.writeSpec(spec);
  if (evaluation.remountPng) await specStore.writeReferencePng(compositionId, evaluation.remountPng);

  return {
    compositionId,
    slug,
    registered: true,
    route: evaluation.decision.route,
    eligible: evaluation.classification.eligible,
    quality: evaluation.quality,
    signature: spec.reference.signature,
    render: spec.scene ? (spec.scene.motion ? "scene+motion" : "scene") : "video (no --scene)",
  };
}

async function refresh({ compositionId, projectId } = {}, deps = {}) {
  let specs;
  if (compositionId) {
    specs = [await specStore.readSpec(compositionId)];
  } else {
    specs = await specStore.listSpecs(projectId);
  }

  const summaries = [];
  for (const spec of specs) {
    // Fail-safe per-composition isolation: one screen that fails to capture or
    // upload must NOT abort a project-wide CI run, and must never touch the live
    // clip. Record the error and carry on (handoff §5 — a wrong "publish" ships a
    // broken demo; doing nothing is always safe).
    try {
      summaries.push(await refreshComposition(spec, deps));
    } catch (error) {
      summaries.push({
        compositionId: spec.compositionId,
        slug: spec.slug,
        action: "error",
        rendered: false,
        reviewItemCreated: false,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    summaries,
    rendersCreated: summaries.filter((s) => s.rendered).length,
    reviewItemsCreated: summaries.filter((s) => s.reviewItemCreated).length,
    published: summaries.filter((s) => s.action === "publish").length,
    flagged: summaries.filter((s) => s.action === "flag").length,
    skipped: summaries.filter((s) => s.action === "skip").length,
    errors: summaries.filter((s) => s.action === "error").length,
  };
}

module.exports = {
  refresh,
  refreshComposition,
  registerComposition,
  validateSceneConfig,
  setScene,
  defaultRender,
  renderScene,
  renderVideo,
  sceneEligible,
  defaultUpload,
  defaultFetchLiveState,
  reconcilePendingFlag,
  loadAutoUpdate,
  captureSettings,
  resolveStorageState,
};
