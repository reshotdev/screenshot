type RenderFormat = "mp4" | "webm" | "poster" | "gif";

type RenderSize = {
    width: number;
    height: number;
};
type RenderedPack = {
    mp4?: string;
    webm?: string;
    poster?: string;
    gif?: string;
};
type RecordHtmlOptions = {
    html: string;
    durationMs: number;
    size: RenderSize;
    formats: RenderFormat[];
    /** Output basename (no extension); each format appends its own. */
    outBase: string;
    fps?: number;
    deviceScaleFactor?: number;
};
declare const DEFAULT_FRAME_RATE = 60;
declare const DEFAULT_DEVICE_SCALE_FACTOR = 2;
declare class ChromiumNotFoundError extends Error {
    constructor();
}
declare function resolveChromiumExecutable(): string | undefined;
/** Frame count for a duration at a given fps (>= 1). */
declare function frameCountFor(durationMs: number, fps: number): number;
/**
 * Render a composition HTML document to the requested formats. Frames are
 * seek-stepped and streamed straight into per-format ffmpeg encoders (mp4 via
 * CRF-tuned H.264, webm via VP9) — encoded ONCE from the source screenshots, with
 * no intermediate video and no PNGs on disk. Poster is encoded from a mid-frame.
 */
declare function recordHtml(options: RecordHtmlOptions): Promise<RenderedPack>;
/**
 * Capture a composition's frames as in-memory PNG buffers (no disk, no encode).
 * For SHORT compositions only — used by the determinism gate and proof contact
 * sheets, which need direct frame access. Long clips should stream via recordHtml.
 */
declare function captureFrameBuffers(options: {
    html: string;
    durationMs: number;
    size: RenderSize;
    fps?: number;
    deviceScaleFactor?: number;
}): Promise<Buffer[]>;

declare function concatMp4Segments(inputs: string[], output: string): Promise<string>;

type RenderOptions = {
    out?: string;
    slug?: string;
    size?: RenderSize;
    formats?: RenderFormat[];
    durationMs?: number;
    fps?: number;
    deviceScaleFactor?: number;
};
type RenderResult = {
    pack: {
        mp4?: string;
        webm?: string;
        poster?: string;
        gif?: string;
    };
    durationMs: number;
};
/**
 * Compile a `.compose.tsx` file to its final composition HTML — the exact path
 * render() uses (esbuild transform → dynamic import → compileToHtml → base-href).
 * Exposed so the frame-level gates (determinism, Phase 4 Scene) can render the
 * same composition without forking this pipeline.
 */
declare function compileCompositionFile(compositionPath: string): Promise<string>;
declare function render(compositionPath: string, options?: RenderOptions): Promise<RenderResult>;

export { ChromiumNotFoundError, DEFAULT_DEVICE_SCALE_FACTOR, DEFAULT_FRAME_RATE, type RecordHtmlOptions, type RenderFormat, type RenderOptions, type RenderResult, type RenderedPack, captureFrameBuffers, compileCompositionFile, concatMp4Segments, frameCountFor, recordHtml, render, resolveChromiumExecutable };
