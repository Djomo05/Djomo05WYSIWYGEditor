/**
 * tests/editor.test.ts
 * ------------------------------------------------------------------
 *  Comprehensive unit tests for the WYSIWYG editor.
 *
 *  jsdom does NOT support `document.execCommand` or `contentEditable`
 *  fully, so we test the API surface, event system, mode toggling,
 *  utilities, DOM helpers, plug-in lifecycle, toolbar rendering,
 *  source editor, fullscreen manager, and content-area setup
 *  rather than actual rich-text behaviour (that belongs in E2E tests
 *  with Playwright/Cypress).
 * ------------------------------------------------------------------
 */

import { createEditor, Editor, sanitizeHTML, EventEmitter } from "../src";
import { ContentArea } from "../src/core/ContentArea";
import { SourceEditor } from "../src/core/SourceEditor";
import { FullscreenManager } from "../src/core/Fullscreen";
import { Toolbar, getDefaultToolbarItems } from "../src/core/Toolbar";
import { ICONS } from "../src/core/icons";
import { PluginManager } from "../src/plugins/PluginManager";
import { ImagePlugin } from "../src/plugins/ImagePlugin";
import { VideoPlugin } from "../src/plugins/VideoPlugin";
import { LinkPlugin } from "../src/plugins/LinkPlugin";
import { TablePlugin } from "../src/plugins/TablePlugin";
import { ListPlugin } from "../src/plugins/ListPlugin";
import {
  resolveElement,
  createElement,
  saveSelection,
  restoreSelection,
  insertHTMLAtCaret,
} from "../src/utils/dom";
import type {
  EditorAPI,
  EditorOptions,
  EditorPlugin,
  ToolbarItem,
  ToolbarButtonDescriptor,
} from "../src";

/* ================================================================ */
/*  Helpers                                                          */
/* ================================================================ */

/** Create a fresh container in the jsdom document body. */
function makeContainer(): HTMLElement {
  const div = document.createElement("div");
  div.id = "test-editor";
  document.body.appendChild(div);
  return div;
}

/** Tear down everything after each test. */
function cleanup(): void {
  document.body.innerHTML = "";
  document.body.classList.remove("we-body--editor-fullscreen");
}

/**
 * Build a lightweight mock EditorAPI for testing sub-modules in
 * isolation.  Every method is a jest.fn() so we can assert calls.
 */
function makeMockEditor(overrides: Partial<EditorAPI> = {}): EditorAPI {
  const contentArea = document.createElement("div");
  contentArea.contentEditable = "true";
  contentArea.className = "we-content";
  document.body.appendChild(contentArea);

  const container = document.createElement("div");
  container.className = "we-editor";
  document.body.appendChild(container);

  return {
    getContent: jest.fn(() => contentArea.innerHTML),
    setContent: jest.fn((html: string) => {
      contentArea.innerHTML = html;
    }),
    getTextContent: jest.fn(() => contentArea.textContent ?? ""),
    clear: jest.fn(),
    execCommand: jest.fn(),
    queryCommandState: jest.fn(() => false),
    saveSelection: jest.fn(),
    restoreSelection: jest.fn(),
    insertHTML: jest.fn((html: string) => {
      contentArea.innerHTML += html;
    }),
    toggleSource: jest.fn(),
    togglePreview: jest.fn(),
    toggleFullscreen: jest.fn(),
    isSourceMode: jest.fn(() => false),
    isPreviewMode: jest.fn(() => false),
    isFullscreen: jest.fn(() => false),
    getContainer: jest.fn(() => container),
    getContentArea: jest.fn(() => contentArea),
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    getPlugin: jest.fn(),
    destroy: jest.fn(),
    ...overrides,
  };
}

/* ================================================================ */
/*  1. Factory function — createEditor()                             */
/* ================================================================ */

describe("createEditor()", () => {
  afterEach(cleanup);

  test("creates an Editor instance", () => {
    const editor = createEditor({ container: makeContainer() });
    expect(editor).toBeInstanceOf(Editor);
  });

  test("throws when container is an empty string", () => {
    expect(() => createEditor({ container: "" } as EditorOptions)).toThrow(
      '"container" option is required'
    );
  });

  test("throws when CSS selector matches nothing", () => {
    expect(() => createEditor({ container: "#nonexistent" })).toThrow(
      'Container "#nonexistent" not found'
    );
  });

  test("accepts an HTMLElement", () => {
    const editor = createEditor({ container: makeContainer() });
    expect(editor.getContainer().classList.contains("we-editor")).toBe(true);
  });

  test("accepts a CSS selector string", () => {
    makeContainer();
    const editor = createEditor({ container: "#test-editor" });
    expect(editor.getContainer()).toBeTruthy();
  });

  test("applies initial content", () => {
    const editor = createEditor({
      container: makeContainer(),
      content: "<p>Hello</p>",
    });
    expect(editor.getContent()).toContain("Hello");
  });

  test("applies className to root", () => {
    const editor = createEditor({
      container: makeContainer(),
      className: "my-class",
    });
    expect(editor.getContainer().classList.contains("my-class")).toBe(true);
  });

  test("applies width to root", () => {
    const editor = createEditor({
      container: makeContainer(),
      width: "800px",
    });
    expect(editor.getContainer().style.width).toBe("800px");
  });

  test("starts in preview mode when readOnly is true", () => {
    const editor = createEditor({
      container: makeContainer(),
      readOnly: true,
    });
    expect(editor.isPreviewMode()).toBe(true);
  });
});

/* ================================================================ */
/*  2. Content API                                                   */
/* ================================================================ */

describe("Editor content API", () => {
  afterEach(cleanup);

  test("setContent() and getContent()", () => {
    const editor = createEditor({ container: makeContainer() });
    editor.setContent("<p>Test</p>");
    expect(editor.getContent()).toContain("Test");
  });

  test("setContent() sanitises scripts", () => {
    const editor = createEditor({ container: makeContainer() });
    editor.setContent('<p>Ok</p><script>alert("x")</script>');
    expect(editor.getContent()).not.toContain("<script");
    expect(editor.getContent()).toContain("Ok");
  });

  test("clear() empties content", () => {
    const editor = createEditor({
      container: makeContainer(),
      content: "<p>data</p>",
    });
    editor.clear();
    expect(editor.getTextContent().trim()).toBe("");
  });

  test("getTextContent() strips tags", () => {
    const editor = createEditor({
      container: makeContainer(),
      content: "<p>Hello <strong>World</strong></p>",
    });
    expect(editor.getTextContent()).toContain("Hello World");
  });

  test("setContent('') clears everything", () => {
    const editor = createEditor({
      container: makeContainer(),
      content: "<p>Stuff</p>",
    });
    editor.setContent("");
    expect(editor.getTextContent().trim()).toBe("");
  });

  test("complex HTML preserves structure", () => {
    const editor = createEditor({ container: makeContainer() });
    const html =
      "<h1>T</h1><p><em>E</em> <strong>B</strong></p>" +
      "<ul><li>A</li><li>B</li></ul><blockquote>Q</blockquote>";
    editor.setContent(html);
    const c = editor.getContent();
    expect(c).toContain("<h1>");
    expect(c).toContain("<em>");
    expect(c).toContain("<li>A</li>");
    expect(c).toContain("<blockquote>");
  });
});

/* ================================================================ */
/*  3. Mode toggling                                                 */
/* ================================================================ */

describe("Editor mode toggling", () => {
  afterEach(cleanup);

  /* Source mode */
  test("toggleSource() enters and exits", () => {
    const e = createEditor({ container: makeContainer() });
    expect(e.isSourceMode()).toBe(false);
    e.toggleSource();
    expect(e.isSourceMode()).toBe(true);
    e.toggleSource();
    expect(e.isSourceMode()).toBe(false);
  });

  test("source mode hides / shows content area", () => {
    const e = createEditor({ container: makeContainer() });
    e.toggleSource();
    expect(e.getContentArea().style.display).toBe("none");
    e.toggleSource();
    expect(e.getContentArea().style.display).toBe("block");
  });

  /* Preview mode */
  test("togglePreview() enters and exits", () => {
    const e = createEditor({ container: makeContainer() });
    expect(e.isPreviewMode()).toBe(false);
    e.togglePreview();
    expect(e.isPreviewMode()).toBe(true);
    e.togglePreview();
    expect(e.isPreviewMode()).toBe(false);
  });

  test("preview hides / shows content area", () => {
    const e = createEditor({ container: makeContainer() });
    e.togglePreview();
    expect(e.getContentArea().style.display).toBe("none");
    e.togglePreview();
    expect(e.getContentArea().style.display).toBe("block");
  });

  test("preview adds toolbar preview class", () => {
    const e = createEditor({ container: makeContainer() });
    e.togglePreview();
    const tb = e.getContainer().querySelector(".we-toolbar");
    expect(tb?.classList.contains("we-toolbar--preview")).toBe(true);
  });

  /* Fullscreen */
  test("toggleFullscreen() enters and exits", () => {
    const e = createEditor({ container: makeContainer() });
    expect(e.isFullscreen()).toBe(false);
    e.toggleFullscreen();
    expect(e.isFullscreen()).toBe(true);
    e.toggleFullscreen();
    expect(e.isFullscreen()).toBe(false);
  });

  test("fullscreen CSS classes on container and body", () => {
    const e = createEditor({ container: makeContainer() });
    e.toggleFullscreen();
    expect(e.getContainer().classList.contains("we-editor--fullscreen")).toBe(true);
    expect(document.body.classList.contains("we-body--editor-fullscreen")).toBe(true);
    e.toggleFullscreen();
    expect(e.getContainer().classList.contains("we-editor--fullscreen")).toBe(false);
    expect(document.body.classList.contains("we-body--editor-fullscreen")).toBe(false);
  });

  /* Mode interactions */
  test("source while preview → exits preview", () => {
    const e = createEditor({ container: makeContainer() });
    e.togglePreview();
    e.toggleSource();
    expect(e.isPreviewMode()).toBe(false);
    expect(e.isSourceMode()).toBe(true);
  });

  test("preview while source → exits source", () => {
    const e = createEditor({ container: makeContainer() });
    e.toggleSource();
    e.togglePreview();
    expect(e.isSourceMode()).toBe(false);
    expect(e.isPreviewMode()).toBe(true);
  });

  test("fullscreen + source together", () => {
    const e = createEditor({ container: makeContainer() });
    e.toggleFullscreen();
    e.toggleSource();
    expect(e.isFullscreen()).toBe(true);
    expect(e.isSourceMode()).toBe(true);
  });

  test("fullscreen + preview together", () => {
    const e = createEditor({ container: makeContainer() });
    e.toggleFullscreen();
    e.togglePreview();
    expect(e.isFullscreen()).toBe(true);
    expect(e.isPreviewMode()).toBe(true);
  });
});

/* ================================================================ */
/*  4. Events                                                        */
/* ================================================================ */

describe("Editor events", () => {
  afterEach(cleanup);

  test("change fires on setContent()", () => {
    const e = createEditor({ container: makeContainer() });
    const h = jest.fn();
    e.on("change", h);
    e.setContent("<p>x</p>");
    expect(h).toHaveBeenCalled();
  });

  test("modeChange fires with correct mode on source toggle", () => {
    const e = createEditor({ container: makeContainer() });
    const h = jest.fn();
    e.on("modeChange", h);
    e.toggleSource();
    expect(h).toHaveBeenCalledWith(expect.objectContaining({ mode: "source" }));
  });

  test("modeChange fires 'wysiwyg' when exiting source", () => {
    const e = createEditor({ container: makeContainer() });
    e.toggleSource();
    const h = jest.fn();
    e.on("modeChange", h);
    e.toggleSource();
    expect(h).toHaveBeenCalledWith(expect.objectContaining({ mode: "wysiwyg" }));
  });

  test("modeChange fires 'preview'", () => {
    const e = createEditor({ container: makeContainer() });
    const h = jest.fn();
    e.on("modeChange", h);
    e.togglePreview();
    expect(h).toHaveBeenCalledWith(expect.objectContaining({ mode: "preview" }));
  });

  test("fullscreenChange fires with true/false", () => {
    const e = createEditor({ container: makeContainer() });
    const h = jest.fn();
    e.on("fullscreenChange", h);
    e.toggleFullscreen();
    expect(h).toHaveBeenCalledWith(expect.objectContaining({ fullscreen: true }));
    e.toggleFullscreen();
    expect(h).toHaveBeenCalledWith(expect.objectContaining({ fullscreen: false }));
  });

  test("destroy event fires", () => {
    const e = createEditor({ container: makeContainer() });
    const h = jest.fn();
    e.on("destroy", h);
    e.destroy();
    expect(h).toHaveBeenCalledTimes(1);
  });

  test("off() removes listener", () => {
    const e = createEditor({ container: makeContainer() });
    const h = jest.fn();
    e.on("change", h);
    e.off("change", h);
    e.setContent("<p>nope</p>");
    expect(h).not.toHaveBeenCalled();
  });

  test("emit() with no listeners does not throw", () => {
    const e = createEditor({ container: makeContainer() });
    expect(() => e.emit("change", {})).not.toThrow();
  });

  test("multiple listeners all fire", () => {
    const e = createEditor({ container: makeContainer() });
    const h1 = jest.fn(), h2 = jest.fn(), h3 = jest.fn();
    e.on("change", h1);
    e.on("change", h2);
    e.on("change", h3);
    e.setContent("<p>multi</p>");
    expect(h1).toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();
    expect(h3).toHaveBeenCalled();
  });
});

/* ================================================================ */
/*  5. Destroy lifecycle                                             */
/* ================================================================ */

describe("Editor destroy()", () => {
  afterEach(cleanup);

  test("removes DOM", () => {
    const c = makeContainer();
    const e = createEditor({ container: c });
    expect(c.querySelector(".we-editor")).toBeTruthy();
    e.destroy();
    expect(c.querySelector(".we-editor")).toBeFalsy();
  });

  test("double destroy is safe", () => {
    const e = createEditor({ container: makeContainer() });
    e.destroy();
    expect(() => e.destroy()).not.toThrow();
  });

  test("exits fullscreen before destroying", () => {
    const e = createEditor({ container: makeContainer() });
    e.toggleFullscreen();
    e.destroy();
    expect(document.body.classList.contains("we-body--editor-fullscreen")).toBe(false);
  });

  test("no events fire after destroy", () => {
    const e = createEditor({ container: makeContainer() });
    const h = jest.fn();
    e.on("change", h);
    e.destroy();
    e.emit("change", {});
    expect(h).not.toHaveBeenCalled();
  });
});

/* ================================================================ */
/*  6. DOM access                                                    */
/* ================================================================ */

describe("Editor DOM access", () => {
  afterEach(cleanup);

  test("getContainer() returns .we-editor", () => {
    const e = createEditor({ container: makeContainer() });
    expect(e.getContainer().classList.contains("we-editor")).toBe(true);
  });

  test("getContentArea() returns contentEditable div", () => {
    const e = createEditor({ container: makeContainer() });
    expect(e.getContentArea().getAttribute("contenteditable")).toBe("true");
  });
});

/* ================================================================ */
/*  7. Plug-in system                                                */
/* ================================================================ */

describe("Plug-in system", () => {
  afterEach(cleanup);

  test("built-in plug-ins registered", () => {
    const e = createEditor({ container: makeContainer() });
    expect(e.getPlugin("image")).toBeDefined();
    expect(e.getPlugin("video")).toBeDefined();
    expect(e.getPlugin("link")).toBeDefined();
    expect(e.getPlugin("table")).toBeDefined();
    expect(e.getPlugin("list")).toBeDefined();
  });

  test("disablePlugins works", () => {
    const e = createEditor({
      container: makeContainer(),
      disablePlugins: ["video", "table"],
    });
    expect(e.getPlugin("video")).toBeUndefined();
    expect(e.getPlugin("table")).toBeUndefined();
    expect(e.getPlugin("image")).toBeDefined();
  });

  test("custom plug-in is initialised with EditorAPI", () => {
    const init = jest.fn();
    const destroy = jest.fn();
    const plugin: EditorPlugin = { name: "custom", init, destroy };
    const e = createEditor({ container: makeContainer(), plugins: [plugin] });
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ getContent: expect.any(Function) })
    );
    expect(e.getPlugin("custom")).toBe(plugin);
  });

  test("custom plug-in destroy() called on editor destroy", () => {
    const destroy = jest.fn();
    const plugin: EditorPlugin = { name: "d", init: jest.fn(), destroy };
    const e = createEditor({ container: makeContainer(), plugins: [plugin] });
    e.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  test("getPlugin() returns undefined for unknown name", () => {
    const e = createEditor({ container: makeContainer() });
    expect(e.getPlugin("nope")).toBeUndefined();
  });
});

/* ================================================================ */
/*  8. sanitizeHTML()                                                */
/* ================================================================ */

describe("sanitizeHTML()", () => {
  test("removes <script>", () => {
    const r = sanitizeHTML('<p>Hi</p><script>alert("x")</script>');
    expect(r).not.toContain("<script");
    expect(r).toContain("Hi");
  });

  test("removes <style>", () => {
    const r = sanitizeHTML("<style>*{}</style><p>V</p>");
    expect(r).not.toContain("<style");
    expect(r).toContain("V");
  });

  test("removes on* attributes", () => {
    const r = sanitizeHTML('<img src="x" onerror="alert(1)" onload="f()" />');
    expect(r).not.toContain("onerror");
    expect(r).not.toContain("onload");
  });

  test("removes javascript: href", () => {
    const r = sanitizeHTML('<a href="javascript:void(0)">X</a>');
    expect(r).not.toContain("javascript:");
  });

  test("removes form elements", () => {
    const r = sanitizeHTML(
      "<form><input /><textarea></textarea><button>Go</button></form>"
    );
    expect(r).not.toContain("<form");
    expect(r).not.toContain("<input");
    expect(r).not.toContain("<textarea");
    expect(r).not.toContain("<button");
  });

  test("removes <iframe> by default", () => {
    const r = sanitizeHTML('<iframe src="https://evil.com"></iframe><p>S</p>');
    expect(r).not.toContain("<iframe");
  });

  test("keeps <iframe> with allowIframes", () => {
    const r = sanitizeHTML('<iframe src="https://yt.com"></iframe>', {
      allowIframes: true,
    });
    expect(r).toContain("<iframe");
  });

  test("keeps safe tags", () => {
    const r = sanitizeHTML(
      "<p><strong>B</strong> <em>I</em> <u>U</u></p>"
    );
    expect(r).toContain("<strong>");
    expect(r).toContain("<em>");
    expect(r).toContain("<u>");
  });

  test("keeps safe <a> href", () => {
    const r = sanitizeHTML('<a href="https://ok.com">L</a>');
    expect(r).toContain('href="https://ok.com"');
  });

  test("keeps safe <img>", () => {
    const r = sanitizeHTML('<img src="https://ok.com/i.jpg" alt="I" />');
    expect(r).toContain("src=");
    expect(r).toContain("alt=");
  });

  test("handles empty string", () => {
    expect(sanitizeHTML("")).toBe("");
  });

  test("handles nested dangerous content", () => {
    const r = sanitizeHTML(
      '<div><p><span><script>alert("d")</script></span></p></div>'
    );
    expect(r).not.toContain("<script");
  });

  test("removes <object> and <embed> tags", () => {
    const r = sanitizeHTML(
      '<object data="x.swf"></object><embed src="y.swf" /><p>Safe</p>'
    );
    expect(r).not.toContain("<object");
    expect(r).not.toContain("<embed");
    expect(r).toContain("Safe");
  });

  test("removes <select> tag", () => {
    const r = sanitizeHTML(
      '<select><option value="a">A</option></select><p>OK</p>'
    );
    expect(r).not.toContain("<select");
    expect(r).toContain("OK");
  });

  test("removes onclick from div", () => {
    const r = sanitizeHTML('<div onclick="alert(1)">Content</div>');
    expect(r).not.toContain("onclick");
    expect(r).toContain("Content");
  });

  test("removes onmouseover attribute", () => {
    const r = sanitizeHTML('<span onmouseover="hack()">Hover</span>');
    expect(r).not.toContain("onmouseover");
    expect(r).toContain("Hover");
  });
});

/* ================================================================ */
/*  9. EventEmitter (standalone)                                     */
/* ================================================================ */

describe("EventEmitter", () => {
  test("on + emit works", () => {
    const em = new EventEmitter();
    const h = jest.fn();
    em.on("change", h);
    em.emit("change", { x: 1 });
    expect(h).toHaveBeenCalledWith({ x: 1 });
  });

  test("off removes handler", () => {
    const em = new EventEmitter();
    const h = jest.fn();
    em.on("change", h);
    em.off("change", h);
    em.emit("change");
    expect(h).not.toHaveBeenCalled();
  });

  test("off only removes the specified handler", () => {
    const em = new EventEmitter();
    const a = jest.fn(), b = jest.fn();
    em.on("change", a);
    em.on("change", b);
    em.off("change", a);
    em.emit("change");
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });

  test("removeAll clears everything", () => {
    const em = new EventEmitter();
    const h1 = jest.fn(), h2 = jest.fn();
    em.on("change", h1);
    em.on("focus", h2);
    em.removeAll();
    em.emit("change");
    em.emit("focus");
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  test("emit with no listeners is safe", () => {
    expect(() => new EventEmitter().emit("change")).not.toThrow();
  });

  test("error in handler doesn't break others", () => {
    const em = new EventEmitter();
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const bad = (): void => { throw new Error("boom"); };
    const good = jest.fn();
    em.on("change", bad);
    em.on("change", good);
    em.emit("change");
    expect(good).toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test("duplicate handler only fires once", () => {
    const em = new EventEmitter();
    const h = jest.fn();
    em.on("change", h);
    em.on("change", h);
    em.emit("change");
    expect(h).toHaveBeenCalledTimes(1);
  });

  test("emit with no data passes undefined", () => {
    const em = new EventEmitter();
    const h = jest.fn();
    em.on("change", h);
    em.emit("change");
    expect(h).toHaveBeenCalledWith(undefined);
  });
});

/* ================================================================ */
/*  10. Toolbar                                                      */
/* ================================================================ */

describe("Toolbar", () => {
  afterEach(cleanup);

  test("visible by default", () => {
    const e = createEditor({ container: makeContainer() });
    const tb = e.getContainer().querySelector(".we-toolbar");
    expect(tb).toBeTruthy();
    expect(tb?.classList.contains("we-toolbar--hidden")).toBe(false);
  });

  test("hidden when toolbar: false", () => {
    const e = createEditor({ container: makeContainer(), toolbar: false });
    const tb = e.getContainer().querySelector(".we-toolbar");
    expect(tb?.classList.contains("we-toolbar--hidden")).toBe(true);
  });

  test("getDefaultToolbarItems() returns array of items", () => {
    const items = getDefaultToolbarItems();
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(10);
    /* Contains at least bold, italic, source, fullscreen */
    const actions = items
      .filter((i): i is ToolbarButtonDescriptor => i !== "|")
      .map((i) => i.action);
    expect(actions).toContain("bold");
    expect(actions).toContain("italic");
    expect(actions).toContain("source");
    expect(actions).toContain("fullscreen");
    expect(actions).toContain("preview");
    expect(actions).toContain("image");
    expect(actions).toContain("video");
    expect(actions).toContain("table");
    expect(actions).toContain("link");
  });

  test("toolbar has role='toolbar' attribute", () => {
    const e = createEditor({ container: makeContainer() });
    const tb = e.getContainer().querySelector(".we-toolbar");
    expect(tb?.getAttribute("role")).toBe("toolbar");
  });

  test("toolbar buttons have aria-label", () => {
    const e = createEditor({ container: makeContainer() });
    const buttons = e.getContainer().querySelectorAll(".we-toolbar__btn");
    buttons.forEach((btn) => {
      expect(btn.getAttribute("aria-label")).toBeTruthy();
    });
  });

  test("toolbar buttons have data-action attribute", () => {
    const e = createEditor({ container: makeContainer() });
    const buttons = e.getContainer().querySelectorAll(".we-toolbar__btn");
    buttons.forEach((btn) => {
      expect(btn.getAttribute("data-action")).toBeTruthy();
    });
  });

  test("separators have role='separator'", () => {
    const e = createEditor({ container: makeContainer() });
    const seps = e.getContainer().querySelectorAll(".we-toolbar__separator");
    expect(seps.length).toBeGreaterThan(0);
    seps.forEach((sep) => {
      expect(sep.getAttribute("role")).toBe("separator");
    });
  });

  test("custom toolbar items are rendered", () => {
    const customItems: ToolbarItem[] = [
      { action: "bold", label: "Bold", icon: "<b>B</b>" },
      "|",
      { action: "italic", label: "Italic", icon: "<i>I</i>" },
    ];
    const e = createEditor({
      container: makeContainer(),
      toolbar: customItems,
    });
    const buttons = e.getContainer().querySelectorAll(".we-toolbar__btn");
    expect(buttons.length).toBe(2);
    const seps = e.getContainer().querySelectorAll(".we-toolbar__separator");
    expect(seps.length).toBe(1);
  });
});

/* ================================================================ */
/*  11. Icons                                                        */
/* ================================================================ */

describe("ICONS", () => {
  test("ICONS object contains all required keys", () => {
    const requiredKeys = [
      "bold", "italic", "underline", "strikethrough",
      "heading1", "heading2", "heading3", "paragraph",
      "alignLeft", "alignCenter", "alignRight", "alignJustify",
      "orderedList", "unorderedList", "indent", "outdent",
      "link", "image", "video", "table", "horizontalRule",
      "quote", "code", "removeFormat",
      "foreColor", "backColor", "subscript", "superscript",
      "undo", "redo", "source", "preview", "fullscreen", "print",
    ];
    for (const key of requiredKeys) {
      expect(ICONS[key]).toBeDefined();
      expect(typeof ICONS[key]).toBe("string");
    }
  });

  test("each icon contains an SVG element", () => {
    for (const [name, svg] of Object.entries(ICONS)) {
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    }
  });

  test("icons use currentColor for theming", () => {
    for (const svg of Object.values(ICONS)) {
      expect(svg).toContain("currentColor");
    }
  });
});

/* ================================================================ */
/*  12. DOM utilities                                                */
/* ================================================================ */

describe("DOM utilities", () => {
  afterEach(cleanup);

  /* resolveElement */
  test("resolveElement with HTMLElement returns it", () => {
    const div = document.createElement("div");
    expect(resolveElement(div)).toBe(div);
  });

  test("resolveElement with valid selector returns element", () => {
    const div = makeContainer();
    expect(resolveElement("#test-editor")).toBe(div);
  });

  test("resolveElement with bad selector throws", () => {
    expect(() => resolveElement("#nope")).toThrow('not found');
  });

  /* createElement */
  test("createElement creates element with className", () => {
    const el = createElement("div", { className: "my-class" });
    expect(el.tagName).toBe("DIV");
    expect(el.classList.contains("my-class")).toBe(true);
  });

  test("createElement with attributes", () => {
    const el = createElement("input", {
      attributes: { type: "text", placeholder: "Hello" },
    });
    expect(el.getAttribute("type")).toBe("text");
    expect(el.getAttribute("placeholder")).toBe("Hello");
  });

  test("createElement with innerHTML", () => {
    const el = createElement("div", { innerHTML: "<span>Hi</span>" });
    expect(el.innerHTML).toBe("<span>Hi</span>");
  });

  test("createElement with parent appends to parent", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const child = createElement("span", { parent, className: "child" });
    expect(parent.contains(child)).toBe(true);
  });

  test("createElement with all options combined", () => {
    const parent = document.createElement("div");
    const el = createElement("a", {
      className: "link",
      attributes: { href: "https://example.com" },
      innerHTML: "Click",
      parent,
    });
    expect(el.tagName).toBe("A");
    expect(el.className).toBe("link");
    expect(el.getAttribute("href")).toBe("https://example.com");
    expect(el.innerHTML).toBe("Click");
    expect(parent.contains(el)).toBe(true);
  });

  /* saveSelection / restoreSelection */
  test("saveSelection returns null when no selection", () => {
    expect(saveSelection()).toBeNull();
  });

  test("restoreSelection with null does not throw", () => {
    expect(() => restoreSelection(null)).not.toThrow();
  });
});

/* ================================================================ */
/*  13. SourceEditor (standalone)                                    */
/* ================================================================ */

describe("SourceEditor", () => {
  afterEach(cleanup);

  test("starts hidden", () => {
    const mockEditor = makeMockEditor();
    const se = new SourceEditor(mockEditor, "300px");
    document.body.appendChild(se.getElement());
    expect(se.getElement().style.display).toBe("none");
    expect(se.isVisible()).toBe(false);
  });

  test("show() makes it visible and populates with HTML", () => {
    const mockEditor = makeMockEditor();
    const se = new SourceEditor(mockEditor, "300px");
    document.body.appendChild(se.getElement());
    se.show("<p>Hello</p>");
    expect(se.isVisible()).toBe(true);
    expect(se.getElement().style.display).toBe("block");
    expect(se.getValue()).toContain("Hello");
  });

  test("hide() hides and returns value", () => {
    const mockEditor = makeMockEditor();
    const se = new SourceEditor(mockEditor, "300px");
    document.body.appendChild(se.getElement());
    se.show("<p>Data</p>");
    const result = se.hide();
    expect(se.isVisible()).toBe(false);
    expect(se.getElement().style.display).toBe("none");
    expect(result).toContain("Data");
  });

  test("setValue() updates the content", () => {
    const mockEditor = makeMockEditor();
    const se = new SourceEditor(mockEditor, "300px");
    se.setValue("<div>Updated</div>");
    expect(se.getValue()).toContain("Updated");
  });

  test("getElement() returns a textarea", () => {
    const mockEditor = makeMockEditor();
    const se = new SourceEditor(mockEditor, "400px");
    const el = se.getElement();
    expect(el.tagName).toBe("TEXTAREA");
    expect(el.classList.contains("we-source-editor")).toBe(true);
  });

  test("textarea has correct aria-label", () => {
    const mockEditor = makeMockEditor();
    const se = new SourceEditor(mockEditor, "300px");
    expect(se.getElement().getAttribute("aria-label")).toBe(
      "HTML source editor"
    );
  });

  test("textarea has spellcheck disabled", () => {
    const mockEditor = makeMockEditor();
    const se = new SourceEditor(mockEditor, "300px");
    expect(se.getElement().getAttribute("spellcheck")).toBe("false");
  });

  test("destroy() removes element from DOM", () => {
    const mockEditor = makeMockEditor();
    const se = new SourceEditor(mockEditor, "300px");
    document.body.appendChild(se.getElement());
    expect(document.body.contains(se.getElement())).toBe(true);
    se.destroy();
    expect(document.body.contains(se.getElement())).toBe(false);
  });

  test("minHeight is set from constructor", () => {
    const mockEditor = makeMockEditor();
    const se = new SourceEditor(mockEditor, "500px");
    expect(se.getElement().style.minHeight).toBe("500px");
  });
});

/* ================================================================ */
/*  14. FullscreenManager (standalone)                               */
/* ================================================================ */

describe("FullscreenManager", () => {
  afterEach(cleanup);

  test("starts inactive", () => {
    const mockEditor = makeMockEditor();
    const fs = new FullscreenManager(mockEditor);
    expect(fs.isActive()).toBe(false);
  });

  test("toggle() enters fullscreen", () => {
    const mockEditor = makeMockEditor();
    const fs = new FullscreenManager(mockEditor);
    const result = fs.toggle();
    expect(result).toBe(true);
    expect(fs.isActive()).toBe(true);
  });

  test("toggle() twice exits fullscreen", () => {
    const mockEditor = makeMockEditor();
    const fs = new FullscreenManager(mockEditor);
    fs.toggle();
    const result = fs.toggle();
    expect(result).toBe(false);
    expect(fs.isActive()).toBe(false);
  });

  test("adds CSS class to container on enter", () => {
    const mockEditor = makeMockEditor();
    const fs = new FullscreenManager(mockEditor);
    fs.toggle();
    const container = mockEditor.getContainer();
    expect(container.classList.contains("we-editor--fullscreen")).toBe(true);
  });

  test("removes CSS class from container on exit", () => {
    const mockEditor = makeMockEditor();
    const fs = new FullscreenManager(mockEditor);
    fs.toggle();
    fs.toggle();
    expect(
      mockEditor.getContainer().classList.contains("we-editor--fullscreen")
    ).toBe(false);
  });

  test("adds body class on enter", () => {
    const mockEditor = makeMockEditor();
    const fs = new FullscreenManager(mockEditor);
    fs.toggle();
    expect(
      document.body.classList.contains("we-body--editor-fullscreen")
    ).toBe(true);
  });

  test("removes body class on exit", () => {
    const mockEditor = makeMockEditor();
    const fs = new FullscreenManager(mockEditor);
    fs.toggle();
    fs.toggle();
    expect(
      document.body.classList.contains("we-body--editor-fullscreen")
    ).toBe(false);
  });

  test("emits fullscreenChange event", () => {
    const mockEditor = makeMockEditor();
    const fs = new FullscreenManager(mockEditor);
    fs.toggle();
    expect(mockEditor.emit).toHaveBeenCalledWith("fullscreenChange", {
      fullscreen: true,
    });
  });

  test("destroy() exits fullscreen if active", () => {
    const mockEditor = makeMockEditor();
    const fs = new FullscreenManager(mockEditor);
    fs.toggle();
    fs.destroy();
    expect(fs.isActive()).toBe(false);
    expect(
      document.body.classList.contains("we-body--editor-fullscreen")
    ).toBe(false);
  });

  test("destroy() is safe when not active", () => {
    const mockEditor = makeMockEditor();
    const fs = new FullscreenManager(mockEditor);
    expect(() => fs.destroy()).not.toThrow();
  });
});

/* ================================================================ */
/*  15. ContentArea (standalone)                                     */
/* ================================================================ */

describe("ContentArea", () => {
  afterEach(cleanup);

  test("creates a contentEditable div", () => {
    const mockEditor = makeMockEditor();
    const ca = new ContentArea(mockEditor, {
      container: makeContainer(),
    });
    const el = ca.getElement();
    expect(el.getAttribute("contenteditable")).toBe("true");
    expect(el.classList.contains("we-content")).toBe(true);
  });

  test("applies initial content", () => {
    const mockEditor = makeMockEditor();
    const ca = new ContentArea(mockEditor, {
      container: makeContainer(),
      content: "<p>Init</p>",
    });
    expect(ca.getContent()).toContain("Init");
  });

  test("applies height", () => {
    const mockEditor = makeMockEditor();
    const ca = new ContentArea(mockEditor, {
      container: makeContainer(),
      height: "500px",
    });
    expect(ca.getElement().style.minHeight).toBe("500px");
  });

  test("default height is 300px", () => {
    const mockEditor = makeMockEditor();
    const ca = new ContentArea(mockEditor, {
      container: makeContainer(),
    });
    expect(ca.getElement().style.minHeight).toBe("300px");
  });

  test("setContent() updates innerHTML", () => {
    const mockEditor = makeMockEditor();
    const ca = new ContentArea(mockEditor, {
      container: makeContainer(),
    });
    ca.setContent("<p>New</p>");
    expect(ca.getContent()).toContain("New");
  });

  test("getTextContent() returns plain text", () => {
    const mockEditor = makeMockEditor();
    const ca = new ContentArea(mockEditor, {
      container: makeContainer(),
      content: "<p>Plain <strong>text</strong></p>",
    });
    const text = ca.getTextContent();
    expect(text).toContain("Plain");
    expect(text).toContain("text");
    expect(text).not.toContain("<strong>");
  });

  test("setEditable(false) makes it readonly", () => {
    const mockEditor = makeMockEditor();
    const ca = new ContentArea(mockEditor, {
      container: makeContainer(),
    });
    ca.setEditable(false);
    expect(ca.getElement().contentEditable).toBe("false");
    expect(ca.getElement().classList.contains("we-content--readonly")).toBe(true);
  });

  test("setEditable(true) restores editing", () => {
    const mockEditor = makeMockEditor();
    const ca = new ContentArea(mockEditor, {
      container: makeContainer(),
    });
    ca.setEditable(false);
    ca.setEditable(true);
    expect(ca.getElement().contentEditable).toBe("true");
    expect(ca.getElement().classList.contains("we-content--readonly")).toBe(false);
  });

  test("has role='textbox' for accessibility", () => {
    const mockEditor = makeMockEditor();
    const ca = new ContentArea(mockEditor, {
      container: makeContainer(),
    });
    expect(ca.getElement().getAttribute("role")).toBe("textbox");
  });

  test("has aria-multiline='true'", () => {
    const mockEditor = makeMockEditor();
    const ca = new ContentArea(mockEditor, {
      container: makeContainer(),
    });
    expect(ca.getElement().getAttribute("aria-multiline")).toBe("true");
  });

  test("placeholder is set as data attribute", () => {
    const mockEditor = makeMockEditor();
    const ca = new ContentArea(mockEditor, {
      container: makeContainer(),
      placeholder: "Type here…",
    });
    expect(ca.getElement().getAttribute("data-placeholder")).toBe("Type here…");
  });

  test("destroy() removes element from DOM", () => {
    const mockEditor = makeMockEditor();
    const ca = new ContentArea(mockEditor, {
      container: makeContainer(),
    });
    document.body.appendChild(ca.getElement());
    ca.destroy();
    expect(document.body.contains(ca.getElement())).toBe(false);
  });
});

/* ================================================================ */
/*  16. PluginManager (standalone)                                   */
/* ================================================================ */

describe("PluginManager", () => {
  afterEach(cleanup);

  test("registers built-in plug-ins", () => {
    const mockEditor = makeMockEditor();
    const pm = new PluginManager(mockEditor, {
      container: makeContainer(),
    });
    expect(pm.get("image")).toBeDefined();
    expect(pm.get("video")).toBeDefined();
    expect(pm.get("link")).toBeDefined();
    expect(pm.get("table")).toBeDefined();
    expect(pm.get("list")).toBeDefined();
  });

  test("disablePlugins excludes specified plug-ins", () => {
    const mockEditor = makeMockEditor();
    const pm = new PluginManager(mockEditor, {
      container: makeContainer(),
      disablePlugins: ["image", "link"],
    });
    expect(pm.get("image")).toBeUndefined();
    expect(pm.get("link")).toBeUndefined();
    expect(pm.get("video")).toBeDefined();
  });

  test("list() returns all registered names", () => {
    const mockEditor = makeMockEditor();
    const pm = new PluginManager(mockEditor, {
      container: makeContainer(),
    });
    const names = pm.list();
    expect(names).toContain("image");
    expect(names).toContain("video");
    expect(names).toContain("link");
    expect(names).toContain("table");
    expect(names).toContain("list");
  });

  test("custom plug-ins are registered", () => {
    const mockEditor = makeMockEditor();
    const custom: EditorPlugin = {
      name: "my-plug",
      init: jest.fn(),
      destroy: jest.fn(),
    };
    const pm = new PluginManager(mockEditor, {
      container: makeContainer(),
      plugins: [custom],
    });
    expect(pm.get("my-plug")).toBe(custom);
    expect(custom.init).toHaveBeenCalled();
  });

  test("duplicate plug-in registration is warned and skipped", () => {
    const mockEditor = makeMockEditor();
    const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const pm = new PluginManager(mockEditor, {
      container: makeContainer(),
    });
    const dup: EditorPlugin = {
      name: "image",
      init: jest.fn(),
      destroy: jest.fn(),
    };
    pm.register(dup);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("already registered")
    );
    expect(dup.init).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("destroyAll() calls destroy on every plug-in", () => {
    const mockEditor = makeMockEditor();
    const p1: EditorPlugin = { name: "a", init: jest.fn(), destroy: jest.fn() };
    const p2: EditorPlugin = { name: "b", init: jest.fn(), destroy: jest.fn() };
    const pm = new PluginManager(mockEditor, {
      container: makeContainer(),
      plugins: [p1, p2],
    });
    pm.destroyAll();
    expect(p1.destroy).toHaveBeenCalled();
    expect(p2.destroy).toHaveBeenCalled();
  });

  test("destroyAll() catches errors in plug-in destroy", () => {
    const mockEditor = makeMockEditor();
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const bad: EditorPlugin = {
      name: "bad",
      init: jest.fn(),
      destroy: () => { throw new Error("fail"); },
    };
    const pm = new PluginManager(mockEditor, {
      container: makeContainer(),
      plugins: [bad],
    });
    expect(() => pm.destroyAll()).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

/* ================================================================ */
/*  17. Individual Plug-in lifecycle                                  */
/* ================================================================ */

describe("ImagePlugin", () => {
  afterEach(cleanup);

  test("has name 'image'", () => {
    const ip = new ImagePlugin({ container: makeContainer() });
    expect(ip.name).toBe("image");
  });

  test("init registers afterCommand listener", () => {
    const mockEditor = makeMockEditor();
    const ip = new ImagePlugin({ container: makeContainer() });
    ip.init(mockEditor);
    expect(mockEditor.on).toHaveBeenCalledWith(
      "afterCommand",
      expect.any(Function)
    );
  });

  test("destroy removes afterCommand listener", () => {
    const mockEditor = makeMockEditor();
    const ip = new ImagePlugin({ container: makeContainer() });
    ip.init(mockEditor);
    ip.destroy();
    expect(mockEditor.off).toHaveBeenCalledWith(
      "afterCommand",
      expect.any(Function)
    );
  });
});

describe("VideoPlugin", () => {
  afterEach(cleanup);

  test("has name 'video'", () => {
    const vp = new VideoPlugin({ container: makeContainer() });
    expect(vp.name).toBe("video");
  });

  test("init registers afterCommand listener", () => {
    const mockEditor = makeMockEditor();
    const vp = new VideoPlugin({ container: makeContainer() });
    vp.init(mockEditor);
    expect(mockEditor.on).toHaveBeenCalledWith(
      "afterCommand",
      expect.any(Function)
    );
  });

  test("destroy removes afterCommand listener", () => {
    const mockEditor = makeMockEditor();
    const vp = new VideoPlugin({ container: makeContainer() });
    vp.init(mockEditor);
    vp.destroy();
    expect(mockEditor.off).toHaveBeenCalledWith(
      "afterCommand",
      expect.any(Function)
    );
  });
});

describe("LinkPlugin", () => {
  afterEach(cleanup);

  test("has name 'link'", () => {
    const lp = new LinkPlugin();
    expect(lp.name).toBe("link");
  });

  test("init registers afterCommand listener", () => {
    const mockEditor = makeMockEditor();
    const lp = new LinkPlugin();
    lp.init(mockEditor);
    expect(mockEditor.on).toHaveBeenCalledWith(
      "afterCommand",
      expect.any(Function)
    );
  });

  test("destroy removes afterCommand listener", () => {
    const mockEditor = makeMockEditor();
    const lp = new LinkPlugin();
    lp.init(mockEditor);
    lp.destroy();
    expect(mockEditor.off).toHaveBeenCalledWith(
      "afterCommand",
      expect.any(Function)
    );
  });
});

describe("TablePlugin", () => {
  afterEach(cleanup);

  test("has name 'table'", () => {
    const tp = new TablePlugin();
    expect(tp.name).toBe("table");
  });

  test("init registers afterCommand listener", () => {
    const mockEditor = makeMockEditor();
    const tp = new TablePlugin();
    tp.init(mockEditor);
    expect(mockEditor.on).toHaveBeenCalledWith(
      "afterCommand",
      expect.any(Function)
    );
  });

  test("destroy removes afterCommand listener", () => {
    const mockEditor = makeMockEditor();
    const tp = new TablePlugin();
    tp.init(mockEditor);
    tp.destroy();
    expect(mockEditor.off).toHaveBeenCalledWith(
      "afterCommand",
      expect.any(Function)
    );
  });
});

describe("ListPlugin", () => {
  afterEach(cleanup);

  test("has name 'list'", () => {
    const lp = new ListPlugin();
    expect(lp.name).toBe("list");
  });

  test("init registers afterCommand listener", () => {
    const mockEditor = makeMockEditor();
    const lp = new ListPlugin();
    lp.init(mockEditor);
    expect(mockEditor.on).toHaveBeenCalledWith(
      "afterCommand",
      expect.any(Function)
    );
  });

  test("destroy removes afterCommand listener", () => {
    const mockEditor = makeMockEditor();
    const lp = new ListPlugin();
    lp.init(mockEditor);
    lp.destroy();
    expect(mockEditor.off).toHaveBeenCalledWith(
      "afterCommand",
      expect.any(Function)
    );
  });
});

/* ================================================================ */
/*  18. Status bar                                                   */
/* ================================================================ */

describe("Status bar", () => {
  afterEach(cleanup);

  test("rendered inside the editor", () => {
    const c = makeContainer();
    createEditor({ container: c });
    expect(c.querySelector(".we-status-bar")).toBeTruthy();
  });

  test("shows word count", () => {
    const c = makeContainer();
    createEditor({ container: c, content: "<p>Hello World</p>" });
    expect(c.querySelector(".we-status-bar")?.textContent).toContain("Words:");
  });

  test("shows character count", () => {
    const c = makeContainer();
    createEditor({ container: c, content: "<p>Hello</p>" });
    expect(c.querySelector(".we-status-bar")?.textContent).toContain(
      "Characters:"
    );
  });

  test("shows 'Source' after toggleSource()", () => {
    const c = makeContainer();
    const e = createEditor({ container: c });
    e.toggleSource();
    expect(c.querySelector(".we-status-bar")?.textContent).toContain("Source");
  });

  test("shows 'Preview' after togglePreview()", () => {
    const c = makeContainer();
    const e = createEditor({ container: c });
    e.togglePreview();
    expect(c.querySelector(".we-status-bar")?.textContent).toContain("Preview");
  });

  test("shows 'WYSIWYG' by default", () => {
    const c = makeContainer();
    createEditor({ container: c });
    expect(c.querySelector(".we-status-bar")?.textContent).toContain("WYSIWYG");
  });

  test("returns to 'WYSIWYG' after exiting source mode", () => {
    const c = makeContainer();
    const e = createEditor({ container: c });
    e.toggleSource();
    e.toggleSource();
    expect(c.querySelector(".we-status-bar")?.textContent).toContain("WYSIWYG");
  });
});

/* ================================================================ */
/*  19. Content integrity across modes                               */
/* ================================================================ */

describe("Content integrity across modes", () => {
  afterEach(cleanup);

  test("survives source round-trip", () => {
    const e = createEditor({
      container: makeContainer(),
      content: "<p>RT</p>",
    });
    e.toggleSource();
    e.toggleSource();
    expect(e.getContent()).toContain("RT");
  });

  test("survives preview round-trip", () => {
    const e = createEditor({
      container: makeContainer(),
      content: "<p>PRT</p>",
    });
    e.togglePreview();
    e.togglePreview();
    expect(e.getContent()).toContain("PRT");
  });

  test("survives full cycle: source → wysiwyg → preview → wysiwyg", () => {
    const e = createEditor({
      container: makeContainer(),
      content: "<p>Cycle</p>",
    });
    e.toggleSource();
    e.toggleSource();
    e.togglePreview();
    e.togglePreview();
    expect(e.getContent()).toContain("Cycle");
  });
});