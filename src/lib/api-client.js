// api-client.js - API client for communicating with Next.js API
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");

const PRODUCTION_API_URL = "https://reshot.dev/api";

function summarizeApiBody(body) {
  if (body == null) return "";
  if (typeof body === "string") return body.trim();
  if (typeof body !== "object") return String(body);

  const candidates = [
    body.message,
    body.error?.message,
    body.error,
    body.reason,
    body.details,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

function createApiError(kind, endpoint, error) {
  const status = error.response?.status || null;
  const statusText = error.response?.statusText || "";
  const bodySummary = summarizeApiBody(error.response?.data);
  const baseMessage = bodySummary || error.message || "Unknown API error";
  const statusLabel = status ? `${status}${statusText ? ` ${statusText}` : ""}` : "request failed";
  const wrapped = new Error(`${kind} (${statusLabel}) at ${endpoint}: ${baseMessage}`);
  wrapped.response = error.response;
  wrapped.code = error.code;
  wrapped.reshot = {
    kind,
    endpoint,
    status,
    statusText,
    bodySummary,
  };
  return wrapped;
}

function getApiBaseUrl() {
  // 1. Explicit env var override (for CI or local dev)
  if (process.env.RESHOT_API_BASE_URL) {
    return process.env.RESHOT_API_BASE_URL;
  }

  // 2. Read from settings.json (set during auth/setup)
  try {
    const path = require("path");
    const settingsPath = path.join(process.cwd(), ".reshot", "settings.json");
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (settings.platformUrl) {
        return settings.platformUrl.replace(/\/+$/, "") + "/api";
      }
    }
  } catch {
    // Settings don't exist yet (first auth) — fall through to default
  }

  // 3. Default to production
  return PRODUCTION_API_URL;
}

// Resolved once at module load — all API calls use this
const baseUrl = getApiBaseUrl();

/**
 * Sleep helper for retry delays
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @returns {Promise<any>}
 */
async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    retryOn = [500, 502, 503, 504, "ECONNRESET", "ETIMEDOUT", "ENOTFOUND"],
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if this error is retryable
      const statusCode = error.response?.status;
      const errorCode = error.code;

      const isRetryable =
        retryOn.includes(statusCode) ||
        retryOn.includes(errorCode) ||
        error.message?.includes("timeout");

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      // Respect Retry-After header on 429 rate limit responses
      const retryAfterHeader = error.response?.headers?.["retry-after"];
      if (retryAfterHeader && statusCode === 429) {
        const retryMs = (parseInt(retryAfterHeader, 10) || 5) * 1000;
        console.log(
          `  ⚠ Rate limited (attempt ${attempt}/${maxRetries}), retrying in ${retryMs / 1000}s...`,
        );
        await sleep(retryMs);
        continue;
      }

      // Calculate delay with exponential backoff + jitter
      const delay = Math.min(
        initialDelay * Math.pow(2, attempt - 1) + Math.random() * 1000,
        maxDelay,
      );
      console.log(
        `  ⚠ Request failed (attempt ${attempt}/${maxRetries}), retrying in ${Math.round(
          delay,
        )}ms...`,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Get all projects
 */
async function getProjects() {
  return withRetry(async () => {
    const response = await axios.get(`${baseUrl}/projects`, { timeout: 30000 });
    return response.data;
  });
}

/**
 * Get a single project by ID
 */
async function getProject(id) {
  return withRetry(async () => {
    try {
      const response = await axios.get(`${baseUrl}/projects/${id}`, {
        timeout: 30000,
      });
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        throw new Error(`Project '${id}' not found`);
      }
      throw error;
    }
  });
}

/**
 * Get visuals for a project
 */
async function getVisuals(projectId, apiKey) {
  return withRetry(async () => {
    const headers = {};
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    const response = await axios.get(
      `${baseUrl}/projects/${projectId}/visuals`,
      { headers, timeout: 30000 },
    );
    return response.data;
  });
}

/**
 * Get visual keys as a Set for efficient validation lookups
 * @param {string} projectId - Project ID
 * @param {string} apiKey - API key for authentication
 * @returns {Promise<Set<string>>} Set of visual keys
 */
async function getVisualKeys(projectId, apiKey) {
  const data = await getVisuals(projectId, apiKey);
  const visuals = data.visuals || data.data?.visuals || [];
  return new Set(visuals.map((v) => v.key));
}

/**
 * Publish an asset
 */
async function publishAsset(projectId, assetFilePath, metadata) {
  return withRetry(
    async () => {
      const formData = new FormData();
      formData.append("assetFile", fs.createReadStream(assetFilePath));
      formData.append("apiKey", metadata.apiKey);
      formData.append("visualKey", metadata.visualKey);
      formData.append("context", metadata.context || "{}");
      formData.append("commitHash", metadata.commitHash || "");
      formData.append("commitMessage", metadata.commitMessage || "");

      const response = await axios.post(
        `${baseUrl}/projects/${projectId}/assets/publish`,
        formData,
        {
          headers: formData.getHeaders(),
          timeout: 60000, // 60s for uploads
        },
      );
      return response.data;
    },
    { maxRetries: 2 },
  ); // Fewer retries for uploads
}

/**
 * Publish a batch of assets using the v1 ingestion endpoint
 */
async function publishAssetsV1(apiKey, metadata, assets) {
  if (!apiKey) {
    throw new Error("API key is required to publish assets");
  }
  if (!metadata?.projectId) {
    throw new Error("metadata.projectId is required");
  }
  if (!assets || Object.keys(assets).length === 0) {
    throw new Error("At least one asset is required for publishing");
  }

  const formData = new FormData();
  formData.append("metadata", JSON.stringify(metadata));

  for (const [captureKey, assetPath] of Object.entries(assets)) {
    formData.append(captureKey, fs.createReadStream(assetPath));
  }

  try {
    const response = await axios.post(`${baseUrl}/v1/publish`, formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 180000, // 3 minutes for large uploads
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return response.data;
  } catch (error) {
    throw createApiError("publish_ingest_failure", `${baseUrl}/v1/publish`, error);
  }
}

/**
 * Get review queue for a project
 */
async function getReviewQueue(projectId, apiKey) {
  try {
    const headers = {};
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    const response = await axios.get(
      `${baseUrl}/projects/${projectId}/review-queue`,
      { headers },
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      // 404 is acceptable - endpoint might not exist yet
      if (error.response.status === 404) {
        return [];
      }
      throw new Error(
        `Failed to fetch review queue: ${error.response.status} ${error.response.statusText}`,
      );
    }
    throw new Error(`Failed to fetch review queue: ${error.message}`);
  }
}

/**
 * Publish documentation files
 */
async function publishDocs(apiKey, docsPayload) {
  if (!apiKey) {
    throw new Error("API key is required to publish docs");
  }
  if (!docsPayload?.projectId) {
    throw new Error("projectId is required in docs payload");
  }
  if (
    !docsPayload.docs ||
    !Array.isArray(docsPayload.docs) ||
    docsPayload.docs.length === 0
  ) {
    throw new Error("At least one doc is required for publishing");
  }

  // Transform docs to pages format expected by API
  const pages = docsPayload.docs.map((doc) => {
    // Convert path to slug (remove .md/.mdx extension and path separators)
    const slug = doc.path
      .replace(/\.(md|mdx)$/, "")
      .replace(/\\/g, "/")
      .replace(/^\/+|\/+$/g, "");

    // Extract title from frontmatter or first heading or filename
    let title = doc.frontmatter?.title;
    if (!title) {
      const headingMatch = doc.content.match(/^#\s+(.+)$/m);
      title = headingMatch
        ? headingMatch[1]
        : slug.split("/").pop() || "Untitled";
    }

    return {
      slug,
      title,
      content: doc.content,
      isIndex:
        slug.endsWith("index") || slug === "README" || doc.frontmatter?.isIndex,
      parentSlug:
        doc.frontmatter?.parent ||
        (slug.includes("/")
          ? slug.split("/").slice(0, -1).join("/")
          : undefined),
    };
  });

  try {
    const response = await axios.post(
      `${baseUrl}/v1/publish/docs`,
      {
        pages,
        commitHash: docsPayload.commitHash || `cli-${Date.now()}`,
        branch: docsPayload.branch || "main",
        contextKey: docsPayload.contextKey || "default",
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(
        `Failed to publish docs: ${error.response.data.error || error.message}`,
      );
    }
    throw new Error(`Failed to publish docs: ${error.message}`);
  }
}

/**
 * Post changelog drafts via v1 API
 */
async function postChangelogDrafts(projectId, commitMessages, apiKey) {
  try {
    const headers = {};
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    // Transform commitMessages to the expected format
    const commits = Array.isArray(commitMessages)
      ? commitMessages.map((msg, idx) => ({
          commitMessage:
            typeof msg === "string"
              ? msg
              : msg.message || msg.commitMessage || "",
          commitHash: msg.hash || msg.commitHash || `cli-${Date.now()}-${idx}`,
          authorName: msg.author || msg.authorName || "CLI User",
        }))
      : [];

    const response = await axios.post(
      `${baseUrl}/v1/publish/changelog`,
      {
        commits,
        commitHash: commits[0]?.commitHash || `cli-${Date.now()}`,
        branch: "main",
      },
      { headers },
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(
        `Failed to post changelog drafts: ${
          error.response.data.error || error.message
        }`,
      );
    }
    throw new Error(`Failed to post changelog drafts: ${error.message}`);
  }
}

async function getProjectConfig(projectId, apiKey) {
  const response = await axios.get(`${baseUrl}/projects/${projectId}/config`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const payload = response.data?.data || response.data;
  return payload.config;
}

/**
 * Sync assets to platform
 * @param {string} apiKey - API key for authentication
 * @param {Object} metadata - Sync metadata
 * @param {Object} assetFiles - Map of fileKey to file path
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Sync result
 */
async function syncPushAssets(
  apiKey,
  metadata,
  assetFiles,
  onProgress = () => {},
) {
  if (!apiKey) {
    throw new Error("API key is required to sync assets");
  }
  if (!metadata?.projectId) {
    throw new Error("metadata.projectId is required");
  }
  if (!metadata.assets || metadata.assets.length === 0) {
    throw new Error("At least one asset is required for syncing");
  }

  const formData = new FormData();
  formData.append("metadata", JSON.stringify(metadata));

  // Add each asset file with its path as the key
  let added = 0;
  for (const asset of metadata.assets) {
    const fileKey = `${asset.scenarioKey}/${asset.variationSlug}/${asset.filename}`;
    const filePath = assetFiles[fileKey];

    if (!filePath || !fs.existsSync(filePath)) {
      console.warn(`File not found for ${fileKey}: ${filePath}`);
      continue;
    }

    formData.append(fileKey, fs.createReadStream(filePath));
    added++;
    onProgress({
      type: "file-added",
      fileKey,
      total: metadata.assets.length,
      current: added,
    });
  }

  if (added === 0) {
    throw new Error("No valid asset files found to sync");
  }

  onProgress({ type: "uploading", total: added });

  try {
    const response = await axios.post(`${baseUrl}/v1/sync`, formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${apiKey}`,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 300000, // 5 minutes for large uploads
    });

    onProgress({ type: "complete", result: response.data });
    return response.data;
  } catch (error) {
    if (error.response) {
      const errData = error.response.data;
      throw new Error(
        `Failed to sync assets: ${
          errData.error || errData.message || error.message
        }`,
      );
    }
    throw new Error(`Failed to sync assets: ${error.message}`);
  }
}

/**
 * Get sync status from platform
 * @param {string} apiKey - API key
 * @returns {Promise<Object>} Sync status
 */
async function getSyncStatus(apiKey) {
  if (!apiKey) {
    throw new Error("API key is required to get sync status");
  }

  const response = await axios.get(`${baseUrl}/v1/sync`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    timeout: 30000,
  });

  return response.data?.data || response.data;
}

/**
 * Get presigned URLs for direct R2 upload (transactional flow)
 * @param {string} apiKey - API key for authentication
 * @param {Object} payload - { files: [{ key, contentType, size, hash, visualKey }] }
 * @returns {Promise<{ urls: { [key]: { uploadUrl, publicUrl, path } }, projectId, expiresIn }>}
 */
async function signAssets(apiKey, payload) {
  if (!apiKey) {
    throw new Error("API key is required to sign assets");
  }

  return withRetry(
    async () => {
      try {
        const response = await axios.post(
          `${baseUrl}/v1/assets/sign`,
          payload,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            timeout: 30000,
          },
        );

        return response.data;
      } catch (err) {
        // Extract detailed error message from response
        if (err.response?.data?.details) {
          const details = err.response.data.details;
          const detailStr = Array.isArray(details)
            ? details
                .map((d) => `${d.path?.join(".")}: ${d.message}`)
                .join(", ")
            : JSON.stringify(details);
          throw new Error(
            `Sign failed: ${
              err.response.data.error || "Validation error"
            } - ${detailStr}`,
          );
        }
        throw err;
      }
    },
    { maxRetries: 3, retryOn: [500, 502, 503, 504, "ECONNRESET", "ETIMEDOUT"] },
  );
}

/**
 * Upload a file directly to R2 using presigned URL
 * @param {string} presignedUrl - The presigned PUT URL (can be relative or absolute)
 * @param {Buffer} fileBuffer - File contents
 * @param {object} options - { contentType: string, headers?: object }
 */
async function uploadToPresignedUrl(presignedUrl, fileBuffer, options = {}) {
  const { contentType = "application/octet-stream", headers = {} } = options;

  // Make relative URLs absolute
  let url = presignedUrl;
  let isExternalUpload = false;

  if (presignedUrl.startsWith("/")) {
    // baseUrl already ends with /api, so if URL starts with /api/, strip it
    if (presignedUrl.startsWith("/api/")) {
      url = `${baseUrl}${presignedUrl.slice(4)}`; // Remove /api prefix
    } else {
      url = `${baseUrl}${presignedUrl}`;
    }
  } else if (
    presignedUrl.startsWith("https://") &&
    !presignedUrl.includes("localhost")
  ) {
    // External presigned URL (R2, S3, etc.) - don't include auth headers
    isExternalUpload = true;
  }

  // Build headers - exclude Authorization for external presigned URLs
  // as the authentication is embedded in the URL signature
  const requestHeaders = {
    "Content-Type": contentType,
  };
  if (!isExternalUpload) {
    Object.assign(requestHeaders, headers);
  }

  return withRetry(
    async () => {
      await axios.put(url, fileBuffer, {
        headers: requestHeaders,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 120000, // 2 minutes for large files
      });
    },
    { maxRetries: 3, retryOn: [500, 502, 503, 504, "ECONNRESET", "ETIMEDOUT"] },
  );
}

/**
 * Publish assets using the transactional flow (assets pre-uploaded to R2)
 * @param {string} apiKey - API key for authentication
 * @param {Object} payload - { metadata, assets: [{ key, s3Path, hash, visualKey, size, contentType }] }
 * @returns {Promise<Object>}
 */
async function publishTransactional(apiKey, payload) {
  if (!apiKey) {
    throw new Error("API key is required to publish");
  }

  const response = await axios.post(`${baseUrl}/v1/publish`, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    timeout: 60000,
  });

  return response.data;
}

/**
 * Batch publish metadata for multiple scenarios in one request
 * @param {string} apiKey - API key for authentication
 * @param {Object} payload - { commits: Array<{ metadata, assets }> }
 * @returns {Promise<Object>}
 */
async function publishBatch(apiKey, payload) {
  if (!apiKey) {
    throw new Error("API key is required to publish");
  }

  return withRetry(
    async () => {
      const response = await axios.post(`${baseUrl}/v1/publish/batch`, payload, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 60000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      return response.data;
    },
    { maxRetries: 2, retryOn: [500, 502, 503, 504, 429, "ECONNRESET", "ETIMEDOUT"] },
  );
}

/**
 * Check which hashes already exist in storage (for deduplication)
 * @param {string} apiKey - API key for authentication
 * @param {string[]} hashes - Array of content hashes to check
 * @returns {Promise<{ existing: string[], total: number, found: number, new: number }>}
 */
async function checkExistingHashes(apiKey, hashes) {
  if (!hashes || hashes.length === 0) {
    return { existing: [], total: 0, found: 0, new: 0 };
  }

  return withRetry(async () => {
    const response = await axios.post(
      `${baseUrl}/v1/assets/check-hashes`,
      { hashes },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 30000,
      },
    );

    // Unwrap standardized API response format
    const body = response.data;
    if (body && body.success && body.data !== undefined) {
      return body.data;
    }
    return body;
  });
}

/**
 * Get baseline URLs for approved visuals (for diffing)
 * @param {string} projectId - Project ID
 * @param {string} apiKey - API key for authentication
 * @returns {Promise<Object>} Map of "scenarioKey/captureKey" to CDN URLs
 */
async function getBaselines(projectId, apiKey) {
  return withRetry(async () => {
    const response = await axios.get(
      `${baseUrl}/v1/projects/${projectId}/baselines`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 30000,
      },
    );
    return response.data.baselines || {};
  });
}

/**
 * Export visuals as JSON for the pull command
 * @param {string} projectId - Project ID
 * @param {Object} options - Export options
 * @param {string} options.format - Export format ('json', 'csv')
 * @param {string} options.status - Status filter ('approved', 'pending', 'all')
 * @returns {Promise<Object>} Asset map with meta and assets
 */
async function exportVisuals(projectId, options = {}) {
  const { format = "json", status = "approved" } = options;
  const settings = require("./config").readSettings();
  const apiKey = settings?.apiKey;

  if (!apiKey) {
    throw new Error("Not authenticated. Run 'reshot auth' first.");
  }

  return withRetry(async () => {
    try {
      const response = await axios.get(
        `${baseUrl}/projects/${projectId}/visuals/export`,
        {
          params: { format, status },
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 60000,
        },
      );
      return response.data;
    } catch (error) {
      throw createApiError(
        "export_visuals_failure",
        `${baseUrl}/projects/${projectId}/visuals/export`,
        error,
      );
    }
  });
}

/**
 * Generic POST helper for API calls
 * Unwraps the standardized API response { success, data } format
 */
async function post(endpoint, data, options = {}) {
  return withRetry(async () => {
    const response = await axios.post(`${baseUrl}${endpoint}`, data, {
      ...options,
      timeout: options.timeout || 60000,
    });
    // Unwrap standardized API response format
    const body = response.data;
    if (body && body.success && body.data !== undefined) {
      return body.data;
    }
    return body;
  });
}

/**
 * Initialize ingestion job with manifest
 */
async function initIngest(apiKey, projectId, manifest) {
  return withRetry(async () => {
    const response = await axios.post(
      `${baseUrl}/v1/ingest/init`,
      { projectId, manifest },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 30000,
      },
    );
    return response.data;
  });
}

/**
 * Commit ingestion job after uploads complete
 */
async function commitIngest(apiKey, projectId, uploadResults, git, cli) {
  return withRetry(async () => {
    const response = await axios.post(
      `${baseUrl}/v1/ingest/commit`,
      { projectId, uploadResults, git, cli },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 30000,
      },
    );
    return response.data;
  });
}

/**
 * Get drift records for a project
 */
async function getDrifts(apiKey, projectId, options = {}) {
  const params = new URLSearchParams();
  if (options.status) params.set("status", options.status);
  if (options.journeyKey) params.set("journeyKey", options.journeyKey);
  const endpoint = `${baseUrl}/v1/projects/${projectId}/drifts?${params.toString()}`;

  try {
    return await withRetry(async () => {
      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 30000,
      });
      return response.data;
    });
  } catch (error) {
    // Surface HTTP status + endpoint + server message instead of axios's
    // bare "Request failed with status code N".
    throw createApiError("Drifts request failed", endpoint, error);
  }
}

/**
 * Get sync jobs for a project
 */
async function getSyncJobs(apiKey, projectId, options = {}) {
  const endpoint = `${baseUrl}/v1/projects/${projectId}/sync-jobs`;
  try {
    return await withRetry(async () => {
      const response = await axios.post(
        endpoint,
        {
          limit: options.limit || 10,
          status: options.status,
        },
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 30000,
        },
      );
      return response.data;
    });
  } catch (error) {
    throw createApiError("Sync jobs request failed", endpoint, error);
  }
}

/**
 * Perform action on a drift record
 */
async function driftAction(apiKey, projectId, driftId, action, options = {}) {
  return withRetry(async () => {
    const response = await axios.post(
      `${baseUrl}/v1/projects/${projectId}/drifts/${driftId}/action`,
      {
        action,
        comment: options.comment,
        reason: options.reason,
      },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 30000,
      },
    );
    return response.data;
  });
}

module.exports = {
  getProjects,
  getProject,
  getVisuals,
  getVisualKeys,
  publishAsset,
  publishAssetsV1,
  publishDocs,
  getReviewQueue,
  getProjectConfig,
  postChangelogDrafts,
  getApiBaseUrl,
  createApiError,
  syncPushAssets,
  getSyncStatus,
  // New transactional flow
  signAssets,
  uploadToPresignedUrl,
  publishTransactional,
  publishBatch,
  checkExistingHashes,
  // Diffing support
  getBaselines,
  // Export support
  exportVisuals,
  // Reshot
  post,
  initIngest,
  commitIngest,
  getDrifts,
  getSyncJobs,
  driftAction,
  // Testing
  withRetry,
};
