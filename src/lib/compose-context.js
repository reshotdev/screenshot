"use strict";

const path = require("path");
const fs = require("fs-extra");

const DEFAULT_FORMATS = ["mp4", "webm", "poster"];
const VALID_FORMATS = new Set(["mp4", "webm", "poster", "gif"]);

async function resolveComposeContext(file, options = {}) {
  const compositionPath = path.resolve(process.cwd(), file);
  if (!(await fs.pathExists(compositionPath))) {
    throw new Error(
      `Composition file not found: ${compositionPath}\n` +
        "Pass the path to a .compose.tsx file.",
    );
  }

  const slug = options.slug || deriveSlug(compositionPath);
  const compositionDir = path.dirname(compositionPath);
  const metadataPath = resolveMetadataPath(compositionDir, slug);
  const metadata = await readMetadata(metadataPath, slug);
  const capturePath = resolveCapturePath({
    metadata,
    compositionDir,
    slug,
  });
  await assertCaptureExists(capturePath, slug);

  return {
    compositionPath,
    slug,
    compositionDir,
    metadataPath,
    metadata,
    capturePath,
  };
}

function deriveSlug(filePath) {
  const filename = path.basename(filePath);
  const withoutKnownSuffix = filename.replace(/\.(compose\.)?[cm]?[tj]sx?$/i, "");
  return withoutKnownSuffix || path.basename(filePath, path.extname(filePath));
}

function resolveOutBase(compositionPath, out) {
  return path.resolve(
    process.cwd(),
    out || path.join(path.dirname(compositionPath), `${deriveSlug(compositionPath)}.composed`),
  );
}

function resolveMetadataPath(compositionDir, slug) {
  return path.join(compositionDir, `${slug}.metadata.json`);
}

async function readMetadata(metadataPath, slug) {
  if (!(await fs.pathExists(metadataPath))) {
    throw new Error(
      `Missing metadata file for slug "${slug}": ${metadataPath}\n` +
        `Expected a sibling ${slug}.metadata.json file. Re-record the clip with metadata enabled or pass --slug matching an existing metadata file.`,
    );
  }

  try {
    const metadata = await fs.readJson(metadataPath);
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new Error("metadata must be a JSON object");
    }
    return metadata;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read metadata file: ${metadataPath}\n${message}`);
  }
}

function resolveCapturePath({ metadata, compositionDir, slug }) {
  const declaredPath =
    metadata.capturePath ||
    metadata.workflowCapturePath ||
    metadata.capture?.path ||
    metadata.source?.capturePath ||
    metadata.source?.path;

  if (typeof declaredPath === "string" && declaredPath.trim()) {
    return path.resolve(compositionDir, declaredPath);
  }

  return path.join(compositionDir, `workflow-capture-${slug}.mp4`);
}

async function assertCaptureExists(capturePath, slug) {
  if (await fs.pathExists(capturePath)) {
    return;
  }

  throw new Error(
    `Missing workflow capture for slug "${slug}": ${capturePath}\n` +
      `Expected workflow-capture-${slug}.mp4 next to the composition, or a capturePath in ${slug}.metadata.json.`,
  );
}

function parseSize(value) {
  const match = /^(\d+)x(\d+)$/i.exec(String(value || "").trim());
  if (!match) {
    throw new Error(`Invalid --size "${value}". Use WIDTHxHEIGHT, for example 1440x900.`);
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid --size "${value}". Width and height must be positive integers.`);
  }

  return { width, height };
}

function parseFormats(value, includeGif = false) {
  const rawFormats = value == null || value === "" ? DEFAULT_FORMATS : String(value).split(",");
  const formats = [];

  for (const rawFormat of rawFormats) {
    const format = rawFormat.trim().toLowerCase();
    if (!format) continue;
    if (!VALID_FORMATS.has(format)) {
      throw new Error(
        `Unknown compose format "${rawFormat}". Supported formats: ${Array.from(VALID_FORMATS).join(", ")}.`,
      );
    }
    if (!formats.includes(format)) {
      formats.push(format);
    }
  }

  if (includeGif && !formats.includes("gif")) {
    formats.push("gif");
  }

  if (formats.length === 0) {
    throw new Error(`No compose formats selected. Use --formats=${DEFAULT_FORMATS.join(",")}.`);
  }

  return formats;
}

module.exports = {
  DEFAULT_FORMATS,
  assertCaptureExists,
  deriveSlug,
  parseFormats,
  parseSize,
  readMetadata,
  resolveCapturePath,
  resolveComposeContext,
  resolveMetadataPath,
  resolveOutBase,
};
