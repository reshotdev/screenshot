const fs = require("fs-extra");
const path = require("path");

const TIMESTAMP_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;
const ASSET_EXTENSIONS = new Set([".png", ".jpg", ".mp4", ".webm"]);

function parseTimestampDirName(name) {
  if (!TIMESTAMP_DIR_PATTERN.test(name)) {
    return null;
  }

  const [date, time] = name.split("_");
  const [year, month, day] = date.split("-");
  const [hour, min, sec] = time.split("-");
  const parsed = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function countAssetsInLatestDir(latestDir) {
  if (!fs.existsSync(latestDir)) {
    return 0;
  }

  try {
    return fs
      .readdirSync(latestDir)
      .filter((file) => ASSET_EXTENSIONS.has(path.extname(file).toLowerCase()))
      .length;
  } catch {
    return 0;
  }
}

function readScenarioOutputMetadata(outputBaseDir, scenarioKey) {
  const scenarioOutputDir = path.join(outputBaseDir, scenarioKey);
  const metadata = {
    createdAt: null,
    lastRunAt: null,
    assetCount: 0,
  };

  if (!fs.existsSync(scenarioOutputDir)) {
    return metadata;
  }

  try {
    const timestamps = fs
      .readdirSync(scenarioOutputDir)
      .filter((item) => {
        const fullPath = path.join(scenarioOutputDir, item);
        try {
          return fs.statSync(fullPath).isDirectory() && item !== "latest";
        } catch {
          return false;
        }
      })
      .map(parseTimestampDirName)
      .filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime());

    if (timestamps.length > 0) {
      metadata.createdAt = timestamps[0].toISOString();
      metadata.lastRunAt = timestamps[timestamps.length - 1].toISOString();
    }

    metadata.assetCount = countAssetsInLatestDir(
      path.join(scenarioOutputDir, "latest"),
    );
  } catch {
    return metadata;
  }

  return metadata;
}

function findScenarioRunJobs(jobs, scenarioKey) {
  return jobs
    .filter((job) => {
      if (job.type !== "run") {
        return false;
      }

      const keys = job.params?.scenarioKeys || [];
      return keys.includes(scenarioKey);
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

function mergeJobMetadata(metadata, jobs) {
  if (jobs.length === 0) {
    return { ...metadata, lastRunStatus: null };
  }

  const latestJob = jobs[0];
  const latestJobTime = latestJob.completedAt || latestJob.createdAt;
  let lastRunAt = metadata.lastRunAt;
  let lastRunStatus = null;

  if (latestJobTime) {
    const jobTime = new Date(latestJobTime).toISOString();
    if (!lastRunAt || jobTime > lastRunAt) {
      lastRunAt = jobTime;
      lastRunStatus = latestJob.status;
    }
  }

  const earliestJob = jobs[jobs.length - 1];
  const createdAt =
    earliestJob.createdAt &&
    (!metadata.createdAt || earliestJob.createdAt < metadata.createdAt)
      ? earliestJob.createdAt
      : metadata.createdAt;

  return {
    ...metadata,
    createdAt,
    lastRunAt,
    lastRunStatus,
  };
}

function addScenarioMetadata(scenarios, jobs, outputBaseDir) {
  return scenarios
    .map((scenario) => {
      const outputMetadata = readScenarioOutputMetadata(
        outputBaseDir,
        scenario.key,
      );
      const scenarioJobs = findScenarioRunJobs(jobs, scenario.key);

      return {
        ...scenario,
        _metadata: mergeJobMetadata(outputMetadata, scenarioJobs),
      };
    })
    .sort((a, b) => {
      const aTime = a._metadata?.lastRunAt
        ? new Date(a._metadata.lastRunAt).getTime()
        : 0;
      const bTime = b._metadata?.lastRunAt
        ? new Date(b._metadata.lastRunAt).getTime()
        : 0;

      if (aTime !== bTime) {
        return bTime - aTime;
      }

      return a.name.localeCompare(b.name);
    });
}

module.exports = {
  addScenarioMetadata,
  countAssetsInLatestDir,
  parseTimestampDirName,
  readScenarioOutputMetadata,
};
