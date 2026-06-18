"use strict";

const fs = require("fs-extra");

async function packFromExistingOutputs(outBase) {
  const pack = {
    mp4: `${outBase}.mp4`,
    webm: `${outBase}.webm`,
    poster: `${outBase}.webp`,
  };
  const gifPath = `${outBase}.gif`;
  if (await fs.pathExists(gifPath)) {
    pack.gif = gifPath;
  }
  return pack;
}

async function assertUploadPackExists(pack, skipRender) {
  const required = [
    ["rendered_mp4", pack.mp4],
    ["rendered_webm", pack.webm],
    ["rendered_poster", pack.poster],
  ];

  for (const [field, filePath] of required) {
    if (!filePath || !(await fs.pathExists(filePath))) {
      const rerenderHint = skipRender
        ? " Run `reshot compose <file>` first or remove --skip-render."
        : "";
      throw new Error(`Missing ${field} output: ${filePath || "(not produced)"}.${rerenderHint}`);
    }
  }

  if (pack.gif && !(await fs.pathExists(pack.gif))) {
    throw new Error(`Missing rendered_gif output: ${pack.gif}.`);
  }
}

module.exports = {
  assertUploadPackExists,
  packFromExistingOutputs,
};
