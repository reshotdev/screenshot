// progress-tracker.js - Track capture progress with ETA and throughput
// Provides structured progress output for CLI and Studio UI parsing.

class ProgressTracker {
  /**
   * @param {number} total - Total number of tasks
   * @param {Object} options
   * @param {number} options.concurrency - Number of parallel workers
   */
  constructor(total, options = {}) {
    this.total = total;
    this.concurrency = options.concurrency || 1;
    this.completed = 0;
    this.durations = [];
    this.startTime = Date.now();
  }

  /**
   * Record completion of a task.
   * @param {number} durationMs - How long the task took
   */
  recordCompletion(durationMs) {
    this.completed++;
    this.durations.push(durationMs);
  }

  /**
   * Get average task duration in ms.
   */
  getAverageDuration() {
    if (this.durations.length === 0) return 0;
    const sum = this.durations.reduce((a, b) => a + b, 0);
    return sum / this.durations.length;
  }

  /**
   * Get estimated time remaining as a formatted string (e.g., "1m45s").
   */
  getETA() {
    if (this.completed === 0) return "calculating...";
    const remaining = this.total - this.completed;
    const avgMs = this.getAverageDuration();
    // With parallelism, effective time per batch = avg / concurrency
    const etaMs = (remaining * avgMs) / this.concurrency;
    return formatDuration(etaMs);
  }

  /**
   * Get throughput as tasks per minute.
   */
  getThroughput() {
    const elapsedMinutes = (Date.now() - this.startTime) / 60000;
    if (elapsedMinutes < 0.01) return "0.0";
    return (this.completed / elapsedMinutes).toFixed(1);
  }

  /**
   * Get elapsed time since start.
   */
  getElapsed() {
    return formatDuration(Date.now() - this.startTime);
  }

  /**
   * Get a full summary object.
   */
  getSummary() {
    return {
      completed: this.completed,
      total: this.total,
      elapsed: this.getElapsed(),
      eta: this.getETA(),
      throughput: this.getThroughput(),
      avgDuration: formatDuration(this.getAverageDuration()),
    };
  }

  /**
   * Format a structured progress log line for CLI output.
   * Parseable by Studio UI's FloatingJobMonitor.
   *
   * @param {number} activeWorkers - Currently active workers
   * @param {number} lastDurationMs - Duration of the last completed task
   */
  formatProgressLine(activeWorkers, lastDurationMs) {
    const last = formatDuration(lastDurationMs);
    const eta = this.getETA();
    const rate = this.getThroughput();
    return `[PROGRESS] ${this.completed}/${this.total} | active:${activeWorkers} | last:${last} | eta:${eta} | rate:${rate}/min`;
  }

  /**
   * Format a per-scenario completion line.
   * @param {string} name - Scenario name
   * @param {number} durationMs - Duration
   * @param {boolean} success - Whether it succeeded
   * @param {string} [error] - Error message if failed
   */
  formatCompletionLine(name, durationMs, success, error) {
    const duration = formatDuration(durationMs);
    const counter = `[${this.completed}/${this.total}]`;
    if (success) {
      return `\u2714 ${name} in ${duration} ${counter}`;
    }
    const reason = error ? ` - ${error}` : "";
    return `\u2718 ${name} in ${duration}${reason} ${counter}`;
  }

  /**
   * Format a summary footer for the entire run.
   */
  formatSummary() {
    const elapsed = this.getElapsed();
    const avgDuration = formatDuration(this.getAverageDuration());
    const successful = this.durations.length;
    const failed = this.completed - successful;
    const lines = [
      `Completed ${this.completed}/${this.total} in ${elapsed}`,
      `Average: ${avgDuration}/scenario | Throughput: ${this.getThroughput()}/min`,
    ];
    if (this.concurrency > 1) {
      lines[0] += ` (${this.concurrency} workers)`;
    }
    if (failed > 0) {
      lines.push(`Failed: ${failed}`);
    }
    return lines.join("\n");
  }
}

/**
 * Format milliseconds into human-readable duration (e.g., "1m45s", "3.2s").
 */
function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
}

module.exports = { ProgressTracker, formatDuration };
