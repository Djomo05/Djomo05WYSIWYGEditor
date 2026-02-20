/**
 * @module core/ContentArea
 * ------------------------------------------------------------------
 *  The editable content area: a `contentEditable` div that captures
 *  user input and renders rich content.  Also manages the
 *  placeholder and drag-and-drop of images.
 * ------------------------------------------------------------------
 */

import { EditorOptions, EditorAPI } from "../types";
import { createElement } from "../utils/dom";

export class ContentArea {
  /** The contentEditable div. */
  private element: HTMLElement;
  /** Reference to the editor API. */
  private editor: EditorAPI;
  /** Configuration options. */
  private options: EditorOptions;

  constructor(editor: EditorAPI, options: EditorOptions) {
    this.editor = editor;
    this.options = options;

    /* Create the main editable div */
    this.element = createElement("div", {
      className: "we-content",
      attributes: {
        contenteditable: "true",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Editor content area",
        spellcheck: "true",
      },
    });

    /* Apply configured height */
    this.element.style.minHeight = options.height ?? "300px";
    this.element.style.overflowY = "auto";

    /* Set initial content */
    if (options.content) {
      this.element.innerHTML = options.content;
    }

    /* Apply optional content CSS */
    if (options.contentCSS) {
      const style = document.createElement("style");
      style.textContent = options.contentCSS;
      this.element.prepend(style);
    }

    /* Placeholder support */
    if (options.placeholder) {
      this.element.setAttribute("data-placeholder", options.placeholder);
      this.updatePlaceholder();
    }

    /* Bind internal event listeners */
    this.bindEvents();
  }

  /* ---------------------------------------------------------------- */
  /*  Event binding                                                    */
  /* ---------------------------------------------------------------- */

  private bindEvents(): void {
    /* Propagate content changes to the editor event bus */
    this.element.addEventListener("input", () => {
      this.updatePlaceholder();
      this.editor.emit("change", { html: this.element.innerHTML });
    });

    /* Focus / blur */
    this.element.addEventListener("focus", () => this.editor.emit("focus"));
    this.element.addEventListener("blur", () => this.editor.emit("blur"));

    /* Selection changes → toolbar state refresh */
    document.addEventListener("selectionchange", this.onSelectionChange);

    /* Keyboard shortcuts */
    this.element.addEventListener("keydown", (e) => this.handleKeyboard(e));

    /* Paste handler — clean up pasted HTML */
    this.element.addEventListener("paste", (e) => this.handlePaste(e));

    /* Drag-and-drop images */
    this.element.addEventListener("dragover", (e) => {
      e.preventDefault();
      this.element.classList.add("we-content--dragover");
    });
    this.element.addEventListener("dragleave", () => {
      this.element.classList.remove("we-content--dragover");
    });
    this.element.addEventListener("drop", (e) => this.handleDrop(e));
  }

  /* ---------------------------------------------------------------- */
  /*  Selection change handler (bound so we can remove it later)       */
  /* ---------------------------------------------------------------- */

  private onSelectionChange = (): void => {
    const sel = window.getSelection();
    if (sel && this.element.contains(sel.anchorNode)) {
      this.editor.emit("selectionChange");
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Keyboard shortcuts                                               */
  /* ---------------------------------------------------------------- */

  private handleKeyboard(e: KeyboardEvent): void {
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl) {
      switch (e.key.toLowerCase()) {
        case "b": e.preventDefault(); this.editor.execCommand("bold"); break;
        case "i": e.preventDefault(); this.editor.execCommand("italic"); break;
        case "u": e.preventDefault(); this.editor.execCommand("underline"); break;
        case "z":
          e.preventDefault();
          this.editor.execCommand(e.shiftKey ? "redo" : "undo");
          break;
        case "y": e.preventDefault(); this.editor.execCommand("redo"); break;
      }
    }

    /* Tab → indent / outdent */
    if (e.key === "Tab") {
      e.preventDefault();
      this.editor.execCommand(e.shiftKey ? "outdent" : "indent");
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Paste handling                                                    */
  /* ---------------------------------------------------------------- */

  private handlePaste(e: ClipboardEvent): void {
    /* If the clipboard contains files (images), hand off to image plug-in */
    if (e.clipboardData?.files.length) {
      e.preventDefault();
      Array.from(e.clipboardData.files).forEach((file) => {
        if (file.type.startsWith("image/")) {
          this.editor.emit("afterCommand", { action: "image", file });
        }
      });
      return;
    }

    /* Otherwise allow normal paste but clean dangerous markup */
    // Browser default paste is OK for most cases
  }

  /* ---------------------------------------------------------------- */
  /*  Drag-and-drop handling                                           */
  /* ---------------------------------------------------------------- */

  private handleDrop(e: DragEvent): void {
    e.preventDefault();
    this.element.classList.remove("we-content--dragover");

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      Array.from(files).forEach((file) => {
        if (file.type.startsWith("image/")) {
          this.editor.emit("afterCommand", { action: "image", file });
        }
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Placeholder                                                      */
  /* ---------------------------------------------------------------- */

  private updatePlaceholder(): void {
    const isEmpty =
      this.element.innerHTML === "" ||
      this.element.innerHTML === "<br>" ||
      this.element.innerHTML === "<p><br></p>";
    this.element.classList.toggle("we-content--empty", isEmpty);
  }

  /* ---------------------------------------------------------------- */
  /*  Public API                                                       */
  /* ---------------------------------------------------------------- */

  getElement(): HTMLElement {
    return this.element;
  }

  getContent(): string {
    return this.element.innerHTML;
  }

  setContent(html: string): void {
    this.element.innerHTML = html;
    this.updatePlaceholder();
  }

  getTextContent(): string {
    return this.element.textContent ?? "";
  }

  setEditable(editable: boolean): void {
    this.element.contentEditable = String(editable);
    this.element.classList.toggle("we-content--readonly", !editable);
  }

  focus(): void {
    this.element.focus();
  }

  destroy(): void {
    document.removeEventListener("selectionchange", this.onSelectionChange);
    this.element.remove();
  }
}