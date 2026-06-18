import type { Job } from "./types";

export const JOBS_LIST_ENDPOINT = "/api/jobs?limit=50";

export function jobDetailEndpoint(jobId: string) {
  return `/api/jobs/${jobId}`;
}

export function cancelJobEndpoint(jobId: string) {
  return `/api/jobs/${jobId}/cancel`;
}

export interface RetryJobRequest {
  endpoint: string;
  body: Record<string, unknown>;
}

export function buildRetryJobRequest(
  job: Pick<Job, "type" | "metadata">,
): RetryJobRequest | null {
  const meta = (job.metadata || {}) as Record<string, unknown>;

  switch (job.type) {
    case "run":
      return {
        endpoint: "/api/jobs/run",
        body: {
          scenarioKeys: meta.scenarioKeys,
          variant: meta.variant,
          format: meta.format,
          diff: meta.diff,
        },
      };
    case "publish":
      return {
        endpoint: "/api/jobs/publish",
        body: {
          scenarioKeys: meta.scenarioKeys,
          selectedGroups: meta.selectedGroups,
          commitMessage: meta.commitMessage,
        },
      };
    case "record":
      return {
        endpoint: "/api/jobs/record",
        body: { ...meta },
      };
    default:
      return null;
  }
}
