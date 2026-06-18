// resolve-targets.js - Resolve compose target coordinates from a Playwright page

async function resolveTargets(page, targets = {}) {
  const resolved = {};

  for (const [name, config] of Object.entries(targets || {})) {
    const target = normalizeTarget(config);

    for (const step of target.navigate) {
      if (step.clickText) {
        await page.getByText(step.clickText, { exact: true }).first().click();
      } else if (step.selector) {
        await page.locator(step.selector).first().click();
      }
      if (step.waitMs) {
        await page.waitForTimeout(step.waitMs);
      }
    }

    const locator = page.locator(target.selector).first();
    await locator.waitFor({ state: 'visible', timeout: target.timeoutMs });
    const box = await locator.boundingBox();
    if (!box) {
      throw new Error(`Could not resolve target "${name}"`);
    }

    resolved[name] = {
      x: Math.round(box.x),
      y: Math.round(box.y),
      w: Math.round(box.width),
      h: Math.round(box.height),
    };
  }

  return resolved;
}

function normalizeTarget(config) {
  if (typeof config === 'string') {
    return {
      selector: config,
      navigate: [],
      timeoutMs: 10000,
    };
  }

  if (!config || typeof config !== 'object' || !config.selector) {
    throw new Error('Target config must be a selector string or an object with selector');
  }

  return {
    selector: config.selector,
    navigate: Array.isArray(config.navigate) ? config.navigate : [],
    timeoutMs: config.timeoutMs || 10000,
  };
}

module.exports = {
  resolveTargets,
};
