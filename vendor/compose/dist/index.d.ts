import { ComposeNode } from './jsx-runtime.js';
export { ComposeComponent, ComposeElement, ComposeElementType, Fragment, jsx, jsxDEV, jsxs } from './jsx-runtime.js';

type CompileResult = {
    html: string;
    styles: string[];
};
declare function compile(node: ComposeNode): CompileResult;
declare function compileToHtml(node: ComposeNode): string;

type TimelineEvent = {
    type?: string;
    name?: string;
    tMs?: number;
    timestampMs?: number;
    [key: string]: unknown;
};
type WorkflowMetadata = {
    durationMs?: number;
    timeline?: TimelineEvent[];
    targets?: Record<string, unknown>;
    source?: unknown;
    captureSize?: unknown;
    capturePath?: string;
    [key: string]: unknown;
};
type WorkflowContextValue = {
    workflow: WorkflowMetadata;
    slug: string;
    capturePath?: string;
};
declare function getWorkflowContext(): WorkflowContextValue | undefined;
declare function useWorkflowContext(): WorkflowContextValue;

type CompositionProps = {
    workflow: WorkflowMetadata;
    slug?: string;
    capturePath?: string;
    durationMs?: number;
    children?: ComposeNode;
};
declare function Composition({ workflow, slug, capturePath, durationMs, children, }: CompositionProps): ComposeNode;

type FrameProps = {
    chrome?: "none" | "minimal" | "browser-light" | "browser-dark";
    url?: string;
    src?: string;
    fit?: "contain" | "cover";
    children?: ComposeNode;
};
declare function Frame({ chrome, url, src, fit, children, }: FrameProps): ComposeNode;

/** The artifact payload a <Scene> mounts. */
type SceneArtifact = {
    /** Self-contained `<!doctype html>` document from Phase 2 capture. */
    html: string;
    /** Per-container scroll offsets to restore (same shape as CaptureSnapshot.scrolls). */
    scrolls?: {
        sel: string;
        x: number;
        y: number;
    }[];
    /** Captured viewport the artifact was serialized at (defaults to the frame size). */
    viewport?: {
        width: number;
        height: number;
    };
};
type SceneCameraKeyframeWire = {
    tMs: number;
    x: number;
    y: number;
    zoom: number;
    isHardCut: boolean;
};
type SceneCameraConfig = {
    keyframes: SceneCameraKeyframeWire[];
    source: {
        width: number;
        height: number;
    };
};
/**
 * Build the inline <script> a <Scene camera=...> emits: writes the solved camera
 * config to a window global and starts the per-frame controller. Returns "" when
 * there is no camera move so static scenes stay untouched.
 */
declare function buildSceneCameraScript(config: SceneCameraConfig | undefined): string;
type SceneMotionInstructionWire = {
    type: "reveal";
    target: string;
    startMs: number;
    endMs: number;
    stagger: number;
    distancePx: number;
    max: number;
} | {
    type: "highlight";
    target: string;
    startMs: number;
    endMs: number;
    walk: boolean;
    rows: number;
    padPx: number;
} | {
    type: "cursor";
    to: string;
    startMs: number;
    endMs: number;
    click: boolean;
    fromXFrac: number;
    fromYFrac: number;
} | {
    type: "type";
    target: string;
    startMs: number;
    endMs: number;
    text: string;
    caret: boolean;
} | {
    type: "countUp";
    target: string;
    startMs: number;
    endMs: number;
    from: number;
    to: number | null;
    format: "number" | "currency" | "percent";
} | {
    type: "scrollTo";
    target: string;
    to: string | null;
    startMs: number;
    endMs: number;
} | {
    type: "populate";
    target: string;
    startMs: number;
    endMs: number;
    stagger: number;
    distancePx: number;
    max: number;
};
type SceneMotionConfig$1 = {
    instructions: SceneMotionInstructionWire[];
};
/**
 * Build the inline <script> a `<Scene motion=...>` emits: writes the solved motion
 * config to a window global and starts the per-frame controller. Returns "" when
 * there is no motion so static/camera-only scenes stay untouched.
 */
declare function buildSceneMotionScript(config: SceneMotionConfig$1 | undefined): string;

type BeatTiming = {
    startMs: number;
    endMs: number;
    durationMs: number;
};
declare function resolveBeatTiming(at: string, until: string | undefined, timeline: TimelineEvent[]): BeatTiming;

type Rect = {
    x: number;
    y: number;
    w: number;
    h: number;
};
type Size = {
    width: number;
    height: number;
};
declare const DEFAULT_SOURCE: Size;
declare const DEFAULT_FRAME_VIDEO: Size;
declare const DEFAULT_FRAME_BAR_H = 36;
declare function sourceToFrame(rect: Rect, source?: Size, frame?: Size, barH?: number): Rect;

type ProductFilmTone = "neutral" | "success" | "warning" | "danger";

type ProductFilmStep = {
    id: string;
    at: string;
    until?: string;
    target?: string;
    label?: string;
    tone?: ProductFilmTone;
    camera?: "auto" | "wide" | "hold";
};
type ProductFilmProps = {
    src?: string;
    url?: string;
    chrome?: FrameProps["chrome"];
    fit?: FrameProps["fit"];
    steps: ProductFilmStep[];
    children?: ComposeNode;
};
declare function ProductFilm({ src, url, chrome, fit, steps, children, }: ProductFilmProps): ComposeNode;

type CameraSolverSettings = {
    mode?: "cinematic" | "static" | "manual";
    damping?: number;
    padding?: number;
};

/** A solved keyframe in absolute composition time, viewport in source pixels. */
type SceneCameraKeyframe = {
    /** Absolute time from composition start, in ms. */
    tMs: number;
    /** Top-left of the viewport in SOURCE (captured) pixels. */
    x: number;
    /** Top-left of the viewport in SOURCE (captured) pixels. */
    y: number;
    /** Zoom (1.0 = full source). */
    zoom: number;
    isHardCut: boolean;
};
type SceneCameraPath = {
    keyframes: SceneCameraKeyframe[];
    /** Source (captured) dimensions the keyframe coordinates are expressed in. */
    source: {
        width: number;
        height: number;
    };
};
/**
 * Solve an authored `ProductFilmStep[]` camera move into absolute-time keyframes
 * in SOURCE pixel space. Pure (no DOM): same inputs → same keyframes. Mirrors the
 * solver wiring in `<FocusPath>` so authored moves render identically on video and
 * on a `<Scene>` — the only difference is HOW the transform is applied per frame.
 */
type SolveSceneCameraOptions = {
    /**
     * Motion settings forwarded to the solver. Defaults mirror `<FocusPath>`
     * (cinematic / damping 0.55 / padding 2.4).
     */
    settings?: CameraSolverSettings;
    /**
     * Spring sample interval in ms. Step-boundary sampling (the default when unset)
     * only emits one keyframe per step, so a single push-in never reaches its target
     * mid-flight. Passing a small interval (e.g. the frame period) samples the spring
     * densely so the camera actually arrives at the zoomed framing. The in-page
     * controller interpolates between whatever keyframes it is given.
     */
    sampleIntervalMs?: number;
};
declare function solveSceneCameraPath(steps: ProductFilmStep[], workflow: WorkflowMetadata, options?: SolveSceneCameraOptions): SceneCameraPath;
/** Resolve the steps + workflow from context (component convenience). */
declare function solveSceneCameraFromContext(steps: ProductFilmStep[], options?: SolveSceneCameraOptions): SceneCameraPath;

/**
 * A motion target within the mounted scene DOM: a CSS selector of the CONTAINER
 * whose children animate, or "auto" (the largest repeated-children container — the
 * main table/list/card grid the eligibility classifier also keys on).
 */
type SceneMotionTarget = string;
/** Authored in-scene motion steps. Timing uses the same at/until beats as camera. */
type SceneMotionStep = {
    id: string;
    at: string;
    until?: string;
    type: "reveal";
    /** Container whose children animate. Default "auto". */
    target?: SceneMotionTarget;
    /** ms between consecutive children entering. Default 80. */
    stagger?: number;
    /** px the children rise from as they fade in. Default 12. */
    distancePx?: number;
    /** Cap on number of children animated. Default 12. */
    max?: number;
} | {
    id: string;
    at: string;
    until?: string;
    type: "highlight";
    /** Container whose rows are highlighted. Default "auto". */
    target?: SceneMotionTarget;
    /** Walk the focus box down the rows over the beat. Default true. */
    walk?: boolean;
    /** Cap on rows traversed. Default 8. */
    rows?: number;
    /** Padding around the focused row, px. Default 6. */
    padPx?: number;
} | {
    id: string;
    at: string;
    until?: string;
    type: "cursor";
    /** Element to move the pointer to: CSS selector, or "auto" (prominent button). */
    to?: SceneMotionTarget;
    /** Pulse-click on arrival. Default true. */
    click?: boolean;
    /** Start point as a fraction of the viewport. Default { x: 0.5, y: 0.92 }. */
    from?: {
        x: number;
        y: number;
    };
} | {
    id: string;
    at: string;
    until?: string;
    type: "type";
    /** Field to type into: CSS selector, or "auto" (first visible text input). */
    target?: SceneMotionTarget;
    /** The text typed character-by-character. */
    text: string;
    /** Show a blinking caret. Default true. */
    caret?: boolean;
} | {
    id: string;
    at: string;
    until?: string;
    type: "countUp";
    /** Number element: CSS selector, or "auto" (most prominent numeric text). */
    target?: SceneMotionTarget;
    /** Start value. Default 0. */
    from?: number;
    /** End value. Default: the element's own parsed number (so it ends pristine). */
    to?: number;
    /** Display format. Default "number" (deterministic grouped integer). */
    format?: "number" | "currency" | "percent";
} | {
    id: string;
    at: string;
    until?: string;
    type: "scrollTo";
    /** Content element to scroll: CSS selector, or "auto" (the mounted body). */
    target?: SceneMotionTarget;
    /** Element to bring into view (selector). Default: scroll to the bottom. */
    to?: SceneMotionTarget;
} | {
    id: string;
    at: string;
    until?: string;
    type: "populate";
    /** Container whose rows stream in. Default "auto". */
    target?: SceneMotionTarget;
    /** ms between consecutive rows. Default 80. */
    stagger?: number;
    /** px the rows slide in from (horizontal). Default 16. */
    distancePx?: number;
    /** Cap on rows. Default 12. */
    max?: number;
};
/** A solved, serializable instruction consumed by the in-page controller. */
type SceneMotionInstruction = {
    type: "reveal";
    target: string;
    startMs: number;
    endMs: number;
    stagger: number;
    distancePx: number;
    max: number;
} | {
    type: "highlight";
    target: string;
    startMs: number;
    endMs: number;
    walk: boolean;
    rows: number;
    padPx: number;
} | {
    type: "cursor";
    to: string;
    startMs: number;
    endMs: number;
    click: boolean;
    fromXFrac: number;
    fromYFrac: number;
} | {
    type: "type";
    target: string;
    startMs: number;
    endMs: number;
    text: string;
    caret: boolean;
} | {
    type: "countUp";
    target: string;
    startMs: number;
    endMs: number;
    from: number;
    /** null → the in-page controller uses the element's own parsed number. */
    to: number | null;
    format: "number" | "currency" | "percent";
} | {
    type: "scrollTo";
    target: string;
    /** Selector to bring into view, or null → scroll to the bottom. */
    to: string | null;
    startMs: number;
    endMs: number;
} | {
    type: "populate";
    target: string;
    startMs: number;
    endMs: number;
    stagger: number;
    distancePx: number;
    max: number;
};
type SceneMotionConfig = {
    instructions: SceneMotionInstruction[];
};
type SolveSceneMotionOptions = {
    defaultStagger?: number;
    defaultDistancePx?: number;
    defaultMax?: number;
};
/**
 * Solve authored motion steps into absolute-time instructions. PURE: same inputs →
 * same config (no DOM, no clock). Element/geometry resolution happens in-page
 * against the mounted DOM (it needs live layout), which is itself a pure function
 * of the static reconstructed DOM — so determinism holds end to end.
 */
declare function solveSceneMotion(steps: SceneMotionStep[], workflow: WorkflowMetadata, options?: SolveSceneMotionOptions): SceneMotionConfig;
/** Resolve the workflow from composition context (component convenience). */
declare function solveSceneMotionFromContext(steps: SceneMotionStep[], options?: SolveSceneMotionOptions): SceneMotionConfig;

type SceneProps = {
    /** The Phase 2 DOM artifact to mount as the scene's media layer. */
    artifact: SceneArtifact;
    chrome?: "none" | "minimal" | "browser-light" | "browser-dark";
    url?: string;
    /**
     * Authored camera move (Task 4.2). Solved via `@reshot/motion-core` (the same
     * solver `<FocusPath>`/`<ProductFilm>` use for video) and applied as an INLINE
     * per-frame transform on the scene media layer, so the zoom re-rasterizes the
     * real DOM (vector-crisp) instead of upscaling a cached bitmap.
     */
    camera?: ProductFilmStep[];
    /** Solver tuning for the camera move (motion settings + spring sample rate). */
    cameraOptions?: SolveSceneCameraOptions;
    /**
     * Authored IN-SCENE motion (Phase 4.5) — the product UI itself animating over the
     * deterministic clock (e.g. rows assembling), not a camera pan. Applied per seeked
     * frame under the determinism contract (no will-change; integer-snapped). Composes
     * with `camera` (camera transforms the layer; motion mutates the inner DOM).
     */
    motion?: SceneMotionStep[];
    /** Solver tuning for the in-scene motion. */
    motionOptions?: SolveSceneMotionOptions;
    /** Overlays (annotations etc.) rendered above the scene, same as <Frame>. */
    children?: ComposeNode;
};
/**
 * `<Scene>` mounts a reconstructed Phase 2 DOM artifact as the composition's media
 * layer — as REAL DOM inside the render page (not an <iframe>, not a cached
 * <img>/<video> bitmap). The artifact is transplanted into
 * `.reshot-frame__media-layer` by a client-side mount script (see scene-driver),
 * keeping the layer's geometry/transform-origin so a later camera move (Task 4.2)
 * re-rasterizes live DOM per frame and stays vector-crisp.
 *
 * `will-change: transform` is removed from this scene's media layer (it promotes a
 * cached GPU layer that blurs under a later zoom). Static rendering here; motion
 * is Task 4.2.
 */
declare function Scene({ artifact, chrome, url, camera, cameraOptions, motion, motionOptions, children, }: SceneProps): ComposeNode;

type AnnotationProps = {
    at: string;
    until?: string;
    target?: string;
    edge?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    chrome?: FrameProps["chrome"];
    tone?: ProductFilmTone;
    label?: ComposeNode;
    children?: ComposeNode;
};
declare function Annotation({ at, until, target, edge, chrome, tone, label, children, }: AnnotationProps): ComposeNode;

type FocusPathProps = {
    steps: ProductFilmStep[];
    className?: string;
};
declare function FocusPath({ steps, className }: FocusPathProps): ComposeNode;

export { Annotation, type AnnotationProps, type BeatTiming, type CompileResult, ComposeNode, Composition, type CompositionProps, DEFAULT_FRAME_BAR_H, DEFAULT_FRAME_VIDEO, DEFAULT_SOURCE, FocusPath, type FocusPathProps, Frame, type FrameProps, ProductFilm, type ProductFilmProps, type ProductFilmStep, type Rect, Scene, type SceneArtifact, type SceneCameraConfig, type SceneCameraKeyframe, type SceneCameraPath, type SceneMotionConfig, type SceneMotionInstruction, type SceneMotionStep, type SceneMotionTarget, type SceneProps, type Size, type SolveSceneCameraOptions, type SolveSceneMotionOptions, type TimelineEvent, type WorkflowContextValue, type WorkflowMetadata, buildSceneCameraScript, buildSceneMotionScript, compile, compileToHtml, getWorkflowContext, resolveBeatTiming, solveSceneCameraFromContext, solveSceneCameraPath, solveSceneMotion, solveSceneMotionFromContext, sourceToFrame, useWorkflowContext };
