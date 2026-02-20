/**
 * @module utils/sanitize
 * ------------------------------------------------------------------
 *  Lightweight HTML sanitiser.  Strips dangerous tags / attributes
 *  (script, on*, javascript: URLs) while keeping safe formatting.
 * ------------------------------------------------------------------
 */

/** Tags that are ALWAYS removed (along with their children). */
const DANGEROUS_TAGS = new Set([
  "script",
  "style",
  "iframe",       // allowed only by the video plug-in via safe embed
  "object",
  "embed",
  "form",
  "input",
  "textarea",
  "select",
  "button",
]);

/** Attribute prefixes / names that are stripped. */
const DANGEROUS_ATTR_PREFIXES = ["on"];  // onclick, onload, …

/**
 * Sanitise an HTML string.
 *
 * @param html  – raw HTML
 * @param opts  – `allowIframes: true` to keep sandboxed iframes
 * @returns       cleaned HTML
 */
export function sanitizeHTML(
  html: string,
  opts: { allowIframes?: boolean } = {}
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  /**
   * Recursively walk the DOM and remove anything dangerous.
   */
  function walk(node: Node): void {
    const toRemove: Node[] = [];

    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();

        /* Remove dangerous tags (keep iframes when explicitly allowed) */
        if (DANGEROUS_TAGS.has(tag) && !(tag === "iframe" && opts.allowIframes)) {
          toRemove.push(child);
          return;
        }

        /* Strip dangerous attributes */
        const attrs = Array.from(el.attributes);
        for (const attr of attrs) {
          const name = attr.name.toLowerCase();
          if (
            DANGEROUS_ATTR_PREFIXES.some((prefix) => name.startsWith(prefix)) ||
            attr.value.trim().toLowerCase().startsWith("javascript:")
          ) {
            el.removeAttribute(attr.name);
          }
        }

        /* Recurse into children */
        walk(child);
      }
    });

    toRemove.forEach((n) => node.removeChild(n));
  }

  walk(doc.body);
  return doc.body.innerHTML;
}