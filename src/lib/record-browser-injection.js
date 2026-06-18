// record-browser-injection.js - Browser event listener injection for recording
const chalk = require("chalk");
const { SELECTOR_STRATEGIES_SCRIPT } = require("./selector-strategies");

/**
 * Injected script that captures browser events and generates selectors.
 */
const INJECTED_LISTENER_SCRIPT = `
// First, inject the selector strategies library
${SELECTOR_STRATEGIES_SCRIPT}

(function() {
  if (window.__RESHOT_INJECTED) return;
  window.__RESHOT_INJECTED = true;
  
  // Check if an element is "noise" - something we shouldn't record interactions on
  function isNoiseElement(element) {
    if (!element) return true;
    const tagName = element.tagName;
    
    // Skip body/html/document level clicks - usually dismiss actions
    if (tagName === 'BODY' || tagName === 'HTML') return true;
    
    // Skip form/container elements - clicks on these are usually accidental
    if (tagName === 'FORM' || tagName === 'MAIN' || tagName === 'SECTION' || tagName === 'ARTICLE' || tagName === 'HEADER' || tagName === 'FOOTER' || tagName === 'NAV' || tagName === 'ASIDE') return true;
    
    // Skip hidden elements (aria-hidden, hidden attribute, display:none)
    if (element.getAttribute('aria-hidden') === 'true') return true;
    if (element.hidden) return true;
    if (element.getAttribute('tabindex') === '-1' && tagName === 'SELECT') return true;  // Radix hidden native select
    
    // Skip native SELECT elements inside Radix components (they're hidden placeholders)
    if (tagName === 'SELECT') {
      // If it's inside a Radix select root, it's the hidden native select
      const radixRoot = element.closest('[data-radix-select-viewport], [role="combobox"]');
      if (radixRoot || element.getAttribute('tabindex') === '-1') {
        return true;
      }
    }
    
    // Skip SVG elements (usually icons inside buttons - we want the button, not the SVG)
    if (tagName === 'SVG' || tagName === 'PATH' || tagName === 'CIRCLE' || tagName === 'RECT' || tagName === 'LINE' || tagName === 'POLYLINE' || tagName === 'POLYGON') {
      return true;
    }
    
    // Skip generic divs that don't have meaningful attributes
    if (tagName === 'DIV') {
      const hasTestId = element.hasAttribute('data-testid') || element.hasAttribute('data-test') || element.hasAttribute('data-cy');
      const hasRole = element.hasAttribute('role') && element.getAttribute('role') !== 'presentation';
      const hasAriaLabel = element.hasAttribute('aria-label');
      const hasOnClick = element.hasAttribute('onclick') || element.onclick;
      // If div has no meaningful attributes, it's probably a layout container
      if (!hasTestId && !hasRole && !hasAriaLabel && !hasOnClick) {
        return true;
      }
    }
    
    // Skip backdrop/overlay divs
    if (element.getAttribute('data-radix-portal') !== null) return true;
    if (element.getAttribute('data-radix-popper-content-wrapper') !== null) return true;
    if (element.className && typeof element.className === 'string') {
      if (element.className.includes('backdrop') || element.className.includes('overlay')) return true;
      // Skip elements that only have layout/spacing classes
      const classes = element.className.trim().split(/\\s+/);
      const meaningfulClasses = classes.filter(c => !isLayoutClass(c));
      if (meaningfulClasses.length === 0) return true;
    }
    return false;
  }
  
  // Find the best clickable parent (for SVGs and other nested elements)
  function findBestClickableParent(element) {
    let current = element;
    let depth = 0;
    
    while (current && current !== document.body && depth < 5) {
      // If this element has data-testid, use it
      if (current.hasAttribute('data-testid')) return current;
      
      // If it's a button, link, or has role=button, use it
      const tagName = current.tagName;
      if (tagName === 'BUTTON' || tagName === 'A' || current.getAttribute('role') === 'button') {
        return current;
      }
      
      // If it's an input-like element, use it
      if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
        return current;
      }
      
      current = current.parentElement;
      depth++;
    }
    
    return element; // Return original if no better parent found
  }
  
  // Check if a class is a layout/utility class (not meaningful for identification)
  function isLayoutClass(className) {
    if (!className) return true;
    // Tailwind spacing/layout patterns
    if (/^(p|m|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr)-/.test(className)) return true;
    if (/^(w-|h-|min-|max-|flex|grid|gap-|space-)/.test(className)) return true;
    if (/^(items-|justify-|self-|place-)/.test(className)) return true;
    if (/^(col-|row-|order-)/.test(className)) return true;
    if (/^(overflow|z-|inset|top-|right-|bottom-|left-)/.test(className)) return true;
    if (/^(block|inline|hidden|visible|absolute|relative|fixed|sticky)$/.test(className)) return true;
    if (/^(rounded|border|shadow|bg-|text-|font-)/.test(className)) return true;
    return false;
  }
  
  // Check if a class name is dynamic/generated (should be skipped)
  function isDynamicClass(className) {
    if (!className || className.length < 2) return true;
    // Skip state classes
    if (/^(is-|has-|active|disabled|hover|focus|selected|open|closed|hidden|visible)/.test(className)) return true;
    // Skip framework prefixes
    if (/^(js-|ng-|v-|react-|ember-)/.test(className)) return true;
    // Skip hash-based classes (Tailwind/CSS Modules)
    if (/^[a-z]+_[a-f0-9]{6,}/.test(className)) return true;  // module__hash pattern
    if (/[_-][a-f0-9]{6,}[_-]/.test(className)) return true;  // hash in middle
    if (/^[a-z]{1,3}[0-9]{4,}/.test(className)) return true;  // a1234 pattern
    if (/-module__/.test(className)) return true;  // CSS module pattern
    if (/^__/.test(className)) return true;  // CSS module output like __className
    // Skip Radix UI dynamic IDs in classes
    if (/radix/.test(className.toLowerCase())) return true;
    return false;
  }
  
  // Filter classes to only meaningful ones
  function getMeaningfulClasses(element) {
    if (!element.className || typeof element.className !== 'string') return [];
    return element.className.trim().split(/\\s+/).filter(c => !isDynamicClass(c));
  }
  
  // ============================================================================
  // ENHANCED SMART SELECTOR GENERATION
  // Uses the new selector-strategies library for industry-standard identification
  // Following Playwright/Testing Library best practices
  // ============================================================================
  
  function generateSmartSelector(element) {
    // Use the enhanced selector strategies if available
    if (window.__RESHOT_SELECTOR_STRATEGIES) {
      const strategies = window.__RESHOT_SELECTOR_STRATEGIES;
      const selectors = strategies.generateSelectors(element, { includeAll: false, maxResults: 3 });
      
      if (selectors && selectors.length > 0) {
        const best = selectors[0];
        
        // Log selector info for debugging (only in dev mode)
        if (window.__RESHOT_DEBUG) {
          console.log('[Reshot] Selector generated:', {
            type: best.type,
            selector: best.selector,
            confidence: best.confidence,
            description: best.description,
            alternates: selectors.slice(1).map(s => s.selector)
          });
        }
        
        // Store alternate selectors for fallback during playback
        if (selectors.length > 1) {
          window.__RESHOT_LAST_ALTERNATES = selectors.slice(1).map(s => s.selector);
        }
        
        return best.selector;
      }
    }
    
    // Fallback to legacy selector generation if strategies not available
    return generateLegacySelector(element);
  }
  
  // Legacy selector generation (kept for backward compatibility)
  function generateLegacySelector(element) {
    // Priority 1: data-testid (most reliable)
    if (element.hasAttribute('data-testid')) {
      return '[data-testid="' + element.getAttribute('data-testid') + '"]';
    }
    
    // Priority 2: data-test, data-cy (common test attributes)
    if (element.hasAttribute('data-test')) {
      return '[data-test="' + element.getAttribute('data-test') + '"]';
    }
    if (element.hasAttribute('data-cy')) {
      return '[data-cy="' + element.getAttribute('data-cy') + '"]';
    }
    
    // Priority 3: ID (if not dynamic/generated)
    if (element.id && !element.id.match(/^(:|react|ember|vue|radix)/i) && !element.id.match(/[_-][a-f0-9]{6,}/)) {
      return '#' + CSS.escape(element.id);
    }
    
    // Priority 4: ARIA label
    if (element.hasAttribute('aria-label')) {
      const label = element.getAttribute('aria-label');
      if (label && label.length < 50) {
        return '[aria-label="' + label + '"]';
      }
    }
    
    // Priority 5: Name attribute (for form elements)
    if (element.name && (element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA')) {
      return element.tagName.toLowerCase() + '[name="' + element.name + '"]';
    }
    
    // Priority 6: For attribute (for labels)
    if (element.tagName === 'LABEL' && element.htmlFor) {
      return 'label[for="' + element.htmlFor + '"]';
    }
    
    // Priority 7: Button/link text content
    if (element.tagName === 'BUTTON' || element.tagName === 'A' || element.getAttribute('role') === 'button') {
      const text = element.textContent.trim().replace(/\\s+/g, ' ');
      if (text && text.length > 0 && text.length < 50 && !text.includes('\\n')) {
        const tagOrRole = element.tagName === 'BUTTON' ? 'button' : (element.tagName === 'A' ? 'a' : '[role="button"]');
        return tagOrRole + ':has-text("' + text.substring(0, 30) + '")';
      }
    }
    
    // Priority 8: Input by placeholder
    if (element.tagName === 'INPUT' && element.placeholder) {
      return 'input[placeholder="' + element.placeholder + '"]';
    }
    
    // Priority 9: Input/select by label association
    if (element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA') {
      const id = element.id;
      if (id) {
        const label = document.querySelector('label[for="' + id + '"]');
        if (label && label.textContent) {
          const labelText = label.textContent.trim();
          if (labelText.length < 30) {
            return element.tagName.toLowerCase() + ':near(label:has-text("' + labelText + '"))';
          }
        }
      }
    }
    
    // Priority 10: Radix UI data attributes (stable for select/dropdown items)
    if (element.hasAttribute('data-radix-collection-item')) {
      const value = element.getAttribute('data-value') || element.textContent?.trim();
      if (value && value.length < 30) {
        return '[data-radix-collection-item]:has-text("' + value + '")';
      }
    }
    
    // Priority 11: Unique class combinations (filtered)
    const meaningfulClasses = getMeaningfulClasses(element);
    if (meaningfulClasses.length > 0) {
      const classCombo = meaningfulClasses.slice(0, 2).join('.');
      const selector = element.tagName.toLowerCase() + '.' + classCombo;
      try {
        const matches = document.querySelectorAll(selector);
        if (matches.length === 1) {
          return selector;
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }
    
    // Priority 12: Build path from nearest identifiable ancestor
    let current = element;
    let pathParts = [];
    let depth = 0;
    
    while (current && current !== document.body && depth < 5) {
      // Check for data-testid on ancestor
      if (current.hasAttribute('data-testid')) {
        const ancestorSelector = '[data-testid="' + current.getAttribute('data-testid') + '"]';
        if (pathParts.length > 0) {
          return ancestorSelector + ' ' + pathParts.reverse().join(' > ');
        }
        return ancestorSelector;
      }
      
      // Check for stable ID on ancestor
      if (current.id && !current.id.match(/^(:|react|ember|vue|radix)/i) && !current.id.match(/[_-][a-f0-9]{6,}/)) {
        const ancestorSelector = '#' + CSS.escape(current.id);
        if (pathParts.length > 0) {
          return ancestorSelector + ' ' + pathParts.reverse().join(' > ');
        }
        return ancestorSelector;
      }
      
      let part = current.tagName.toLowerCase();
      
      // Add meaningful class if available
      const classes = getMeaningfulClasses(current);
      if (classes.length > 0) {
        part += '.' + classes[0];
      }
      
      pathParts.push(part);
      current = current.parentElement;
      depth++;
    }
    
    // Fallback: return the path we built
    if (pathParts.length > 0) {
      return pathParts.reverse().join(' > ');
    }
    
    // Last resort: tag with nth-child (least stable)
    let selector = element.tagName.toLowerCase();
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(el => el.tagName === element.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(element) + 1;
        selector += ':nth-of-type(' + index + ')';
      }
    }
    return selector;
  }
  
  // Click event handler
  function handleClick(event) {
    const mode = window.__RESHOT_MODE || 'normal';
    const debug = window.__RESHOT_DEBUG;
    
    // Find best target - go up the tree if clicking on SVG, SPAN, etc.
    let target = event.target;
    if (isNoiseElement(target)) {
      target = findBestClickableParent(target);
      if (isNoiseElement(target)) {
        if (debug) console.log('[Reshot] Skipping noise click on:', event.target.tagName);
        return;
      }
    }
    
    const selector = generateSmartSelector(target);
    
    // Skip if we couldn't generate a meaningful selector
    if (!selector || selector === 'body' || selector === 'html' || selector.startsWith('body.') || selector.startsWith('html.')) {
      if (debug) console.log('[Reshot] Skipping click with unstable selector:', selector);
      return;
    }
    
    // Skip complex selectors with generic class patterns (these are unstable)
    if (selector.includes('form.') || selector.includes('> select') || selector.includes('div.space-')) {
      if (debug) console.log('[Reshot] Skipping complex unstable selector:', selector);
      return;
    }
    
    if (mode === 'select-element-for-screenshot' || mode === 'select-element-for-clip') {
      // In selection mode, prevent default behavior and report selection
      event.preventDefault();
      event.stopPropagation();
      
      window.reshotReportAction({
        type: 'selection',
        selector: selector
      });
      
      return false;
    } else if (mode === 'normal' || mode === 'recording-clip') {
      // Normal recording mode - capture click
      window.reshotReportAction({
        type: 'click',
        selector: selector
      });
    }
  }
  
  // Input change handler
  function handleChange(event) {
    const mode = window.__RESHOT_MODE || 'normal';
    const debug = window.__RESHOT_DEBUG;
    
    // Skip hidden/aria-hidden elements (like Radix hidden selects)
    if (event.target.getAttribute('aria-hidden') === 'true') {
      if (debug) console.log('[Reshot] Skipping change on aria-hidden element');
      return;
    }
    if (event.target.getAttribute('tabindex') === '-1' && event.target.tagName === 'SELECT') {
      if (debug) console.log('[Reshot] Skipping change on hidden Radix select');
      return;
    }
    
    if (mode === 'normal' || mode === 'recording-clip') {
      const selector = generateSmartSelector(event.target);
      
      // Skip complex selectors
      if (selector.includes('form.') || selector.includes('> select') || selector.includes('div.space-')) {
        if (debug) console.log('[Reshot] Skipping input with complex unstable selector:', selector);
        return;
      }
      
      window.reshotReportAction({
        type: 'input',
        selector: selector,
        value: event.target.value
      });
    }
  }
  
  // Attach listeners
  document.addEventListener('click', handleClick, true);
  document.addEventListener('change', handleChange, true);
  
  if (window.__RESHOT_DEBUG) console.log('[Reshot] Event listeners attached');
})();
`;

/**
 * Set up browser action listener via exposeBinding
 * @param {Page} page - Playwright page object
 * @param {Object} sessionState - Recording session state
 * @param {Object} options - Options
 * @param {boolean} options.skipBinding - Skip exposeBinding if already done
 */
async function setupBrowserActionListener(page, sessionState, options = {}) {
  const { skipBinding = false } = options;

  // Expose binding for browser to report actions back to Node
  // Only if not already done (e.g., by RecorderService)
  if (!skipBinding) {
    try {
      // Check if binding already exists
      const bindingExists = await page
        .evaluate(() => typeof window.reshotReportAction === "function")
        .catch(() => false);

      if (!bindingExists) {
        await page.exposeBinding(
          "reshotReportAction",
          async (source, payload) => {
            await onBrowserAction(payload, sessionState, page);
          }
        );
      }
    } catch (error) {
      // If binding already registered, that's fine - it means we're reconnecting
      if (!error.message.includes("already registered")) {
        throw error;
      }
      console.log(chalk.yellow("[Recorder] Binding already exists, reusing"));
    }
  }

  // Inject the listener script as init script (for future navigations)
  try {
    await page.addInitScript(INJECTED_LISTENER_SCRIPT);
  } catch (error) {
    // Init script may already be added
    if (!error.message.includes("already")) {
      console.log(chalk.yellow("[Recorder] Init script may already be added"));
    }
  }

  // Inject into current page
  try {
    await page.evaluate(INJECTED_LISTENER_SCRIPT);
  } catch (error) {
    console.log(
      chalk.yellow("[Recorder] Could not inject script:", error.message)
    );
  }

  console.log(chalk.green("✔ Browser event listeners injected\n"));
}

/**
 * Update the mode in the browser
 * @param {Page} page - Playwright page object
 * @param {string} mode - New mode to set
 */
async function updateBrowserMode(page, mode) {
  await page.evaluate((newMode) => {
    window.__RESHOT_MODE = newMode;
  }, mode);
}

/**
 * Check if a selector is unstable/garbage and should be rejected
 * @param {string} selector - The CSS selector to validate
 * @returns {boolean} true if the selector is bad and should be rejected
 */
function isUnstableSelector(selector) {
  if (!selector) return true;

  // Reject body/html selectors
  if (selector === "body" || selector === "html") return true;
  if (selector.startsWith("body.") || selector.startsWith("html.")) return true;

  // Reject form container selectors (form.something)
  if (selector.startsWith("form.") || selector === "form") return true;

  // Reject main/section/article container selectors
  if (/^(main|section|article|header|footer|nav|aside)(\.|$)/.test(selector))
    return true;

  // Reject generic div selectors without data-testid
  if (selector.startsWith("div.") && !selector.includes("[data-testid"))
    return true;

  // Reject selectors that are purely Tailwind utility classes
  const tailwindPattern =
    /\.(p|m|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr|w|h|flex|grid|gap|space|items|justify|rounded|border|shadow|bg|text|font)-/;
  if (
    tailwindPattern.test(selector) &&
    !selector.includes("[data-testid") &&
    !selector.includes("#")
  )
    return true;

  // Reject selectors with dynamic Radix IDs
  if (/radix-[A-Za-z0-9_-]+/.test(selector)) return true;

  // Reject selectors with CSS module hashes
  if (/[a-z]+_[a-f0-9]{6,}/.test(selector)) return true;
  if (/-module__/.test(selector)) return true;

  return false;
}

/**
 * Handle action reported from browser
 * @param {Object} payload - Action payload from browser
 * @param {Object} sessionState - Recording session state
 * @param {Page} page - Playwright page object
 */
async function onBrowserAction(payload, sessionState, page) {
  const { type, selector, value } = payload;

  // Handle element selection modes
  if (sessionState.mode === "select-element-for-screenshot") {
    console.log(chalk.cyan(`  SELECTED ELEMENT: ${selector}\n`));
    sessionState.pendingCapture.selector = selector;
    sessionState.mode = "normal";

    // Trigger continuation of screenshot flow
    if (sessionState.onElementSelected) {
      sessionState.onElementSelected();
    }
    return;
  }

  if (sessionState.mode === "select-element-for-clip") {
    console.log(chalk.cyan(`  SELECTED ELEMENT FOR CLIP: ${selector}\n`));
    sessionState.pendingCapture.selector = selector;
    sessionState.mode = "normal";

    // Trigger continuation of clip flow
    if (sessionState.onElementSelected) {
      sessionState.onElementSelected();
    }
    return;
  }

  // Normal recording mode
  if (
    sessionState.mode === "normal" ||
    sessionState.mode === "recording-clip"
  ) {
    if (sessionState.phase !== "capturing") {
      return;
    }

    // Server-side validation: reject unstable selectors
    if (isUnstableSelector(selector)) {
      console.log(chalk.yellow(`  REJECTED (unstable selector): ${selector}`));
      return;
    }

    // Deduplication: skip duplicate consecutive clicks on the same element
    const lastStep =
      sessionState.capturedSteps[sessionState.capturedSteps.length - 1];
    if (
      lastStep &&
      type === "click" &&
      lastStep.action === "click" &&
      lastStep.selector === selector
    ) {
      console.log(chalk.yellow(`  SKIPPED (duplicate click): ${selector}`));
      return;
    }

    // Also skip click if we just typed into the same element (click before type is redundant)
    if (
      type === "click" &&
      lastStep &&
      lastStep.action === "type" &&
      lastStep.selector === selector
    ) {
      console.log(chalk.yellow(`  SKIPPED (click after type): ${selector}`));
      return;
    }

    let step;

    if (type === "click") {
      step = {
        action: "click",
        selector: selector,
      };
      console.log(chalk.green(`  ✔ ACTION CAPTURED: click on ${selector}`));
    } else if (type === "input") {
      // If we have a pending click on the same element, remove it (click before type is redundant)
      if (
        lastStep &&
        lastStep.action === "click" &&
        lastStep.selector === selector
      ) {
        sessionState.capturedSteps.pop();
        console.log(
          chalk.yellow(`  REMOVED redundant click before type: ${selector}`)
        );
      }

      step = {
        action: "input",
        selector: selector,
        text: value,
      };
      console.log(
        chalk.green(`  ✔ ACTION CAPTURED: type "${value}" into ${selector}`)
      );
    }

    if (step) {
      sessionState.capturedSteps.push(step);

      // If recording clip, also add to clip events with timestamp and replay to recording context
      if (sessionState.mode === "recording-clip" && sessionState.clipEvents) {
        const timestamp = (Date.now() - sessionState.recordingStart) / 1000;
        const clipEvent = {
          ...step,
          timestamp,
          selector: selector,
        };
        sessionState.clipEvents.push(clipEvent);

        // Replay action to recording context to sync video with timeline
        if (sessionState.replayActionToRecording) {
          // Fire and forget - don't block on replay
          sessionState
            .replayActionToRecording(step.action, selector, step.text)
            .catch(() => {
              // Silently handle replay errors
            });
        }
      }
    }
  }
}

module.exports = {
  setupBrowserActionListener,
  updateBrowserMode,
};
