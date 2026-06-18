const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { withRetry } = require("../../src/lib/api-client");

// Fast retry options to keep tests quick
const fastOpts = { initialDelay: 10, maxDelay: 50 };

function makeAxiosError(status, extras = {}) {
  const err = new Error(`Request failed with status code ${status}`);
  err.response = { status, statusText: `${status}`, headers: {}, ...extras };
  return err;
}

function makeNetworkError(code) {
  const err = new Error(`connect ${code}`);
  err.code = code;
  return err;
}

describe("withRetry", () => {
  it("retries on 500 and eventually succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw makeAxiosError(500);
        return "ok";
      },
      { maxRetries: 3, ...fastOpts },
    );

    assert.equal(result, "ok");
    assert.equal(calls, 3);
  });

  it("exhausts retries on 503 and throws", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            calls++;
            throw makeAxiosError(503);
          },
          { maxRetries: 3, ...fastOpts },
        ),
      (err) => {
        assert.equal(err.response.status, 503);
        return true;
      },
    );
    assert.equal(calls, 3);
  });

  it("handles 429 with Retry-After header", async () => {
    let calls = 0;
    const start = Date.now();
    const result = await withRetry(
      async () => {
        calls++;
        if (calls === 1) {
          throw makeAxiosError(429, {
            headers: { "retry-after": "1" },
          });
        }
        return "rate-limit-recovered";
      },
      { maxRetries: 3, retryOn: [429, 500], ...fastOpts },
    );

    assert.equal(result, "rate-limit-recovered");
    assert.equal(calls, 2);
    // Retry-After: 1 means 1000ms delay
    assert.ok(Date.now() - start >= 900, "should wait ~1s for Retry-After");
  });

  it("does NOT retry on 400 (non-retryable)", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            calls++;
            throw makeAxiosError(400);
          },
          { maxRetries: 3, ...fastOpts },
        ),
      (err) => {
        assert.equal(err.response.status, 400);
        return true;
      },
    );
    assert.equal(calls, 1, "should not retry on 400");
  });

  it("does NOT retry on 401 (non-retryable)", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            calls++;
            throw makeAxiosError(401);
          },
          { maxRetries: 3, ...fastOpts },
        ),
      (err) => {
        assert.equal(err.response.status, 401);
        return true;
      },
    );
    assert.equal(calls, 1, "should not retry on 401");
  });

  it("retries on ECONNRESET and succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls === 1) throw makeNetworkError("ECONNRESET");
        return "reconnected";
      },
      { maxRetries: 3, ...fastOpts },
    );

    assert.equal(result, "reconnected");
    assert.equal(calls, 2);
  });

  it("succeeds on first try without retrying", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        return "first-try";
      },
      { maxRetries: 3, ...fastOpts },
    );

    assert.equal(result, "first-try");
    assert.equal(calls, 1);
  });

  it("retries on timeout message", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls === 1) {
          const err = new Error("timeout of 60000ms exceeded");
          throw err;
        }
        return "timeout-recovered";
      },
      { maxRetries: 3, ...fastOpts },
    );

    assert.equal(result, "timeout-recovered");
    assert.equal(calls, 2);
  });
});
