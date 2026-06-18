// ci-detect.js - CI environment detection and configuration
// Detects common CI providers and provides optimized Chromium launch options

/**
 * Detect if running in a CI environment and which provider
 * @returns {{ isCI: boolean, provider: string|null }}
 */
function detectCI() {
  if (process.env.GITHUB_ACTIONS === "true") {
    return { isCI: true, provider: "github-actions" };
  }
  if (process.env.GITLAB_CI === "true") {
    return { isCI: true, provider: "gitlab-ci" };
  }
  if (process.env.CIRCLECI === "true") {
    return { isCI: true, provider: "circleci" };
  }
  if (process.env.JENKINS_URL) {
    return { isCI: true, provider: "jenkins" };
  }
  if (process.env.BITBUCKET_PIPELINE_UUID) {
    return { isCI: true, provider: "bitbucket" };
  }
  if (process.env.BUILDKITE === "true") {
    return { isCI: true, provider: "buildkite" };
  }
  if (process.env.TRAVIS === "true") {
    return { isCI: true, provider: "travis" };
  }
  if (process.env.CI === "true" || process.env.CI === "1") {
    return { isCI: true, provider: "unknown" };
  }
  return { isCI: false, provider: null };
}

/**
 * Get Chromium launch args optimized for CI environments
 * @returns {string[]} Array of Chromium flags
 */
function getCIChromiumArgs() {
  const { isCI } = detectCI();
  if (!isCI) return [];

  return [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-setuid-sandbox",
    "--disable-software-rasterizer",
  ];
}

/**
 * Build Playwright launch options with CI args merged in
 * @param {{ headless?: boolean }} options - Base launch options
 * @returns {Object} Merged launch options
 */
function buildLaunchOptions(options = {}) {
  const ciArgs = getCIChromiumArgs();
  const baseArgs = options.args || [];

  return {
    ...options,
    args: [...baseArgs, ...ciArgs],
  };
}

/**
 * Extract CI metadata (commit, branch, repo) from environment
 * @returns {{ commitSha: string|null, branch: string|null, repo: string|null, provider: string|null, buildUrl: string|null }}
 */
function getCIMetadata() {
  const { isCI, provider } = detectCI();
  if (!isCI) {
    return { commitSha: null, branch: null, repo: null, provider: null, buildUrl: null };
  }

  let commitSha = null;
  let branch = null;
  let repo = null;
  let buildUrl = null;

  switch (provider) {
    case "github-actions":
      commitSha = process.env.GITHUB_SHA;
      branch = process.env.GITHUB_REF_NAME || process.env.GITHUB_HEAD_REF;
      repo = process.env.GITHUB_REPOSITORY;
      buildUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : null;
      break;
    case "gitlab-ci":
      commitSha = process.env.CI_COMMIT_SHA;
      branch = process.env.CI_COMMIT_REF_NAME;
      repo = process.env.CI_PROJECT_PATH;
      buildUrl = process.env.CI_JOB_URL;
      break;
    case "circleci":
      commitSha = process.env.CIRCLE_SHA1;
      branch = process.env.CIRCLE_BRANCH;
      repo = process.env.CIRCLE_PROJECT_REPONAME;
      buildUrl = process.env.CIRCLE_BUILD_URL;
      break;
    case "jenkins":
      commitSha = process.env.GIT_COMMIT;
      branch = process.env.GIT_BRANCH;
      repo = process.env.JOB_NAME;
      buildUrl = process.env.BUILD_URL;
      break;
    case "bitbucket":
      commitSha = process.env.BITBUCKET_COMMIT;
      branch = process.env.BITBUCKET_BRANCH;
      repo = process.env.BITBUCKET_REPO_FULL_NAME;
      buildUrl = process.env.BITBUCKET_BUILD_URL;
      break;
    case "buildkite":
      commitSha = process.env.BUILDKITE_COMMIT;
      branch = process.env.BUILDKITE_BRANCH;
      repo = process.env.BUILDKITE_REPO;
      buildUrl = process.env.BUILDKITE_BUILD_URL;
      break;
    default:
      // Generic CI — try common env vars
      commitSha = process.env.COMMIT_SHA || process.env.GIT_COMMIT;
      branch = process.env.BRANCH || process.env.GIT_BRANCH;
      break;
  }

  return { commitSha, branch, repo, provider, buildUrl };
}

module.exports = {
  detectCI,
  getCIChromiumArgs,
  buildLaunchOptions,
  getCIMetadata,
};
