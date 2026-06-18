// ui-executor.js - Job execution and management for UI
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs-extra");
const { v4: uuidv4 } = require("uuid");

const JOBS_FILE = path.join(process.cwd(), ".reshot", "ui-jobs.json");
const MAX_JOBS_HISTORY = 100;

// Track running processes for cancellation
const runningProcesses = new Map(); // jobId -> { child, timeout }

/**
 * Job model
 * @typedef {Object} Job
 * @property {string} id
 * @property {string} type - 'run' | 'publish' | 'record' | 'crop-helper'
 * @property {string} status - 'pending' | 'running' | 'success' | 'failed'
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string|null} scenarioKey
 * @property {string[]} logs
 * @property {Object} metadata
 */

/**
 * Load jobs from disk
 */
function loadJobs() {
  try {
    if (fs.existsSync(JOBS_FILE)) {
      return fs.readJSONSync(JOBS_FILE);
    }
  } catch (error) {
    console.warn("Failed to load jobs file:", error.message);
  }
  return [];
}

/**
 * Save jobs to disk
 */
function saveJobs(jobs) {
  try {
    fs.ensureDirSync(path.dirname(JOBS_FILE));
    // Keep only last MAX_JOBS_HISTORY jobs
    const jobsToSave = jobs.slice(-MAX_JOBS_HISTORY);
    fs.writeJSONSync(JOBS_FILE, jobsToSave, { spaces: 2 });
  } catch (error) {
    console.error("Failed to save jobs file:", error.message);
  }
}

/**
 * Create a new job
 */
function createJob(type, metadata = {}) {
  const job = {
    id: uuidv4(),
    type,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    scenarioKey: metadata.scenarioKey || (metadata.scenarioKeys?.length === 1 ? metadata.scenarioKeys[0] : null),
    logs: [],
    metadata,
  };

  const jobs = loadJobs();
  jobs.push(job);
  saveJobs(jobs);

  return job;
}

/**
 * Update job status
 */
function updateJobStatus(jobId, status, additionalData = {}) {
  const jobs = loadJobs();
  const jobIndex = jobs.findIndex((j) => j.id === jobId);

  if (jobIndex === -1) {
    throw new Error(`Job ${jobId} not found`);
  }

  jobs[jobIndex] = {
    ...jobs[jobIndex],
    ...additionalData,
    status,
    updatedAt: new Date().toISOString(),
  };

  saveJobs(jobs);
  return jobs[jobIndex];
}

/**
 * Append log to job
 */
function appendJobLog(jobId, logLine) {
  const jobs = loadJobs();
  const jobIndex = jobs.findIndex((j) => j.id === jobId);

  if (jobIndex === -1) {
    return;
  }

  jobs[jobIndex].logs.push({
    timestamp: new Date().toISOString(),
    message: logLine,
  });

  // Keep only last 1000 log lines
  if (jobs[jobIndex].logs.length > 1000) {
    jobs[jobIndex].logs = jobs[jobIndex].logs.slice(-1000);
  }

  jobs[jobIndex].updatedAt = new Date().toISOString();
  saveJobs(jobs);
}

/**
 * Get job by ID
 */
function getJob(jobId) {
  const jobs = loadJobs();
  return jobs.find((j) => j.id === jobId) || null;
}

/**
 * Get all jobs
 */
function getAllJobs(limit = 50) {
  const jobs = loadJobs();
  return jobs.slice(-limit).reverse(); // Most recent first
}

/**
 * Clean up stuck jobs (jobs that have been running for more than 5 minutes without updates)
 */
function cleanupStuckJobs() {
  const jobs = loadJobs();
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  let cleaned = false;

  for (const job of jobs) {
    if (job.status === "running") {
      const updatedAtDate = new Date(job.updatedAt);
      // Skip if date is invalid
      if (isNaN(updatedAtDate.getTime())) continue;
      const updatedAt = updatedAtDate.getTime();
      if (updatedAt < fiveMinutesAgo) {
        // Job has been running for more than 5 minutes without updates, mark as failed
        const jobIndex = jobs.findIndex((j) => j.id === job.id);
        if (jobIndex !== -1) {
          jobs[jobIndex].status = "failed";
          jobs[jobIndex].updatedAt = new Date().toISOString();
          if (!jobs[jobIndex].metadata) {
            jobs[jobIndex].metadata = {};
          }
          jobs[jobIndex].metadata.error =
            "Job timed out (no activity for 5 minutes) - platform may be unavailable";
          jobs[jobIndex].logs.push({
            timestamp: new Date().toISOString(),
            message:
              "[error] Job was stuck in running state and has been marked as failed",
          });
          cleaned = true;
        }
      }
    }
  }

  if (cleaned) {
    saveJobs(jobs);
  }

  return cleaned;
}

/**
 * Execute a CLI command as a job
 */
function executeJob(jobId, command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    // Always use the local CLI script — global installs may have stale paths
    // __dirname is in src/lib, so go up one level to get to src/index.js
    let cliPath = path.resolve(__dirname, "..", "index.js");
    let useNode = true;

    // Ensure the file exists
    if (!fs.existsSync(cliPath)) {
      const error = `CLI script not found at ${cliPath}`;
      updateJobStatus(jobId, "failed", { error });
      const jobs = loadJobs();
      const jobIndex = jobs.findIndex((j) => j.id === jobId);
      if (jobIndex !== -1) {
        jobs[jobIndex].logs.push({
          timestamp: new Date().toISOString(),
          message: `[error] ${error}`,
        });
        jobs[jobIndex].logs.push({
          timestamp: new Date().toISOString(),
          message: `[error] Current working directory: ${process.cwd()}`,
        });
        jobs[jobIndex].logs.push({
          timestamp: new Date().toISOString(),
          message: `[error] __dirname: ${__dirname}`,
        });
        saveJobs(jobs);
      }
      return reject(new Error(error));
    }

    const isInteractive = command === "record"; // Record is interactive

    // Build command and args
    const cmd = useNode ? "node" : cliPath;
    const cmdArgs = useNode ? [cliPath, command, ...args] : [command, ...args];

    // Update status and add initial logs
    updateJobStatus(jobId, "running");
    appendJobLog(
      jobId,
      `[info] Executing: ${useNode ? "node" : "reshot"} ${command} ${args.join(
        " "
      )}`
    );
    appendJobLog(jobId, `[info] Working directory: ${process.cwd()}`);
    appendJobLog(
      jobId,
      `[info] Using ${useNode ? "local" : "global"} CLI: ${
        useNode ? cliPath : "reshot"
      }`
    );

    // Use node to run the CLI script
    const child = spawn(cmd, cmdArgs, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...options.env,
        // Preserve color output for better logs
        FORCE_COLOR: "1",
        NODE_ENV: process.env.NODE_ENV || "production",
      },
      stdio: isInteractive
        ? ["pipe", "pipe", "pipe"]
        : ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stdoutBuffer = "";
    let stderrBuffer = "";
    let hasOutput = false;

    // Set a timeout for non-interactive commands (10 minutes max)
    const timeout = isInteractive
      ? null
      : setTimeout(() => {
          if (child && !child.killed) {
            appendJobLog(jobId, "[error] Job timed out after 10 minutes");
            child.kill("SIGTERM");
            runningProcesses.delete(jobId);
            updateJobStatus(jobId, "failed", {
              error: "Job timed out after 10 minutes",
            });
            resolve({
              code: -1,
              stdout: stdoutBuffer,
              stderr: stderrBuffer,
              error: "Timeout",
            });
          }
        }, 10 * 60 * 1000);

    // Track the process for cancellation
    runningProcesses.set(jobId, { child, timeout });

    child.stdout.on("data", (data) => {
      hasOutput = true;
      const text = data.toString();
      stdoutBuffer += text;
      // Split by newlines and log each line
      const lines = text
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);
      lines.forEach((line) => {
        appendJobLog(jobId, line);
      });
    });

    child.stderr.on("data", (data) => {
      hasOutput = true;
      const text = data.toString();
      stderrBuffer += text;
      // Split by newlines and log each line
      const lines = text
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);
      lines.forEach((line) => {
        appendJobLog(jobId, `[stderr] ${line}`);
      });
    });

    // For interactive commands like record, we can't fully automate
    // But we'll let it start and log what happens
    if (isInteractive) {
      appendJobLog(
        jobId,
        "[info] Interactive command - may require manual input"
      );
      appendJobLog(
        jobId,
        "[info] Ensure Chrome is running with remote debugging enabled"
      );
    }

    child.on("close", (code, signal) => {
      if (timeout) clearTimeout(timeout);
      runningProcesses.delete(jobId);

      if (signal) {
        appendJobLog(jobId, `[info] Process terminated by signal: ${signal}`);
        updateJobStatus(jobId, "failed", {
          exitCode: -1,
          error: `Process terminated by signal: ${signal}`,
        });
        return resolve({
          code: -1,
          stdout: stdoutBuffer,
          stderr: stderrBuffer,
          error: `Terminated: ${signal}`,
        });
      }

      appendJobLog(jobId, `[info] Process exited with code ${code}`);

      // If no output was received and process exited quickly, it might have failed to start
      if (!hasOutput && code !== 0) {
        appendJobLog(
          jobId,
          "[error] Process exited with no output - command may have failed to start"
        );
        const errorMsg =
          stderrBuffer || `Process exited with code ${code} and no output`;
        updateJobStatus(jobId, "failed", {
          exitCode: code,
          error: errorMsg,
        });
        return resolve({
          code,
          stdout: stdoutBuffer,
          stderr: stderrBuffer,
          error: errorMsg,
        });
      }

      // Check if job was cancelled
      const job = getJob(jobId);
      if (job && job.status === "cancelled") {
        // Already marked as cancelled, don't override
        resolve({
          code,
          stdout: stdoutBuffer,
          stderr: stderrBuffer,
          cancelled: true,
        });
        return;
      }

      // Check for common error patterns in output even if exit code is 0
      // Be more specific to avoid false positives - look for actual error patterns, not just keywords
      const authErrorPatterns = [
        /(?:invalid|missing|expired|bad|unauthorized).*api.?key/i,
        /api.?key.*(?:invalid|missing|expired|bad|required)/i,
        /401.*unauthorized/i,
        /authentication.*(?:failed|error|required)/i,
        /(?:failed|error).*authentication/i,
      ];
      const hasAuthError = authErrorPatterns.some(
        (pattern) =>
          pattern.test(stderrBuffer) ||
          (code !== 0 && pattern.test(stdoutBuffer))
      );

      const hasConnectionError =
        stderrBuffer.includes("ECONNREFUSED") ||
        stderrBuffer.includes("ENOTFOUND") ||
        stderrBuffer.includes("connect ETIMEDOUT") ||
        (code !== 0 &&
          (stdoutBuffer.includes("ECONNREFUSED") ||
            stdoutBuffer.includes("ENOTFOUND")));

      if (hasAuthError) {
        const errorMsg =
          "Authentication failed - check API key and run 'reshot auth'";
        appendJobLog(jobId, `[error] ${errorMsg}`);
        updateJobStatus(jobId, "failed", {
          exitCode: code,
          error: errorMsg,
        });
        return resolve({
          code,
          stdout: stdoutBuffer,
          stderr: stderrBuffer,
          error: errorMsg,
        });
      }

      if (hasConnectionError) {
        const errorMsg =
          "Cannot connect to platform - ensure the server is running";
        appendJobLog(jobId, `[error] ${errorMsg}`);
        updateJobStatus(jobId, "failed", {
          exitCode: code,
          error: errorMsg,
        });
        return resolve({
          code,
          stdout: stdoutBuffer,
          stderr: stderrBuffer,
          error: errorMsg,
        });
      }

      if (code === 0) {
        updateJobStatus(jobId, "success", {
          exitCode: code,
        });
        resolve({ code, stdout: stdoutBuffer, stderr: stderrBuffer });
      } else {
        const errorMsg = stderrBuffer || `Process exited with code ${code}`;
        updateJobStatus(jobId, "failed", {
          exitCode: code,
          error: errorMsg,
        });
        // Don't reject for non-zero exit codes - some commands may exit with codes for expected reasons
        // Just mark as failed and resolve
        resolve({
          code,
          stdout: stdoutBuffer,
          stderr: stderrBuffer,
          error: errorMsg,
        });
      }
    });

    child.on("error", (error) => {
      if (timeout) clearTimeout(timeout);
      runningProcesses.delete(jobId);
      const errorMsg = error.message;
      updateJobStatus(jobId, "failed", {
        error: errorMsg,
      });
      appendJobLog(jobId, `[error] Failed to start process: ${errorMsg}`);
      appendJobLog(jobId, `[error] Command: ${cmd} ${cmdArgs.join(" ")}`);
      reject(error);
    });
  });
}

/**
 * Cancel a running job
 */
function cancelJob(jobId) {
  const processInfo = runningProcesses.get(jobId);

  if (processInfo) {
    const { child, timeout } = processInfo;

    // Clear the timeout
    if (timeout) clearTimeout(timeout);

    // Kill the process
    if (child && !child.killed) {
      child.kill("SIGTERM");
      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 5000);
    }

    runningProcesses.delete(jobId);
    appendJobLog(jobId, "[info] Job cancelled by user");
    updateJobStatus(jobId, "cancelled");
    return true;
  }

  // Job not running, just update status if it's in running state
  const job = getJob(jobId);
  if (job && job.status === "running") {
    appendJobLog(jobId, "[info] Job marked as cancelled (process not found)");
    updateJobStatus(jobId, "cancelled");
    return true;
  }

  return false;
}

/**
 * Execute run job
 * @param {string} jobId - Job ID
 * @param {string[]|null} scenarioKeys - Optional scenario keys to run
 * @param {Object|null} variant - Optional variant configuration (e.g., { locale: 'ko', role: 'admin' })
 * @param {string|null} format - Optional output format ('step-by-step-images' or 'summary-video')
 * @param {boolean|null} diff - Whether to enable baseline diffing (null = use config default)
 */
async function executeRunJob(
  jobId,
  scenarioKeys = null,
  variant = null,
  format = null,
  diff = null,
  noPrivacy = false,
  noStyle = false
) {
  const args = [];
  // Pass scenario keys if provided (comma-separated)
  if (scenarioKeys && Array.isArray(scenarioKeys) && scenarioKeys.length > 0) {
    args.push("--scenarios", scenarioKeys.join(","));
  }
  // Pass variant as JSON string if provided
  if (
    variant &&
    typeof variant === "object" &&
    Object.keys(variant).length > 0
  ) {
    args.push("--variant", JSON.stringify(variant));
  }
  // Pass format if provided
  if (format) {
    args.push("--format", format);
  }
  // Pass diff flag if explicitly set
  if (diff === true) {
    args.push("--diff");
  } else if (diff === false) {
    args.push("--no-diff");
  }
  // Pass privacy/style flags
  if (noPrivacy) {
    args.push("--no-privacy");
  }
  if (noStyle) {
    args.push("--no-style");
  }
  return executeJob(jobId, "run", args);
}

/**
 * Execute publish job
 */
async function executePublishJob(jobId, scenarioKeys = null) {
  const args = [];
  // For now, publish all. Future: filter by scenarioKeys
  return executeJob(jobId, "publish", args);
}

/**
 * Execute record job
 */
async function executeRecordJob(jobId, title, scenarioKey = null) {
  const args = title ? [title] : [];
  // If scenarioKey is provided, we'd need to pass it somehow
  // For now, just use the title
  return executeJob(jobId, "record", args);
}

module.exports = {
  createJob,
  updateJobStatus,
  appendJobLog,
  getJob,
  getAllJobs,
  executeJob,
  executeRunJob,
  executePublishJob,
  executeRecordJob,
  cancelJob,
  cleanupStuckJobs,
  loadJobs,
  saveJobs,
};
