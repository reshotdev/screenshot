import { Classification, ScreenEvaluation } from './eligibility.cjs';
export { CleanDataConfig, CleanDataResult, checkCleanData, classify, classifyPage, evaluatePage, evaluateUrl } from './eligibility.cjs';
import { D as DiffResult } from './proof-bzr146az.cjs';
export { d as decodePng, a as diffImages, l as loadPng, r as renderProofHtml, v as verdict, w as writeProof } from './proof-bzr146az.cjs';
export { captureUrl } from './capture.cjs';
export { b as CaptureSettings, D as DEFAULT_CAPTURE_SETTINGS } from './types-Miq-3WVh.cjs';
import 'playwright-core';

type StructureSignature = {
    /** `${kind}@${selector}` for each repeated group, sorted & de-duped (no counts). */
    shapes: string[];
    /** De-duped stable motion anchors (cssPaths), sorted. */
    anchors: string[];
    /** Number of form fields (coarse — a redesign changes this, data does not). */
    formFields: number;
    eligible: boolean;
};
/** >= this share of shared shape tokens => structurally stable (data-only change). */
declare const STRUCTURE_STABLE_MIN = 0.8;
declare function structureSignature(classification: Classification): StructureSignature;
/**
 * Jaccard similarity over the union of shape + anchor tokens. 1 = identical
 * structure, 0 = nothing shared. Robust to sampling jitter (a couple of anchors
 * shifting) the way an exact-equality check is not.
 */
declare function signatureSimilarity(a: StructureSignature, b: StructureSignature): number;
/**
 * Structure is "stable" when the new capture is still eligible, the form-field
 * count is unchanged, and the shape/anchor sets overlap past the threshold.
 */
declare function isStructureStable(prev: StructureSignature, next: StructureSignature): boolean;

/** A recapture this close to the reference frame is "unchanged" (determinism-grade). */
declare const NOCHANGE_MAX_PCT = 0.05;
type UpdateAction = "skip" | "publish" | "flag";
type UpdateDecision = {
    action: UpdateAction;
    reason: string;
    signature: StructureSignature;
    changed: boolean;
    eligible: boolean;
    qualityPass: boolean;
    structureStable: boolean;
    metrics: {
        pixelDiffPct: number;
        ssim: number;
    } | null;
};
/** A reference-vs-candidate diff this small means the screen did not change. */
declare function isUnchanged(diff: DiffResult): boolean;
declare function decideUpdate(input: {
    /** Prior accepted render's structure signature (null = first ever capture). */
    prevSignature: StructureSignature | null;
    /** Fresh capture-time evaluation of the source screen. */
    evaluation: ScreenEvaluation;
    /** Did the screen change vs the stored reference frame? (reference diff > NOCHANGE) */
    changed: boolean;
}): UpdateDecision;

export { Classification, DiffResult, NOCHANGE_MAX_PCT, STRUCTURE_STABLE_MIN, ScreenEvaluation, type StructureSignature, type UpdateAction, type UpdateDecision, decideUpdate, isStructureStable, isUnchanged, signatureSimilarity, structureSignature };
