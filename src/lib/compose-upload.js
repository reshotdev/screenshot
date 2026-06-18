"use strict";

const fs = require("fs-extra");
const axios = require("axios");
const FormData = require("form-data");
const config = require("./config");
const apiClient = require("./api-client");

function resolveComposeProjectContext({ projectOption, settings }) {
  const resolvedSettings =
    settings !== undefined ? settings : readSettingsSafe();
  const apiKey = process.env.RESHOT_API_KEY || resolvedSettings?.apiKey;
  const projectId =
    projectOption ||
    process.env.RESHOT_PROJECT_ID ||
    resolvedSettings?.projectId;

  if (!apiKey) {
    throw new Error(
      "No API key found. Set RESHOT_API_KEY or run `reshot auth` to create .reshot/settings.json.",
    );
  }

  if (!projectId) {
    throw new Error(
      "No project ID found. Pass --project, set RESHOT_PROJECT_ID, or authenticate with `reshot auth`.",
    );
  }

  return { apiKey, projectId };
}

function readSettingsSafe() {
  try {
    return config.readSettings();
  } catch {
    return null;
  }
}

async function uploadComposition({
  apiBaseUrl,
  apiKey,
  projectId,
  name,
  slug,
  sourceTsx,
  metadataJson,
  pack,
  autoApprove = false,
  httpClient = axios,
}) {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("slug", slug);
  formData.append("source_tsx", sourceTsx);
  formData.append("metadata_json", metadataJson);
  if (autoApprove) {
    formData.append("auto_approve", "true");
  }
  formData.append("rendered_mp4", fs.createReadStream(pack.mp4));
  formData.append("rendered_webm", fs.createReadStream(pack.webm));
  formData.append("rendered_poster", fs.createReadStream(pack.poster));
  if (pack.gif) {
    formData.append("rendered_gif", fs.createReadStream(pack.gif));
  }

  const endpoint = `${apiBaseUrl.replace(/\/+$/, "")}/projects/${encodeURIComponent(projectId)}/compositions`;
  const response = await httpClient.post(endpoint, formData, {
    headers: {
      ...formData.getHeaders(),
      Authorization: `Bearer ${apiKey}`,
    },
    timeout: 180000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  const data = unwrapApiResponse(response.data);
  const attributionWarning = readResponseHeader(
    response.headers,
    "x-reshot-attribution-warning",
  );

  if (attributionWarning) {
    return { ...data, attributionWarning };
  }

  return data;
}

function unwrapApiResponse(body) {
  if (body && typeof body === "object" && body.success && body.data !== undefined) {
    return body.data;
  }
  return body;
}

function readResponseHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") {
    return headers.get(name);
  }
  return headers[name] || headers[name.toLowerCase()] || null;
}

function buildDashboardUrl(response, apiBaseUrl, projectId) {
  const platformUrl = apiBaseUrl.replace(/\/api\/?$/, "");
  const dashboardUrl =
    response?.dashboardUrl ||
    response?.composition?.dashboardUrl ||
    response?.render?.dashboardUrl;
  if (dashboardUrl) {
    return dashboardUrl;
  }

  const compositionId = response?.composition?.id || response?.id;
  const base = `${platformUrl}/app/projects/${encodeURIComponent(projectId)}/compositions`;
  return compositionId ? `${base}/${encodeURIComponent(compositionId)}` : base;
}

function humanizeName(slug) {
  return String(slug)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim() || slug;
}

function getComposeApiBaseUrl(explicitApiBaseUrl) {
  return explicitApiBaseUrl || apiClient.getApiBaseUrl();
}

module.exports = {
  buildDashboardUrl,
  getComposeApiBaseUrl,
  humanizeName,
  readResponseHeader,
  readSettingsSafe,
  resolveComposeProjectContext,
  unwrapApiResponse,
  uploadComposition,
};
