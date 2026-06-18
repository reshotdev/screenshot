const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createApiError } = require("../../src/lib/api-client");

describe("API client error normalization", () => {
  it("surfaces status, endpoint, and response details in publish failures", () => {
    const error = createApiError("publish_ingest_failure", "https://reshot.dev/api/v1/publish", {
      message: "Request failed with status code 500",
      response: {
        status: 500,
        statusText: "Internal Server Error",
        data: {
          error: "storage write failed",
          details: "r2 bucket unavailable",
        },
      },
    });

    assert.match(
      error.message,
      /publish_ingest_failure \(500 Internal Server Error\) at https:\/\/reshot\.dev\/api\/v1\/publish: storage write failed/,
    );
    assert.equal(error.reshot.kind, "publish_ingest_failure");
    assert.equal(error.reshot.status, 500);
    assert.equal(error.reshot.endpoint, "https://reshot.dev/api/v1/publish");
    assert.equal(error.reshot.bodySummary, "storage write failed");
  });
});
