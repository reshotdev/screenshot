const fs = require("fs-extra");
const path = require("path");

function countFilesRecursive(dir) {
  let count = 0;
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      count += countFilesRecursive(fullPath);
    } else {
      count++;
    }
  }

  return count;
}

function deleteAllOutputAssets(outputDir) {
  if (!fs.existsSync(outputDir)) {
    return 0;
  }

  const deletedFiles = countFilesRecursive(outputDir);
  fs.emptyDirSync(outputDir);

  return deletedFiles;
}

function deleteScenarioAssetDirectories(outputDir, scenarioKeys, isPathWithinBase) {
  if (!fs.existsSync(outputDir)) {
    return { deletedScenarios: 0, deletedFiles: 0 };
  }

  let deletedScenarios = 0;
  let deletedFiles = 0;

  for (const scenarioKey of scenarioKeys) {
    const scenarioDir = path.join(outputDir, scenarioKey);

    if (!isPathWithinBase(scenarioDir, outputDir)) {
      continue;
    }

    if (fs.existsSync(scenarioDir)) {
      deletedFiles += countFilesRecursive(scenarioDir);
      fs.removeSync(scenarioDir);
      deletedScenarios++;
    }
  }

  return { deletedScenarios, deletedFiles };
}

module.exports = {
  countFilesRecursive,
  deleteAllOutputAssets,
  deleteScenarioAssetDirectories,
};
