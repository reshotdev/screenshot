const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeConfigContract,
  validateNormalizedConfig,
  getCertifiedScenarioKeys,
} = require("../../src/lib/target-contract");

describe("target contract normalization", () => {
  it("maps legacy auth and readiness fields into the certified-target contract", () => {
    const normalized = normalizeConfigContract({
      baseUrl: "http://localhost:3000",
      target: {
        key: "paperjsx-platform",
        displayName: "PaperJSX Platform",
        tier: "certified",
        baseUrl: "http://localhost:3001",
        defaultAuthMode: "live-auth",
        authPreflightUrl: ["/app/projects", "/app/settings"],
        certifiedScenarios: ["playground-workflow"],
        supportedLocalCommand: "npm run build && npm run start -- --port 3001",
      },
      scenarios: [
        {
          key: "playground-workflow",
          url: "/playground",
          requiresAuth: false,
          readySelector: "[data-reshot-ready='playground-page-ready']",
          readyExpression: "window.__READY__ === true",
          publishPolicy: "required",
          requiredRoutes: ["/playground"],
          requiredSelectors: ["[data-testid='playground-page']"],
        },
        {
          key: "dashboard-overview",
          url: "/dashboard",
          requiresAuth: true,
          waitForReady: {
            selector: "[data-testid='dashboard-overview']",
          },
        },
      ],
    });

    validateNormalizedConfig(normalized);

    assert.equal(normalized.target.tier, "certified");
    assert.equal(
      normalized.target.supportedLocalCommand,
      "npm run build && npm run start -- --port 3001",
    );
    assert.equal(normalized.target.authPreflightUrl, "/app/projects");
    assert.deepEqual(normalized.target.authPreflightUrls, ["/app/projects", "/app/settings"]);
    assert.deepEqual(getCertifiedScenarioKeys(normalized), ["playground-workflow"]);
    assert.equal(
      normalized.scenarios[0].captureClass,
      "public",
    );
    assert.equal(
      normalized.scenarios[0].ready.selector,
      "[data-reshot-ready='playground-page-ready']",
    );
    assert.equal(
      normalized.scenarios[0].ready.expression,
      "window.__READY__ === true",
    );
    assert.equal(normalized.scenarios[1].captureClass, "live-auth");
    assert.equal(
      normalized.scenarios[1].ready.selector,
      "[data-testid='dashboard-overview']",
    );
  });
});
