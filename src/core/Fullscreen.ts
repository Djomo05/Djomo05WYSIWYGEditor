/**
 * @module core/Fullscreen
 * ------------------------------------------------------------------
 *  Manages fullscreen toggling for the editor.
 *
 *  Strategy:
 *    1. Add a CSS class to the editor root that makes it `position:
 *       fixed; inset: 0; z-index: 99999`.
 *    2. Optionally request the real Fullscreen API so the browser
 *       chrome disappears too.
 *    3. On exit, reverse both steps.
 *
 *  This approach never moves the element in the DOM, so event
 *  listeners, React refs, Vue bindings, etc. keep working.
 * ------------------------------------------------------------------
 */

import { EditorAPI } from "../types";

/** CSS class applied to the root container in fullscreen mode. */
const FS_CLASS = "we-editor--fullscreen";

/** CSS class applied to `<body>` to prevent background scrolling. */
const BODY_CLASS = "we-body--editor-fullscreen";

export class FullscreenManager {
  private editor: EditorAPI;
  private active = false;

  /** Bound handler so we can add/remove it. */
  private onKeyDown = (e: KeyboardEvent): void => {
    /* Escape exits fullscreen */
    if (e.key === "Escape" && this.active) {
      e.preventDefault();
      this.toggle();
    }
  };

  constructor(editor: EditorAPI) {
    this.editor = editor;
  }

  /* ---------------------------------------------------------------- */
  /*  Toggle                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Toggle between normal and fullscreen mode.
   *
   * @returns the new state (`true` = fullscreen is now ON)
   */
  toggle(): boolean {
    this.active = !this.active;
    const container = this.editor.getContainer();

    if (this.active) {
      /* ---- Enter fullscreen ---- */
      container.classList.add(FS_CLASS);
      document.body.classList.add(BODY_CLASS);
      document.addEventListener("keydown", this.onKeyDown);

      /* Try the real Fullscreen API (may fail on some mobile browsers) */
      if (container.requestFullscreen) {
        container.requestFullscreen().catch(() => {
          /* Silently fall back to CSS-only fullscreen */
        });
      }
    } else {
      /* ---- Exit fullscreen ---- */
      container.classList.remove(FS_CLASS);
      document.body.classList.remove(BODY_CLASS);
      document.removeEventListener("keydown", this.onKeyDown);

      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {
          /* Ignore — we already removed the CSS class */
        });
      }
    }

    this.editor.emit("fullscreenChange", { fullscreen: this.active });
    return this.active;
  }

  /** Query the current state. */
  isActive(): boolean {
    return this.active;
  }

  /** Clean up on destroy. */
  destroy(): void {
    if (this.active) {
      this.toggle(); // exit fullscreen gracefully
    }
    document.removeEventListener("keydown", this.onKeyDown);
  }
}