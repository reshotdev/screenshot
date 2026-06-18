export { C as CALIBRATION_PROVENANCE, D as DiffResult, M as Metrics, P as PIXELMATCH_THRESHOLD, e as PIXEL_DIFF_MAX, h as ProofMetricRow, f as ProofOptions, g as ProofPair, R as RgbaImage, S as SSIM_MIN, V as Verdict, c as computeSsim, d as decodePng, b as diffFiles, a as diffImages, l as loadPng, r as renderProofHtml, v as verdict, w as writeProof } from './proof-bzr146az.cjs';

type DeterminismResult = {
    runs: number;
    frameCount: number;
    /** True iff every frame's bytes are identical across all runs. */
    byteIdentical: boolean;
    /** Worst per-frame pixelDiff% across all run-pairs (0 when byte-identical). */
    maxFramePixelDiff: number;
    /** sha256 of the concatenated frames for each run. */
    runHashes: string[];
};
/** A producer renders the same input and returns its frames as PNG buffers. */
type FrameProducer = () => Promise<Buffer[]>;
/**
 * Run `produce` `runs` times and compare. Frame bytes are compared directly;
 * when they differ, the calibrated pixel-diff quantifies by how much (so a
 * failure report can show the drift, not just "not identical").
 */
declare function checkDeterminism(produce: FrameProducer, runs?: number): Promise<DeterminismResult>;
/** Throws unless the producer is bit-for-bit deterministic across runs. */
declare function assertDeterministic(produce: FrameProducer, runs?: number): Promise<DeterminismResult>;

type Region = {
    x: number;
    y: number;
    width: number;
    height: number;
};
/**
 * Variance of the 3x3 Laplacian over a region of a PNG. Higher = sharper (more
 * high-frequency edge energy). The region is clamped to the image bounds.
 */
declare function laplacianVariance(pngBuffer: Buffer, region: Region): number;
/** Crop a region out of a PNG and re-encode it (for 1:1 visual-proof crops). */
declare function cropPng(pngBuffer: Buffer, region: Region): Buffer;

export { type DeterminismResult, type FrameProducer, type Region, assertDeterministic, checkDeterminism, cropPng, laplacianVariance };
