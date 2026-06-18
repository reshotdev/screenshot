// compose.js - Render a local @reshot/compose file into a video pack
const path = require("path");
const fs = require("fs-extra");
const chalk = require("chalk");
const {
  DEFAULT_FORMATS,
  assertCaptureExists,
  deriveSlug,
  parseFormats,
  parseSize,
  resolveCapturePath,
  resolveComposeContext,
  resolveMetadataPath,
  resolveOutBase,
} = require("../lib/compose-context");
const {
  assertUploadPackExists,
  packFromExistingOutputs,
} = require("../lib/compose-pack");
const {
  buildDashboardUrl,
  getComposeApiBaseUrl,
  humanizeName,
  resolveComposeProjectContext,
  uploadComposition,
} = require("../lib/compose-upload");

async function runCompose(file, options = {}, deps = {}) {
  const context = await resolveComposeContext(file, options);

  const size = parseSize(options.size || "1440x900");
  const formats = parseFormats(options.formats, options.gif);
  const outBase = resolveOutBase(context.compositionPath, options.out);

  const { render } = deps.renderModule || loadComposeRender();

  console.log(chalk.cyan(`\n-> Rendering ${chalk.bold(context.slug)} (${size.width}x${size.height})`));
  console.log(chalk.gray(`  composition ${relativePath(context.compositionPath)}`));
  console.log(chalk.gray(`  metadata    ${relativePath(context.metadataPath)}`));
  console.log(chalk.gray(`  capture     ${relativePath(context.capturePath)}`));
  console.log(chalk.gray(`  out         ${relativePath(outBase)}`));

  const result = await withComposeEnvironment(
    {
      RESHOT_COMPOSE_SLUG: context.slug,
      RESHOT_COMPOSE_METADATA_PATH: context.metadataPath,
      RESHOT_COMPOSE_CAPTURE_PATH: context.capturePath,
    },
    () =>
      render(context.compositionPath, {
        slug: context.slug,
        out: outBase,
        size,
        formats,
        metadataPath: context.metadataPath,
        capturePath: context.capturePath,
      }),
  );

  console.log(chalk.green(`\nRendered ${context.slug}`));
  printPack(result.pack || {});
  return result;
}

async function runComposePush(file, options = {}, deps = {}) {
  const context = await resolveComposeContext(file, options);
  const outBase = resolveOutBase(context.compositionPath, options.out);
  const pack = options.skipRender
    ? await packFromExistingOutputs(outBase)
    : (await runCompose(file, options, deps)).pack || {};

  await assertUploadPackExists(pack, Boolean(options.skipRender));

  const projectContext = resolveComposeProjectContext({
    projectOption: options.project,
    settings: deps.settings,
  });
  const apiBaseUrl = getComposeApiBaseUrl(deps.apiBaseUrl);
  const name = options.name || humanizeName(context.slug);
  const upload = deps.uploadComposition || uploadComposition;

  console.log(chalk.cyan(`\n-> Uploading ${chalk.bold(name)} to project ${projectContext.projectId}`));
  const response = await upload({
    apiBaseUrl,
    apiKey: projectContext.apiKey,
    projectId: projectContext.projectId,
    name,
    slug: context.slug,
    sourceTsx: await fs.readFile(context.compositionPath, "utf8"),
    metadataJson: await fs.readFile(context.metadataPath, "utf8"),
    pack,
    autoApprove: Boolean(options.autoApprove),
    httpClient: deps.httpClient,
  });
  const dashboardUrl = buildDashboardUrl(response, apiBaseUrl, projectContext.projectId);

  console.log(chalk.green(`\nUploaded ${context.slug}`));
  console.log(chalk.gray(`  Dashboard: ${dashboardUrl}`));
  printPublicUrls(response?.publicUrls);
  if (response?.attributionWarning === "legacy-key-no-user-attribution") {
    console.log(
      chalk.yellow(
        "  Attribution: re-issue your API key to enable per-engineer render attribution.",
      ),
    );
  }

  return { response, dashboardUrl, projectId: projectContext.projectId };
}

function registerCompose(program) {
  const compose = program
    .command("compose")
    .description("Render and upload local JSX compositions")
    .argument("<file>", "Composition file to render")
    .option("--slug <slug>", "Matrix variant slug; defaults to the composition filename")
    .option("--out <path>", "Output base path; defaults to <file-stem>.composed")
    .option("--size <size>", "Viewport size as WIDTHxHEIGHT", "1440x900")
    .option("--formats <formats>", "Comma-separated output formats", DEFAULT_FORMATS.join(","))
    .option("--gif", "Also emit a gif")
    .action(async (file, options) => {
      try {
        await runCompose(file, normalizeCommandOptions(options));
      } catch (error) {
        console.error(chalk.red("Error:"), error.message);
        process.exit(1);
      }
    });

  compose
    .command("push <file>")
    .description("Render and upload a local JSX composition to the dashboard")
    .option("--name <name>", "Composition display name")
    .option("--project <projectId>", "Project id; defaults to local Reshot settings")
    .option("--out <path>", "Output base path to upload when --skip-render is used")
    .option("--skip-render", "Upload existing local outputs without re-rendering")
    .option("--auto-approve", "Immediately approve this composition render and update live embed URLs")
    .action(async (file, options) => {
      try {
        await runComposePush(file, normalizeCommandOptions(options));
      } catch (error) {
        console.error(chalk.red("Error:"), error.message);
        process.exit(1);
      }
    });
}

function normalizeCommandOptions(options) {
  return typeof options?.opts === "function" ? options.opts() : options || {};
}

function loadComposeRender() {
  try {
    return require("@reshot/compose/render");
  } catch (error) {
    const monoPath = path.resolve(
      __dirname,
      "../../../../packages/compose/dist/render.cjs",
    );
    if (fs.existsSync(monoPath)) {
      return require(monoPath);
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      "@reshot/compose/render not found. Run `pnpm install` at the repo root and `pnpm --dir packages/compose build`.\n" +
        message,
    );
  }
}

async function withComposeEnvironment(env, callback) {
  const previous = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function printPack(pack) {
  for (const format of ["mp4", "webm", "poster", "gif"]) {
    if (pack[format]) {
      console.log(chalk.gray(`  ${format.padEnd(6)} ${relativePath(pack[format])}`));
    }
  }
}

function printPublicUrls(publicUrls) {
  if (!publicUrls || typeof publicUrls !== "object") return;
  if (publicUrls.embed) {
    console.log(chalk.gray(`  Live embed: ${publicUrls.embed}`));
  }
  if (publicUrls.live?.mp4) {
    console.log(chalk.gray(`  Live MP4:   ${publicUrls.live.mp4}`));
  }
  if (publicUrls.pinned?.mp4) {
    console.log(chalk.gray(`  Pinned MP4: ${publicUrls.pinned.mp4}`));
  }
}

function relativePath(filePath) {
  const relative = path.relative(process.cwd(), filePath);
  return relative && !relative.startsWith("..") ? relative : filePath;
}

module.exports = {
  DEFAULT_FORMATS,
  assertCaptureExists,
  deriveSlug,
  normalizeCommandOptions,
  parseFormats,
  parseSize,
  printPublicUrls,
  registerCompose,
  resolveComposeContext,
  resolveComposeProjectContext,
  resolveCapturePath,
  resolveMetadataPath,
  resolveOutBase,
  runCompose,
  runComposePush,
  uploadComposition,
};
