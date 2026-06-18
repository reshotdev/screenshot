declare const PIXELMATCH_THRESHOLD = 0.1;
type RgbaImage = {
    data: Uint8ClampedArray;
    width: number;
    height: number;
};
type DiffResult = {
    pixelDiffPct: number;
    ssim: number;
    width: number;
    height: number;
    diffPixels: number;
    /** PNG-encoded pixelmatch heatmap (red = differing pixel over a dimmed base). */
    heatmapPng: Buffer;
};
declare function loadPng(path: string): Promise<RgbaImage>;
declare function decodePng(buffer: Buffer): RgbaImage;
/** SSIM (fast, mean SSIM) between two equal-size RGBA images. */
declare function computeSsim(a: RgbaImage, b: RgbaImage): number;
/** Core diff over two in-memory RGBA images. */
declare function diffImages(a: RgbaImage, b: RgbaImage): DiffResult;
/** Diff two PNG files. Optionally write the heatmap PNG to `heatmapPath`. */
declare function diffFiles(refPath: string, recPath: string, opts?: {
    heatmapPath?: string;
}): Promise<DiffResult>;

declare const CALIBRATION_PROVENANCE = "single-rater (jake), provisional \u2014 70 pairs, honesty 3/3, kappa n/a (n=1)";
/** pixelDiff% must be <= this to count as indistinguishable. */
declare const PIXEL_DIFF_MAX = 1.82335;
/** SSIM must be >= this to count as indistinguishable. */
declare const SSIM_MIN = 0.9905;
type Metrics = {
    pixelDiffPct: number;
    ssim: number;
};
type Verdict = {
    pass: boolean;
    /** Which metric carried the pass (pixel-diff is primary for UI). */
    reason: "pixelDiff" | "ssim" | "both" | "neither";
    primaryMetric: "pixelDiff";
    pixelDiffPct: number;
    ssim: number;
    thresholds: {
        pixelDiffMax: number;
        ssimMin: number;
    };
    provenance: string;
};
/**
 * Union verdict: indistinguishable iff pixelDiff <= 1.82% OR SSIM >= 0.9905.
 * Pixel-diff is the primary metric for UI per FINDINGS.md.
 */
declare function verdict(metrics: Metrics): Verdict;

type ProofPair = {
    label: string;
    /** Left image (e.g. reconstruction / candidate). */
    a: Buffer;
    aCaption?: string;
    /** Right image (e.g. ground-truth / baseline). */
    b: Buffer;
    bCaption?: string;
    /** Optional pixelmatch heatmap. */
    heatmap?: Buffer;
    pixelDiffPct?: number;
    ssim?: number;
    pass?: boolean;
};
type ProofMetricRow = {
    label: string;
    value: string;
    pass?: boolean;
};
type ProofOptions = {
    title: string;
    /** Directory to write index.html into. Created if absent. */
    outDir: string;
    subtitle?: string;
    verdict?: Verdict;
    pairs?: ProofPair[];
    metrics?: ProofMetricRow[];
    /** Embedded video (mp4/webm) shown inline. */
    video?: {
        data: Buffer;
        mime: string;
    };
    /** Frame contact-sheet (e.g. animated render frames). */
    frames?: Buffer[];
    /** Trusted, generator-produced raw HTML/SVG (e.g. a scatter chart). Not escaped. */
    charts?: string[];
    /** Actionable failure detail per the methodology's "detailed issue reporting". */
    failure?: {
        frameIndex?: number;
        selector?: string;
        note?: string;
    };
    /** Footnote — used to carry the provisional-calibration caveat. */
    note?: string;
};
declare function renderProofHtml(opts: ProofOptions): string;
/** Render and write the proof; returns the absolute path to index.html. */
declare function writeProof(opts: ProofOptions): Promise<string>;

export { CALIBRATION_PROVENANCE as C, type DiffResult as D, type Metrics as M, PIXELMATCH_THRESHOLD as P, type RgbaImage as R, SSIM_MIN as S, type Verdict as V, diffImages as a, diffFiles as b, computeSsim as c, decodePng as d, PIXEL_DIFF_MAX as e, type ProofOptions as f, type ProofPair as g, type ProofMetricRow as h, loadPng as l, renderProofHtml as r, verdict as v, writeProof as w };
