/**
 * @reshot/motion-core — Types
 *
 * All types used by the SteadyCam motion solver.
 * This package has ZERO runtime dependencies — pure math only.
 */
/**
 * Per-step camera strategy.
 *
 * - `auto`   — SteadyCam decides zoom/position via clustering + safe-frame.
 * - `fix`    — Lock camera to the PREVIOUS step's position (no movement).
 * - `manual` — User-specified viewport override.
 * - `wide`   — Force 1.0x zoom showing full page (establishing shot).
 */
type CameraStrategy = 'auto' | 'fix' | 'manual' | 'wide';
/**
 * Per-step camera configuration.
 * Replaces the old `zoomLevel` / `useAdaptiveZoom` pair.
 */
interface StepCameraConfig {
    strategy: CameraStrategy;
    /** Only used when strategy === 'manual' */
    viewport?: CameraViewport;
}
/**
 * Global motion engine mode.
 *
 * - `cinematic` — Full SteadyCam: clustering, safe-frame, spring physics. (Default)
 * - `static`    — Fixed 1.0x zoom always. Traditional screencast feel.
 * - `manual`    — Respects every per-step camera override strictly.
 */
type MotionMode = 'cinematic' | 'static' | 'manual';
/**
 * Project-level motion settings stored on `Timeline.camera.motionSettings`.
 */
interface MotionSettings {
    /** Global motion mode */
    mode: MotionMode;
    /**
     * Camera "heaviness" — how quickly the spring converges.
     * 0.1 = very smooth/slow, 1.0 = snappy.
     * Maps to spring friction internally.
     */
    damping: number;
    /**
     * Context padding multiplier around target elements.
     * 1.2 = tight framing, 3.0 = lots of context.
     */
    padding: number;
}
interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}
/**
 * A camera viewport describes what the viewer sees.
 * Position is in IMAGE pixel coordinates (not normalized).
 */
interface CameraViewport {
    /** Top-left X of the viewport in image pixels */
    x: number;
    /** Top-left Y of the viewport in image pixels */
    y: number;
    /** Zoom level (1.0 = show full image, 2.0 = show half) */
    zoom: number;
}
/**
 * Minimal step representation consumed by the solver.
 * Decoupled from the full TimelineStep to avoid importing project-format.
 */
interface StepInput {
    /** Step ID for tracking (optional — not used by solver) */
    id?: string;
    /** Action type */
    action: string;
    /** URL at time of action (optional — navigation detected via action field) */
    url?: string;
    /** Target element bounding box in image pixel coordinates */
    bounds: Rect;
    /** Semantic container bounding box (e.g. the card wrapping a button) */
    containerBounds?: Rect;
    /** Step duration in ms */
    durationMs: number;
    /** Transition duration in ms */
    transitionDurationMs: number;
    /** Per-step camera config (new system) */
    camera: StepCameraConfig;
    /**
     * @deprecated Legacy zoom level — used for migration only.
     * If `camera` is not set, falls back to this.
     */
    legacyZoomLevel?: number;
}
/**
 * A camera shot groups one or more steps into a single stable framing.
 * Output of the spatial clustering pass (Algorithm A).
 */
interface CameraShot {
    /** Union bounding box of all elements in this shot (image pixels) */
    targetBounds: Rect;
    /** Index of first step in this shot */
    startStepIndex: number;
    /** Index of last step in this shot */
    endStepIndex: number;
    /** Start time in ms */
    startTimeMs: number;
    /** End time in ms */
    endTimeMs: number;
    /** Whether this shot was forced by user override */
    isUserOverride: boolean;
}
/**
 * A solved camera keyframe — the final output the renderer consumes.
 */
interface SolvedKeyframe {
    /** Time in milliseconds from timeline start */
    timeMs: number;
    /** Camera viewport at this moment */
    viewport: CameraViewport;
    /** Whether this is a hard cut (no spring interpolation) */
    isHardCut: boolean;
}
/**
 * State of the damped-spring camera simulation.
 */
interface SpringState {
    /** Current camera position (image pixels) */
    x: number;
    y: number;
    zoom: number;
    /** Current velocity */
    vx: number;
    vy: number;
    vZoom: number;
}
type EasingFunction = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring';

/**
 * @reshot/motion-core — Constants
 *
 * Tunable parameters for the SteadyCam motion engine.
 */

/**
 * Maximum pixel distance between step targets before the cluster breaks.
 * ~26% of a 1080p screen width. Larger value groups more actions into
 * a single shot, reducing unnecessary zoom changes.
 */
declare const CLUSTER_THRESHOLD_PX = 500;
/** Maximum zoom level (never zoom closer than this). 1.8x keeps 56% of the screen visible. */
declare const MAX_ZOOM = 1.8;
/** Minimum zoom level (never zoom out further than full image) */
declare const MIN_ZOOM = 1;
/** Default context padding multiplier — more surrounding context reduces tunnel-vision */
declare const DEFAULT_PADDING = 2.5;
/** Output viewport aspect ratio (width / height). 16:9 standard. */
declare const SAFE_FRAME_ASPECT_RATIO: number;
/** Minimum margin from image edges in pixels to prevent clipping */
declare const IMAGE_EDGE_MARGIN_PX = 4;
/**
 * Minimum fraction of the full image that must remain visible.
 * Prevents tiny elements from causing extreme zoom.
 * 0.40 = at least 40% of the image is always visible.
 */
declare const MIN_VISIBLE_RATIO = 0.4;
/**
 * Discrete zoom levels the camera snaps to.
 * 4 levels: wide → gentle focus → medium → close-up.
 * 1.5x max keeps ~67% of screen visible (still comfortable).
 */
declare const ZOOM_LEVELS: readonly number[];
/** Spring tension — how strongly the camera is pulled toward the target */
declare const DEFAULT_SPRING_TENSION = 120;
/** Spring friction — damping force that prevents oscillation */
declare const DEFAULT_SPRING_FRICTION = 20;
/**
 * Fixed simulation timestep in ms.
 * Using a fixed timestep ensures deterministic output regardless of frame rate.
 * 1ms gives sub-frame precision at 60fps (16.67ms/frame).
 */
declare const SIMULATION_TIMESTEP_MS = 1;
/**
 * Spring convergence threshold.
 * When position delta and velocity are both below this, snap to target.
 */
declare const SPRING_EPSILON = 0.01;
declare const DEFAULT_MOTION_SETTINGS: MotionSettings;
/**
 * Convert user-facing damping (0.1–1.0) to spring tension + friction.
 *
 * Low damping (0.1) = smooth/slow camera → low tension, high friction
 * High damping (1.0) = snappy camera → high tension, moderate friction
 *
 * Calibrated so that at damping=0.5 → tension=120, friction=20 (spec defaults).
 */
declare function dampingToSpringParams(damping: number): {
    tension: number;
    friction: number;
};

/**
 * @reshot/motion-core — Easing Functions
 *
 * Shared easing functions used by both the preview renderer and the export pipeline.
 * This is the SINGLE SOURCE OF TRUTH — no more duplicating in PreviewCanvas or motion-engine.
 */

/**
 * Apply an easing function to a progress value.
 * @param t - Progress value, 0–1 (will be clamped)
 * @param easing - Easing function name
 * @returns Eased value, 0–1
 */
declare function applyEasing(t: number, easing: EasingFunction): number;
/**
 * Linear interpolation.
 */
declare function lerp(a: number, b: number, t: number): number;

/**
 * @reshot/motion-core — Algorithm A: Spatial Clustering ("The Stabilizer")
 *
 * Groups nearby sequential actions into a single stable camera shot.
 * Prevents jittery lateral pans when the user interacts with elements
 * in the same region (e.g., filling out a form).
 *
 * Reference: Doc 2, §1
 */

/**
 * Generate camera shots by clustering nearby sequential steps.
 *
 * The algorithm iterates through steps and groups them into shots:
 * - Steps whose targets are within CLUSTER_THRESHOLD_PX of each other stay in the same shot.
 * - Navigation events, user overrides, and large gaps break the cluster.
 *
 * Result: If the user clicks 3 buttons close together, the camera holds still
 * for the entire sequence instead of panning between each click.
 */
declare function generateCameraShots(steps: StepInput[], _settings: MotionSettings): CameraShot[];

/**
 * @reshot/motion-core — Algorithm B: Safe Frame ("The Frame")
 *
 * Calculates the camera viewport for a given shot region,
 * applying padding, aspect-ratio fitting, zoom clamping,
 * and edge collision prevention.
 *
 * Reference: Doc 2, §2
 */

interface SafeFrameContext {
    /** Full image width in pixels */
    imageWidth: number;
    /** Full image height in pixels */
    imageHeight: number;
}
/**
 * Calculate the safe camera viewport for a given shot.
 *
 * The algorithm:
 * 1. Take the union bounding box of the shot (from clustering)
 * 2. Apply padding (user setting, default 2.0 = 200%)
 * 3. Fit to aspect ratio (16:9 by default)
 * 4. Clamp zoom to [MIN_ZOOM, MAX_ZOOM]
 * 5. Prevent edge collisions (don't pan past image bounds)
 *
 * The result is a CameraViewport in IMAGE PIXEL coordinates.
 */
declare function calculateSafeFrame(shot: CameraShot, steps: StepInput[], settings: MotionSettings, ctx: SafeFrameContext): CameraViewport;

/**
 * @reshot/motion-core — Algorithm C: Temporal Smoothing ("The Spring")
 *
 * Damped spring integrator that smoothly transitions the camera
 * between target positions. Uses a fixed 1ms simulation timestep
 * for deterministic output regardless of caller's frame rate.
 *
 * Reference: Doc 2, §3
 */

/**
 * Advance a spring simulation from `current` toward `target` by `deltaMs`.
 *
 * Uses semi-implicit Euler integration at a fixed 1ms timestep.
 * This means the output is IDENTICAL whether called from a 60fps preview
 * or a 30fps export pipeline.
 *
 * @param current  Current spring state (position + velocity)
 * @param target   Target viewport to move toward
 * @param tension  Spring stiffness (higher = snappier)
 * @param friction Spring damping (higher = less oscillation)
 * @param deltaMs  Real time to advance in milliseconds
 * @returns        New spring state after simulation
 */
declare function simulateSpring(current: SpringState, target: CameraViewport, tension: number, friction: number, deltaMs: number): SpringState;
/**
 * Create a spring state from a viewport (at rest, zero velocity).
 */
declare function springFromViewport(viewport: CameraViewport): SpringState;
/**
 * Extract a CameraViewport from a spring state.
 */
declare function viewportFromSpring(state: SpringState): CameraViewport;
/**
 * Reset spring to a target position with zero velocity.
 * Used for hard cuts (navigation events, page loads).
 */
declare function hardCutSpring(target: CameraViewport): SpringState;

/**
 * Social Crop (Auto-Reframing 9:16)
 *
 * Pure function that computes the horizontal position of a 9:16 crop strip
 * within a wider viewport, smoothly tracking the cursor via Lerp.
 *
 * Coordinate space: operates within the camera viewport's visible region.
 * At zoom 1.0 on a 1920px source, worldWidth = 1920, cropWidth = 1080.
 * At zoom 1.5, worldWidth = 1280, cropWidth = 720.
 */
declare const SOCIAL_CROP_ASPECT: number;
/**
 * Compute the smoothed left-edge X of a 9:16 crop strip within a viewport.
 *
 * @param worldWidth   Width of the visible region (e.g. 1920, or 1280 if zoomed)
 * @param targetX      Cursor X or element center X within visible region
 * @param currentX     Previous frame's smoothed crop-left X
 * @param lerpFactor   Smoothing factor: 0.1 = cinematic, 1.0 = instant snap
 * @returns            New crop-left X, clamped to [0, worldWidth - cropWidth]
 */
declare function computeSocialCropX(worldWidth: number, targetX: number, currentX: number, lerpFactor: number): number;

/**
 * @reshot/motion-core — Camera Path Solver ("The Director")
 *
 * Orchestrates the full pipeline:
 *   Steps → Cluster → Safe Frame → Spring → Keyframes
 *
 * This is the single entry point consumed by both:
 * - PreviewCanvas.tsx (renderer process, real-time)
 * - motion-engine.ts (main process, video export)
 *
 * Reference: Doc 1, §Architecture Overview
 */

interface SolveOptions {
    /** Steps in the timeline */
    steps: StepInput[];
    /** Motion settings (project-level) */
    settings?: MotionSettings;
    /** Image dimensions for safe-frame calculation */
    imageWidth: number;
    imageHeight: number;
    /**
     * Simulation resolution in milliseconds.
     * Default: step-aligned (one keyframe per step boundary).
     * For real-time preview, pass the frame interval (e.g., 16 for 60fps).
     */
    sampleIntervalMs?: number;
}
/**
 * Solve the complete camera path for an entire timeline.
 *
 * This is DETERMINISTIC: same inputs always produce the same outputs.
 * The output is an ordered array of keyframes with camera positions.
 *
 * @returns Array of solved keyframes, one per sample point.
 */
declare function solveCameraPath(options: SolveOptions): SolvedKeyframe[];

export { CLUSTER_THRESHOLD_PX, type CameraShot, type CameraStrategy, type CameraViewport, DEFAULT_MOTION_SETTINGS, DEFAULT_PADDING, DEFAULT_SPRING_FRICTION, DEFAULT_SPRING_TENSION, type EasingFunction, IMAGE_EDGE_MARGIN_PX, MAX_ZOOM, MIN_VISIBLE_RATIO, MIN_ZOOM, type MotionMode, type MotionSettings, type Rect, SAFE_FRAME_ASPECT_RATIO, SIMULATION_TIMESTEP_MS, SOCIAL_CROP_ASPECT, SPRING_EPSILON, type SafeFrameContext, type SolveOptions, type SolvedKeyframe, type SpringState, type StepCameraConfig, type StepInput, ZOOM_LEVELS, applyEasing, calculateSafeFrame, computeSocialCropX, dampingToSpringParams, generateCameraShots, hardCutSpring, lerp, simulateSpring, solveCameraPath, springFromViewport, viewportFromSpring };
