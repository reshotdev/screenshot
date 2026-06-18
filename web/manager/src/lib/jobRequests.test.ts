import { describe, expect, it } from "vitest";

import {
  buildRetryJobRequest,
  cancelJobEndpoint,
  jobDetailEndpoint,
  JOBS_LIST_ENDPOINT,
} from "./jobRequests";

describe("job request helpers", () => {
  it("keeps list and detail endpoints unchanged", () => {
    expect(JOBS_LIST_ENDPOINT).toBe("/api/jobs?limit=50");
    expect(jobDetailEndpoint("job-123")).toBe("/api/jobs/job-123");
    expect(cancelJobEndpoint("job-123")).toBe("/api/jobs/job-123/cancel");
  });

  it("builds retry requests for run jobs from the original metadata fields", () => {
    expect(
      buildRetryJobRequest({
        type: "run",
        metadata: {
          scenarioKeys: ["checkout"],
          variant: "mobile",
          format: "summary-video",
          diff: true,
          ignored: "not forwarded",
        },
      }),
    ).toEqual({
      endpoint: "/api/jobs/run",
      body: {
        scenarioKeys: ["checkout"],
        variant: "mobile",
        format: "summary-video",
        diff: true,
      },
    });
  });

  it("builds retry requests for publish jobs from the original metadata fields", () => {
    expect(
      buildRetryJobRequest({
        type: "publish",
        metadata: {
          scenarioKeys: ["checkout"],
          selectedGroups: [{ scenarioKey: "checkout" }],
          commitMessage: "Publish assets",
          variant: "ignored",
        },
      }),
    ).toEqual({
      endpoint: "/api/jobs/publish",
      body: {
        scenarioKeys: ["checkout"],
        selectedGroups: [{ scenarioKey: "checkout" }],
        commitMessage: "Publish assets",
      },
    });
  });

  it("builds retry requests for record jobs by forwarding metadata", () => {
    expect(
      buildRetryJobRequest({
        type: "record",
        metadata: {
          url: "https://example.com",
          browser: "chrome",
        },
      }),
    ).toEqual({
      endpoint: "/api/jobs/record",
      body: {
        url: "https://example.com",
        browser: "chrome",
      },
    });
  });

  it("returns null for unknown runtime job types", () => {
    expect(
      buildRetryJobRequest({
        type: "unknown",
        metadata: {},
      } as unknown as Parameters<typeof buildRetryJobRequest>[0]),
    ).toBeNull();
  });
});
