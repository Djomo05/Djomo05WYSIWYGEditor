/**
 * @module core/Toolbar
 * ------------------------------------------------------------------
 *  Renders the toolbar and dispatches actions to the editor.
 *
 *  Now includes:
 *    • Font-family dropdown
 *    • Font-size dropdown
 *    • Proper native color pickers for foreColor / backColor
 * ------------------------------------------------------------------
 */

import { EditorAPI, ToolbarItem, ToolbarButtonDescriptor, ToolbarAction } from "../types";
import { createElement } from "../utils/dom";
import { ICONS } from "./icons";

/* ================================================================ */
/*  Font lists                                                       */
/* ================================================================ */

const FONT_FAMILIES = [
  { label: "Default", value: "" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
  { label: "Comic Sans MS", value: "'Comic Sans MS', cursive" },
  { label: "Impact", value: "Impact, sans-serif" },
  { label: "Lucida Console", value: "'Lucida Console', Monaco, monospace" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Palatino", value: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" },
  { label: "Garamond", value: "Garamond, serif" },
];

const FONT_SIZES = [
  { label: "Default", value: "" },
  { label: "8px", value: "1" },
  { label: "10px", value: "2" },
  { label: "12px", value: "3" },
  { label: "14px", value: "3" },
  { label: "16px", value: "4" },
  { label: "18px", value: "4" },
  { label: "20px", value: "5" },
  { label: "24px", value: "5" },
  { label: "28px", value: "6" },
  { label: "32px", value: "6" },
  { label: "36px", value: "7" },
  { label: "48px", value: "7" },
];

/* ================================================================ */
/*  Preset colour palette for the colour picker                      */
/* ================================================================ */

const COLOR_PALETTE = [
  "#000000", "#434343", "#666666", "#999999", "#cccccc", "#efefef", "#f3f3f3", "#ffffff",
  "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#9900ff", "#ff00ff",
  "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#cfe2f3", "#d9d2e9", "#ead1dc",
  "#ea9999", "#f9cb9c", "#ffe599", "#b6d7a8", "#a2c4c9", "#9fc5e8", "#b4a7d6", "#d5a6bd",
  "#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6fa8dc", "#8e7cc3", "#c27ba0",
  "#cc0000", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3d85c6", "#674ea7", "#a64d79",
  "#990000", "#b45f06", "#bf9000", "#38761d", "#134f5c", "#0b5394", "#351c75", "#741b47",
  "#660000", "#783f04", "#7f6000", "#274e13", "#0c343d", "#073763", "#20124d", "#4c1130",
];

/* ================================================================ */
/*  Default toolbar layout                                           */
/* ================================================================ */

export function getDefaultToolbarItems(): ToolbarItem[] {
  return [
    { action: "fontFamily", label: "Font Family", icon: ICONS.fontFamily },
    { action: "fontSize", label: "Font Size", icon: ICONS.fontSize },
    "|",
    { action: "bold", label: "Bold", icon: ICONS.bold, shortcut: "Ctrl+B", isToggle: true },
    { action: "italic", label: "Italic", icon: ICONS.italic, shortcut: "Ctrl+I", isToggle: true },
    { action: "underline", label: "Underline", icon: ICONS.underline, shortcut: "Ctrl+U", isToggle: true },
    { action: "strikethrough", label: "Strikethrough", icon: ICONS.strikethrough, isToggle: true },
    "|",
    { action: "foreColor", label: "Text Color", icon: ICONS.foreColor },
    { action: "backColor", label: "Background Color", icon: ICONS.backColor },
    "|",
    { action: "heading1", label: "Heading 1", icon: ICONS.heading1 },
    { action: "heading2", label: "Heading 2", icon: ICONS.heading2 },
    { action: "heading3", label: "Heading 3", icon: ICONS.heading3 },
    { action: "paragraph", label: "Paragraph", icon: ICONS.paragraph },
    "|",
    { action: "alignLeft", label: "Align Left", icon: ICONS.alignLeft },
    { action: "alignCenter", label: "Align Center", icon: ICONS.alignCenter },
    { action: "alignRight", label: "Align Right", icon: ICONS.alignRight },
    { action: "alignJustify", label: "Justify", icon: ICONS.alignJustify },
    "|",
    { action: "orderedList", label: "Ordered List", icon: ICONS.orderedList },
    { action: "unorderedList", label: "Unordered List", icon: ICONS.unorderedList },
    { action: "indent", label: "Indent", icon: ICONS.indent },
    { action: "outdent", label: "Outdent", icon: ICONS.outdent },
    "|",
    { action: "link", label: "Link", icon: ICONS.link },
    { action: "image", label: "Image", icon: ICONS.image },
    { action: "video", label: "Video", icon: ICONS.video },
    { action: "table", label: "Table", icon: ICONS.table },
    "|",
    { action: "quote", label: "Blockquote", icon: ICONS.quote },
    { action: "code", label: "Code Block", icon: ICONS.code },
    { action: "horizontalRule", label: "Horizontal Rule", icon: ICONS.horizontalRule },
    "|",
    { action: "subscript", label: "Subscript", icon: ICONS.subscript, isToggle: true },
    { action: "superscript", label: "Superscript", icon: ICONS.superscript, isToggle: true },
    { action: "removeFormat", label: "Remove Format", icon: ICONS.removeFormat },
    "|",
    { action: "undo", label: "Undo", icon: ICONS.undo, shortcut: "Ctrl+Z" },
    { action: "redo", label: "Redo", icon: ICONS.redo, shortcut: "Ctrl+Y" },
    "|",
    { action: "source", label: "Source Code", icon: ICONS.source },
    { action: "preview", label: "Preview", icon: ICONS.preview },
    { action: "fullscreen", label: "Fullscreen", icon: ICONS.fullscreen },
    { action: "print", label: "Print", icon: ICONS.print },
  ];
}

/* ================================================================ */
/*  Toolbar class                                                    */
/* ================================================================ */

export class Toolbar {
  private element: HTMLElement;
  private editor: EditorAPI;
  private items: ToolbarItem[];
  private buttons: Map<string, HTMLElement> = new Map();

  /* References to special controls */
  private fontFamilySelect: HTMLSelectElement | null = null;
  private fontSizeSelect: HTMLSelectElement | null = null;

  constructor(editor: EditorAPI, config?: ToolbarItem[] | false) {
    this.editor = editor;

    if (config === false) {
      this.items = [];
      this.element = createElement("div", {
        className: "we-toolbar we-toolbar--hidden",
        attributes: { role: "toolbar", "aria-label": "Editor toolbar" },
      });
      return;
    }

    this.items = config ?? getDefaultToolbarItems();

    this.element = createElement("div", {
      className: "we-toolbar",
      attributes: { role: "toolbar", "aria-label": "Editor toolbar" },
    });

    this.render();
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  private render(): void {
    for (const item of this.items) {
      if (item === "|") {
        createElement("span", {
          className: "we-toolbar__separator",
          parent: this.element,
          attributes: { role: "separator" },
        });
        continue;
      }

      const desc = item as ToolbarButtonDescriptor;

      /* Special handling for font-family and font-size dropdowns */
      if (desc.action === "fontFamily") {
        this.renderFontFamilyDropdown();
        continue;
      }

      if (desc.action === "fontSize") {
        this.renderFontSizeDropdown();
        continue;
      }

      /* Special handling for color pickers */
      if (desc.action === "foreColor" || desc.action === "backColor") {
        this.renderColorButton(desc);
        continue;
      }

      /* Standard button */
      const tooltip = desc.shortcut
        ? `${desc.label} (${desc.shortcut})`
        : desc.label;

      const btn = createElement("button", {
        className: "we-toolbar__btn",
        innerHTML: desc.icon,
        attributes: {
          type: "button",
          "aria-label": tooltip,
          title: tooltip,
          "data-action": desc.action,
        },
        parent: this.element,
      });

      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.executeAction(desc.action);
      });

      this.buttons.set(desc.action, btn);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Font-Family Dropdown                                             */
  /* ---------------------------------------------------------------- */

  private renderFontFamilyDropdown(): void {
    const wrapper = createElement("div", {
      className: "we-toolbar__dropdown-wrapper",
      parent: this.element,
    });

    this.fontFamilySelect = document.createElement("select");
    this.fontFamilySelect.className = "we-toolbar__select we-toolbar__select--font";
    this.fontFamilySelect.title = "Font Family";
    this.fontFamilySelect.setAttribute("aria-label", "Font Family");

    for (const font of FONT_FAMILIES) {
      const option = document.createElement("option");
      option.value = font.value;
      option.textContent = font.label;
      if (font.value) {
        option.style.fontFamily = font.value;
      }
      this.fontFamilySelect.appendChild(option);
    }

    this.fontFamilySelect.addEventListener("change", (e) => {
      e.preventDefault();
      const value = this.fontFamilySelect!.value;
      if (value) {
        this.editor.execCommand("fontName", value);
      } else {
        /* "Default" selected — remove font override */
        this.editor.execCommand("removeFormat");
      }
      this.editor.getContentArea().focus();
    });

    /* Prevent focus steal */
    this.fontFamilySelect.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });

    wrapper.appendChild(this.fontFamilySelect);
  }

  /* ---------------------------------------------------------------- */
  /*  Font-Size Dropdown                                               */
  /* ---------------------------------------------------------------- */

  private renderFontSizeDropdown(): void {
    const wrapper = createElement("div", {
      className: "we-toolbar__dropdown-wrapper",
      parent: this.element,
    });

    this.fontSizeSelect = document.createElement("select");
    this.fontSizeSelect.className = "we-toolbar__select we-toolbar__select--size";
    this.fontSizeSelect.title = "Font Size";
    this.fontSizeSelect.setAttribute("aria-label", "Font Size");

    for (const size of FONT_SIZES) {
      const option = document.createElement("option");
      option.value = size.value;
      option.textContent = size.label;
      this.fontSizeSelect.appendChild(option);
    }

    this.fontSizeSelect.addEventListener("change", (e) => {
      e.preventDefault();
      const value = this.fontSizeSelect!.value;
      if (value) {
        this.editor.execCommand("fontSize", value);
      }
      this.editor.getContentArea().focus();
    });

    this.fontSizeSelect.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });

    wrapper.appendChild(this.fontSizeSelect);
  }

  /* ---------------------------------------------------------------- */
  /*  Color Picker Button                                              */
  /* ---------------------------------------------------------------- */

  /**
   * Renders a toolbar button that opens a colour palette dropdown
   * when clicked. Much more reliable than browser's built-in color
   * input which often doesn't work well with contentEditable.
   */
  private renderColorButton(desc: ToolbarButtonDescriptor): void {
    const wrapper = createElement("div", {
      className: "we-toolbar__color-wrapper",
      parent: this.element,
    });

    /* The visible button */
    const btn = createElement("button", {
      className: "we-toolbar__btn we-toolbar__btn--color",
      innerHTML: desc.icon,
      attributes: {
        type: "button",
        "aria-label": desc.label,
        title: desc.label,
        "data-action": desc.action,
      },
      parent: wrapper,
    });

    /* The colour palette (hidden by default) */
    const palette = createElement("div", {
      className: "we-color-palette",
      parent: wrapper,
    });
    palette.style.display = "none";

    /* Render colour cells */
    for (const color of COLOR_PALETTE) {
      const cell = createElement("button", {
        className: "we-color-palette__cell",
        attributes: {
          type: "button",
          "data-color": color,
          title: color,
          "aria-label": `Color ${color}`,
        },
        parent: palette,
      });
      cell.style.backgroundColor = color;

      cell.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();

        /* Apply the colour */
        if (desc.action === "foreColor") {
          this.editor.execCommand("foreColor", color);
        } else {
          this.editor.execCommand("hiliteColor", color);
        }

        /* Update the colour bar indicator on the button */
        const bar = btn.querySelector(".we-icon-color-bar") as SVGElement | null;
        if (bar) {
          bar.setAttribute("fill", color);
        }

        /* Close palette */
        palette.style.display = "none";
        this.editor.getContentArea().focus();
      });
    }

    /* Custom colour input at the bottom of the palette */
    const customRow = createElement("div", {
      className: "we-color-palette__custom",
      parent: palette,
      innerHTML: `
        <label class="we-color-palette__custom-label">
          Custom:
          <input type="color" class="we-color-palette__custom-input" value="#000000" />
        </label>
      `,
    });

    const customInput = customRow.querySelector("input")!;
    customInput.addEventListener("input", (e) => {
      e.stopPropagation();
      const color = customInput.value;

      if (desc.action === "foreColor") {
        this.editor.execCommand("foreColor", color);
      } else {
        this.editor.execCommand("hiliteColor", color);
      }

      const bar = btn.querySelector(".we-icon-color-bar") as SVGElement | null;
      if (bar) bar.setAttribute("fill", color);
    });

    customInput.addEventListener("change", () => {
      palette.style.display = "none";
      this.editor.getContentArea().focus();
    });

    /* Toggle palette visibility on button click */
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();

      /* Save selection before showing palette */
      this.editor.saveSelection();

      /* Close any other open palettes */
      document.querySelectorAll(".we-color-palette").forEach((p) => {
        if (p !== palette) (p as HTMLElement).style.display = "none";
      });

      /* Toggle this palette */
      const isVisible = palette.style.display !== "none";
      palette.style.display = isVisible ? "none" : "grid";
    });

    /* Close palette when clicking outside */
    document.addEventListener("mousedown", (e) => {
      if (!wrapper.contains(e.target as Node)) {
        palette.style.display = "none";
      }
    });

    this.buttons.set(desc.action, btn);
  }

  /* ---------------------------------------------------------------- */
  /*  Action dispatch                                                  */
  /* ---------------------------------------------------------------- */

  private executeAction(action: string): void {
    const commandMap: Record<string, string> = {
      bold: "bold",
      italic: "italic",
      underline: "underline",
      strikethrough: "strikeThrough",
      subscript: "subscript",
      superscript: "superscript",
      orderedList: "insertOrderedList",
      unorderedList: "insertUnorderedList",
      indent: "indent",
      outdent: "outdent",
      alignLeft: "justifyLeft",
      alignCenter: "justifyCenter",
      alignRight: "justifyRight",
      alignJustify: "justifyFull",
      removeFormat: "removeFormat",
      undo: "undo",
      redo: "redo",
    };

    const formatBlockMap: Record<string, string> = {
      heading1: "H1",
      heading2: "H2",
      heading3: "H3",
      paragraph: "P",
      quote: "BLOCKQUOTE",
    };

    /* Direct document.execCommand */
    if (commandMap[action]) {
      this.editor.execCommand(commandMap[action]);
      return;
    }

    /* Format block commands */
    if (formatBlockMap[action]) {
      this.editor.execCommand("formatBlock", `<${formatBlockMap[action]}>`);
      return;
    }

    /* Code block */
    if (action === "code") {
      this.editor.execCommand("formatBlock", "<PRE>");
      return;
    }

    /* Horizontal rule */
    if (action === "horizontalRule") {
      this.editor.execCommand("insertHorizontalRule");
      return;
    }

    /* Source view */
    if (action === "source") {
      this.editor.toggleSource();
      return;
    }

    /* Preview */
    if (action === "preview") {
      this.editor.togglePreview();
      return;
    }

    /* Fullscreen */
    if (action === "fullscreen") {
      this.editor.toggleFullscreen();
      return;
    }

    /* Print */
    if (action === "print") {
      window.print();
      return;
    }

    /* Plug-in actions (link, image, video, table) */
    this.editor.emit("afterCommand", { action });
  }

  /* ---------------------------------------------------------------- */
  /*  Active states                                                    */
  /* ---------------------------------------------------------------- */

  updateActiveStates(): void {
    const toggleCommands: Record<string, string> = {
      bold: "bold",
      italic: "italic",
      underline: "underline",
      strikethrough: "strikeThrough",
      subscript: "subscript",
      superscript: "superscript",
      orderedList: "insertOrderedList",
      unorderedList: "insertUnorderedList",
    };

    for (const [action, command] of Object.entries(toggleCommands)) {
      const btn = this.buttons.get(action);
      if (btn) {
        const active = this.editor.queryCommandState(command);
        btn.classList.toggle("we-toolbar__btn--active", active);
      }
    }

    /* Source / preview / fullscreen toggle */
    const sourceBtn = this.buttons.get("source");
    if (sourceBtn) sourceBtn.classList.toggle("we-toolbar__btn--active", this.editor.isSourceMode());

    const previewBtn = this.buttons.get("preview");
    if (previewBtn) previewBtn.classList.toggle("we-toolbar__btn--active", this.editor.isPreviewMode());

    const fsBtn = this.buttons.get("fullscreen");
    if (fsBtn) fsBtn.classList.toggle("we-toolbar__btn--active", this.editor.isFullscreen());
  }

  /* ---------------------------------------------------------------- */
  /*  Public API                                                       */
  /* ---------------------------------------------------------------- */

  getElement(): HTMLElement {
    return this.element;
  }

  destroy(): void {
    this.element.remove();
  }
}