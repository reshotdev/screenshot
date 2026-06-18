import { Page } from 'playwright-core';
import { C as CaptureMethod, a as CaptureSnapshot, b as CaptureSettings, c as CaptureStorageState } from './types-Miq-3WVh.js';
export { D as DEFAULT_CAPTURE_SETTINGS, S as SurfaceMeta, e as launchBrowser, l as liveScreenshot, n as navigate, o as openPage, r as remountScreenshot, d as renderArtifactOffline, s as settle } from './types-Miq-3WVh.js';

/**
 * Decide whether to fall back from m7 (primary) to m4. m7's in-page walk cannot
 * see CLOSED shadow DOM, and a restrictive CSP blocks its in-page asset/font
 * fetches; m4 (CDP) sees Chromium's flattened render tree and transports
 * resources out-of-page, so it survives both.
 */
declare function shouldFallbackToM4(signals: {
    closedShadow: boolean;
    csp?: string | null;
}): boolean;
type CaptureDomOptions = {
    /** Force a specific method (skips detection). Used by tests to prove fallback. */
    forceMethod?: CaptureMethod;
    /** CSP header from the page response, for fallback detection. */
    csp?: string | null;
};
/** Capture a self-contained reconstruction from a live, navigated, settled page. */
declare function captureDom(page: Page, opts?: CaptureDomOptions): Promise<CaptureSnapshot>;
type CaptureArtifactPaths = {
    html: string;
    meta: string;
};
/** Write the artifact + sidecar metadata. Returns the written paths. */
declare function writeArtifact(snapshot: CaptureSnapshot, basePath: string): Promise<CaptureArtifactPaths>;
type CaptureUrlResult = {
    snapshot: CaptureSnapshot;
    method: CaptureMethod;
    livePng: Buffer;
    remountPng: Buffer;
};
type CaptureUrlOptions = CaptureDomOptions & {
    settings?: CaptureSettings;
    storageState?: CaptureStorageState;
};
/**
 * End-to-end: navigate to `url`, take a deterministic live screenshot, capture a
 * DOM artifact (auto-selecting m7/m4), and remount it to a screenshot at the same
 * settings — everything the calibrated quality gate needs.
 */
declare function captureUrl(url: string, opts?: CaptureUrlOptions): Promise<CaptureUrlResult>;

export { type CaptureArtifactPaths, type CaptureDomOptions, CaptureMethod, CaptureSettings, CaptureSnapshot, CaptureStorageState, type CaptureUrlOptions, type CaptureUrlResult, captureDom, captureUrl, shouldFallbackToM4, writeArtifact };
