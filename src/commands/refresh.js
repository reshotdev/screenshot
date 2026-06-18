// refresh.js — Phase 5 auto-update loop (CI-runnable).
//
// `reshot refresh --composition <id>` or `reshot refresh --project <id>`:
// recapture each composition's source screen, run the calibrated drift check, and
// either re-publish (data changed, structure-stable) or flag for human review
// (structural redesign / lost eligibility). Idempotent: a re-run with no source
// changes is a no-op (0 renders, 0 review items).

const fs = require("fs");
const chalk = require("chalk");
const { refresh, registerComposition, setScene } = require("../lib/auto-update/refresh");

// Read + parse the --scene <path> JSON (the spec.scene render config: camera/motion
// /timeline/targets/...). Returns undefined when no path was given.
function readSceneFile(scenePath) {
  if (!scenePath) return undefined;
  let raw;
  try {
    raw = fs.readFileSync(scenePath, "utf8");
  } catch (error) {
    throw new Error(`--scene: cannot read ${scenePath}: ${error.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`--scene: ${scenePath} is not valid JSON: ${error.message}`);
  }
}

function parseViewport(spec) {
  if (!spec) return undefined;
  const m = /^(\d+)x(\d+)(?:@(\d+(?:\.\d+)?))?$/.exec(String(spec).trim());
  if (!m) throw new Error(`Invalid --viewport "${spec}" (expected WxH or WxH@scale, e.g. 1280x900 or 1280x900@2)`);
  return { width: Number(m[1]), height: Number(m[2]), deviceScaleFactor: m[3] ? Number(m[3]) : 2 };
}

// Build the capture-auth config (stored on the spec, re-resolved on every recapture)
// so the loop can reach authenticated /app screens. --storage-state wins if both set.
function buildAuth(options) {
  if (options.storageState) return { mode: "storage-state", path: options.storageState };
  if (options.demoAuth) {
    return { mode: "demo-bootstrap", email: typeof options.demoAuth === "string" ? options.demoAuth : "demo@example.com" };
  }
  return undefined;
}

const ACTION_LABEL = {
  publish: chalk.green("published"),
  flag: chalk.yellow("flagged"),
  skip: chalk.gray("skipped"),
  error: chalk.red("errored"),
};

function printSummary(result) {
  console.log(chalk.cyan("\nReshot refresh — per-composition result\n"));
  for (const s of result.summaries) {
    const label = ACTION_LABEL[s.action] || s.action;
    const metrics = s.metrics
      ? ` diff=${s.metrics.pixelDiffPct}% ssim=${s.metrics.ssim}`
      : "";
    console.log(
      `  ${label}  ${chalk.bold(s.slug)} (${s.compositionId})\n` +
        `      route=${s.route} eligible=${s.eligible} structureStable=${s.structureStable} quality=${s.qualityPass}${metrics}\n` +
        `      ${chalk.gray(s.reason)}`,
    );
  }
  console.log(
    chalk.cyan(
      `\nrendersCreated=${result.rendersCreated} reviewItemsCreated=${result.reviewItemsCreated} ` +
        `published=${result.published} flagged=${result.flagged} skipped=${result.skipped} errors=${result.errors}`,
    ),
  );
}

async function refreshCommand(options = {}) {
  // Attach/update the crisp <Scene>+motion render config on an already-enrolled
  // composition (so the loop renders it animated instead of the video fallback).
  if (options.setScene) {
    const result = await setScene(options.composition, readSceneFile(options.scene));
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(chalk.green("scene set ") + chalk.bold(result.compositionId) + ` (render=${result.mode})`);
    return result;
  }

  if (options.register) {
    const result = await registerComposition({
      compositionId: options.composition,
      projectId: options.project || process.env.RESHOT_PROJECT_ID,
      url: options.url,
      viewport: parseViewport(options.viewport),
      composePath: options.compose,
      slug: options.slug,
      name: options.name,
      scene: readSceneFile(options.scene),
      auth: buildAuth(options),
    });
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(
        chalk.green("registered ") +
          chalk.bold(result.slug || result.compositionId) +
          ` (route=${result.route}, eligible=${result.eligible}, render=${result.render})`,
      );
    }
    return result;
  }

  if (!options.composition && !options.project) {
    throw new Error("Pass --composition <id> or --project <id> (or --register to enroll one).");
  }

  const result = await refresh({
    compositionId: options.composition,
    projectId: options.project,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printSummary(result);
  }
  return result;
}

function registerRefresh(program) {
  program
    .command("refresh")
    .description("Recapture composition source screens and auto re-publish or flag drift for review")
    .option("--composition <id>", "Refresh a single composition by id")
    .option("--project <id>", "Refresh every composition with a stored spec in this project")
    .option("--register", "Enroll a composition into the loop: capture its source screen as the accepted baseline")
    .option("--set-scene", "Attach/update the crisp <Scene>+motion render config on an enrolled composition (with --composition + --scene)")
    .option("--scene <path>", "[--register|--set-scene] JSON file with the scene render config (camera/motion/timeline/targets); without it the loop renders video")
    .option("--url <url>", "[--register] source screen URL to recapture")
    .option("--viewport <WxH>", "[--register] capture viewport, e.g. 1280x900 or 1280x900@2")
    .option("--compose <path>", "[--register] path to the composition's .compose.tsx for re-rendering on publish")
    .option("--slug <slug>", "[--register] composition slug (for the upload route + public URL)")
    .option("--name <name>", "[--register] composition display name")
    .option("--demo-auth [email]", "[--register] authenticate the capture via the seeded demo bootstrap (default email demo@example.com) — reaches /app screens")
    .option("--storage-state <path>", "[--register] authenticate the capture with a Playwright storageState JSON exported from a real session")
    .option("--json", "Output the structured result as JSON")
    .option("--fail-on-error", "Exit non-zero (2) if any composition errored — for CI gating")
    .action(async (options) => {
      try {
        const result = await refreshCommand(options);
        if (shouldFailOnError(options, result)) {
          console.error(chalk.red(`Refresh completed with ${result.errors} error(s) (--fail-on-error).`));
          process.exit(2);
        }
      } catch (error) {
        console.error(chalk.red("Error:"), error.message);
        process.exit(1);
      }
    });
}

// CI gating: a completed refresh that had per-composition errors (a screen failed
// to capture/upload) still exits 0 by default (the batch is isolated, fail-safe).
// With --fail-on-error, CI can treat that as a non-zero (exit 2) — distinct from a
// hard crash (exit 1). Pure + exported so it is unit-testable without process.exit.
function shouldFailOnError(options, result) {
  return Boolean(options && options.failOnError && result && result.errors > 0);
}

module.exports = { refreshCommand, registerRefresh, printSummary, shouldFailOnError };
