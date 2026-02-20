/**
 * @module utils/dom
 * ------------------------------------------------------------------
 *  Pure-function DOM helpers.  Every function is side-effect-free
 *  (except when the name starts with `create` or `insert`).
 * ------------------------------------------------------------------
 */

/**
 * Resolve a CSS selector or raw element to an `HTMLElement`.
 * Throws a helpful error if the selector matches nothing.
 */
export function resolveElement(target: string | HTMLElement): HTMLElement {
  if (typeof target === "string") {
    const el = document.querySelector<HTMLElement>(target);
    if (!el) {
      throw new Error(
        `[WysiwygEditor] Container "${target}" not found in the DOM.`
      );
    }
    return el;
  }
  return target;
}

/**
 * Create an element with optional class, attributes, and innerHTML.
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    className?: string;
    attributes?: Record<string, string>;
    innerHTML?: string;
    parent?: HTMLElement;
  } = {}
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  if (options.className) {
    el.className = options.className;
  }
  if (options.attributes) {
    for (const [key, value] of Object.entries(options.attributes)) {
      el.setAttribute(key, value);
    }
  }
  if (options.innerHTML !== undefined) {
    el.innerHTML = options.innerHTML;
  }
  if (options.parent) {
    options.parent.appendChild(el);
  }

  return el;
}

/**
 * Save and restore the browser selection / caret position.
 */
export function saveSelection(): Range | null {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    return sel.getRangeAt(0).cloneRange();
  }
  return null;
}

export function restoreSelection(range: Range | null): void {
  if (!range) return;
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

/**
 * Insert raw HTML at the current caret position inside a
 * contentEditable element.
 */
export function insertHTMLAtCaret(html: string): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  range.deleteContents();

  // Parse the HTML string into DOM nodes
  const temp = document.createElement("div");
  temp.innerHTML = html;
  const frag = document.createDocumentFragment();
  let lastNode: Node | null = null;

  while (temp.firstChild) {
    lastNode = frag.appendChild(temp.firstChild);
  }

  range.insertNode(frag);

  // Move the caret to just after the inserted content
  if (lastNode) {
    const newRange = document.createRange();
    newRange.setStartAfter(lastNode);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }
}