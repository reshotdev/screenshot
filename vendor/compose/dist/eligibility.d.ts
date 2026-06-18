import { Page } from 'playwright-core';
import { a as CaptureSnapshot, b as CaptureSettings, c as CaptureStorageState } from './types-Miq-3WVh.js';

type RepeatedGroup = {
    kind: "table" | "aria-rows" | "list" | "cards";
    count: number;
    selector: string;
};
type EligibilitySignals = {
    vw: number;
    vh: number;
    repeated: RepeatedGroup[];
    maxRepeat: number;
    formFields: number;
    rasterHeroFraction: number;
    canvasFraction: number;
    kpiCards: number;
    textChars: number;
    anchorStableRatio: number;
    sampleStableAnchors: string[];
    sampleHashedAnchors: string[];
};
type Classification = {
    /** In the reconstruction-eligible class. */
    eligible: boolean;
    /** Authored motion can bind to stable anchors (rrweb replay does not need this). */
    animatable: boolean;
    reasons: string[];
    signals: EligibilitySignals;
};
declare const MIN_REPEAT = 3;
declare const HERO_FRACTION = 0.35;
declare const CANVAS_FRACTION = 0.35;
declare const ANCHOR_STABLE_MIN = 0.6;
declare function collectSignalsInPage(): EligibilitySignals;
/** Pure, fail-safe decision over the signals. */
declare function classify(signals: EligibilitySignals): Classification;

type Route = "reconstruction" | "video";
type QualitySummary = {
    pass: boolean;
    pixelDiffPct: number;
    ssim: number;
};
type RouteDecision = {
    route: Route;
    reason: string;
    eligible: boolean;
    /** null when the quality check was not run (e.g. ineligible short-circuit). */
    qualityPass: boolean | null;
};
declare function decideRoute(classification: Classification, quality?: QualitySummary | null): RouteDecision;

type CleanDataHit = {
    /** Category: "empty-state" | "placeholder" | "pii-email" | "pii-phone" | custom. */
    kind: string;
    /** The matched snippet (trimmed), for the skip-reason log. */
    sample: string;
};
type CleanDataResult = {
    clean: boolean;
    reasons: string[];
    hits: CleanDataHit[];
};
type CleanDataConfig = {
    /** Extra deny patterns (regex source + kind label + optional flags). */
    deny?: {
        pattern: string;
        kind: string;
        flags?: string;
    }[];
    /** Phrases that indicate an empty/placeholder state (case-insensitive substring). */
    emptyStatePhrases?: string[];
    /** Substrings that SUPPRESS a hit when they contain the match (legit product copy). */
    allow?: string[];
    /** Tolerated count of email-like strings before flagging. Default 0. */
    maxEmails?: number;
    /** Tolerated count of phone-like strings before flagging. Default 0. */
    maxPhones?: number;
    /** Run PII (email/phone) checks. Default true. Disable for screens that legitimately show contacts. */
    pii?: boolean;
};
/** Strip script/style + tags, decode the common entities, collapse whitespace. */
declare function extractVisibleText(html: string): string;
/**
 * Check whether a captured screen's data is marketing-grade. Returns every hit so
 * the caller can log specific skip reasons. `clean` is true iff there are no hits.
 */
declare function checkCleanData(input: {
    html: string;
} | string, config?: CleanDataConfig): CleanDataResult;

/** Classify a live, navigated, settled page. */
declare function classifyPage(page: Page): Promise<Classification>;
type ScreenEvaluation = {
    classification: Classification;
    decision: RouteDecision;
    /** Quality is only measured when the screen is structurally eligible. */
    quality: {
        pass: boolean;
        pixelDiffPct: number;
        ssim: number;
    } | null;
    livePng: Buffer;
    /** Only produced when eligible (reconstruction attempted). */
    remountPng: Buffer | null;
    snapshot: CaptureSnapshot | null;
};
/**
 * The capture-time gate on an ALREADY navigated + settled page: screenshot,
 * classify, and if (and only if) structurally eligible, reconstruct + remount +
 * run the calibrated quality check, then route. Use this when the caller owns the
 * browser/page lifecycle — e.g. authenticated `/app` screens that need cookies +
 * an init script before navigation (the auto-update loop over real dashboards).
 * `evaluateUrl` is the unauthenticated convenience wrapper around this.
 */
declare function evaluatePage(page: Page, opts?: {
    settings?: CaptureSettings;
    csp?: string | null;
}): Promise<ScreenEvaluation>;
/**
 * End-to-end capture-time gate in ONE navigation: classify, and if (and only if)
 * structurally eligible, reconstruct + remount + run the calibrated quality check,
 * then route. Ineligible screens short-circuit BEFORE any reconstruction work —
 * the video path does no extra rendering (additive, no regression).
 */
declare function evaluateUrl(url: string, opts?: {
    settings?: CaptureSettings;
    csp?: string | null;
    storageState?: CaptureStorageState;
}): Promise<ScreenEvaluation>;

export { ANCHOR_STABLE_MIN, CANVAS_FRACTION, type Classification, type CleanDataConfig, type CleanDataHit, type CleanDataResult, type EligibilitySignals, HERO_FRACTION, MIN_REPEAT, type QualitySummary, type RepeatedGroup, type Route, type RouteDecision, type ScreenEvaluation, checkCleanData, classify, classifyPage, collectSignalsInPage, decideRoute, evaluatePage, evaluateUrl, extractVisibleText };
