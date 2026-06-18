const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");

const {
  refreshComposition,
  refresh,
  defaultRender,
  sceneEligible,
  validateSceneConfig,
  setScene,
  registerComposition,
} = require("../../src/lib/auto-update/refresh");
const specStore = require("../../src/lib/auto-update/spec");

// Deterministic, browser-free harness: inject a fake compose/auto-update module
// plus fake evaluate/render/upload so the orchestrator's publish/flag/skip and
// idempotence logic is exercised without a browser or platform.
function fakeAu({ decision }) {
  return {
    STRUCTURE_STABLE_MIN: 0.8,
    decodePng: (b) => b,
    diffImages: (_a, _b) => ({ pixelDiffPct: 2.5, ssim: 0.98 }),
    isUnchanged: (diff) => diff.pixelDiffPct <= 0.05,
    signatureSimilarity: (a, b) => (JSON.stringify(a) === JSON.stringify(b) ? 1 : 0),
    decideUpdate: ({ changed }) => {
      if (!changed) {
        return {
          action: "skip",
          reason: "reference-identical",
          signature: decision.signature,
          changed,
          eligible: true,
          qualityPass: true,
          structureStable: true,
          metrics: { pixelDiffPct: 0.01, ssim: 1 },
        };
      }
      return { ...decision, changed };
    },
  };
}

const baseSpec = () => ({
  compositionId: "comp-1",
  projectId: "proj-1",
  slug: "projects",
  name: "Projects",
  composePath: "/tmp/projects.compose.tsx",
  source: { url: "http://localhost:3000/app/projects", viewport: { width: 900, height: 600, deviceScaleFactor: 2 } },
  reference: { signature: { shapes: ["table@table.projects"], anchors: ["td.cell"], formFields: 0, eligible: true }, capturedAt: "t0" },
  pendingFlag: null,
});

let tmpDir;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "phase5-spec-"));
  process.env.RESHOT_AUTO_UPDATE_DIR = tmpDir;
});
afterEach(async () => {
  delete process.env.RESHOT_AUTO_UPDATE_DIR;
  await fs.remove(tmpDir);
});

function deps(au, calls) {
  return {
    autoUpdate: au,
    evaluate: async () => ({ remountPng: Buffer.from("new"), decision: { route: "reconstruction" } }),
    render: async () => {
      calls.rendered += 1;
      return { mp4: "/tmp/x.mp4" };
    },
    upload: async (_spec, _pack, { autoApprove }) => {
      calls.uploaded += 1;
      calls.autoApprove = autoApprove;
      return { render: { id: "render-new" } };
    },
  };
}

describe("refreshComposition — publish/flag/skip + idempotence", () => {
  it("data change with stable structure => publish (auto-approve, reference advances)", async () => {
    const spec = baseSpec();
    await specStore.writeSpec(spec);
    await specStore.writeReferencePng(spec.compositionId, Buffer.from("ref"));
    const calls = { rendered: 0, uploaded: 0 };
    const au = fakeAu({
      decision: {
        action: "publish",
        reason: "data changed; stable",
        signature: { shapes: ["table@table.projects"], anchors: ["td.cell"], formFields: 0, eligible: true },
        eligible: true,
        qualityPass: true,
        structureStable: true,
        metrics: { pixelDiffPct: 1.1, ssim: 0.995 },
      },
    });

    const r = await refreshComposition(spec, deps(au, calls));
    assert.equal(r.action, "publish");
    assert.equal(r.rendered, true);
    assert.equal(calls.autoApprove, true);
    assert.equal(r.liveRenderId, "render-new");

    const saved = await specStore.readSpec("comp-1");
    assert.equal(saved.liveRenderId, "render-new");
    assert.equal(saved.pendingFlag, null);
    // reference frame advanced to the new capture
    const ref = await specStore.readReferencePng("comp-1");
    assert.equal(ref.toString(), "new");
  });

  it("structural redesign => flag (PENDING, reference unchanged, pendingFlag recorded)", async () => {
    const spec = baseSpec();
    await specStore.writeSpec(spec);
    await specStore.writeReferencePng(spec.compositionId, Buffer.from("ref"));
    const calls = { rendered: 0, uploaded: 0 };
    const flagSig = { shapes: ["list@ul.tiles"], anchors: ["li.tile"], formFields: 0, eligible: true };
    const au = fakeAu({
      decision: {
        action: "flag",
        reason: "structural redesign",
        signature: flagSig,
        eligible: true,
        qualityPass: true,
        structureStable: false,
        metrics: { pixelDiffPct: 9, ssim: 0.8 },
      },
    });

    const r = await refreshComposition(spec, deps(au, calls));
    assert.equal(r.action, "flag");
    assert.equal(r.rendered, true);
    assert.equal(r.reviewItemCreated, true);
    assert.equal(calls.autoApprove, false);

    const saved = await specStore.readSpec("comp-1");
    assert.deepEqual(saved.pendingFlag.signature, flagSig);
    // accepted reference frame is NOT advanced (old clip stays live)
    const ref = await specStore.readReferencePng("comp-1");
    assert.equal(ref.toString(), "ref");
  });

  it("no source change => skip (no render, no upload)", async () => {
    const spec = baseSpec();
    await specStore.writeSpec(spec);
    await specStore.writeReferencePng(spec.compositionId, Buffer.from("ref"));
    const calls = { rendered: 0, uploaded: 0 };
    const au = fakeAu({ decision: { signature: spec.reference.signature } });
    // isUnchanged true => changed=false => skip
    au.isUnchanged = () => true;

    const r = await refreshComposition(spec, deps(au, calls));
    assert.equal(r.action, "skip");
    assert.equal(r.rendered, false);
    assert.equal(calls.rendered, 0);
    assert.equal(calls.uploaded, 0);
  });

  it("a failing composition is isolated: it errors but the batch continues", async () => {
    // Two specs; the first throws on evaluate, the second is a clean skip.
    const bad = baseSpec();
    bad.compositionId = "comp-bad";
    bad.slug = "bad";
    const good = baseSpec();
    good.compositionId = "comp-good";
    good.slug = "good";
    await specStore.writeSpec(bad);
    await specStore.writeSpec(good);
    await specStore.writeReferencePng("comp-good", Buffer.from("ref"));

    // distinguish the two specs by url
    bad.source.url = "http://localhost/bad-screen";
    good.source.url = "http://localhost/good-screen";
    await specStore.writeSpec(bad);
    await specStore.writeSpec(good);

    const au = fakeAu({ decision: { signature: good.reference.signature } });
    au.isUnchanged = () => true; // good => skip
    const deps = {
      autoUpdate: au,
      evaluate: async (url) => {
        if (url.includes("bad-screen")) throw new Error("capture failed");
        return { remountPng: Buffer.from("new"), decision: { route: "reconstruction" } };
      },
      render: async () => ({ mp4: "/tmp/x.mp4" }),
      upload: async () => ({ render: { id: "r" } }),
    };

    const r = await refresh({ projectId: "proj-1" }, deps);
    const badSummary = r.summaries.find((s) => s.compositionId === "comp-bad");
    const goodSummary = r.summaries.find((s) => s.compositionId === "comp-good");
    assert.equal(badSummary.action, "error");
    assert.match(badSummary.reason, /capture failed/);
    assert.equal(goodSummary.action, "skip");
    assert.equal(r.errors, 1);
    assert.equal(r.rendersCreated, 0);
  });

  it("re-flag of the same outstanding redesign => skip (idempotent)", async () => {
    const flagSig = { shapes: ["list@ul.tiles"], anchors: ["li.tile"], formFields: 0, eligible: true };
    const spec = baseSpec();
    spec.pendingFlag = { signature: flagSig, renderId: "render-old", flaggedAt: "t0" };
    await specStore.writeSpec(spec);
    await specStore.writeReferencePng(spec.compositionId, Buffer.from("ref"));
    const calls = { rendered: 0, uploaded: 0 };
    const au = fakeAu({
      decision: {
        action: "flag",
        reason: "structural redesign (same)",
        signature: flagSig,
        eligible: true,
        qualityPass: true,
        structureStable: false,
        metrics: { pixelDiffPct: 9, ssim: 0.8 },
      },
    });

    const r = await refreshComposition(spec, deps(au, calls));
    assert.equal(r.action, "skip");
    assert.equal(r.rendered, false);
    assert.equal(calls.uploaded, 0);
  });
});

describe("defaultRender — Phase 4 <Scene> routing with video fallback", () => {
  const sceneSpec = () => ({
    compositionId: "comp-scene",
    slug: "projects",
    source: { url: "http://x/app/projects", viewport: { width: 900, height: 600, deviceScaleFactor: 2 } },
    scene: {
      durationMs: 2000,
      timeline: [{ id: "start", tMs: 0 }, { id: "end", tMs: 2000 }],
      targets: { region: { x: 10, y: 10, width: 400, height: 200 } },
      camera: [{ id: "z", at: "start", until: "end", target: "region", camera: "auto" }],
    },
  });
  const evalReconstruction = { decision: { route: "reconstruction" }, snapshot: { html: "<html></html>", scrolls: [], viewport: { width: 900, height: 600 } } };

  it("eligible + reconstruction route => renders <Scene> (not video)", async () => {
    const calls = { scene: 0, video: 0 };
    const pack = await defaultRender(sceneSpec(), {
      renderScene: async () => { calls.scene += 1; return { mp4: "/tmp/s.mp4", webm: "/tmp/s.webm" }; },
      renderVideo: async () => { calls.video += 1; return { mp4: "/tmp/v.mp4" }; },
    }, evalReconstruction);
    assert.equal(calls.scene, 1);
    assert.equal(calls.video, 0);
    assert.equal(pack.mp4, "/tmp/s.mp4");
  });

  it("scene render throws => falls back to video (fail-safe)", async () => {
    const calls = { scene: 0, video: 0 };
    const pack = await defaultRender(sceneSpec(), {
      renderScene: async () => { calls.scene += 1; throw new Error("boom"); },
      renderVideo: async () => { calls.video += 1; return { mp4: "/tmp/v.mp4" }; },
    }, evalReconstruction);
    assert.equal(calls.scene, 1);
    assert.equal(calls.video, 1);
    assert.equal(pack.mp4, "/tmp/v.mp4");
  });

  it("scene render yields no clip => falls back to video", async () => {
    const calls = { scene: 0, video: 0 };
    const pack = await defaultRender(sceneSpec(), {
      renderScene: async () => { calls.scene += 1; return {}; },
      renderVideo: async () => { calls.video += 1; return { mp4: "/tmp/v.mp4" }; },
    }, evalReconstruction);
    assert.equal(calls.video, 1);
    assert.equal(pack.mp4, "/tmp/v.mp4");
  });

  it("no scene opt-in => video (unchanged Phase 5 behavior)", async () => {
    const calls = { scene: 0, video: 0 };
    const spec = sceneSpec();
    delete spec.scene;
    spec.composePath = "/tmp/x.compose.tsx";
    await defaultRender(spec, {
      renderScene: async () => { calls.scene += 1; return { mp4: "/s" }; },
      renderVideo: async () => { calls.video += 1; return { mp4: "/v" }; },
    }, evalReconstruction);
    assert.equal(calls.scene, 0);
    assert.equal(calls.video, 1);
  });

  it("video route (ineligible) => video even with scene opt-in", async () => {
    const calls = { scene: 0, video: 0 };
    await defaultRender(sceneSpec(), {
      renderScene: async () => { calls.scene += 1; return { mp4: "/s" }; },
      renderVideo: async () => { calls.video += 1; return { mp4: "/v" }; },
    }, { decision: { route: "video" }, snapshot: null });
    assert.equal(calls.scene, 0);
    assert.equal(calls.video, 1);
  });

  it("sceneEligible guards on opt-in, route, and snapshot", () => {
    assert.equal(sceneEligible(sceneSpec(), evalReconstruction), true);
    assert.equal(sceneEligible(sceneSpec(), { decision: { route: "video" }, snapshot: {} }), false);
    assert.equal(sceneEligible(sceneSpec(), { decision: { route: "reconstruction" }, snapshot: null }), false);
    const noCam = sceneSpec(); noCam.scene.camera = [];
    assert.equal(sceneEligible(noCam, evalReconstruction), false);
  });

  // Phase 4.5 — in-scene motion routing + anchor-stability fail-safe.
  const motionSpec = () => ({
    compositionId: "comp-motion",
    slug: "activity",
    source: { url: "http://x/app/activity", viewport: { width: 1280, height: 900, deviceScaleFactor: 2 } },
    scene: { durationMs: 4000, scene: undefined, motion: [{ id: "a", at: "start", until: "end", type: "reveal", target: "auto" }] },
  });

  it("motion-only opt-in + reconstruction => renders <Scene> (motion)", async () => {
    const calls = { scene: 0, video: 0 };
    await defaultRender(motionSpec(), {
      renderScene: async () => { calls.scene += 1; return { mp4: "/s.mp4", webm: "/s.webm" }; },
      renderVideo: async () => { calls.video += 1; return { mp4: "/v.mp4" }; },
    }, evalReconstruction);
    assert.equal(calls.scene, 1);
    assert.equal(calls.video, 0);
  });

  it("anchor fail-safe: motion comp + animatable:false => routes to video", async () => {
    const calls = { scene: 0, video: 0 };
    await defaultRender(motionSpec(), {
      renderScene: async () => { calls.scene += 1; return { mp4: "/s.mp4", webm: "/s.webm" }; },
      renderVideo: async () => { calls.video += 1; return { mp4: "/v.mp4" }; },
    }, { decision: { route: "reconstruction" }, snapshot: {}, classification: { animatable: false } });
    assert.equal(calls.scene, 0);
    assert.equal(calls.video, 1);
  });

  it("sceneEligible: motion routing + anchor-stability + camera-exempt", () => {
    // motion-only, anchors stable (animatable absent or true) => eligible
    assert.equal(sceneEligible(motionSpec(), evalReconstruction), true);
    assert.equal(sceneEligible(motionSpec(), { decision: { route: "reconstruction" }, snapshot: {}, classification: { animatable: true } }), true);
    // motion + anchors drifted => NOT eligible (route to video)
    assert.equal(sceneEligible(motionSpec(), { decision: { route: "reconstruction" }, snapshot: {}, classification: { animatable: false } }), false);
    // camera-only is exempt from the anchor check (doesn't bind to anchors)
    assert.equal(sceneEligible(sceneSpec(), { decision: { route: "reconstruction" }, snapshot: {}, classification: { animatable: false } }), true);
    // neither camera nor motion => not eligible
    const empty = motionSpec(); empty.scene.motion = [];
    assert.equal(sceneEligible(empty, evalReconstruction), false);
  });

  it("ORIGINAL idempotent re-flag still holds (sanity)", async () => {
    const flagSig = { shapes: ["list@ul.tiles"], anchors: ["li.tile"], formFields: 0, eligible: true };
    const spec = baseSpec();
    spec.pendingFlag = { signature: flagSig, renderId: "render-old", flaggedAt: "t0" };
    await specStore.writeSpec(spec);
    await specStore.writeReferencePng(spec.compositionId, Buffer.from("ref"));
    const calls = { rendered: 0, uploaded: 0 };
    const au = fakeAu({
      decision: {
        action: "flag",
        reason: "structural redesign (same)",
        signature: flagSig,
        eligible: true,
        qualityPass: true,
        structureStable: false,
        metrics: { pixelDiffPct: 9, ssim: 0.8 },
      },
    });

    const r = await refreshComposition(spec, deps(au, calls));
    assert.equal(r.action, "skip");
    assert.equal(r.rendered, false);
    assert.equal(calls.uploaded, 0);
  });
});

describe("clean-data publish sub-gate (Phase 4.6)", () => {
  const publishAu = () =>
    fakeAu({
      decision: {
        action: "publish",
        reason: "data changed; stable",
        signature: { shapes: ["table@table.projects"], anchors: ["td.cell"], formFields: 0, eligible: true },
        eligible: true,
        qualityPass: true,
        structureStable: true,
        metrics: { pixelDiffPct: 1.1, ssim: 0.995 },
      },
    });

  function gateDeps(au, calls, { snapshot, cleanResult }) {
    return {
      autoUpdate: au,
      evaluate: async () => ({ remountPng: Buffer.from("new"), snapshot, decision: { route: "reconstruction" } }),
      render: async () => { calls.rendered += 1; return { mp4: "/x.mp4" }; },
      upload: async () => { calls.uploaded += 1; return { render: { id: "render-new" } }; },
      checkCleanData: cleanResult ? () => cleanResult : undefined,
    };
  }

  it("publish + DIRTY data => skip (no render, no upload, reference unchanged)", async () => {
    const spec = baseSpec();
    await specStore.writeSpec(spec);
    await specStore.writeReferencePng(spec.compositionId, Buffer.from("ref"));
    const calls = { rendered: 0, uploaded: 0 };
    const r = await refreshComposition(spec, gateDeps(publishAu(), calls, {
      snapshot: { html: "<body>No data yet</body>" },
      cleanResult: { clean: false, reasons: ["empty-state: No data yet"], hits: [{ kind: "empty-state", sample: "No data yet" }] },
    }));
    assert.equal(r.action, "skip");
    assert.equal(r.rendered, false);
    assert.equal(calls.rendered, 0);
    assert.equal(calls.uploaded, 0);
    assert.match(r.reason, /clean-data guard/);
    assert.equal((await specStore.readReferencePng("comp-1")).toString(), "ref"); // last good stays live
  });

  it("publish + CLEAN data => publishes normally", async () => {
    const spec = baseSpec();
    await specStore.writeSpec(spec);
    await specStore.writeReferencePng(spec.compositionId, Buffer.from("ref"));
    const calls = { rendered: 0, uploaded: 0 };
    const r = await refreshComposition(spec, gateDeps(publishAu(), calls, {
      snapshot: { html: "<body><table><tr><td>Acme Corp</td></tr></table></body>" },
      cleanResult: { clean: true, reasons: [], hits: [] },
    }));
    assert.equal(r.action, "publish");
    assert.equal(calls.uploaded, 1);
  });

  it("dirty but gate disabled (spec.cleanData.disabled) => publishes", async () => {
    const spec = baseSpec();
    spec.cleanData = { disabled: true };
    await specStore.writeSpec(spec);
    await specStore.writeReferencePng(spec.compositionId, Buffer.from("ref"));
    const calls = { rendered: 0, uploaded: 0 };
    const r = await refreshComposition(spec, gateDeps(publishAu(), calls, {
      snapshot: { html: "<body>No data yet</body>" },
      cleanResult: { clean: false, reasons: ["empty-state"], hits: [] },
    }));
    assert.equal(r.action, "publish");
    assert.equal(calls.uploaded, 1);
  });

  it("publish + NO snapshot (video path) => gate inactive, publishes (unchanged)", async () => {
    const spec = baseSpec();
    await specStore.writeSpec(spec);
    await specStore.writeReferencePng(spec.compositionId, Buffer.from("ref"));
    const calls = { rendered: 0, uploaded: 0 };
    const r = await refreshComposition(spec, gateDeps(publishAu(), calls, {
      snapshot: undefined,
      cleanResult: { clean: false, reasons: ["empty-state"], hits: [] },
    }));
    assert.equal(r.action, "publish");
    assert.equal(calls.uploaded, 1);
  });
});

describe("scene config — validate / set-scene / register --scene (Phase F)", () => {
  const camera = [{ id: "z", at: "start", until: "end", target: "r", camera: "auto" }];
  const motion = [{ id: "a", at: "start", until: "end", type: "reveal", target: "auto" }];

  it("validateSceneConfig accepts camera-only, motion-only, or both", () => {
    assert.equal(validateSceneConfig({ camera }).camera.length, 1);
    assert.equal(validateSceneConfig({ motion }).motion.length, 1);
    assert.ok(validateSceneConfig({ camera, motion }));
  });

  it("validateSceneConfig rejects empty/invalid config", () => {
    assert.throws(() => validateSceneConfig({}), /camera.*motion/);
    assert.throws(() => validateSceneConfig({ camera: [], motion: [] }), /camera.*motion/);
    assert.throws(() => validateSceneConfig(null), /object/);
    assert.throws(() => validateSceneConfig({ motion: [{ id: "x", at: "s", type: "bogus" }] }), /invalid type/);
    assert.throws(() => validateSceneConfig({ motion: [{ id: "x", type: "reveal" }] }), /missing "at"/);
  });

  it("setScene attaches scene to an enrolled spec (and reports the render mode)", async () => {
    const spec = baseSpec();
    await specStore.writeSpec(spec);
    const r = await setScene(spec.compositionId, { motion });
    assert.equal(r.updated, true);
    assert.equal(r.mode, "scene+motion");
    const saved = await specStore.readSpec(spec.compositionId);
    assert.deepEqual(saved.scene.motion, motion);
  });

  it("setScene throws for an un-enrolled composition", async () => {
    await assert.rejects(() => setScene("nope", { camera }), /enroll it with --register/);
  });

  it("registerComposition --scene writes spec.scene and reports render=scene+motion", async () => {
    const au = {
      structureSignature: () => ({ shapes: ["table"], anchors: ["td"], formFields: 0, eligible: true }),
    };
    const deps = {
      autoUpdate: au,
      evaluate: async () => ({
        classification: { eligible: true, reasons: [] },
        decision: { route: "reconstruction" },
        quality: { pass: true, pixelDiffPct: 0.1, ssim: 0.99 },
        remountPng: Buffer.from("ref"),
      }),
    };
    const result = await registerComposition(
      { compositionId: "comp-s", projectId: "proj-1", url: "http://x/app/x", composePath: "/x.tsx", scene: { motion } },
      deps,
    );
    assert.equal(result.render, "scene+motion");
    const saved = await specStore.readSpec("comp-s");
    assert.deepEqual(saved.scene.motion, motion);
  });

  it("registerComposition without --scene leaves video render (unchanged enroll)", async () => {
    const au = { structureSignature: () => ({ eligible: true }) };
    const deps = {
      autoUpdate: au,
      evaluate: async () => ({ classification: { eligible: true, reasons: [] }, decision: { route: "reconstruction" }, quality: {}, remountPng: Buffer.from("ref") }),
    };
    const result = await registerComposition({ compositionId: "comp-v", projectId: "proj-1", url: "http://x/app/x", composePath: "/x.tsx" }, deps);
    assert.match(result.render, /video/);
    const saved = await specStore.readSpec("comp-v");
    assert.equal(saved.scene, undefined);
  });
});
