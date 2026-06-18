import { readFileSync } from "node:fs";

import { Composition, Scene } from "@reshot/compose";

// Phase 4 · Task 4.4 integration — the auto-update loop's <Scene> render template.
//
// When a composition opts into reconstruction rendering (`spec.scene`) and the live
// evaluation routes the source screen to "reconstruction", the refresh orchestrator
// recaptures the screen, writes the Phase 2 DOM artifact + a scene sidecar, and
// renders THIS template through the published Phase 1 pipeline. The artifact is
// mounted as REAL DOM and driven by the composition's authored camera move, so the
// published clip is vector-crisp (text re-rasterized per frame) instead of an
// upscaled video. On any failure the orchestrator falls back to the video render.
//
// Everything is read from the sidecar (RESHOT_SCENE_DEMO) so this single template
// serves every eligible composition without per-composition codegen.
const artifactPath = process.env.RESHOT_SCENE_ARTIFACT!;
const demoPath = process.env.RESHOT_SCENE_DEMO!;

const html = readFileSync(artifactPath, "utf8");
const demo = JSON.parse(readFileSync(demoPath, "utf8")) as {
  viewport: { width: number; height: number };
  durationMs: number;
  scrolls?: { sel: string; x: number; y: number }[];
  timeline?: { id: string; tMs: number }[];
  targets?: Record<string, { x: number; y: number; width: number; height: number }>;
  camera?: { id: string; at: string; until: string; target?: string; camera: string }[];
  cameraOptions?: {
    settings?: { mode?: string; damping?: number; padding?: number };
    sampleIntervalMs?: number;
  };
  // Phase 4.5 — authored IN-SCENE motion (reveal/highlight/cursor).
  motion?: { id: string; at: string; until?: string; type: string }[];
  motionOptions?: Record<string, unknown>;
};

const source = demo.viewport;
const durationMs = demo.durationMs;

const workflow = {
  durationMs,
  source,
  timeline: demo.timeline ?? [
    { id: "start", tMs: 0 },
    { id: "end", tMs: durationMs },
  ],
  targets: demo.targets ?? {},
};

const cameraOptions = demo.cameraOptions ?? {
  settings: { padding: 1.2, damping: 0.9 },
  sampleIntervalMs: 1000 / 60,
};

const hasCamera = Array.isArray(demo.camera) && demo.camera.length > 0;
const hasMotion = Array.isArray(demo.motion) && demo.motion.length > 0;

export default function SceneRuntime() {
  return (
    <Composition workflow={workflow} slug="scene-runtime" durationMs={durationMs}>
      <Scene
        artifact={{ html, scrolls: demo.scrolls ?? [], viewport: source }}
        // Authored camera (ProductFilmStep[]) and/or in-scene motion
        // (reveal/highlight/cursor) — both solved inside the composition's React
        // context and applied per seeked frame on the deterministic clock.
        camera={hasCamera ? (demo.camera as never) : undefined}
        cameraOptions={hasCamera ? (cameraOptions as never) : undefined}
        motion={hasMotion ? (demo.motion as never) : undefined}
        motionOptions={hasMotion ? (demo.motionOptions as never) : undefined}
      />
    </Composition>
  );
}
