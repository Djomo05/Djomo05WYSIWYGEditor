/**
 * @module plugins/ListPlugin
 * ------------------------------------------------------------------
 *  Enhances list behaviour:
 *    • Proper nested list indentation via Tab / Shift-Tab
 *    • List type toggling (ordered ↔ unordered)
 *
 *  This plug-in mostly augments the browser's built-in list commands
 *  with better keyboard handling.
 * ------------------------------------------------------------------
 */

import { EditorPlugin, EditorAPI } from "../types";

export class ListPlugin implements EditorPlugin {
  readonly name = "list";

  private editor!: EditorAPI;

  init(editor: EditorAPI): void {
    this.editor = editor;
    /* The main keyboard handling for Tab is in ContentArea.
       This plug-in registers for afterCommand to normalise list
       structure after insertions. */
    this.editor.on("afterCommand", this.handleCommand);
  }

  destroy(): void {
    this.editor.off("afterCommand", this.handleCommand);
  }

  private handleCommand = (data?: unknown): void => {
    const payload = data as { action?: string } | undefined;
    if (!payload) return;

    /* After list commands, clean up empty list items the browser
       sometimes leaves behind. */
    if (
      payload.action === "orderedList" ||
      payload.action === "unorderedList"
    ) {
      this.cleanEmptyListItems();
    }
  };

  /**
   * Remove empty `<li>` elements that have no content and no children.
   * Some browsers leave these behind when toggling lists.
   */
  private cleanEmptyListItems(): void {
    const contentArea = this.editor.getContentArea();
    const items = contentArea.querySelectorAll("li");
    items.forEach((li) => {
      if (
        li.innerHTML.trim() === "" ||
        li.innerHTML.trim() === "<br>"
      ) {
        /* Only remove if the list has other items */
        const list = li.parentElement;
        if (list && list.children.length > 1) {
          li.remove();
        }
      }
    });
  }
}