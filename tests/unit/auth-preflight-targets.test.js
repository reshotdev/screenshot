const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { resolveAuthPreflightTargets } = require("../../src/lib/capture-script-runner");

describe("resolveAuthPreflightTargets", () => {
  it("uses configured targets and selected live-auth scenario URLs", () => {
    const result = resolveAuthPreflightTargets(
      {
        target: {
          authPreflightUrls: ["/app/projects", "/app/settings"],
        },
        scenarios: [
          {
            key: "dashboard",
            url: "/app/projects/123/dashboard",
            captureClass: "live-auth",
          },
          {
            key: "billing",
            url: "/app/settings/billing",
            captureClass: "live-auth",
          },
          {
            key: "marketing-home",
            url: "/",
            captureClass: "public",
          },
        ],
      },
      { scenarioKeys: ["billing"] },
    );

    assert.deepEqual(result.selectedScenarioKeys, ["billing"]);
    assert.deepEqual(result.liveAuthScenarioKeys, ["billing"]);
    assert.deepEqual(result.targets, [
      "/app/projects",
      "/app/settings",
      "/app/settings/billing",
    ]);
  });

  it("skips fixture-auth scenarios and falls back only for selected live-auth runs", () => {
    const fixtureOnly = resolveAuthPreflightTargets({
      scenarios: [
        {
          key: "fixture-dashboard",
          url: "/fixture/dashboard",
          captureClass: "fixture-auth",
        },
      ],
    });

    assert.deepEqual(fixtureOnly.liveAuthScenarioKeys, []);
    assert.deepEqual(fixtureOnly.targets, []);

    const liveAuthFallback = resolveAuthPreflightTargets({
      scenarios: [
        {
          key: "dashboard",
          url: "/app/dashboard",
          captureClass: "live-auth",
        },
      ],
    });

    assert.deepEqual(liveAuthFallback.targets, ["/app/dashboard"]);
  });
});