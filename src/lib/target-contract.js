"use strict";

const TARGET_TIERS = new Set(["certified", "candidate", "custom"]);
const TARGET_AUTH_MODES = new Set(["public", "fixture", "live-auth"]);
const SCENARIO_CAPTURE_CLASSES = new Set([
  "public",
  "fixture-auth",
  "live-auth",
]);
const PUBLISH_POLICIES = new Set(["required", "optional"]);

function normalizeTargetTier(value) {
  const normalized = String(value || "custom").trim().toLowerCase();
  return TARGET_TIERS.has(normalized) ? normalized : "custom";
}

function normalizeTargetAuthMode(value) {
  const normalized = String(value || "public").trim().toLowerCase();
  if (normalized === "fixture-auth") return "fixture";
  if (normalized === "authenticated" || normalized === "auth") {
    return "live-auth";
  }
  return TARGET_AUTH_MODES.has(normalized) ? normalized : "public";
}

function normalizeScenarioCaptureClass(value, requiresAuth, defaultAuthMode) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) {
    if (requiresAuth) {
      return defaultAuthMode === "fixture" ? "fixture-auth" : "live-auth";
    }
    return "public";
  }

  if (
    normalized === "fixture" ||
    normalized === "docs-fixture" ||
    normalized === "fixture-auth"
  ) {
    return "fixture-auth";
  }

  if (
    normalized === "live-auth" ||
    normalized === "auth" ||
    normalized === "authenticated"
  ) {
    return "live-auth";
  }

  if (
    normalized === "public" ||
    normalized === "public-docs" ||
    normalized === "public-explorer"
  ) {
    return "public";
  }

  return requiresAuth
    ? defaultAuthMode === "fixture"
      ? "fixture-auth"
      : "live-auth"
    : "public";
}

function normalizeReadyContract(scenario) {
  const ready = scenario.ready && typeof scenario.ready === "object"
    ? scenario.ready
    : {};
  const waitForReady =
    scenario.waitForReady && typeof scenario.waitForReady === "object"
      ? scenario.waitForReady
      : {};

  const selector =
    ready.selector ||
    scenario.readySelector ||
    waitForReady.selector ||
    null;
  const expression =
    ready.expression ||
    scenario.readyExpression ||
    waitForReady.expression ||
    null;
  const timeout =
    ready.timeout ||
    waitForReady.timeout ||
    scenario.readyTimeout ||
    null;

  if (!selector && !expression && !timeout) {
    return null;
  }

  return {
    ...(selector ? { selector } : {}),
    ...(expression ? { expression } : {}),
    ...(timeout ? { timeout } : {}),
  };
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeOneOrManyStrings(value) {
  if (Array.isArray(value)) {
    return normalizeStringArray(value);
  }

  const normalized = String(value || "").trim();
  return normalized ? [normalized] : [];
}

function inferExpectedArtifacts(scenario) {
  return (scenario.steps || [])
    .filter((step) => step.action === "screenshot" && step.key)
    .map((step) => String(step.key));
}

function normalizePublishPolicy(value) {
  const normalized = String(value || "required").trim().toLowerCase();
  return PUBLISH_POLICIES.has(normalized) ? normalized : "required";
}

function normalizeScenarioContract(scenario, target) {
  const defaultAuthMode = target?.defaultAuthMode || "public";
  const captureClass = normalizeScenarioCaptureClass(
    scenario.captureClass,
    Boolean(scenario.requiresAuth),
    defaultAuthMode,
  );
  const ready = normalizeReadyContract(scenario);
  const requiredSelectors = normalizeStringArray(scenario.requiredSelectors);
  const readySelector = ready?.selector || null;
  const expectedArtifacts = normalizeStringArray(scenario.expectedArtifacts);

  return {
    ...scenario,
    captureClass,
    requiresAuth: captureClass !== "public",
    ready,
    readySelector: readySelector || undefined,
    readyExpression: ready?.expression || undefined,
    readyTimeout: ready?.timeout || scenario.readyTimeout,
    waitForReady: ready || scenario.waitForReady || null,
    requiredRoutes: normalizeStringArray(
      scenario.requiredRoutes && scenario.requiredRoutes.length > 0
        ? scenario.requiredRoutes
        : scenario.url
          ? [scenario.url]
          : [],
    ),
    requiredSelectors:
      requiredSelectors.length > 0
        ? requiredSelectors
        : readySelector
          ? [readySelector]
          : [],
    needsWorkspaceInjection:
      scenario.needsWorkspaceInjection !== undefined
        ? Boolean(scenario.needsWorkspaceInjection)
        : captureClass !== "public",
    expectedArtifacts:
      expectedArtifacts.length > 0 ? expectedArtifacts : inferExpectedArtifacts(scenario),
    publishPolicy: normalizePublishPolicy(scenario.publishPolicy),
  };
}

function normalizeTargetBlock(config) {
  const raw = config.target && typeof config.target === "object"
    ? config.target
    : {};

  const fixture =
    raw.fixture && typeof raw.fixture === "object" ? raw.fixture : {};
  const authPreflightUrls = normalizeOneOrManyStrings(
    raw.authPreflightUrls || raw.authPreflightUrl,
  );

  return {
    key: String(raw.key || config.name || config.projectId || "local-target"),
    displayName: String(raw.displayName || raw.key || config.name || "Local Target"),
    tier: normalizeTargetTier(raw.tier),
    owner: String(raw.owner || "local"),
    baseUrl: String(raw.baseUrl || config.baseUrl || "").replace(/\/+$/, ""),
    captureSafe: Boolean(raw.captureSafe),
    defaultAuthMode: normalizeTargetAuthMode(raw.defaultAuthMode),
    supportedLocalCommand: String(
      raw.supportedLocalCommand ||
        raw.localServerCommand ||
        raw.startCommand ||
        "",
    ).trim() || null,
    fixture:
      fixture.command || fixture.script || fixture.healthUrl
        ? {
            ...(fixture.command ? { command: String(fixture.command) } : {}),
            ...(fixture.script ? { script: String(fixture.script) } : {}),
            ...(fixture.healthUrl ? { healthUrl: String(fixture.healthUrl) } : {}),
          }
        : null,
    requiredEnv: normalizeStringArray(raw.requiredEnv),
    certificationScenarioKeys: normalizeStringArray(
      raw.certificationScenarioKeys || raw.certifiedScenarios || [],
    ),
    authPreflightUrl: authPreflightUrls[0] || null,
    authPreflightUrls,
  };
}

function normalizeConfigContract(config) {
  const target = normalizeTargetBlock(config);
  const scenarios = Array.isArray(config.scenarios)
    ? config.scenarios.map((scenario) => normalizeScenarioContract(scenario, target))
    : [];

  return {
    ...config,
    target,
    scenarios,
  };
}

function validateNormalizedConfig(config) {
  const errors = [];

  if (!config.target || typeof config.target !== "object") {
    return {
      valid: true,
      errors,
    };
  }

  if (!TARGET_TIERS.has(config.target.tier)) {
    errors.push(`Invalid target tier "${config.target.tier}"`);
  }

  if (!TARGET_AUTH_MODES.has(config.target.defaultAuthMode)) {
    errors.push(`Invalid target.defaultAuthMode "${config.target.defaultAuthMode}"`);
  }

  for (const scenario of config.scenarios || []) {
    if (!SCENARIO_CAPTURE_CLASSES.has(scenario.captureClass)) {
      errors.push(
        `Scenario "${scenario.key}" has invalid captureClass "${scenario.captureClass}"`,
      );
    }
    if (!PUBLISH_POLICIES.has(scenario.publishPolicy)) {
      errors.push(
        `Scenario "${scenario.key}" has invalid publishPolicy "${scenario.publishPolicy}"`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function getCertifiedScenarioKeys(config, explicitScenarioKeys = null) {
  if (Array.isArray(explicitScenarioKeys) && explicitScenarioKeys.length > 0) {
    return explicitScenarioKeys;
  }

  const configured = normalizeStringArray(config?.target?.certificationScenarioKeys);
  if (configured.length > 0) {
    return configured;
  }

  return (config?.scenarios || []).map((scenario) => scenario.key);
}

module.exports = {
  TARGET_TIERS,
  TARGET_AUTH_MODES,
  SCENARIO_CAPTURE_CLASSES,
  PUBLISH_POLICIES,
  normalizeConfigContract,
  normalizeTargetBlock,
  normalizeScenarioContract,
  validateNormalizedConfig,
  getCertifiedScenarioKeys,
};
