// worker-pool.js - Streaming worker pool for concurrent task execution
// Replaces batch-based Promise.all — when any worker finishes, the next
// queued task starts immediately. No batch blocking.

class WorkerPool {
  /**
   * @param {number} concurrency - Max concurrent workers
   * @param {Object} options
   * @param {Function} options.onProgress - Called after each task completes:
   *   ({ completed, total, active, durationMs, result, error }) => void
   */
  constructor(concurrency, options = {}) {
    this.concurrency = Math.max(1, concurrency);
    this.onProgress = options.onProgress || null;
  }

  /**
   * Execute all tasks with streaming concurrency.
   * Returns results in the same order as the input tasks array.
   *
   * @param {Array} tasks - Array of task items
   * @param {Function} executor - async (task, index) => result
   * @returns {Promise<Array>} Results in input order
   */
  async runAll(tasks, executor) {
    const total = tasks.length;
    const results = new Array(total);
    let nextIndex = 0;
    let completed = 0;
    let active = 0;

    return new Promise((resolve, reject) => {
      const startNext = () => {
        while (active < this.concurrency && nextIndex < total) {
          const index = nextIndex++;
          active++;

          const taskStart = Date.now();

          executor(tasks[index], index)
            .then((result) => {
              results[index] = result;
              active--;
              completed++;

              // Start next task BEFORE reporting progress so active count
              // reflects the replacement worker already launched
              if (completed < total) {
                startNext();
              }

              if (this.onProgress) {
                try {
                  this.onProgress({
                    completed,
                    total,
                    active,
                    durationMs: Date.now() - taskStart,
                    result,
                    error: null,
                    task: tasks[index],
                    index,
                  });
                } catch (_e) {
                  // Don't let progress callback errors break the pool
                }
              }

              if (completed === total) {
                resolve(results);
              }
            })
            .catch((error) => {
              // Store error as a failed result rather than rejecting the whole pool
              results[index] = { success: false, error: error.message };
              active--;
              completed++;

              // Start next task BEFORE reporting progress
              if (completed < total) {
                startNext();
              }

              if (this.onProgress) {
                try {
                  this.onProgress({
                    completed,
                    total,
                    active,
                    durationMs: Date.now() - taskStart,
                    result: null,
                    error,
                    task: tasks[index],
                    index,
                  });
                } catch (_e) {
                  // Don't let progress callback errors break the pool
                }
              }

              if (completed === total) {
                resolve(results);
              }
            });
        }
      };

      if (total === 0) {
        resolve([]);
        return;
      }

      startNext();
    });
  }
}

module.exports = { WorkerPool };
