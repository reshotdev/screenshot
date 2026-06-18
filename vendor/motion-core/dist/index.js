// src/constants.ts
var CLUSTER_THRESHOLD_PX = 500;
var MAX_ZOOM = 1.8;
var MIN_ZOOM = 1;
var DEFAULT_PADDING = 2.5;
var SAFE_FRAME_ASPECT_RATIO = 16 / 9;
var IMAGE_EDGE_MARGIN_PX = 4;
var MIN_VISIBLE_RATIO = 0.4;
var ZOOM_LEVELS = [1, 1.15, 1.3, 1.5];
var DEFAULT_SPRING_TENSION = 120;
var DEFAULT_SPRING_FRICTION = 20;
var SIMULATION_TIMESTEP_MS = 1;
var SPRING_EPSILON = 0.01;
var DEFAULT_MOTION_SETTINGS = {
  mode: "cinematic",
  damping: 0.5,
  padding: DEFAULT_PADDING
};
function dampingToSpringParams(damping) {
  const clampedDamping = Math.max(0.1, Math.min(1, damping));
  const tension = 40 + (200 - 40) * clampedDamping;
  const FRICTION_RATIO = DEFAULT_SPRING_FRICTION / (2 * Math.sqrt(DEFAULT_SPRING_TENSION));
  const friction = 2 * Math.sqrt(tension) * FRICTION_RATIO;
  return { tension, friction };
}

// src/easing.ts
function applyEasing(t, easing) {
  t = Math.max(0, Math.min(1, t));
  switch (easing) {
    case "linear":
      return t;
    case "ease-in":
      return t * t * t;
    case "ease-out":
      return 1 - Math.pow(1 - t, 3);
    case "ease-in-out":
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case "spring": {
      const c4 = 2 * Math.PI / 3;
      return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    }
    default:
      return t;
  }
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}

// src/spatial-clustering.ts
function distanceBetweenCenters(a, b) {
  const aCenterX = a.x + a.width / 2;
  const aCenterY = a.y + a.height / 2;
  const bCenterX = b.x + b.width / 2;
  const bCenterY = b.y + b.height / 2;
  return Math.sqrt(
    Math.pow(aCenterX - bCenterX, 2) + Math.pow(aCenterY - bCenterY, 2)
  );
}
function getUnionRect(rects) {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}
function isNavigationStep(step) {
  return step.action === "navigate";
}
function isUserOverrideStep(step) {
  const { strategy } = step.camera;
  return strategy === "manual" || strategy === "wide" || strategy === "fix";
}
function generateCameraShots(steps, _settings) {
  if (steps.length === 0) return [];
  const shots = [];
  let clusterBounds = [];
  let clusterStartIndex = 0;
  let clusterStartTimeMs = 0;
  let currentTimeMs = 0;
  for (let i = 0; i < steps.length; i++) {
    const currentStep = steps[i];
    const nextStep = steps[i + 1];
    clusterBounds.push(currentStep.containerBounds ?? currentStep.bounds);
    const stepEndTimeMs = currentTimeMs + currentStep.durationMs + currentStep.transitionDurationMs;
    const shouldBreak = (
      // End of timeline
      !nextStep || // URL changed → hard cut required
      nextStep && isNavigationStep(nextStep) || // Current step is a navigation → it should be its own shot
      isNavigationStep(currentStep) || // Next step has a user override → it needs its own shot
      nextStep && isUserOverrideStep(nextStep) || // Current step has a user override → it should be its own shot
      isUserOverrideStep(currentStep) || // Scroll events force cluster breaks (camera must travel large distance)
      currentStep.action === "scroll" || nextStep && nextStep.action === "scroll" || // Target is too far away from the cluster
      nextStep && distanceBetweenCenters(
        getUnionRect(clusterBounds),
        nextStep.containerBounds ?? nextStep.bounds
      ) > CLUSTER_THRESHOLD_PX
    );
    if (shouldBreak) {
      const unionBounds = getUnionRect(clusterBounds);
      shots.push({
        targetBounds: unionBounds,
        startStepIndex: clusterStartIndex,
        endStepIndex: i,
        startTimeMs: clusterStartTimeMs,
        endTimeMs: stepEndTimeMs,
        isUserOverride: isUserOverrideStep(currentStep) && clusterBounds.length === 1
      });
      clusterBounds = [];
      clusterStartIndex = i + 1;
      clusterStartTimeMs = stepEndTimeMs;
    }
    currentTimeMs = stepEndTimeMs;
  }
  return shots;
}

// src/safe-frame.ts
function calculateSafeFrame(shot, steps, settings, ctx) {
  const { imageWidth, imageHeight } = ctx;
  if (shot.isUserOverride) {
    const step = steps[shot.startStepIndex];
    if (step?.camera.viewport) {
      return clampToImage(step.camera.viewport, imageWidth, imageHeight);
    }
    if (step?.camera.strategy === "fix") {
      const prevStep = shot.startStepIndex > 0 ? steps[shot.startStepIndex - 1] : null;
      if (prevStep?.camera.viewport) {
        return clampToImage(prevStep.camera.viewport, imageWidth, imageHeight);
      }
      if (prevStep) {
        const prevBounds = prevStep.bounds;
        return calculateSafeFrameFromBounds(prevBounds, settings, ctx);
      }
      return { x: 0, y: 0, zoom: MIN_ZOOM };
    }
    if (step?.camera.strategy === "wide") {
      return { x: 0, y: 0, zoom: MIN_ZOOM };
    }
  }
  let { targetBounds } = shot;
  if (shot.startStepIndex === shot.endStepIndex) {
    const step = steps[shot.startStepIndex];
    if (step?.containerBounds) {
      targetBounds = step.containerBounds;
    }
  }
  const paddingMultiplier = settings.padding ?? 2;
  const paddedWidth = targetBounds.width * paddingMultiplier;
  const paddedHeight = targetBounds.height * paddingMultiplier;
  const paddedCenterX = targetBounds.x + targetBounds.width / 2;
  const paddedCenterY = targetBounds.y + targetBounds.height / 2;
  const targetAspect = SAFE_FRAME_ASPECT_RATIO;
  const paddedAspect = paddedWidth / Math.max(paddedHeight, 1);
  let frameWidth;
  let frameHeight;
  if (paddedAspect > targetAspect) {
    frameWidth = paddedWidth;
    frameHeight = paddedWidth / targetAspect;
  } else {
    frameHeight = paddedHeight;
    frameWidth = paddedHeight * targetAspect;
  }
  const floorApplied = frameWidth < imageWidth * MIN_VISIBLE_RATIO || frameHeight < imageHeight * MIN_VISIBLE_RATIO;
  frameWidth = Math.max(frameWidth, imageWidth * MIN_VISIBLE_RATIO);
  frameHeight = Math.max(frameHeight, imageHeight * MIN_VISIBLE_RATIO);
  const zoomX = imageWidth / Math.max(frameWidth, 1);
  const zoomY = imageHeight / Math.max(frameHeight, 1);
  const rawZoom = Math.min(zoomX, zoomY);
  const clampedZoom = floorApplied ? MIN_ZOOM : quantizeZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rawZoom)));
  const viewportWidth = imageWidth / clampedZoom;
  const viewportHeight = imageHeight / clampedZoom;
  const x = paddedCenterX - viewportWidth / 2;
  const y = paddedCenterY - viewportHeight / 2;
  return clampToImage({ x, y, zoom: clampedZoom }, imageWidth, imageHeight);
}
function calculateSafeFrameFromBounds(bounds, settings, ctx) {
  const { imageWidth, imageHeight } = ctx;
  const paddingMultiplier = settings.padding ?? 2;
  const paddedWidth = bounds.width * paddingMultiplier;
  const paddedHeight = bounds.height * paddingMultiplier;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const targetAspect = SAFE_FRAME_ASPECT_RATIO;
  const paddedAspect = paddedWidth / Math.max(paddedHeight, 1);
  let frameWidth = paddedWidth;
  let frameHeight = paddedHeight;
  if (paddedAspect > targetAspect) {
    frameHeight = paddedWidth / targetAspect;
  } else {
    frameWidth = paddedHeight * targetAspect;
  }
  const floorApplied = frameWidth < imageWidth * MIN_VISIBLE_RATIO || frameHeight < imageHeight * MIN_VISIBLE_RATIO;
  frameWidth = Math.max(frameWidth, imageWidth * MIN_VISIBLE_RATIO);
  frameHeight = Math.max(frameHeight, imageHeight * MIN_VISIBLE_RATIO);
  const zoomX = imageWidth / Math.max(frameWidth, 1);
  const zoomY = imageHeight / Math.max(frameHeight, 1);
  const rawZoom = Math.min(zoomX, zoomY);
  const clampedZoom = floorApplied ? MIN_ZOOM : quantizeZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rawZoom)));
  const viewportWidth = imageWidth / clampedZoom;
  const viewportHeight = imageHeight / clampedZoom;
  return clampToImage(
    { x: centerX - viewportWidth / 2, y: centerY - viewportHeight / 2, zoom: clampedZoom },
    imageWidth,
    imageHeight
  );
}
function quantizeZoom(zoom) {
  let quantized = ZOOM_LEVELS[0];
  for (const level of ZOOM_LEVELS) {
    if (level <= zoom) {
      quantized = level;
    } else {
      break;
    }
  }
  return quantized;
}
function clampToImage(viewport, imageWidth, imageHeight) {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.zoom));
  const viewportWidth = imageWidth / zoom;
  const viewportHeight = imageHeight / zoom;
  const maxX = imageWidth - viewportWidth - IMAGE_EDGE_MARGIN_PX;
  const maxY = imageHeight - viewportHeight - IMAGE_EDGE_MARGIN_PX;
  const x = Math.max(IMAGE_EDGE_MARGIN_PX, Math.min(maxX, viewport.x));
  const y = Math.max(IMAGE_EDGE_MARGIN_PX, Math.min(maxY, viewport.y));
  return { x, y, zoom };
}

// src/temporal-smoothing.ts
function simulateSpring(current, target, tension, friction, deltaMs) {
  let state = { ...current };
  const steps = Math.ceil(deltaMs / SIMULATION_TIMESTEP_MS);
  const dt = SIMULATION_TIMESTEP_MS / 1e3;
  for (let i = 0; i < steps; i++) {
    const forceX = -tension * (state.x - target.x) - friction * state.vx;
    const forceY = -tension * (state.y - target.y) - friction * state.vy;
    const forceZoom = -tension * (state.zoom - target.zoom) - friction * state.vZoom;
    state = {
      vx: state.vx + forceX * dt,
      vy: state.vy + forceY * dt,
      vZoom: state.vZoom + forceZoom * dt,
      x: state.x + (state.vx + forceX * dt) * dt,
      y: state.y + (state.vy + forceY * dt) * dt,
      zoom: state.zoom + (state.vZoom + forceZoom * dt) * dt
    };
    if (state.zoom < MIN_ZOOM) {
      state.zoom = MIN_ZOOM;
      state.vZoom = Math.max(0, state.vZoom);
    } else if (state.zoom > MAX_ZOOM) {
      state.zoom = MAX_ZOOM;
      state.vZoom = Math.min(0, state.vZoom);
    }
  }
  if (isConverged(state, target)) {
    state = {
      x: target.x,
      y: target.y,
      zoom: target.zoom,
      vx: 0,
      vy: 0,
      vZoom: 0
    };
  }
  return state;
}
function springFromViewport(viewport) {
  return {
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom,
    vx: 0,
    vy: 0,
    vZoom: 0
  };
}
function viewportFromSpring(state) {
  return {
    x: state.x,
    y: state.y,
    zoom: state.zoom
  };
}
function hardCutSpring(target) {
  return springFromViewport(target);
}
function isConverged(state, target) {
  const posDelta = Math.abs(state.x - target.x) + Math.abs(state.y - target.y) + Math.abs(state.zoom - target.zoom);
  const velocity = Math.abs(state.vx) + Math.abs(state.vy) + Math.abs(state.vZoom);
  return posDelta < SPRING_EPSILON && velocity < SPRING_EPSILON;
}

// src/social-crop.ts
var SOCIAL_CROP_ASPECT = 9 / 16;
function computeSocialCropX(worldWidth, targetX, currentX, lerpFactor) {
  const cropWidth = worldWidth * SOCIAL_CROP_ASPECT;
  const idealLeft = targetX - cropWidth / 2;
  const clamped = Math.max(0, Math.min(worldWidth - cropWidth, idealLeft));
  const smoothed = currentX + (clamped - currentX) * lerpFactor;
  return Math.max(0, Math.min(worldWidth - cropWidth, smoothed));
}

// src/solve-camera-path.ts
function solveCameraPath(options) {
  const {
    steps,
    settings = DEFAULT_MOTION_SETTINGS,
    imageWidth,
    imageHeight,
    sampleIntervalMs
  } = options;
  if (steps.length === 0) return [];
  switch (settings.mode) {
    case "static":
      return solveStatic(steps, imageWidth, imageHeight);
    case "manual":
      return solveManual(steps, settings, imageWidth, imageHeight);
    case "cinematic":
    default:
      return solveCinematic(steps, settings, imageWidth, imageHeight, sampleIntervalMs);
  }
}
function solveStatic(steps, _imageWidth, _imageHeight) {
  const staticViewport = { x: 0, y: 0, zoom: 1 };
  const keyframes = [];
  let timeMs = 0;
  for (const step of steps) {
    keyframes.push({
      timeMs,
      viewport: { ...staticViewport },
      isHardCut: false
    });
    timeMs += step.durationMs + step.transitionDurationMs;
  }
  return keyframes;
}
function solveManual(steps, settings, imageWidth, imageHeight) {
  const keyframes = [];
  let timeMs = 0;
  const ctx = { imageWidth, imageHeight };
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const singleShot = {
      targetBounds: step.bounds,
      startStepIndex: i,
      endStepIndex: i,
      startTimeMs: timeMs,
      endTimeMs: timeMs + step.durationMs + step.transitionDurationMs,
      isUserOverride: step.camera.strategy !== "auto"
    };
    const viewport = calculateSafeFrame(singleShot, steps, settings, ctx);
    keyframes.push({
      timeMs,
      viewport,
      isHardCut: step.action === "navigate"
    });
    timeMs += step.durationMs + step.transitionDurationMs;
  }
  return keyframes;
}
function solveCinematic(steps, settings, imageWidth, imageHeight, sampleIntervalMs) {
  const ctx = { imageWidth, imageHeight };
  const { tension, friction } = dampingToSpringParams(settings.damping ?? 0.5);
  const shots = generateCameraShots(steps, settings);
  const shotViewports = shots.map(
    (shot) => calculateSafeFrame(shot, steps, settings, ctx)
  );
  stabilizeZoomLevels(shotViewports, shots, imageWidth, imageHeight);
  const totalDurationMs = steps.reduce(
    (sum, s) => sum + s.durationMs + s.transitionDurationMs,
    0
  );
  const keyframes = [];
  if (shots.length === 0 || shotViewports.length === 0) return keyframes;
  let spring = springFromViewport(shotViewports[0]);
  let currentShotIdx = 0;
  if (sampleIntervalMs && sampleIntervalMs > 0) {
    return solveCinematicUniform(
      steps,
      shots,
      shotViewports,
      settings,
      tension,
      friction,
      totalDurationMs,
      sampleIntervalMs
    );
  }
  let timeMs = 0;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    while (currentShotIdx < shots.length - 1 && i > shots[currentShotIdx].endStepIndex) {
      currentShotIdx++;
    }
    const target = shotViewports[currentShotIdx];
    const isHardCut = step.action === "navigate";
    if (isHardCut) {
      const navViewport = { x: 0, y: 0, zoom: 1 };
      spring = hardCutSpring(navViewport);
      keyframes.push({
        timeMs,
        viewport: { ...navViewport },
        isHardCut: true
      });
    } else {
      const deltaMs = i === 0 ? 0 : steps[i - 1].durationMs + steps[i - 1].transitionDurationMs;
      if (deltaMs > 0) {
        spring = simulateSpring(spring, target, tension, friction, deltaMs);
      }
      keyframes.push({
        timeMs,
        viewport: viewportFromSpring(spring),
        isHardCut: false
      });
    }
    timeMs += step.durationMs + step.transitionDurationMs;
  }
  return keyframes;
}
function solveCinematicUniform(steps, shots, shotViewports, _settings, tension, friction, totalDurationMs, intervalMs) {
  const keyframes = [];
  let spring = springFromViewport(shotViewports[0]);
  let currentShotIdx = 0;
  const stepBoundaries = buildStepTimeBoundaries(steps);
  for (let t = 0; t <= totalDurationMs; t += intervalMs) {
    while (currentShotIdx < shots.length - 1 && t >= shots[currentShotIdx + 1].startTimeMs) {
      currentShotIdx++;
    }
    const target = shotViewports[currentShotIdx];
    const isHardCut = isNavigationBoundaryInRange(
      stepBoundaries,
      t - intervalMs,
      t
    );
    if (isHardCut) {
      const navViewport = { x: 0, y: 0, zoom: 1 };
      spring = hardCutSpring(navViewport);
      keyframes.push({
        timeMs: t,
        viewport: { ...navViewport },
        isHardCut: true
      });
    } else {
      spring = simulateSpring(spring, target, tension, friction, intervalMs);
      keyframes.push({
        timeMs: t,
        viewport: viewportFromSpring(spring),
        isHardCut: false
      });
    }
  }
  return keyframes;
}
function stabilizeZoomLevels(shotViewports, shots, imageWidth, imageHeight) {
  if (shotViewports.length <= 2) return;
  for (let i = 1; i < shotViewports.length - 1; i++) {
    const prev = shotViewports[i - 1];
    const curr = shotViewports[i];
    const next = shotViewports[i + 1];
    if (shots[i].isUserOverride) continue;
    if (curr.zoom === prev.zoom || curr.zoom === next.zoom) continue;
    if (i - 2 < 0 || i + 2 >= shotViewports.length) continue;
    const prevPrev = shotViewports[i - 2];
    const nextNext = shotViewports[i + 2];
    if (prev.zoom !== prevPrev.zoom || next.zoom !== nextNext.zoom) continue;
    const targetBounds = shots[i].targetBounds;
    const centerX = targetBounds.x + targetBounds.width / 2;
    const centerY = targetBounds.y + targetBounds.height / 2;
    const viewportWidth = imageWidth / prev.zoom;
    const viewportHeight = imageHeight / prev.zoom;
    let x = centerX - viewportWidth / 2;
    let y = centerY - viewportHeight / 2;
    x = Math.max(0, Math.min(imageWidth - viewportWidth, x));
    y = Math.max(0, Math.min(imageHeight - viewportHeight, y));
    shotViewports[i] = { x, y, zoom: prev.zoom };
  }
}
function buildStepTimeBoundaries(steps) {
  const boundaries = [];
  let timeMs = 0;
  for (const step of steps) {
    boundaries.push({
      timeMs,
      isNavigation: step.action === "navigate"
    });
    timeMs += step.durationMs + step.transitionDurationMs;
  }
  return boundaries;
}
function isNavigationBoundaryInRange(boundaries, fromMs, toMs) {
  return boundaries.some(
    (b) => b.isNavigation && b.timeMs > fromMs && b.timeMs <= toMs
  );
}
export {
  CLUSTER_THRESHOLD_PX,
  DEFAULT_MOTION_SETTINGS,
  DEFAULT_PADDING,
  DEFAULT_SPRING_FRICTION,
  DEFAULT_SPRING_TENSION,
  IMAGE_EDGE_MARGIN_PX,
  MAX_ZOOM,
  MIN_VISIBLE_RATIO,
  MIN_ZOOM,
  SAFE_FRAME_ASPECT_RATIO,
  SIMULATION_TIMESTEP_MS,
  SOCIAL_CROP_ASPECT,
  SPRING_EPSILON,
  ZOOM_LEVELS,
  applyEasing,
  calculateSafeFrame,
  computeSocialCropX,
  dampingToSpringParams,
  generateCameraShots,
  hardCutSpring,
  lerp,
  simulateSpring,
  solveCameraPath,
  springFromViewport,
  viewportFromSpring
};
