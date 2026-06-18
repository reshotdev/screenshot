// capture-dom.js - Capture a self-contained DOM reconstruction artifact from a
// live URL (Tier-3 Phase 2). Emits <slug>.dom.html (+ sidecars), remounted.png,
// and live.png so the calibrated quality gate can diff them:
//
//   reshot capture-dom <url> --out /tmp/cap
//   pnpm --dir packages/compose verify diff /tmp/cap/remounted.png /tmp/cap/live.png

const chalk = require("chalk");
const path = require("path");
const { captureDomFromUrl } = require("../lib/dom-capture");

function registerCaptureDom(program) {
  program
    .command("capture-dom <url>")
    .description("Capture a self-contained DOM reconstruction artifact from a live URL")
    .option("-o, --out <dir>", "Output directory", "./.reshot/capture-dom")
    .option("-s, --slug <slug>", "Artifact slug", "capture")
    .option("--width <px>", "Viewport width", (v) => parseInt(v, 10))
    .option("--height <px>", "Viewport height", (v) => parseInt(v, 10))
    .option("--dpr <n>", "Device scale factor", (v) => parseInt(v, 10))
    .action(async (url, options) => {
      const outDir = path.resolve(options.out);
      const settings =
        options.width || options.height || options.dpr
          ? {
              width: options.width || 1000,
              height: options.height || 800,
              deviceScaleFactor: options.dpr || 2,
            }
          : undefined;

      console.log(chalk.cyan(`\n  Capturing DOM from ${url} ...\n`));
      const result = await captureDomFromUrl({ url, outDir, slug: options.slug, settings });

      console.log(chalk.green(`  ✔ method: ${result.method}`));
      console.log(`  artifact:  ${result.artifact}`);
      console.log(`  remounted: ${result.remounted}`);
      console.log(`  live:      ${result.live}`);
      if (result.sidecars.length) {
        console.log(`  sidecars:  ${result.sidecars.map((s) => `${s.kind}(rasterized=${s.rasterized})`).join(", ")}`);
      }
      console.log(
        chalk.gray(
          `\n  Verify: pnpm --dir packages/compose verify diff ${result.remounted} ${result.live}\n`,
        ),
      );
    });
}

module.exports = { registerCaptureDom };
