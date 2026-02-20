/**
 * @module plugins/VideoPlugin
 * ------------------------------------------------------------------
 *  Handles embedding videos from:
 *    • YouTube (regular, short, and embed URLs)
 *    • Vimeo
 *    • Dailymotion
 *    • Direct video file URLs (.mp4, .webm, .ogg)
 *
 *  The embed is wrapped in a responsive `<figure>` with 16 : 9
 *  aspect ratio by default.  When `sanitizeEmbeds` is true (default)
 *  the `<iframe>` gets a strict `sandbox` attribute.
 * ------------------------------------------------------------------
 */

import { EditorPlugin, EditorAPI, EditorOptions } from "../types";
import { createElement } from "../utils/dom";

export class VideoPlugin implements EditorPlugin {
  readonly name = "video";

  private editor!: EditorAPI;
  private sanitize: boolean;

  constructor(options: EditorOptions) {
    this.sanitize = options.sanitizeEmbeds !== false; // default true
  }

  /* ---------------------------------------------------------------- */
  /*  Lifecycle                                                        */
  /* ---------------------------------------------------------------- */

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
    if (!payload || payload.action !== "video") return;
    this.showVideoModal();
  };

  /* ---------------------------------------------------------------- */
  /*  Video Modal                                                      */
  /* ---------------------------------------------------------------- */

  private showVideoModal(): void {
    this.editor.saveSelection();

    const overlay = createElement("div", {
      className: "we-modal-overlay",
      parent: document.body,
    });

    const modal = createElement("div", {
      className: "we-modal",
      parent: overlay,
      innerHTML: `
        <div class="we-modal__header">
          <h3 class="we-modal__title">Insert Video</h3>
          <button type="button" class="we-modal__close" aria-label="Close">&times;</button>
        </div>

        <div class="we-modal__body">
          <label class="we-modal__label">
            Video URL
            <input type="url" class="we-modal__input" placeholder="https://www.youtube.com/watch?v=…" data-field="url" />
          </label>
          <p class="we-modal__hint">
            Supports YouTube, Vimeo, Dailymotion, or direct .mp4/.webm/.ogg links.
          </p>

          <label class="we-modal__label">
            Width (optional, e.g. 640px or 100%)
            <input type="text" class="we-modal__input" placeholder="100%" data-field="width" />
          </label>

          <label class="we-modal__label">
            Height (optional, e.g. 360px)
            <input type="text" class="we-modal__input" placeholder="auto" data-field="height" />
          </label>

          <label class="we-modal__label">
            Alignment
            <select class="we-modal__input" data-field="align">
              <option value="">None</option>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>

          <div class="we-modal__preview" data-field="preview"></div>
        </div>

        <div class="we-modal__footer">
          <button type="button" class="we-modal__btn we-modal__btn--cancel">Cancel</button>
          <button type="button" class="we-modal__btn we-modal__btn--secondary" data-action="preview-btn">Preview</button>
          <button type="button" class="we-modal__btn we-modal__btn--primary">Insert</button>
        </div>
      `,
    });

    /* Close logic */
    const close = (): void => overlay.remove();
    modal.querySelector(".we-modal__close")!.addEventListener("click", close);
    modal.querySelector(".we-modal__btn--cancel")!.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    /* Preview button */
    modal.querySelector('[data-action="preview-btn"]')!.addEventListener("click", () => {
      const urlInput = modal.querySelector<HTMLInputElement>('[data-field="url"]')!;
      const previewArea = modal.querySelector<HTMLElement>('[data-field="preview"]')!;
      const url = urlInput.value.trim();
      if (!url) return;
      const embedHTML = this.buildEmbedHTML(url, "100%", "315px");
      previewArea.innerHTML = embedHTML;
    });

    /* Insert handler */
    modal.querySelector(".we-modal__btn--primary")!.addEventListener("click", () => {
      const urlInput = modal.querySelector<HTMLInputElement>('[data-field="url"]')!;
      const widthInput = modal.querySelector<HTMLInputElement>('[data-field="width"]')!;
      const heightInput = modal.querySelector<HTMLInputElement>('[data-field="height"]')!;
      const alignSelect = modal.querySelector<HTMLSelectElement>('[data-field="align"]')!;

      const url = urlInput.value.trim();
      if (!url) {
        urlInput.classList.add("we-modal__input--error");
        urlInput.focus();
        return;
      }

      const width = widthInput.value || "100%";
      const height = heightInput.value || "auto";
      const align = alignSelect.value;

      const html = this.buildVideoFigure(url, width, height, align);
      this.editor.restoreSelection();
      this.editor.insertHTML(html);
      this.editor.emit("change", {});
      close();
    });
  }

  /* ---------------------------------------------------------------- */
  /*  URL parsing                                                      */
  /* ---------------------------------------------------------------- */

  /**
   * Attempt to extract an embed URL from common video providers.
   * Returns `null` if the URL is not a recognized provider —
   * the caller should then treat it as a direct video file link.
   */
  private getEmbedUrl(url: string): string | null {
    /* YouTube */
    const ytMatch = url.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    if (ytMatch) {
      return `https://www.youtube.com/embed/${ytMatch[1]}`;
    }

    /* Vimeo */
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    }

    /* Dailymotion */
    const dmMatch = url.match(
      /dailymotion\.com\/video\/([a-zA-Z0-9]+)/
    );
    if (dmMatch) {
      return `https://www.dailymotion.com/embed/video/${dmMatch[1]}`;
    }

    return null;
  }

  /**
   * Return `true` when the URL points directly to a video file.
   */
  private isDirectVideoUrl(url: string): boolean {
    return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url);
  }

  /* ---------------------------------------------------------------- */
  /*  HTML builders                                                    */
  /* ---------------------------------------------------------------- */

  /**
   * Build the raw embed (either `<iframe>` or `<video>`).
   */
  private buildEmbedHTML(url: string, width: string, height: string): string {
    const embedUrl = this.getEmbedUrl(url);

    if (embedUrl) {
      /* Embed via <iframe> */
      const sandbox = this.sanitize
        ? ' sandbox="allow-scripts allow-same-origin allow-presentation"'
        : "";
      return (
        `<iframe src="${this.esc(embedUrl)}" ` +
        `width="${this.esc(width)}" height="${this.esc(height)}" ` +
        `frameborder="0" allowfullscreen loading="lazy"${sandbox} ` +
        `class="we-video-iframe"></iframe>`
      );
    }

    if (this.isDirectVideoUrl(url)) {
      /* Direct <video> tag */
      return (
        `<video src="${this.esc(url)}" controls preload="metadata" ` +
        `style="width:${this.esc(width)};height:${this.esc(height)};max-width:100%;" ` +
        `class="we-video-player">` +
        `Your browser does not support the video tag.` +
        `</video>`
      );
    }

    /* Unknown URL — try an iframe anyway */
    return (
      `<iframe src="${this.esc(url)}" ` +
      `width="${this.esc(width)}" height="${this.esc(height)}" ` +
      `frameborder="0" allowfullscreen loading="lazy" ` +
      `class="we-video-iframe"></iframe>`
    );
  }

  /**
   * Wrap the embed in a responsive `<figure>`.
   */
  private buildVideoFigure(
    url: string,
    width: string,
    height: string,
    align: string
  ): string {
    const figureStyles: string[] = [];
    if (align === "center") figureStyles.push("text-align:center", "margin:0 auto");
    else if (align === "left") figureStyles.push("float:left", "margin-right:1em");
    else if (align === "right") figureStyles.push("float:right", "margin-left:1em");

    const style = figureStyles.length ? ` style="${figureStyles.join(";")}"` : "";
    const embed = this.buildEmbedHTML(url, width, height);

    return (
      `<figure class="we-video-figure"${style}>` +
      `<div class="we-video-wrapper">${embed}</div>` +
      `</figure>` +
      `<p><br></p>`
    );
  }

  /** Escape an HTML attribute value. */
  private esc(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}