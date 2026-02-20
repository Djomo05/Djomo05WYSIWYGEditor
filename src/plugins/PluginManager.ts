/**
 * @module plugins/PluginManager
 * ------------------------------------------------------------------
 *  Registers, initialises, and destroys plug-ins.
 *
 *  Built-in plug-ins (Image, Video, Link, Table, List) are auto-
 *  registered unless their name appears in `options.disablePlugins`.
 * ------------------------------------------------------------------
 */

import { EditorPlugin, EditorAPI, EditorOptions } from "../types";
import { ImagePlugin } from "./ImagePlugin";
import { VideoPlugin } from "./VideoPlugin";
import { LinkPlugin } from "./LinkPlugin";
import { TablePlugin } from "./TablePlugin";
import { ListPlugin } from "./ListPlugin";

export class PluginManager {
  /** All registered plug-ins, keyed by name. */
  private plugins: Map<string, EditorPlugin> = new Map();

  /** The editor API reference passed to every plug-in. */
  private editor: EditorAPI;

  constructor(editor: EditorAPI, options: EditorOptions) {
    this.editor = editor;

    const disabled = new Set(options.disablePlugins ?? []);

    /* ---- Register built-in plug-ins ---- */
    const builtins: EditorPlugin[] = [
      new ImagePlugin(options),
      new VideoPlugin(options),
      new LinkPlugin(),
      new TablePlugin(),
      new ListPlugin(),
    ];

    for (const plugin of builtins) {
      if (!disabled.has(plugin.name)) {
        this.register(plugin);
      }
    }

    /* ---- Register user-supplied plug-ins ---- */
    if (options.plugins) {
      for (const plugin of options.plugins) {
        this.register(plugin);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Registration                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Register a plug-in and immediately initialise it.
   */
  register(plugin: EditorPlugin): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(
        `[WysiwygEditor] Plug-in "${plugin.name}" is already registered.`
      );
      return;
    }

    this.plugins.set(plugin.name, plugin);
    plugin.init(this.editor);
  }

  /* ---------------------------------------------------------------- */
  /*  Queries                                                          */
  /* ---------------------------------------------------------------- */

  /** Get a plug-in by name, with optional type narrowing. */
  get<T extends EditorPlugin>(name: string): T | undefined {
    return this.plugins.get(name) as T | undefined;
  }

  /** Return all registered plug-in names. */
  list(): string[] {
    return Array.from(this.plugins.keys());
  }

  /* ---------------------------------------------------------------- */
  /*  Lifecycle                                                        */
  /* ---------------------------------------------------------------- */

  /** Destroy every registered plug-in. */
  destroyAll(): void {
    this.plugins.forEach((plugin) => {
      try {
        plugin.destroy();
      } catch (err) {
        console.error(
          `[WysiwygEditor] Error destroying plug-in "${plugin.name}":`,
          err
        );
      }
    });
    this.plugins.clear();
  }
}