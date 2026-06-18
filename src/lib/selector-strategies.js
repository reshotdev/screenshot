// selector-strategies.js - Element identification following Playwright/Testing Library best practices
// Priority: role > label > placeholder > text > testId > attributes > CSS

/**
 * Injected script for smart selector generation
 * This follows W3C accessibility guidelines and modern testing best practices
 */
const SELECTOR_STRATEGIES_SCRIPT = `
(function() {
  if (window.__RESHOT_SELECTOR_STRATEGIES) return window.__RESHOT_SELECTOR_STRATEGIES;

  // ============================================================================
  // ARIA Role Mappings (W3C HTML-AAM specification)
  // https://www.w3.org/TR/html-aria/#docconformance
  // ============================================================================
  
  const IMPLICIT_ROLES = {
    'A': (el) => el.hasAttribute('href') ? 'link' : null,
    'ARTICLE': () => 'article',
    'ASIDE': () => 'complementary',
    'BUTTON': () => 'button',
    'DATALIST': () => 'listbox',
    'DETAILS': () => 'group',
    'DIALOG': () => 'dialog',
    'FIELDSET': () => 'group',
    'FIGURE': () => 'figure',
    'FOOTER': (el) => {
      // Footer within article/aside/main/nav/section = null, otherwise contentinfo
      const parent = el.closest('article, aside, main, nav, section');
      return parent ? null : 'contentinfo';
    },
    'FORM': (el) => el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') || el.hasAttribute('name') ? 'form' : null,
    'H1': () => 'heading',
    'H2': () => 'heading',
    'H3': () => 'heading',
    'H4': () => 'heading',
    'H5': () => 'heading',
    'H6': () => 'heading',
    'HEADER': (el) => {
      const parent = el.closest('article, aside, main, nav, section');
      return parent ? null : 'banner';
    },
    'HR': () => 'separator',
    'IMG': (el) => {
      const alt = el.getAttribute('alt');
      if (alt === '') return 'presentation';
      return 'img';
    },
    'INPUT': (el) => {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      const typeRoles = {
        'button': 'button',
        'checkbox': 'checkbox',
        'email': 'textbox',
        'image': 'button',
        'number': 'spinbutton',
        'password': 'textbox',
        'radio': 'radio',
        'range': 'slider',
        'reset': 'button',
        'search': 'searchbox',
        'submit': 'button',
        'tel': 'textbox',
        'text': 'textbox',
        'url': 'textbox'
      };
      return typeRoles[type] || 'textbox';
    },
    'LI': (el) => {
      const parent = el.closest('ul, ol, menu');
      return parent ? 'listitem' : null;
    },
    'MAIN': () => 'main',
    'MENU': () => 'list',
    'NAV': () => 'navigation',
    'OL': () => 'list',
    'OPTGROUP': () => 'group',
    'OPTION': () => 'option',
    'OUTPUT': () => 'status',
    'PROGRESS': () => 'progressbar',
    'SECTION': (el) => el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') ? 'region' : null,
    'SELECT': (el) => el.hasAttribute('multiple') || (el.hasAttribute('size') && parseInt(el.getAttribute('size')) > 1) ? 'listbox' : 'combobox',
    'SUMMARY': () => 'button',
    'TABLE': () => 'table',
    'TBODY': () => 'rowgroup',
    'TD': () => 'cell',
    'TEXTAREA': () => 'textbox',
    'TFOOT': () => 'rowgroup',
    'TH': (el) => el.getAttribute('scope') === 'row' ? 'rowheader' : 'columnheader',
    'THEAD': () => 'rowgroup',
    'TR': () => 'row',
    'UL': () => 'list'
  };

  /**
   * Get the ARIA role for an element (explicit or implicit)
   */
  function getRole(element) {
    // Explicit role takes precedence
    const explicitRole = element.getAttribute('role');
    if (explicitRole) return explicitRole.split(' ')[0]; // Take first role if multiple

    // Check for implicit role based on tag name
    const tagName = element.tagName;
    const implicitRoleFn = IMPLICIT_ROLES[tagName];
    if (implicitRoleFn) {
      return implicitRoleFn(element);
    }

    return null;
  }

  // ============================================================================
  // Accessible Name Computation (simplified W3C accname algorithm)
  // https://www.w3.org/TR/accname-1.1/
  // ============================================================================

  /**
   * Compute the accessible name for an element
   * This follows a simplified version of the W3C Accessible Name Computation
   */
  function getAccessibleName(element, options = {}) {
    const { maxLength = 50 } = options;
    let name = null;

    // Step 1: aria-labelledby
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const ids = labelledBy.split(/\\s+/);
      const names = ids
        .map(id => document.getElementById(id))
        .filter(Boolean)
        .map(el => el.textContent?.trim())
        .filter(Boolean);
      if (names.length > 0) {
        name = names.join(' ');
      }
    }

    // Step 2: aria-label
    if (!name) {
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel && ariaLabel.trim()) {
        name = ariaLabel.trim();
      }
    }

    // Step 3: Native label association (for form controls)
    if (!name && (element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA')) {
      // Check for associated label via 'for' attribute
      if (element.id) {
        const label = document.querySelector('label[for="' + CSS.escape(element.id) + '"]');
        if (label) {
          name = label.textContent?.trim();
        }
      }
      // Check for wrapping label
      if (!name) {
        const parentLabel = element.closest('label');
        if (parentLabel) {
          // Get text content excluding the input itself
          const clone = parentLabel.cloneNode(true);
          const inputs = clone.querySelectorAll('input, select, textarea');
          inputs.forEach(input => input.remove());
          name = clone.textContent?.trim();
        }
      }
    }

    // Step 4: For buttons, links - use text content
    if (!name) {
      const role = getRole(element);
      if (role === 'button' || role === 'link' || role === 'menuitem' || role === 'tab' || role === 'option') {
        name = getTextContent(element);
      }
    }

    // Step 5: For inputs - check value, placeholder
    if (!name && element.tagName === 'INPUT') {
      const type = (element.getAttribute('type') || 'text').toLowerCase();
      if (type === 'submit' || type === 'reset' || type === 'button') {
        name = element.value || (type === 'submit' ? 'Submit' : type === 'reset' ? 'Reset' : null);
      } else if (element.placeholder) {
        name = element.placeholder;
      }
    }

    // Step 6: img alt text
    if (!name && element.tagName === 'IMG') {
      name = element.getAttribute('alt');
    }

    // Step 7: title attribute (last resort)
    if (!name) {
      name = element.getAttribute('title');
    }

    // Normalize and truncate
    if (name) {
      name = name.replace(/\\s+/g, ' ').trim();
      if (name.length > maxLength) {
        name = name.substring(0, maxLength);
      }
    }

    return name;
  }

  /**
   * Get visible text content of an element (excluding hidden elements)
   */
  function getTextContent(element) {
    // Skip hidden elements
    if (element.getAttribute('aria-hidden') === 'true') return '';
    if (element.hidden) return '';
    
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return '';

    // Get direct text and recurse into children
    let text = '';
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Skip certain elements
        const tagName = node.tagName;
        if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'SVG') continue;
        text += getTextContent(node);
      }
    }
    
    return text.replace(/\\s+/g, ' ').trim();
  }

  // ============================================================================
  // Selector Generation Strategies
  // ============================================================================

  /**
   * Generate a role-based selector (most resilient)
   * Example: role=button[name="Submit"]
   */
  function generateRoleSelector(element) {
    const role = getRole(element);
    if (!role) return null;

    const accessibleName = getAccessibleName(element);
    
    if (accessibleName && accessibleName.length > 0 && accessibleName.length < 50) {
      // Escape quotes in the name
      const escapedName = accessibleName.replace(/"/g, '\\\\"');
      return {
        type: 'role',
        selector: 'role=' + role + '[name="' + escapedName + '"]',
        confidence: 0.95,
        description: role + ' with name "' + accessibleName + '"'
      };
    }

    // Role without name is less reliable but still useful for unique elements
    return null;
  }

  /**
   * Generate a label-based selector for form controls
   * Example: input:near(label:has-text("Email"))
   */
  function generateLabelSelector(element) {
    const tagName = element.tagName;
    if (tagName !== 'INPUT' && tagName !== 'SELECT' && tagName !== 'TEXTAREA') {
      return null;
    }

    // Check for associated label
    let labelText = null;

    // Via 'for' attribute
    if (element.id) {
      const label = document.querySelector('label[for="' + CSS.escape(element.id) + '"]');
      if (label) {
        labelText = label.textContent?.trim();
      }
    }

    // Via wrapping label
    if (!labelText) {
      const parentLabel = element.closest('label');
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true);
        clone.querySelectorAll('input, select, textarea').forEach(el => el.remove());
        labelText = clone.textContent?.trim();
      }
    }

    if (labelText && labelText.length > 0 && labelText.length < 40) {
      return {
        type: 'label',
        selector: 'label:has-text("' + labelText + '") >> ' + tagName.toLowerCase(),
        // Alternative Playwright-style selector
        playwrightSelector: 'getByLabel("' + labelText + '")',
        confidence: 0.9,
        description: tagName.toLowerCase() + ' with label "' + labelText + '"'
      };
    }

    return null;
  }

  /**
   * Generate a placeholder-based selector for inputs
   * Example: input[placeholder="Enter your email"]
   */
  function generatePlaceholderSelector(element) {
    const placeholder = element.getAttribute('placeholder');
    if (!placeholder || placeholder.length > 50) return null;

    const tagName = element.tagName.toLowerCase();
    return {
      type: 'placeholder',
      selector: tagName + '[placeholder="' + placeholder + '"]',
      playwrightSelector: 'getByPlaceholder("' + placeholder + '")',
      confidence: 0.85,
      description: tagName + ' with placeholder "' + placeholder + '"'
    };
  }

  /**
   * Generate a text-based selector
   * Example: button:has-text("Submit")
   */
  function generateTextSelector(element) {
    const role = getRole(element);
    const textContent = getTextContent(element);

    if (!textContent || textContent.length === 0 || textContent.length > 40) {
      return null;
    }

    // Only for interactive or meaningful elements
    const interactiveRoles = ['button', 'link', 'menuitem', 'option', 'tab', 'checkbox', 'radio'];
    const interactiveTags = ['BUTTON', 'A', 'LABEL', 'SUMMARY'];

    if (interactiveRoles.includes(role) || interactiveTags.includes(element.tagName)) {
      const tagName = element.tagName.toLowerCase();
      const escapedText = textContent.replace(/"/g, '\\\\"');
      
      return {
        type: 'text',
        selector: tagName + ':has-text("' + escapedText + '")',
        playwrightSelector: 'getByText("' + escapedText + '")',
        confidence: 0.8,
        description: tagName + ' containing text "' + textContent + '"'
      };
    }

    return null;
  }

  /**
   * Generate an alt text selector for images
   * Example: img[alt="Company Logo"]
   */
  function generateAltTextSelector(element) {
    if (element.tagName !== 'IMG' && element.tagName !== 'AREA') return null;

    const alt = element.getAttribute('alt');
    if (!alt || alt.length === 0 || alt.length > 50) return null;

    return {
      type: 'alt',
      selector: element.tagName.toLowerCase() + '[alt="' + alt + '"]',
      playwrightSelector: 'getByAltText("' + alt + '")',
      confidence: 0.85,
      description: element.tagName.toLowerCase() + ' with alt text "' + alt + '"'
    };
  }

  /**
   * Generate a title-based selector
   * Example: [title="More information"]
   */
  function generateTitleSelector(element) {
    const title = element.getAttribute('title');
    if (!title || title.length > 50) return null;

    return {
      type: 'title',
      selector: '[title="' + title + '"]',
      playwrightSelector: 'getByTitle("' + title + '")',
      confidence: 0.75,
      description: 'element with title "' + title + '"'
    };
  }

  /**
   * Generate a test ID selector (most stable, but requires explicit contract)
   * Example: [data-testid="submit-button"]
   */
  function generateTestIdSelector(element) {
    // Check various test ID conventions
    const testIdAttrs = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-pw'];
    
    for (const attr of testIdAttrs) {
      const value = element.getAttribute(attr);
      if (value && value.length < 60) {
        return {
          type: 'testid',
          selector: '[' + attr + '="' + value + '"]',
          playwrightSelector: 'getByTestId("' + value + '")',
          confidence: 0.99,
          description: 'test ID "' + value + '"'
        };
      }
    }

    return null;
  }

  /**
   * Generate an ARIA attribute selector
   * Example: [aria-label="Close dialog"]
   */
  function generateAriaSelector(element) {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.length < 50) {
      return {
        type: 'aria',
        selector: '[aria-label="' + ariaLabel + '"]',
        confidence: 0.9,
        description: 'element with aria-label "' + ariaLabel + '"'
      };
    }

    return null;
  }

  /**
   * Generate an ID-based selector (if ID is stable)
   * Example: #submit-form
   */
  function generateIdSelector(element) {
    const id = element.id;
    if (!id) return null;

    // Skip dynamic/generated IDs
    const dynamicPatterns = [
      /^react-/i,
      /^ember/i,
      /^vue-/i,
      /^radix-/i,
      /^:r[0-9a-z]+:/i, // React 18+ useId
      /^[a-f0-9]{8}-[a-f0-9]{4}/i, // UUID
      /[_-][a-f0-9]{6,}$/i, // Hash suffix
      /^[a-z]{1,3}[0-9]{4,}$/i, // Generated like a1234
      /^\\d+$/, // Pure numbers
    ];

    for (const pattern of dynamicPatterns) {
      if (pattern.test(id)) return null;
    }

    return {
      type: 'id',
      selector: '#' + CSS.escape(id),
      confidence: 0.95,
      description: 'ID "' + id + '"'
    };
  }

  /**
   * Generate a name attribute selector (for form elements)
   * Example: input[name="email"]
   */
  function generateNameSelector(element) {
    const name = element.getAttribute('name');
    if (!name) return null;

    const validTags = ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'FORM'];
    if (!validTags.includes(element.tagName)) return null;

    return {
      type: 'name',
      selector: element.tagName.toLowerCase() + '[name="' + name + '"]',
      confidence: 0.85,
      description: element.tagName.toLowerCase() + ' with name "' + name + '"'
    };
  }

  /**
   * Generate a data attribute selector
   * Example: [data-value="option1"]
   */
  function generateDataAttributeSelector(element) {
    // Check for meaningful data attributes
    const meaningfulDataAttrs = [
      'data-value', 'data-id', 'data-name', 'data-key', 
      'data-action', 'data-target', 'data-type',
      'data-radix-collection-item' // Common in Radix UI
    ];

    for (const attr of meaningfulDataAttrs) {
      const value = element.getAttribute(attr);
      if (value && value.length < 50) {
        return {
          type: 'data-attribute',
          selector: '[' + attr + '="' + value + '"]',
          confidence: 0.7,
          description: attr + '="' + value + '"'
        };
      }
    }

    return null;
  }

  /**
   * Generate a composite selector combining ancestor context with element
   * Example: [data-testid="modal"] button:has-text("Confirm")
   */
  function generateCompositeSelector(element) {
    // Find nearest identifiable ancestor
    let ancestor = element.parentElement;
    let depth = 0;
    const maxDepth = 5;

    while (ancestor && ancestor !== document.body && depth < maxDepth) {
      // Check for test ID on ancestor
      const ancestorTestId = generateTestIdSelector(ancestor);
      if (ancestorTestId) {
        // Now generate a simple selector for the element relative to ancestor
        const elementRole = generateRoleSelector(element);
        if (elementRole) {
          return {
            type: 'composite',
            selector: ancestorTestId.selector + ' >> ' + elementRole.selector,
            confidence: 0.85,
            description: 'inside ' + ancestorTestId.description + ': ' + elementRole.description
          };
        }
        
        const elementText = generateTextSelector(element);
        if (elementText) {
          return {
            type: 'composite',
            selector: ancestorTestId.selector + ' ' + elementText.selector,
            confidence: 0.8,
            description: 'inside ' + ancestorTestId.description + ': ' + elementText.description
          };
        }
      }

      // Check for stable ID on ancestor
      const ancestorId = generateIdSelector(ancestor);
      if (ancestorId) {
        const elementRole = generateRoleSelector(element);
        if (elementRole) {
          return {
            type: 'composite',
            selector: ancestorId.selector + ' >> ' + elementRole.selector,
            confidence: 0.8,
            description: 'inside ' + ancestorId.description + ': ' + elementRole.description
          };
        }
      }

      // Check for ARIA landmark
      const ancestorRole = getRole(ancestor);
      if (['navigation', 'main', 'banner', 'contentinfo', 'dialog', 'form'].includes(ancestorRole)) {
        const ancestorName = getAccessibleName(ancestor);
        if (ancestorName) {
          const elementSel = generateRoleSelector(element) || generateTextSelector(element);
          if (elementSel) {
            return {
              type: 'composite',
              selector: 'role=' + ancestorRole + '[name="' + ancestorName + '"] >> ' + elementSel.selector,
              confidence: 0.75,
              description: 'inside ' + ancestorRole + ' "' + ancestorName + '": ' + elementSel.description
            };
          }
        }
      }

      ancestor = ancestor.parentElement;
      depth++;
    }

    return null;
  }

  /**
   * Generate a structural path selector (fallback)
   * Example: main > section > button:nth-of-type(2)
   */
  function generateStructuralSelector(element) {
    const parts = [];
    let current = element;
    let depth = 0;
    const maxDepth = 4;

    while (current && current !== document.body && depth < maxDepth) {
      let part = current.tagName.toLowerCase();
      
      // Add distinguishing info
      if (current.id && !/[_-][a-f0-9]{6,}/.test(current.id)) {
        return {
          type: 'structural',
          selector: parts.reverse().join(' > ') + (parts.length ? ' > ' : '') + '#' + CSS.escape(current.id),
          confidence: 0.6,
          description: 'structural path ending at #' + current.id
        };
      }

      // Add nth-of-type if there are siblings of same type
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          part += ':nth-of-type(' + index + ')';
        }
      }

      parts.push(part);
      current = current.parentElement;
      depth++;
    }

    return {
      type: 'structural',
      selector: parts.reverse().join(' > '),
      confidence: 0.4,
      description: 'structural path (least reliable)'
    };
  }

  // ============================================================================
  // Main API
  // ============================================================================

  /**
   * Generate the best selector(s) for an element
   * Returns an array of selectors sorted by confidence
   */
  function generateSelectors(element, options = {}) {
    const { includeAll = false, maxResults = 3 } = options;
    const selectors = [];

    // Strategy priority order (industry best practices)
    const strategies = [
      generateTestIdSelector,    // 1. Test ID (explicit contract)
      generateRoleSelector,      // 2. Role + accessible name
      generateLabelSelector,     // 3. Label association
      generateAriaSelector,      // 4. ARIA attributes
      generatePlaceholderSelector, // 5. Placeholder
      generateTextSelector,      // 6. Text content
      generateAltTextSelector,   // 7. Alt text
      generateTitleSelector,     // 8. Title
      generateIdSelector,        // 9. Stable ID
      generateNameSelector,      // 10. Name attribute
      generateDataAttributeSelector, // 11. Data attributes
      generateCompositeSelector, // 12. Composite (ancestor + element)
      generateStructuralSelector // 13. Structural path (fallback)
    ];

    for (const strategy of strategies) {
      try {
        const result = strategy(element);
        if (result) {
          selectors.push(result);
          // For efficiency, stop early if we have a high-confidence selector
          if (!includeAll && result.confidence >= 0.9) {
            break;
          }
        }
      } catch (e) {
        // Strategy failed, continue to next
        console.warn('[Reshot] Selector strategy failed:', e.message);
      }
    }

    // Sort by confidence and return
    selectors.sort((a, b) => b.confidence - a.confidence);
    return includeAll ? selectors : selectors.slice(0, maxResults);
  }

  /**
   * Get the best single selector for an element
   */
  function getBestSelector(element) {
    const selectors = generateSelectors(element, { includeAll: false, maxResults: 1 });
    return selectors[0]?.selector || null;
  }

  /**
   * Validate that a selector uniquely identifies the target element
   */
  function validateSelector(selector, expectedElement) {
    try {
      // Handle Playwright-style role selectors
      if (selector.startsWith('role=')) {
        // Can't validate role selectors in browser - they need Playwright
        return { valid: true, reason: 'role selector (Playwright-only)' };
      }

      const matches = document.querySelectorAll(selector);
      if (matches.length === 0) {
        return { valid: false, reason: 'no matches' };
      }
      if (matches.length > 1) {
        return { valid: false, reason: 'multiple matches (' + matches.length + ')' };
      }
      if (matches[0] !== expectedElement) {
        return { valid: false, reason: 'matches different element' };
      }
      return { valid: true, reason: 'unique match' };
    } catch (e) {
      return { valid: false, reason: 'invalid selector: ' + e.message };
    }
  }

  // Export the API
  const api = {
    getRole,
    getAccessibleName,
    getTextContent,
    generateSelectors,
    getBestSelector,
    validateSelector,
    // Individual strategies for debugging
    strategies: {
      testId: generateTestIdSelector,
      role: generateRoleSelector,
      label: generateLabelSelector,
      aria: generateAriaSelector,
      placeholder: generatePlaceholderSelector,
      text: generateTextSelector,
      altText: generateAltTextSelector,
      title: generateTitleSelector,
      id: generateIdSelector,
      name: generateNameSelector,
      dataAttribute: generateDataAttributeSelector,
      composite: generateCompositeSelector,
      structural: generateStructuralSelector
    }
  };

  window.__RESHOT_SELECTOR_STRATEGIES = api;
  return api;
})();
`;

/**
 * Node.js utilities for working with selectors
 */

/**
 * Convert a role-based selector to Playwright locator syntax
 * @param {string} selector - Selector like 'role=button[name="Submit"]'
 * @returns {Object} Playwright locator config
 */
function parseRoleSelector(selector) {
  if (!selector.startsWith('role=')) return null;

  const match = selector.match(/^role=(\w+)(?:\[name="(.+)"\])?$/);
  if (!match) return null;

  return {
    role: match[1],
    name: match[2] || undefined
  };
}

/**
 * Generate a Playwright locator call from selector info
 * @param {Object} selectorInfo - Result from generateSelectors
 * @returns {string} Playwright code snippet
 */
function toPlaywrightLocator(selectorInfo) {
  if (!selectorInfo) return null;

  switch (selectorInfo.type) {
    case 'role': {
      const parsed = parseRoleSelector(selectorInfo.selector);
      if (parsed) {
        if (parsed.name) {
          return `page.getByRole('${parsed.role}', { name: '${parsed.name}' })`;
        }
        return `page.getByRole('${parsed.role}')`;
      }
      break;
    }
    case 'label':
      return selectorInfo.playwrightSelector ? `page.${selectorInfo.playwrightSelector}` : null;
    case 'placeholder':
      return selectorInfo.playwrightSelector ? `page.${selectorInfo.playwrightSelector}` : null;
    case 'text':
      return selectorInfo.playwrightSelector ? `page.${selectorInfo.playwrightSelector}` : null;
    case 'alt':
      return selectorInfo.playwrightSelector ? `page.${selectorInfo.playwrightSelector}` : null;
    case 'title':
      return selectorInfo.playwrightSelector ? `page.${selectorInfo.playwrightSelector}` : null;
    case 'testid':
      return selectorInfo.playwrightSelector ? `page.${selectorInfo.playwrightSelector}` : null;
    default:
      return `page.locator('${selectorInfo.selector}')`;
  }
  
  return `page.locator('${selectorInfo.selector}')`;
}

/**
 * Determine the best locator strategy to use in capture-engine
 * @param {Array} selectors - Array of selector results
 * @returns {Object} Recommended strategy with selector and method
 */
function chooseBestStrategy(selectors) {
  if (!selectors || selectors.length === 0) {
    return null;
  }

  // Sort by confidence
  const sorted = [...selectors].sort((a, b) => b.confidence - a.confidence);
  const best = sorted[0];

  // Prefer certain types for reliability
  const preferredOrder = ['testid', 'role', 'label', 'aria', 'id'];
  
  for (const type of preferredOrder) {
    const match = sorted.find(s => s.type === type && s.confidence >= 0.8);
    if (match) {
      return {
        selector: match.selector,
        type: match.type,
        confidence: match.confidence,
        description: match.description,
        playwrightLocator: toPlaywrightLocator(match),
        fallbacks: sorted.filter(s => s !== match).map(s => s.selector)
      };
    }
  }

  // Return the highest confidence one
  return {
    selector: best.selector,
    type: best.type,
    confidence: best.confidence,
    description: best.description,
    playwrightLocator: toPlaywrightLocator(best),
    fallbacks: sorted.slice(1).map(s => s.selector)
  };
}

module.exports = {
  SELECTOR_STRATEGIES_SCRIPT,
  parseRoleSelector,
  toPlaywrightLocator,
  chooseBestStrategy
};
