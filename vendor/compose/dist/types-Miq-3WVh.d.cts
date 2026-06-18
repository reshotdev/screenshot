import * as playwright_core from 'playwright-core';
import { Browser, Page } from 'playwright-core';

type CaptureSettings = {
    width: number;
    height: number;
    deviceScaleFactor: number;
};
declare const DEFAULT_CAPTURE_SETTINGS: CaptureSettings;
declare function launchBrowser(): Promise<Browser>;
/** Settle a page for a deterministic screenshot (fonts ready, animations killed). */
declare function settle(page: Page): Promise<void>;
/**
 * Navigate deterministically. Real dashboards hold realtime/polling connections
 * open, so `networkidle` never fires and times out — use `domcontentloaded`, then
 * a BEST-EFFORT idle wait (so static pages still settle their assets), then a
 * fixed render window. Caller is expected to `settle(page)` afterwards.
 */
declare function navigate(page: Page, url: string, idleMs?: number): Promise<playwright_core.Response | null>;
/**
 * Auth context for capturing screens behind a login. Playwright's native
 * storageState shape (cookies + per-origin localStorage) — lets the capture
 * pipeline reach authenticated `/app/*` screens. Built by the CLI (demo bootstrap
 * or a real session) and threaded through evaluateUrl/captureUrl.
 */
type CaptureStorageState = {
    cookies?: unknown[];
    origins?: {
        origin: string;
        localStorage: {
            name: string;
            value: string;
        }[];
    }[];
};
/** Open a context with capture settings (and optional auth) applied before navigation. */
declare function openPage(browser: Browser, settings: CaptureSettings, storageState?: CaptureStorageState): Promise<Page>;
/** Remount artifact HTML and screenshot it at the given settings. */
declare function remountScreenshot(html: string, scrolls: {
    sel: string;
    x: number;
    y: number;
}[], settings?: CaptureSettings): Promise<Buffer>;
/**
 * Render artifact HTML offline and count network egress. A self-contained
 * artifact must make ZERO http(s) requests — every asset is a data-URI.
 */
declare function renderArtifactOffline(html: string, settings?: CaptureSettings): Promise<{
    networkRequests: string[];
    png: Buffer;
}>;
/** Take a deterministic live screenshot of a URL at the given settings. */
declare function liveScreenshot(url: string, settings?: CaptureSettings): Promise<Buffer>;

type CaptureMethod = "m7" | "m4";
/** Per-surface record persisted into the artifact metadata (auditable). */
type SurfaceMeta = {
    id: string;
    kind: "canvas" | "video" | "iframe";
    rect: {
        x: number;
        y: number;
        vx: number;
        vy: number;
        w: number;
        h: number;
    };
    /** Whether the surface's pixels were captured (false = capture failed). */
    rasterized: boolean;
    /** How the pixels were obtained. */
    via: "inline" | "playwright";
};
/** A method's serialization result: a self-contained HTML doc + metadata. */
type CaptureSnapshot = {
    method: CaptureMethod;
    /** Self-contained HTML (inlined fonts/images, baked sidecars). */
    html: string;
    scrolls: {
        sel: string;
        x: number;
        y: number;
    }[];
    surfaces: SurfaceMeta[];
    notes: string;
};

export { type CaptureMethod as C, DEFAULT_CAPTURE_SETTINGS as D, type SurfaceMeta as S, type CaptureSnapshot as a, type CaptureSettings as b, type CaptureStorageState as c, renderArtifactOffline as d, launchBrowser as e, liveScreenshot as l, navigate as n, openPage as o, remountScreenshot as r, settle as s };
