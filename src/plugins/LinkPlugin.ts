/**
 * @module plugins/LinkPlugin
 * ------------------------------------------------------------------
 *  Inserts and edits hyperlinks.
 *
 *  Features:
 *    • URL + display text + title attribute
 *    • Open-in-new-tab toggle (adds `target="_blank" rel="noopener"`)
 *    • "Unlink" button when the caret is inside an existing <a>
 * ------------------------------------------------------------------
 */

import { EditorPlugin, EditorAPI } from "../types";
import { createElement } from "../utils/dom";

export class LinkPlugin implements EditorPlugin {
  readonly name = "link";

  private editor!: EditorAPI;

  init(editor: EditorAPI): void {
    this.editor = editor;
    this.editor.on("afterCommand", this.handleCommand);
  }

  destroy(): void {
    this.editor.off("afterCommand", this.handleCommand);
  }

  /* ---------------------------------------------------------------- */
  /*  Command handler                                                  */
  /* ---------------------------------------------------------------- */

  private handleCommand = (data?: unknown): void => {
    const payload = data as { action?: string } | undefined;
    if (!payload || payload.action !== "link") return;
    this.showLinkModal();
  };

  /* ---------------------------------------------------------------- */
  /*  Modal                                                            */
  /* ---------------------------------------------------------------- */

  private showLinkModal(): void {
    this.editor.saveSelection();

    /* Try to detect an existing link at the caret */
    const existingLink = this.getSelectedLink();
    const existingUrl = existingLink?.getAttribute("href") ?? "";
    const existingText = existingLink?.textContent ?? this.getSelectedText();
    const existingTitle = existingLink?.getAttribute("title") ?? "";
    const existingNewTab = existingLink?.getAttribute("target") === "_blank";

    const overlay = createElement("div", {
      className: "we-modal-overlay",
      parent: document.body,
    });

    const modal = createElement("div", {
      className: "we-modal",
      parent: overlay,
      innerHTML: `
        <div class="we-modal__header">
          <h3 class="we-modal__title">${existingLink ? "Edit Link" : "Insert Link"}</h3>
          <button type="button" class="we-modal__close" aria-label="Close">&times;</button>
        </div>

        <div class="we-modal__body">
          <label class="we-modal__label">
            URL
            <input type="url" class="we-modal__input" placeholder="https://…" data-field="url"
              value="${this.esc(existingUrl)}" />
          </label>

          <label class="we-modal__label">
            Display text
            <input type="text" class="we-modal__input" placeholder="Click here" data-field="text"
              value="${this.esc(existingText)}" />
          </label>

          <label class="we-modal__label">
            Title (tooltip)
            <input type="text" class="we-modal__input" placeholder="Optional title" data-field="title"
              value="${this.esc(existingTitle)}" />
          </label>

          <label class="we-modal__label we-modal__label--checkbox">
            <input type="checkbox" data-field="newtab" ${existingNewTab ? "checked" : ""} />
            Open in new tab
          </label>
        </div>

        <div class="we-modal__footer">
          ${
            existingLink
              ? '<button type="button" class="we-modal__btn we-modal__btn--danger" data-action="unlink">Unlink</button>'
              : ""
          }
          <button type="button" class="we-modal__btn we-modal__btn--cancel">Cancel</button>
          <button type="button" class="we-modal__btn we-modal__btn--primary">${
            existingLink ? "Update" : "Insert"
          }</button>
        </div>
      `,
    });

    const close = (): void => overlay.remove();
    modal.querySelector(".we-modal__close")!.addEventListener("click", close);
    modal.querySelector(".we-modal__btn--cancel")!.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    /* Unlink button */
    modal.querySelector('[data-action="unlink"]')?.addEventListener("click", () => {
      this.editor.restoreSelection();
      this.editor.execCommand("unlink");
      this.editor.emit("change", {});
      close();
    });

    /* Insert / Update */
    modal.querySelector(".we-modal__btn--primary")!.addEventListener("click", () => {
      const url = (modal.querySelector<HTMLInputElement>('[data-field="url"]')!).value.trim();
      const text = (modal.querySelector<HTMLInputElement>('[data-field="text"]')!).value || url;
      const title = (modal.querySelector<HTMLInputElement>('[data-field="title"]')!).value;
      const newTab = (modal.querySelector<HTMLInputElement>('[data-field="newtab"]')!).checked;

      if (!url) {
        modal.querySelector<HTMLInputElement>('[data-field="url"]')!.classList.add("we-modal__input--error");
        return;
      }

      const target = newTab ? ' target="_blank" rel="noopener noreferrer"' : "";
      const titleAttr = title ? ` title="${this.esc(title)}"` : "";

      const linkHTML = `<a href="${this.esc(url)}"${titleAttr}${target}>${this.escText(text)}</a>`;

      this.editor.restoreSelection();

      /* Remove old link if editing */
      if (existingLink) {
        const range = document.createRange();
        range.selectNode(existingLink);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }

      this.editor.insertHTML(linkHTML);
      this.editor.emit("change", {});
      close();
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Helpers                                                          */
  /* ---------------------------------------------------------------- */

  /** Walk up from the selection anchor to find an enclosing <a>. */
  private getSelectedLink(): HTMLAnchorElement | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let node: Node | null = sel.anchorNode;
    while (node && node !== this.editor.getContentArea()) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === "A") {
        return node as HTMLAnchorElement;
      }
      node = node.parentNode;
    }
    return null;
  }

  /** Get the currently selected text (for pre-filling display text). */
  private getSelectedText(): string {
    return window.getSelection()?.toString() ?? "";
  }

  private esc(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  private escText(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}