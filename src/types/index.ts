/**
 * @module types
 * ------------------------------------------------------------------
 *  Central type definitions for the WYSIWYG editor.
 *  Every public surface is typed here so that consumers get full
 *  IntelliSense when they `npm install` the package.
 * ------------------------------------------------------------------
 */

/* ================================================================ */
/*  TOOLBAR                                                          */
/* ================================================================ */

/**
 * Built-in toolbar actions the editor ships with.
 * Extend this union when you add custom toolbar items.
 */
export type ToolbarAction =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "heading1"
  | "heading2"
  | "heading3"
  | "paragraph"
  | "quote"
  | "code"
  | "orderedList"
  | "unorderedList"
  | "link"
  | "image"
  | "video"
  | "table"
  | "horizontalRule"
  | "undo"
  | "redo"
  | "removeFormat"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "alignJustify"
  | "indent"
  | "outdent"
  | "subscript"
  | "superscript"
  | "foreColor"
  | "backColor"
  | "fontSize"
  | "fontFamily"
  | "source"
  | "preview"
  | "fullscreen"
  | "print";

/**
 * A single toolbar button descriptor.
 */
export interface ToolbarButtonDescriptor {
  /** The action this button triggers. */
  action: ToolbarAction | string;
  /** Visible tooltip / aria-label. */
  label: string;
  /** SVG icon markup (innerHTML). */
  icon: string;
  /** Optional keyboard shortcut shown in the tooltip. */
  shortcut?: string;
  /** When true the button toggles an active state (bold, italic …). */
  isToggle?: boolean;
}

/**
 * Toolbar items can be buttons or a `"|"` separator.
 */
export type ToolbarItem = ToolbarButtonDescriptor | "|";

/* ================================================================ */
/*  PLUGINS                                                          */
/* ================================================================ */

/**
 * Every plug-in must implement this interface.
 * Plug-ins are registered via `PluginManager.register()`.
 */
export interface EditorPlugin {
  /** Unique name used to identify the plug-in. */
  readonly name: string;
  /** Called once when the editor boots. */
  init(editor: EditorAPI): void;
  /** Called when the editor is destroyed – clean up listeners etc. */
  destroy(): void;
}

/* ================================================================ */
/*  IMAGE MANIPULATION                                               */
/* ================================================================ */

/**
 * Supported resize handle positions around an image.
 */
export type ResizeHandlePosition =
  | "nw" | "n" | "ne"
  | "w"  |        "e"
  | "sw" | "s" | "se";

/**
 * Crop region as percentages (0–100) of the original image.
 */
export interface CropRegion {
  /** Left offset as % of original width. */
  x: number;
  /** Top offset as % of original height. */
  y: number;
  /** Crop width as % of original width. */
  width: number;
  /** Crop height as % of original height. */
  height: number;
}

/**
 * State tracked for a selected image being manipulated.
 */
export interface ImageManipulationState {
  /** The <img> element being manipulated. */
  element: HTMLImageElement;
  /** The wrapping <figure> if present. */
  figure: HTMLElement | null;
  /** Whether drag-to-move is in progress. */
  isDragging: boolean;
  /** Whether resize is in progress. */
  isResizing: boolean;
  /** Whether crop mode is active. */
  isCropping: boolean;
  /** Which resize handle is being dragged. */
  activeHandle: ResizeHandlePosition | null;
  /** Starting mouse X. */
  startX: number;
  /** Starting mouse Y. */
  startY: number;
  /** Image width at drag start. */
  startWidth: number;
  /** Image height at drag start. */
  startHeight: number;
  /** Image left offset at drag start (for move). */
  startLeft: number;
  /** Image top offset at drag start (for move). */
  startTop: number;
  /** Current crop region (if cropping). */
  cropRegion: CropRegion | null;
}

/* ================================================================ */
/*  EDITOR API (exposed to plug-ins & consumers)                     */
/* ================================================================ */

/**
 * The public API surface that the `Editor` class exposes.
 * Plug-ins and external code interact with the editor only through
 * this interface – the concrete class may have additional private
 * helpers.
 */
export interface EditorAPI {
  /* ---- Content ---- */
  /** Returns the current HTML content. */
  getContent(): string;
  /** Replaces the editor content with the supplied HTML. */
  setContent(html: string): void;
  /** Returns the plain-text content (no markup). */
  getTextContent(): string;
  /** Clears the editor. */
  clear(): void;

  /* ---- Commands ---- */
  /** Execute a document command (bold, italic, …). */
  execCommand(command: string, value?: string): void;
  /** Query whether a command is currently active (e.g. bold). */
  queryCommandState(command: string): boolean;

  /* ---- Selection ---- */
  /** Save the current selection / caret position. */
  saveSelection(): void;
  /** Restore a previously saved selection. */
  restoreSelection(): void;
  /** Insert raw HTML at the caret. */
  insertHTML(html: string): void;

  /* ---- Mode switching ---- */
  /** Toggle between WYSIWYG and source-code mode. */
  toggleSource(): void;
  /** Toggle preview (read-only) mode. */
  togglePreview(): void;
  /** Toggle fullscreen. */
  toggleFullscreen(): void;

  /* ---- State queries ---- */
  isSourceMode(): boolean;
  isPreviewMode(): boolean;
  isFullscreen(): boolean;

  /* ---- DOM access ---- */
  /** The root container element the editor is mounted in. */
  getContainer(): HTMLElement;
  /** The editable content area (contentEditable div). */
  getContentArea(): HTMLElement;

  /* ---- Events ---- */
  on(event: EditorEventName, handler: EditorEventHandler): void;
  off(event: EditorEventName, handler: EditorEventHandler): void;
  emit(event: EditorEventName, data?: unknown): void;

  /* ---- Plug-in access ---- */
  getPlugin<T extends EditorPlugin>(name: string): T | undefined;

  /* ---- Lifecycle ---- */
  /** Remove the editor from the DOM and clean up. */
  destroy(): void;
}

/* ================================================================ */
/*  EVENTS                                                           */
/* ================================================================ */

/** Names of events the editor can emit. */
export type EditorEventName =
  | "change"
  | "focus"
  | "blur"
  | "ready"
  | "destroy"
  | "modeChange"
  | "fullscreenChange"
  | "selectionChange"
  | "beforeCommand"
  | "afterCommand";

/** Shape of every event handler callback. */
export type EditorEventHandler = (data?: unknown) => void;

/* ================================================================ */
/*  OPTIONS                                                          */
/* ================================================================ */

/**
 * Configuration object passed to `createEditor()`.
 * Every property is optional – sensible defaults are applied.
 */
export interface EditorOptions {
  /**
   * CSS selector **or** DOM element where the editor will be mounted.
   * @example "#my-editor"
   */
  container: string | HTMLElement;

  /** Initial HTML content. Defaults to `""`. */
  content?: string;

  /** Height of the content area. Defaults to `"300px"`. */
  height?: string;

  /** Width of the whole editor. Defaults to `"100%"`. */
  width?: string;

  /**
   * Toolbar layout.
   * Pass an array of `ToolbarItem`s or `false` to hide the toolbar.
   * When omitted a default set is used.
   */
  toolbar?: ToolbarItem[] | false;

  /** Placeholder text shown when the editor is empty. */
  placeholder?: string;

  /** When `true` the editor starts in read-only / preview mode. */
  readOnly?: boolean;

  /** Extra CSS class(es) added to the root container. */
  className?: string;

  /**
   * Extra plug-ins to register.
   * Built-in plug-ins (image, video, link, table, list) are always
   * loaded unless you explicitly disable them via `disablePlugins`.
   */
  plugins?: EditorPlugin[];

  /** Names of built-in plug-ins to *disable*. */
  disablePlugins?: string[];

  /** Max file-size (bytes) for drag-and-dropped / pasted images.  */
  maxImageSize?: number;

  /** Accepted image MIME types. Defaults to common raster formats. */
  acceptedImageTypes?: string[];

  /**
   * Custom image-upload handler.
   * Return a Promise that resolves to the public URL of the image.
   */
  imageUploadHandler?: (file: File) => Promise<string>;

  /**
   * When `true`, the `<iframe>` / `<video>` embeds are sandboxed.
   * Defaults to `true`.
   */
  sanitizeEmbeds?: boolean;

  /** CSS to inject inside the content area's `<style>` tag. */
  contentCSS?: string;

  /**
   * Enable image manipulation features.
   * Defaults to `true`.
   */
  enableImageManipulation?: boolean;

  /**
   * Minimum image dimensions (in px) during resize.
   * Defaults to `{ width: 30, height: 30 }`.
   */
  minImageSize?: { width: number; height: number };
}