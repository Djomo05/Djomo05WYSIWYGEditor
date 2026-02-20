/**
 * @module index
 * ------------------------------------------------------------------
 *  Public entry point for the package.
 *
 *  Usage (ESM / TypeScript):
 *    import { createEditor } from '@djomo05/wysiwyg-editor';
 *    import '@djomo05/wysiwyg-editor/styles';
 *
 *    const editor = createEditor({
 *      container: '#my-editor',
 *      placeholder: 'Start typing…',
 *    });
 *
 *  Usage (UMD / script tag):
 *    <script src="wysiwyg-editor.min.js"></script>
 *    <script>
 *      const editor = WysiwygEditor.createEditor({
 *        container: '#my-editor',
 *      });
 *    </script>
 * ------------------------------------------------------------------
 */

/* ---- Core ---- */
export { Editor } from "./core/Editor";
export { Toolbar, getDefaultToolbarItems } from "./core/Toolbar";
export { ContentArea } from "./core/ContentArea";
export { SourceEditor } from "./core/SourceEditor";
export { FullscreenManager } from "./core/Fullscreen";
export { ICONS } from "./core/icons";

/* ---- Plug-ins ---- */
export { PluginManager } from "./plugins/PluginManager";
export { ImagePlugin } from "./plugins/ImagePlugin";
export { VideoPlugin } from "./plugins/VideoPlugin";
export { LinkPlugin } from "./plugins/LinkPlugin";
export { TablePlugin } from "./plugins/TablePlugin";
export { ListPlugin } from "./plugins/ListPlugin";

/* ---- Utilities ---- */
export { EventEmitter } from "./utils/events";
export { sanitizeHTML } from "./utils/sanitize";
export * from "./utils/dom";

/* ---- Types (re-exported for consumers) ---- */
export type {
  EditorOptions,
  EditorAPI,
  EditorPlugin,
  EditorEventName,
  EditorEventHandler,
  ToolbarAction,
  ToolbarButtonDescriptor,
  ToolbarItem,
} from "./types";

/* ================================================================ */
/*  Factory function                                                  */
/* ================================================================ */

import { Editor } from "./core/Editor";
import { EditorOptions } from "./types";

/**
 * Create a new WYSIWYG editor instance.
 *
 * This is the recommended way to instantiate the editor — it
 * validates the options and returns the public `EditorAPI` interface
 * rather than the concrete class.
 *
 * @param options – configuration (at minimum `container` is required)
 * @returns         the editor API
 *
 * @example
 * ```ts
 * const editor = createEditor({
 *   container: '#editor',
 *   content: '<p>Hello World</p>',
 *   height: '500px',
 *   placeholder: 'Write something…',
 *   imageUploadHandler: async (file) => {
 *     const formData = new FormData();
 *     formData.append('image', file);
 *     const res = await fetch('/api/upload', { method: 'POST', body: formData });
 *     const { url } = await res.json();
 *     return url;
 *   },
 * });
 *
 * // Listen for changes
 * editor.on('change', () => {
 *   console.log(editor.getContent());
 * });
 *
 * // Later: tear down
 * editor.destroy();
 * ```
 */
export function createEditor(options: EditorOptions): Editor {
  /* Validate required options */
  if (!options.container) {
    throw new Error(
      '[WysiwygEditor] "container" option is required. ' +
        "Pass a CSS selector string or an HTMLElement."
    );
  }

  return new Editor(options);
}