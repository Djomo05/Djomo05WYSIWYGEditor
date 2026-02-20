/**
 * @module core/Editor
 * ------------------------------------------------------------------
 *  The main `Editor` class that orchestrates every sub-module:
 *
 *    ┌──────────────────────────────────────────┐
 *    │  Root Container (.we-editor)              │
 *    │  ┌──────────────────────────────────────┐ │
 *    │  │  Toolbar                             │ │
 *    │  └──────────────────────────────────────┘ │
 *    │  ┌──────────────────────────────────────┐ │
 *    │  │  Content Area (contentEditable)      │ │
 *    │  │  ─── or ───                          │ │
 *    │  │  Source Editor (<textarea>)          │ │
 *    │  │  ─── or ───                          │ │
 *    │  │  Preview Pane (read-only)            │ │
 *    │  └──────────────────────────────────────┘ │
 *    │  ┌──��───────────────────────────────────┐ │
 *    │  │  Status Bar                          │ │
 *    │  └──────────────────────────────────────┘ │
 *    └──────────────────────────────────────────┘
 *
 *  This class implements `EditorAPI` so plug-ins and external code
 *  share a single, documented surface.
 * ------------------------------------------------------------------
 */

import {
  EditorOptions,
  EditorAPI,
  EditorPlugin,
  EditorEventName,
  EditorEventHandler,
} from "../types";
import { EventEmitter } from "../utils/events";
import {
  resolveElement,
  createElement,
  saveSelection,
  restoreSelection,
  insertHTMLAtCaret,
} from "../utils/dom";
import { sanitizeHTML } from "../utils/sanitize";
import { Toolbar } from "./Toolbar";
import { ContentArea } from "./ContentArea";
import { SourceEditor } from "./SourceEditor";
import { FullscreenManager } from "./Fullscreen";
import { PluginManager } from "../plugins/PluginManager";

export class Editor implements EditorAPI {
  /* ---- Sub-modules ---- */
  private toolbar: Toolbar;
  private contentArea: ContentArea;
  private sourceEditor: SourceEditor;
  private fullscreenManager: FullscreenManager;
  private pluginManager: PluginManager;
  private events: EventEmitter;

  /* ---- DOM elements ---- */
  private root: HTMLElement;
  private container: HTMLElement;
  private previewPane: HTMLElement;
  private statusBar: HTMLElement;

  /* ---- State ---- */
  private _sourceMode = false;
  private _previewMode = false;
  private _destroyed = false;
  private savedRange: Range | null = null;

  /* ---- Options ---- */
  private options: EditorOptions;

  /* ================================================================ */
  /*  Constructor                                                      */
  /* ================================================================ */

  constructor(options: EditorOptions) {
    this.options = options;
    this.events = new EventEmitter();

    /* ---- Resolve the mount point ---- */
    this.root = resolveElement(options.container);
    this.root.innerHTML = "";

    /* ---- Build the container skeleton ---- */
    this.container = createElement("div", {
      className: `we-editor ${options.className ?? ""}`.trim(),
      parent: this.root,
    });
    if (options.width) {
      this.container.style.width = options.width;
    }

    /* ---- Toolbar ---- */
    this.toolbar = new Toolbar(this, options.toolbar);
    this.container.appendChild(this.toolbar.getElement());

    /* ---- Content wrapper ---- */
    const bodyWrapper = createElement("div", {
      className: "we-editor__body",
      parent: this.container,
    });

    /* ---- Content area ---- */
    this.contentArea = new ContentArea(this, options);
    bodyWrapper.appendChild(this.contentArea.getElement());

    /* ---- Source editor ---- */
    this.sourceEditor = new SourceEditor(this, options.height ?? "300px");
    bodyWrapper.appendChild(this.sourceEditor.getElement());

    /* ---- Preview pane ---- */
    this.previewPane = createElement("div", {
      className: "we-preview",
      attributes: { role: "document", "aria-label": "Content preview" },
    });
    this.previewPane.style.display = "none";
    this.previewPane.style.minHeight = options.height ?? "300px";
    this.previewPane.style.overflowY = "auto";
    bodyWrapper.appendChild(this.previewPane);

    /* ---- Status bar ---- */
    this.statusBar = createElement("div", {
      className: "we-status-bar",
      parent: this.container,
    });
    this.updateStatusBar();

    /* ---- Fullscreen manager ---- */
    this.fullscreenManager = new FullscreenManager(this);

    /* ---- Plug-ins ---- */
    this.pluginManager = new PluginManager(this, options);

    /* ---- Internal event wiring ---- */
    this.events.on("change", () => {
      this.updateStatusBar();
      this.toolbar.updateActiveStates();
    });
    this.events.on("selectionChange", () => {
      this.toolbar.updateActiveStates();
    });

    /* ---- Read-only mode ---- */
    if (options.readOnly) {
      this.togglePreview();
    }

    /* ---- Fire ready ---- */
    this.events.emit("ready");
  }

  /* ================================================================ */
  /*  EditorAPI: Content                                               */
  /* ================================================================ */

  getContent(): string {
    if (this._sourceMode) {
      return this.sourceEditor.getValue();
    }
    return this.contentArea.getContent();
  }

  setContent(html: string): void {
    const clean = sanitizeHTML(html);
    this.contentArea.setContent(clean);
    if (this._sourceMode) {
      this.sourceEditor.setValue(clean);
    }
    if (this._previewMode) {
      this.previewPane.innerHTML = clean;
    }
    this.events.emit("change", { html: clean });
  }

  getTextContent(): string {
    return this.contentArea.getTextContent();
  }

  clear(): void {
    this.setContent("");
  }

  /* ================================================================ */
  /*  EditorAPI: Commands                                              */
  /* ================================================================ */

  execCommand(command: string, value?: string): void {
    this.events.emit("beforeCommand", { command, value });
    this.contentArea.getElement().focus();
    document.execCommand(command, false, value ?? "");
    this.events.emit("afterCommand", { command, value });
    this.events.emit("change", { html: this.contentArea.getContent() });
    this.toolbar.updateActiveStates();
  }

  queryCommandState(command: string): boolean {
    try {
      return document.queryCommandState(command);
    } catch {
      return false;
    }
  }

  /* ================================================================ */
  /*  EditorAPI: Selection                                             */
  /* ================================================================ */

  saveSelection(): void {
    this.savedRange = saveSelection();
  }

  restoreSelection(): void {
    restoreSelection(this.savedRange);
  }

  insertHTML(html: string): void {
    this.contentArea.getElement().focus();
    insertHTMLAtCaret(html);
    this.events.emit("change", { html: this.contentArea.getContent() });
  }

  /* ================================================================ */
  /*  EditorAPI: Mode switching                                        */
  /* ================================================================ */

  /**
   * Toggle between WYSIWYG mode and raw HTML source editing.
   *
   * When entering source mode:
   *   1. The contentEditable div is hidden.
   *   2. The <textarea> source editor is shown with formatted HTML.
   *
   * When leaving source mode:
   *   1. The HTML from the <textarea> is sanitised and pushed back
   *      into the contentEditable div.
   *   2. The <textarea> is hidden.
   */
  toggleSource(): void {
    /* If we're in preview mode, exit it first so we don't have
       conflicting UI states. */
    if (this._previewMode) {
      this.togglePreview();
    }

    this._sourceMode = !this._sourceMode;

    if (this._sourceMode) {
      /* ---- Enter source mode ---- */
      this.sourceEditor.show(this.contentArea.getContent());
      this.contentArea.getElement().style.display = "none";
    } else {
      /* ---- Exit source mode ---- */
      const editedHTML = this.sourceEditor.hide();
      const clean = sanitizeHTML(editedHTML);
      this.contentArea.setContent(clean);
      this.contentArea.getElement().style.display = "block";
      this.contentArea.focus();
    }

    /* Update toolbar toggle state, status bar, and notify listeners */
    this.toolbar.updateActiveStates();
    this.updateStatusBar();
    this.events.emit("modeChange", {
      mode: this._sourceMode ? "source" : "wysiwyg",
    });
  }

  /**
   * Toggle preview (read-only) mode.
   *
   * In preview mode the content is rendered inside a non-editable
   * div so the user sees exactly what the final output looks like,
   * with no editing chrome.
   */
  togglePreview(): void {
    /* If we're in source mode, apply changes first */
    if (this._sourceMode) {
      this.toggleSource();
    }

    this._previewMode = !this._previewMode;

    if (this._previewMode) {
      /* ---- Enter preview mode ---- */
      const currentHTML = this.contentArea.getContent();
      this.previewPane.innerHTML = sanitizeHTML(currentHTML, {
        allowIframes: true,
      });
      this.contentArea.getElement().style.display = "none";
      this.previewPane.style.display = "block";
      /* Dim the toolbar to signal read-only state */
      this.toolbar.getElement().classList.add("we-toolbar--preview");
    } else {
      /* ---- Exit preview mode ---- */
      this.previewPane.style.display = "none";
      this.previewPane.innerHTML = "";
      this.contentArea.getElement().style.display = "block";
      this.contentArea.focus();
      this.toolbar.getElement().classList.remove("we-toolbar--preview");
    }

    /* Update toolbar toggle state, status bar, and notify listeners */
    this.toolbar.updateActiveStates();
    this.updateStatusBar();
    this.events.emit("modeChange", {
      mode: this._previewMode ? "preview" : "wysiwyg",
    });
  }

  /**
   * Toggle fullscreen mode.
   *
   * Delegates to `FullscreenManager` which handles:
   *   • CSS class toggling (position: fixed; inset: 0)
   *   • The native Fullscreen API (as a progressive enhancement)
   *   • Escape-key listener
   *   • Body scroll locking
   */
  toggleFullscreen(): void {
    this.fullscreenManager.toggle();
    this.toolbar.updateActiveStates();
  }

  /* ================================================================ */
  /*  EditorAPI: State queries                                         */
  /* ================================================================ */

  isSourceMode(): boolean {
    return this._sourceMode;
  }

  isPreviewMode(): boolean {
    return this._previewMode;
  }

  isFullscreen(): boolean {
    return this.fullscreenManager.isActive();
  }

  /* ================================================================ */
  /*  EditorAPI: DOM access                                            */
  /* ================================================================ */

  getContainer(): HTMLElement {
    return this.container;
  }

  getContentArea(): HTMLElement {
    return this.contentArea.getElement();
  }

  /* ================================================================ */
  /*  EditorAPI: Events                                                */
  /* ================================================================ */

  on(event: EditorEventName, handler: EditorEventHandler): void {
    this.events.on(event, handler);
  }

  off(event: EditorEventName, handler: EditorEventHandler): void {
    this.events.off(event, handler);
  }

  emit(event: EditorEventName, data?: unknown): void {
    this.events.emit(event, data);
  }

  /* ================================================================ */
  /*  EditorAPI: Plug-in access                                        */
  /* ================================================================ */

  getPlugin<T extends EditorPlugin>(name: string): T | undefined {
    return this.pluginManager.get<T>(name);
  }

  /* ================================================================ */
  /*  EditorAPI: Lifecycle                                             */
  /* ================================================================ */

  /**
   * Completely tear down the editor:
   *   1. Destroy all plug-ins.
   *   2. Destroy sub-modules (toolbar, content area, source editor,
   *      fullscreen manager).
   *   3. Remove all DOM elements we created.
   *   4. Remove all event listeners.
   *
   * After calling `destroy()` the editor instance is inert — calling
   * any other method is a no-op.
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;

    /* Notify listeners before we tear everything down */
    this.events.emit("destroy");

    /* Destroy plug-ins first (they may reference editor DOM) */
    this.pluginManager.destroyAll();

    /* Exit fullscreen if active */
    this.fullscreenManager.destroy();

    /* Destroy sub-modules */
    this.toolbar.destroy();
    this.contentArea.destroy();
    this.sourceEditor.destroy();

    /* Remove our container from the root */
    this.container.remove();

    /* Clear all event listeners */
    this.events.removeAll();
  }

  /* ================================================================ */
  /*  Status bar                                                       */
  /* ================================================================ */

  /**
   * Update the bottom status bar with word count, character count,
   * and the current editing mode.
   *
   * Called:
   *   • after every `change` event
   *   • after every mode toggle (source / preview / wysiwyg)
   *   • on initial construction
   */
  private updateStatusBar(): void {
    const text = this.getTextContent().trim();

    /* Word count: split on whitespace, filter out empties */
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;

    /* Character count (excluding leading/trailing whitespace) */
    const chars = text.length;

    /* Current mode label */
    let modeLabel = "WYSIWYG";
    if (this._sourceMode) modeLabel = "Source";
    if (this._previewMode) modeLabel = "Preview";

    this.statusBar.innerHTML = [
      `<span class="we-status-bar__item">Words: <strong>${words}</strong></span>`,
      `<span class="we-status-bar__item">Characters: <strong>${chars}</strong></span>`,
      `<span class="we-status-bar__item we-status-bar__mode">Mode: <strong>${modeLabel}</strong></span>`,
    ].join("");
  }
}