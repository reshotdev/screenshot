const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  attachRecorderRoutes,
  isRecordableTarget,
  sortRecorderTabs,
  toRecorderTab,
} = require("../../src/lib/ui-recorder-routes");

function createApp() {
  const routes = new Map();
  const register = (method) => (path, handler) => {
    routes.set(`${method} ${path}`, handler);
  };

  return {
    routes,
    get: register("GET"),
    post: register("POST"),
    delete: register("DELETE"),
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function invoke(app, routeKey, req = {}) {
  const handler = app.routes.get(routeKey);
  assert.ok(handler, `Expected route ${routeKey} to be registered`);

  const res = createResponse();
  let nextError = null;
  await handler(
    {
      body: {},
      params: {},
      query: {},
      ...req,
    },
    res,
    (error) => {
      nextError = error;
    },
  );

  if (nextError) throw nextError;
  return res;
}

describe("ui recorder route helpers", () => {
  it("classifies recordable Chrome targets", () => {
    assert.equal(
      isRecordableTarget({ type: "page", url: "https://example.com" }),
      true,
    );
    assert.equal(isRecordableTarget({ type: "iframe", url: "https://x.test" }), false);
    assert.equal(isRecordableTarget({ type: "page", url: "chrome://settings" }), false);
    assert.equal(isRecordableTarget({ type: "page", url: "about:blank" }), false);
  });

  it("sorts real pages before Chrome internals and the Reshot UI", () => {
    const tabs = [
      toRecorderTab({ id: "ui", title: "Reshot", url: "http://localhost:4300" }),
      toRecorderTab({ id: "chrome", title: "Settings", url: "chrome://settings" }),
      toRecorderTab({ id: "app", title: "App", url: "https://example.com" }),
    ].sort(sortRecorderTabs);

    assert.deepEqual(
      tabs.map((tab) => tab.id),
      ["app", "chrome", "ui"],
    );
  });
});

describe("attachRecorderRoutes", () => {
  it("registers unavailable Chrome response with launch instructions", async () => {
    const app = createApp();
    attachRecorderRoutes(app, {}, {
      recordCdp: {
        checkCdpEndpoint: async () => ({ available: false, error: "refused" }),
      },
    });

    const res = await invoke(app, "GET /api/recorder/check-chrome");

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.chromeAvailable, false);
    assert.equal(res.body.error, "refused");
    assert.match(res.body.instructions.darwin, /remote-debugging-port=9222/);
  });

  it("lists and sorts recorder tabs", async () => {
    const app = createApp();
    attachRecorderRoutes(app, {}, {
      recordCdp: {
        checkCdpEndpoint: async () => ({ available: true }),
        getCdpTargets: async () => [
          { id: "ui", type: "page", title: "Reshot", url: "http://127.0.0.1:4300" },
          { id: "worker", type: "service_worker", title: "Worker", url: "https://x.test" },
          { id: "chrome", type: "page", title: "Settings", url: "chrome://settings" },
          { id: "app", type: "page", title: "App", url: "https://app.test" },
        ],
      },
    });

    const res = await invoke(app, "GET /api/recorder/tabs");

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.deepEqual(
      res.body.tabs.map((tab) => tab.id),
      ["app", "chrome", "ui"],
    );
  });

  it("returns inert status and steps when recorder service is unavailable", async () => {
    const app = createApp();
    attachRecorderRoutes(app, {}, {
      recordCdp: {
        checkCdpEndpoint: async () => ({ available: false }),
      },
    });

    const status = await invoke(app, "GET /api/recorder/status");
    const steps = await invoke(app, "GET /api/recorder/steps");

    assert.deepEqual(status.body, {
      ok: true,
      status: { active: false, error: "Recorder service not available" },
    });
    assert.deepEqual(steps.body, { ok: true, steps: [] });
  });

  it("passes UI mode options to recorder service actions", async () => {
    const calls = [];
    const app = createApp();
    attachRecorderRoutes(
      app,
      {
        recorderService: {
          start: async (options) => {
            calls.push(["start", options]);
            return { sessionId: "session-1" };
          },
          stop: async (save, options) => {
            calls.push(["stop", save, options]);
            return { saved: save };
          },
          capture: async (options) => {
            calls.push(["capture", options]);
            return { key: "step-1" };
          },
        },
      },
      {
        recordCdp: {
          checkCdpEndpoint: async () => ({ available: false }),
        },
      },
    );

    await invoke(app, "POST /api/recorder/start", {
      body: { visualKey: "hero", targetId: "tab-1" },
    });
    await invoke(app, "POST /api/recorder/stop", {
      body: { save: false, mergeMode: "append" },
    });
    await invoke(app, "POST /api/recorder/capture", {
      body: { outputFilename: "hero.png" },
    });

    assert.deepEqual(calls, [
      ["start", { visualKey: "hero", title: undefined, targetUrl: undefined, targetId: "tab-1", scenarioUrl: undefined, uiMode: true }],
      ["stop", false, { uiMode: true, mergeMode: "append" }],
      ["capture", { outputFilename: "hero.png", areaType: "full", selector: undefined, uiMode: true }],
    ]);
  });
});
