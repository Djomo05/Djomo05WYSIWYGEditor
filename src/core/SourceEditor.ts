/**
 * @module core/SourceEditor
 * ------------------------------------------------------------------
 *  A syntax-highlighted `<textarea>` that shows the raw HTML source.
 *  Toggling between WYSIWYG ↔ source syncs the content both ways.
 * ------------------------------------------------------------------
 */

import { createElement } from "../utils/dom";
import { EditorAPI } from "../types";

export class SourceEditor {
  private element: HTMLTextAreaElement;
  private editor: EditorAPI;
  private visible = false;

  constructor(editor: EditorAPI, height: string) {
    this.editor = editor;

    this.element = createElement("textarea", {
      className: "we-source-editor",
      attributes: {
        spellcheck: "false",
        "aria-label": "HTML source editor",
        wrap: "off",
      },
    }) as unknown as HTMLTextAreaElement;

    /* Match the content area height */
    this.element.style.minHeight = height;
    this.element.style.display = "none"; // hidden by default

    /* Sync changes back to the editor on input */
    this.element.addEventListener("input", () => {
      this.editor.emit("change", { html: this.element.value });
    });

    /* Tab key inserts two spaces instead of moving focus */
    this.element.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const start = this.element.selectionStart;
        const end = this.element.selectionEnd;
        const value = this.element.value;

        /* Insert two-space indent at caret */
        this.element.value =
          value.substring(0, start) + "  " + value.substring(end);
        this.element.selectionStart = this.element.selectionEnd = start + 2;
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Show / Hide                                                      */
  /* ---------------------------------------------------------------- */

  /**
   * Reveal the source editor and populate it with formatted HTML.
   * @param html – the current content of the WYSIWYG area
   */
  show(html: string): void {
    this.element.value = this.formatHTML(html);
    this.element.style.display = "block";
    this.visible = true;
    this.element.focus();
  }

  /**
   * Hide the source editor and return the (possibly edited) HTML
   * so the caller can push it back into the WYSIWYG area.
   */
  hide(): string {
    this.element.style.display = "none";
    this.visible = false;
    return this.element.value;
  }

  /** Whether the source editor is currently showing. */
  isVisible(): boolean {
    return this.visible;
  }

  /** Return the current source text. */
  getValue(): string {
    return this.element.value;
  }

  /** Overwrite the source text (used when content changes externally). */
  setValue(html: string): void {
    this.element.value = this.formatHTML(html);
  }

  /* ---------------------------------------------------------------- */
  /*  HTML pretty-printing (basic indentation)                         */
  /* ---------------------------------------------------------------- */

  /**
   * Very lightweight HTML formatter.
   *
   * This is intentionally simple — it adds line-breaks and indentation
   * around block-level tags so the source is readable.  It does NOT
   * attempt to be a full HTML beautifier (that would be a heavy
   * dependency we want to avoid).
   *
   * @param html – raw HTML string
   * @returns      indented HTML string
   */
  private formatHTML(html: string): string {
    /* Normalise whitespace between tags */
    let formatted = html.replace(/>\s+</g, ">\n<");

    /** Block-level tags that deserve their own line. */
    const blockTags = [
      "div", "p", "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "table", "thead", "tbody", "tfoot",
      "tr", "th", "td", "blockquote", "pre", "figure",
      "figcaption", "section", "article", "header", "footer",
      "nav", "main", "aside", "details", "summary", "hr", "br",
    ];

    const blockTagPattern = blockTags.join("|");

    /* Ensure a newline before every opening block tag */
    formatted = formatted.replace(
      new RegExp(`<(${blockTagPattern})(\\s|>|\\/)`, "gi"),
      "\n<$1$2"
    );

    /* Ensure a newline after every closing block tag */
    formatted = formatted.replace(
      new RegExp(`<\\/(${blockTagPattern})>`, "gi"),
      "</$1>\n"
    );

    /* Now apply indentation */
    const lines = formatted.split("\n").filter((l) => l.trim().length > 0);
    let indent = 0;
    const indentStr = "  ";
    const result: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();

      /* Closing tag → decrease indent first */
      if (/^<\//.test(line)) {
        indent = Math.max(0, indent - 1);
      }

      result.push(indentStr.repeat(indent) + line);

      /* Opening tag that is NOT self-closing → increase indent */
      if (
        /^<[a-zA-Z][^>]*[^/]>$/.test(line) &&
        !/^<(br|hr|img|input|meta|link|col|area|base|embed|source|track|wbr)\b/i.test(
          line
        )
      ) {
        indent += 1;
      }
    }

    return result.join("\n");
  }

  /* ---------------------------------------------------------------- */
  /*  DOM access & cleanup                                             */
  /* ---------------------------------------------------------------- */

  /** Return the underlying <textarea> element. */
  getElement(): HTMLElement {
    return this.element;
  }

  /** Remove the element from the DOM. */
  destroy(): void {
    this.element.remove();
  }
}