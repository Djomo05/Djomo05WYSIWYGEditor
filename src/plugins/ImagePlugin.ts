/**
 * @module plugins/ImagePlugin
 * ------------------------------------------------------------------
 *  Handles image insertion AND manipulation:
 *    • Insert via toolbar button → URL prompt or file picker
 *    • Drag-and-drop & clipboard paste
 *    • **Resize** — 8 corner/edge handles with aspect-ratio lock
 *    • **Crop**   — visual crop overlay with draggable region
 *    • **Move**   — drag an image to reposition it in the content
 *    • **Align**  — left / center / right (NO float — uses flexbox
 *      on wrapper so text never wraps around the image)
 *    • **Image toolbar** — floating bar with align, crop, delete
 *
 *  Alignment strategy:
 *    Instead of using CSS `float` (which causes text to wrap around
 *    the image), we wrap the <figure> in a block-level <div> with
 *    `display:flex` and `justify-content` set to left/center/right.
 *    This keeps the image on its own visual line and the text always
 *    flows below it — no wrapping, no layout breakage.
 * ------------------------------------------------------------------
 */

import {
  EditorPlugin,
  EditorAPI,
  EditorOptions,
  ResizeHandlePosition,
  ImageManipulationState,
  CropRegion,
} from "../types";
import { createElement, insertHTMLAtCaret } from "../utils/dom";

/* ================================================================ */
/*  Constants                                                        */
/* ================================================================ */

const DEFAULT_MAX_SIZE = 5 * 1024 * 1024;

const DEFAULT_TYPES = [
  "image/jpeg", "image/png", "image/gif",
  "image/webp", "image/svg+xml",
];

const HANDLE_POSITIONS: ResizeHandlePosition[] = [
  "nw", "n", "ne", "w", "e", "sw", "s", "se",
];

const DEFAULT_MIN_SIZE = { width: 30, height: 30 };

/* ================================================================ */
/*  ImagePlugin                                                      */
/* ================================================================ */

export class ImagePlugin implements EditorPlugin {
  readonly name = "image";

  private editor!: EditorAPI;
  private maxSize: number;
  private acceptedTypes: string[];
  private uploadHandler?: (file: File) => Promise<string>;
  private enableManipulation: boolean;
  private minSize: { width: number; height: number };

  /* ---- Manipulation state ---- */
  private state: ImageManipulationState | null = null;
  private overlay: HTMLElement | null = null;
  private imageToolbar: HTMLElement | null = null;
  private cropOverlay: HTMLElement | null = null;

  /* ---- Bound handlers ---- */
  private boundMouseDown = this.onContentMouseDown.bind(this);
  private boundMouseMove = this.onDocumentMouseMove.bind(this);
  private boundMouseUp = this.onDocumentMouseUp.bind(this);
  private boundKeyDown = this.onKeyDown.bind(this);

  constructor(options: EditorOptions) {
    this.maxSize = options.maxImageSize ?? DEFAULT_MAX_SIZE;
    this.acceptedTypes = options.acceptedImageTypes ?? DEFAULT_TYPES;
    this.uploadHandler = options.imageUploadHandler;
    this.enableManipulation = options.enableImageManipulation !== false;
    this.minSize = options.minImageSize ?? DEFAULT_MIN_SIZE;
  }

  /* ================================================================ */
  /*  Lifecycle                                                        */
  /* ================================================================ */

  init(editor: EditorAPI): void {
    this.editor = editor;
    this.editor.on("afterCommand", this.handleCommand);

    if (this.enableManipulation) {
      const contentArea = this.editor.getContentArea();
      contentArea.addEventListener("mousedown", this.boundMouseDown);
      document.addEventListener("mousemove", this.boundMouseMove);
      document.addEventListener("mouseup", this.boundMouseUp);
      document.addEventListener("keydown", this.boundKeyDown);
    }
  }

  destroy(): void {
    this.editor.off("afterCommand", this.handleCommand);
    this.deselectImage();

    if (this.enableManipulation) {
      const contentArea = this.editor.getContentArea();
      contentArea.removeEventListener("mousedown", this.boundMouseDown);
      document.removeEventListener("mousemove", this.boundMouseMove);
      document.removeEventListener("mouseup", this.boundMouseUp);
      document.removeEventListener("keydown", this.boundKeyDown);
    }
  }

  /* ================================================================ */
  /*  Command handler                                                  */
  /* ================================================================ */

  private handleCommand = (data?: unknown): void => {
    const payload = data as { action?: string; file?: File } | undefined;
    if (!payload || payload.action !== "image") return;

    if (payload.file) {
      this.processFile(payload.file);
    } else {
      this.showImageModal();
    }
  };

  /* ================================================================ */
  /*  MOUSE / KEYBOARD HANDLERS                                        */
  /* ================================================================ */

  private onContentMouseDown(e: MouseEvent): void {
    const target = e.target as HTMLElement;

    if (target.classList.contains("we-resize-handle")) {
      e.preventDefault();
      e.stopPropagation();
      const pos = target.getAttribute("data-position") as ResizeHandlePosition;
      if (this.state) this.startResize(pos, e);
      return;
    }

    if (target.classList.contains("we-crop-handle")) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (target.tagName === "IMG" && target.classList.contains("we-image")) {
      e.preventDefault();
      e.stopPropagation();
      this.selectImage(target as HTMLImageElement, e);
      return;
    }

    if (this.state && !this.isInsideImageToolbar(target)) {
      this.deselectImage();
    }
  }

  private onDocumentMouseMove(e: MouseEvent): void {
    if (!this.state) return;

    if (this.state.isResizing) {
      e.preventDefault();
      this.handleResize(e);
    } else if (this.state.isDragging) {
      e.preventDefault();
      this.handleMove(e);
    }
  }

  private onDocumentMouseUp(_e: MouseEvent): void {
    if (!this.state) return;

    if (this.state.isResizing) {
      this.state.isResizing = false;
      this.state.activeHandle = null;
      this.updateOverlay();
      this.editor.emit("change", {});
    }

    if (this.state.isDragging) {
      this.state.isDragging = false;
      this.state.element.classList.remove("we-image--dragging");
      this.updateOverlay();
      this.editor.emit("change", {});
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.state) return;

    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.deleteSelectedImage();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      if (this.state.isCropping) {
        this.cancelCrop();
      } else {
        this.deselectImage();
      }
      return;
    }

    const nudge = e.shiftKey ? 10 : 1;
    const target = this.state.figure ?? this.state.element;

    switch (e.key) {
      case "ArrowLeft":  e.preventDefault(); this.nudgeElement(target, -nudge, 0); break;
      case "ArrowRight": e.preventDefault(); this.nudgeElement(target, nudge, 0); break;
      case "ArrowUp":    e.preventDefault(); this.nudgeElement(target, 0, -nudge); break;
      case "ArrowDown":  e.preventDefault(); this.nudgeElement(target, 0, nudge); break;
    }
  }

  /* ================================================================ */
  /*  SELECT / DESELECT                                                */
  /* ================================================================ */

  private selectImage(img: HTMLImageElement, e: MouseEvent): void {
    this.deselectImage();

    const figure = img.closest(".we-image-figure") as HTMLElement | null;

    this.state = {
      element: img,
      figure,
      isDragging: false,
      isResizing: false,
      isCropping: false,
      activeHandle: null,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: img.offsetWidth,
      startHeight: img.offsetHeight,
      startLeft: 0,
      startTop: 0,
      cropRegion: null,
    };

    img.classList.add("we-image--selected");
    this.createOverlay(img);
    this.createImageToolbar(img);
    img.addEventListener("dblclick", this.startMoveFromDblClick);
  }

  private deselectImage(): void {
    if (!this.state) return;

    this.state.element.classList.remove("we-image--selected");
    this.state.element.classList.remove("we-image--dragging");
    this.state.element.removeEventListener("dblclick", this.startMoveFromDblClick);

    this.removeOverlay();
    this.removeImageToolbar();
    this.removeCropOverlay();
    this.state = null;
  }

  /* ================================================================ */
  /*  RESIZE OVERLAY                                                   */
  /* ================================================================ */

  private createOverlay(img: HTMLImageElement): void {
    this.removeOverlay();

    const rect = img.getBoundingClientRect();
    const contentRect = this.editor.getContentArea().getBoundingClientRect();

    this.overlay = createElement("div", {
      className: "we-image-overlay",
      parent: this.editor.getContentArea(),
    });

    this.positionOverlay(rect, contentRect);

    for (const pos of HANDLE_POSITIONS) {
      createElement("div", {
        className: `we-resize-handle we-resize-handle--${pos}`,
        parent: this.overlay,
        attributes: { "data-position": pos },
      });
    }

    const label = createElement("div", {
      className: "we-image-dimensions",
      parent: this.overlay,
      innerHTML: `${Math.round(img.offsetWidth)} × ${Math.round(img.offsetHeight)}`,
    });
    label.setAttribute("data-role", "dimensions");
  }

  private updateOverlay(): void {
    if (!this.overlay || !this.state) return;

    const img = this.state.element;
    const rect = img.getBoundingClientRect();
    const contentRect = this.editor.getContentArea().getBoundingClientRect();

    this.positionOverlay(rect, contentRect);

    const label = this.overlay.querySelector('[data-role="dimensions"]') as HTMLElement | null;
    if (label) {
      label.innerHTML = `${Math.round(img.offsetWidth)} × ${Math.round(img.offsetHeight)}`;
    }

    this.positionImageToolbar(img);
  }

  private positionOverlay(imgRect: DOMRect, containerRect: DOMRect): void {
    if (!this.overlay) return;
    const ca = this.editor.getContentArea();
    this.overlay.style.left = `${imgRect.left - containerRect.left + ca.scrollLeft}px`;
    this.overlay.style.top = `${imgRect.top - containerRect.top + ca.scrollTop}px`;
    this.overlay.style.width = `${imgRect.width}px`;
    this.overlay.style.height = `${imgRect.height}px`;
  }

  private removeOverlay(): void {
    if (this.overlay) { this.overlay.remove(); this.overlay = null; }
  }

  /* ================================================================ */
  /*  RESIZE                                                           */
  /* ================================================================ */

  private startResize(pos: ResizeHandlePosition, e: MouseEvent): void {
    if (!this.state) return;
    this.state.isResizing = true;
    this.state.activeHandle = pos;
    this.state.startX = e.clientX;
    this.state.startY = e.clientY;
    this.state.startWidth = this.state.element.offsetWidth;
    this.state.startHeight = this.state.element.offsetHeight;
  }

  private handleResize(e: MouseEvent): void {
    if (!this.state || !this.state.activeHandle) return;

    const dx = e.clientX - this.state.startX;
    const dy = e.clientY - this.state.startY;
    const handle = this.state.activeHandle;
    const img = this.state.element;
    const aspect = this.state.startWidth / this.state.startHeight;

    let newW = this.state.startWidth;
    let newH = this.state.startHeight;

    switch (handle) {
      case "e":  newW = this.state.startWidth + dx; break;
      case "w":  newW = this.state.startWidth - dx; break;
      case "s":  newH = this.state.startHeight + dy; break;
      case "n":  newH = this.state.startHeight - dy; break;
      case "se": newW = this.state.startWidth + dx; newH = newW / aspect; break;
      case "sw": newW = this.state.startWidth - dx; newH = newW / aspect; break;
      case "ne": newW = this.state.startWidth + dx; newH = newW / aspect; break;
      case "nw": newW = this.state.startWidth - dx; newH = newW / aspect; break;
    }

    newW = Math.max(this.minSize.width, newW);
    newH = Math.max(this.minSize.height, newH);

    img.style.width = `${Math.round(newW)}px`;
    img.style.height = `${Math.round(newH)}px`;
    img.style.maxWidth = "none";

    this.updateOverlay();
  }

  /* ================================================================ */
  /*  MOVE                                                             */
  /* ================================================================ */

  private startMoveFromDblClick = (e: Event): void => {
    e.preventDefault();
    if (!this.state) return;
    if (this.state.isCropping) { this.applyCrop(); return; }
    this.startMove(e as MouseEvent);
  };

  private startMove(e: MouseEvent): void {
    if (!this.state) return;
    const target = this.state.figure ?? this.state.element;
    this.state.isDragging = true;
    this.state.startX = e.clientX;
    this.state.startY = e.clientY;
    const style = window.getComputedStyle(target);
    this.state.startLeft = parseInt(style.marginLeft, 10) || 0;
    this.state.startTop = parseInt(style.marginTop, 10) || 0;
    this.state.element.classList.add("we-image--dragging");
  }

  private handleMove(e: MouseEvent): void {
    if (!this.state) return;
    const dx = e.clientX - this.state.startX;
    const dy = e.clientY - this.state.startY;
    const target = this.state.figure ?? this.state.element;
    target.style.marginLeft = `${this.state.startLeft + dx}px`;
    target.style.marginTop = `${this.state.startTop + dy}px`;
    target.style.position = "relative";
    this.updateOverlay();
  }

  private nudgeElement(el: HTMLElement, dx: number, dy: number): void {
    const style = window.getComputedStyle(el);
    el.style.marginLeft = `${(parseInt(style.marginLeft, 10) || 0) + dx}px`;
    el.style.marginTop = `${(parseInt(style.marginTop, 10) || 0) + dy}px`;
    el.style.position = "relative";
    this.updateOverlay();
    this.editor.emit("change", {});
  }

  /* ================================================================ */
  /*  CROP                                                             */
  /* ================================================================ */

  private enterCropMode(): void {
    if (!this.state) return;
    this.state.isCropping = true;
    this.removeOverlay();

    const img = this.state.element;
    const imgRect = img.getBoundingClientRect();
    const contentRect = this.editor.getContentArea().getBoundingClientRect();
    const ca = this.editor.getContentArea();

    this.state.cropRegion = { x: 10, y: 10, width: 80, height: 80 };

    this.cropOverlay = createElement("div", {
      className: "we-crop-overlay",
      parent: ca,
    });

    this.cropOverlay.style.left = `${imgRect.left - contentRect.left + ca.scrollLeft}px`;
    this.cropOverlay.style.top = `${imgRect.top - contentRect.top + ca.scrollTop}px`;
    this.cropOverlay.style.width = `${imgRect.width}px`;
    this.cropOverlay.style.height = `${imgRect.height}px`;

    this.cropOverlay.innerHTML = `
      <div class="we-crop-mask"></div>
      <div class="we-crop-region"
           style="left:${this.state.cropRegion.x}%;top:${this.state.cropRegion.y}%;width:${this.state.cropRegion.width}%;height:${this.state.cropRegion.height}%">
        <div class="we-crop-handle we-crop-handle--nw" data-crop-handle="nw"></div>
        <div class="we-crop-handle we-crop-handle--ne" data-crop-handle="ne"></div>
        <div class="we-crop-handle we-crop-handle--sw" data-crop-handle="sw"></div>
        <div class="we-crop-handle we-crop-handle--se" data-crop-handle="se"></div>
        <div class="we-crop-grid">
          <div class="we-crop-grid__line we-crop-grid__line--h1"></div>
          <div class="we-crop-grid__line we-crop-grid__line--h2"></div>
          <div class="we-crop-grid__line we-crop-grid__line--v1"></div>
          <div class="we-crop-grid__line we-crop-grid__line--v2"></div>
        </div>
      </div>
      <div class="we-crop-actions">
        <button type="button" class="we-crop-btn we-crop-btn--apply" title="Apply Crop">✓ Apply</button>
        <button type="button" class="we-crop-btn we-crop-btn--cancel" title="Cancel Crop">✕ Cancel</button>
      </div>
    `;

    const region = this.cropOverlay.querySelector(".we-crop-region") as HTMLElement;
    this.makeCropRegionDraggable(region);
    this.makeCropHandlesDraggable();

    this.cropOverlay.querySelector(".we-crop-btn--apply")!.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation(); this.applyCrop();
    });
    this.cropOverlay.querySelector(".we-crop-btn--cancel")!.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation(); this.cancelCrop();
    });
  }

  private makeCropRegionDraggable(region: HTMLElement): void {
    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    region.addEventListener("mousedown", (e: MouseEvent) => {
      if ((e.target as HTMLElement).classList.contains("we-crop-handle")) return;
      e.preventDefault(); e.stopPropagation();
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      startLeft = parseFloat(region.style.left) || 0;
      startTop = parseFloat(region.style.top) || 0;
    });

    const onMove = (e: MouseEvent): void => {
      if (!dragging || !this.cropOverlay || !this.state) return;
      e.preventDefault();
      const oW = this.cropOverlay.offsetWidth;
      const oH = this.cropOverlay.offsetHeight;
      const rW = parseFloat(region.style.width) || 80;
      const rH = parseFloat(region.style.height) || 80;
      let nL = startLeft + ((e.clientX - startX) / oW) * 100;
      let nT = startTop + ((e.clientY - startY) / oH) * 100;
      nL = Math.max(0, Math.min(100 - rW, nL));
      nT = Math.max(0, Math.min(100 - rH, nT));
      region.style.left = `${nL}%`;
      region.style.top = `${nT}%`;
      if (this.state.cropRegion) { this.state.cropRegion.x = nL; this.state.cropRegion.y = nT; }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", () => { dragging = false; });
  }

  private makeCropHandlesDraggable(): void {
    if (!this.cropOverlay) return;

    this.cropOverlay.querySelectorAll<HTMLElement>(".we-crop-handle").forEach((handle) => {
      let dragging = false;
      let startX = 0, startY = 0;
      let orig: CropRegion = { x: 0, y: 0, width: 0, height: 0 };

      handle.addEventListener("mousedown", (e: MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        dragging = true; startX = e.clientX; startY = e.clientY;
        if (this.state?.cropRegion) orig = { ...this.state.cropRegion };
      });

      const onMove = (e: MouseEvent): void => {
        if (!dragging || !this.cropOverlay || !this.state?.cropRegion) return;
        e.preventDefault();
        const oW = this.cropOverlay.offsetWidth;
        const oH = this.cropOverlay.offsetHeight;
        const dxP = ((e.clientX - startX) / oW) * 100;
        const dyP = ((e.clientY - startY) / oH) * 100;
        const pos = handle.getAttribute("data-crop-handle");
        const r = this.state.cropRegion;
        const el = this.cropOverlay.querySelector(".we-crop-region") as HTMLElement;
        const min = 10;

        switch (pos) {
          case "se":
            r.width = Math.max(min, Math.min(100 - orig.x, orig.width + dxP));
            r.height = Math.max(min, Math.min(100 - orig.y, orig.height + dyP));
            break;
          case "sw":
            r.x = Math.max(0, Math.min(orig.x + orig.width - min, orig.x + dxP));
            r.width = Math.max(min, orig.width - (r.x - orig.x));
            r.height = Math.max(min, Math.min(100 - orig.y, orig.height + dyP));
            break;
          case "ne":
            r.width = Math.max(min, Math.min(100 - orig.x, orig.width + dxP));
            r.y = Math.max(0, Math.min(orig.y + orig.height - min, orig.y + dyP));
            r.height = Math.max(min, orig.height - (r.y - orig.y));
            break;
          case "nw":
            r.x = Math.max(0, Math.min(orig.x + orig.width - min, orig.x + dxP));
            r.width = Math.max(min, orig.width - (r.x - orig.x));
            r.y = Math.max(0, Math.min(orig.y + orig.height - min, orig.y + dyP));
            r.height = Math.max(min, orig.height - (r.y - orig.y));
            break;
        }

        if (el) {
          el.style.left = `${r.x}%`; el.style.top = `${r.y}%`;
          el.style.width = `${r.width}%`; el.style.height = `${r.height}%`;
        }
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", () => { dragging = false; });
    });
  }

  private applyCrop(): void {
    if (!this.state || !this.state.cropRegion) return;
    const img = this.state.element;
    const crop = this.state.cropRegion;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) { this.cancelCrop(); return; }

    const nW = img.naturalWidth, nH = img.naturalHeight;
    const sx = (crop.x / 100) * nW, sy = (crop.y / 100) * nH;
    const sw = (crop.width / 100) * nW, sh = (crop.height / 100) * nH;
    canvas.width = sw; canvas.height = sh;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    try {
      img.src = canvas.toDataURL("image/png");
      img.style.width = `${Math.round(img.offsetWidth * (crop.width / 100))}px`;
      img.style.height = "auto";
      img.removeAttribute("width"); img.removeAttribute("height");
    } catch (err) {
      console.warn("[WysiwygEditor] Cannot crop (cross-origin).", err);
      alert("Cannot crop this image due to cross-origin restrictions.");
    }

    this.state.isCropping = false;
    this.state.cropRegion = null;
    this.removeCropOverlay();
    this.createOverlay(img);
    this.editor.emit("change", {});
  }

  private cancelCrop(): void {
    if (!this.state) return;
    this.state.isCropping = false;
    this.state.cropRegion = null;
    this.removeCropOverlay();
    this.createOverlay(this.state.element);
  }

  private removeCropOverlay(): void {
    if (this.cropOverlay) { this.cropOverlay.remove(); this.cropOverlay = null; }
  }

  /* ================================================================ */
  /*  FLOATING IMAGE TOOLBAR                                           */
  /* ================================================================ */

  private createImageToolbar(img: HTMLImageElement): void {
    this.removeImageToolbar();

    this.imageToolbar = createElement("div", {
      className: "we-image-toolbar",
      parent: this.editor.getContentArea(),
      innerHTML: `
        <button type="button" class="we-image-toolbar__btn" data-img-action="align-left" title="Align Left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/>
            <line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/>
          </svg>
        </button>
        <button type="button" class="we-image-toolbar__btn" data-img-action="align-center" title="Align Center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/>
            <line x1="21" y1="14" x2="3" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/>
          </svg>
        </button>
        <button type="button" class="we-image-toolbar__btn" data-img-action="align-right" title="Align Right">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/>
            <line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/>
          </svg>
        </button>
        <span class="we-image-toolbar__sep"></span>
        <button type="button" class="we-image-toolbar__btn" data-img-action="crop" title="Crop Image">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>
          </svg>
        </button>
        <button type="button" class="we-image-toolbar__btn" data-img-action="reset" title="Reset Size & Position">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
        </button>
        <button type="button" class="we-image-toolbar__btn we-image-toolbar__btn--danger" data-img-action="delete" title="Delete Image">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      `,
    });

    this.positionImageToolbar(img);

    this.imageToolbar.addEventListener("mousedown", (e) => {
      e.preventDefault(); e.stopPropagation();
      const btn = (e.target as HTMLElement).closest("[data-img-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-img-action");
      switch (action) {
        case "align-left":   this.alignImage("left"); break;
        case "align-center": this.alignImage("center"); break;
        case "align-right":  this.alignImage("right"); break;
        case "crop":         this.enterCropMode(); break;
        case "reset":        this.resetImageSize(); break;
        case "delete":       this.deleteSelectedImage(); break;
      }
    });
  }

  private positionImageToolbar(img: HTMLImageElement): void {
    if (!this.imageToolbar) return;
    const imgRect = img.getBoundingClientRect();
    const contentRect = this.editor.getContentArea().getBoundingClientRect();
    const ca = this.editor.getContentArea();
    const top = imgRect.top - contentRect.top + ca.scrollTop - 44;
    const left = imgRect.left - contentRect.left + ca.scrollLeft + imgRect.width / 2;
    this.imageToolbar.style.top = `${Math.max(0, top)}px`;
    this.imageToolbar.style.left = `${left}px`;
    this.imageToolbar.style.transform = "translateX(-50%)";
  }

  private removeImageToolbar(): void {
    if (this.imageToolbar) { this.imageToolbar.remove(); this.imageToolbar = null; }
  }

  private isInsideImageToolbar(el: HTMLElement): boolean {
    return !!this.imageToolbar?.contains(el);
  }

  /* ================================================================ */
  /*  ALIGN / RESET / DELETE                                           */
  /* ================================================================ */

  /**
   * Align the image WITHOUT using CSS float.
   *
   * Instead we find or create a wrapper <div class="we-image-wrapper">
   * around the <figure> and use `display:flex` + `justify-content`
   * to position the image. This guarantees:
   *
   *   1. Text NEVER wraps beside the image (the wrapper is a full-
   *      width block element).
   *   2. Toggling alignment doesn't accumulate margins or push
   *      content down.
   *   3. The approach is clean, predictable, and works in all
   *      browsers.
   */
  private alignImage(align: "left" | "center" | "right"): void {
    if (!this.state) return;

    const figure = this.state.figure;
    const img = this.state.element;

    /* The element we wrap or operate on */
    const target = figure ?? img;

    /* ---- Step 1: Find or create the wrapper div ---- */
    let wrapper = target.parentElement;

    if (!wrapper || !wrapper.classList.contains("we-image-wrapper")) {
      /* Create a new wrapper and insert it where the target currently is */
      wrapper = document.createElement("div");
      wrapper.className = "we-image-wrapper";
      target.parentNode?.insertBefore(wrapper, target);
      wrapper.appendChild(target);
    }

    /* ---- Step 2: Reset ALL styles on wrapper, figure, and img ---- */
    wrapper.style.display = "flex";
    wrapper.style.width = "100%";
    wrapper.style.justifyContent = "flex-start"; /* default */
    wrapper.style.marginTop = "";
    wrapper.style.marginBottom = "0.5em";

    /* Clear float and margin on the target itself */
    target.style.float = "none";
    target.style.display = "";
    target.style.marginLeft = "";
    target.style.marginRight = "";
    target.style.marginBottom = "";
    target.style.textAlign = "";

    /* Clear on the img too */
    img.style.display = "";
    img.style.marginLeft = "";
    img.style.marginRight = "";

    /* ---- Step 3: Apply alignment via justify-content ---- */
    switch (align) {
      case "left":
        wrapper.style.justifyContent = "flex-start";
        break;
      case "center":
        wrapper.style.justifyContent = "center";
        break;
      case "right":
        wrapper.style.justifyContent = "flex-end";
        break;
    }

    wrapper.setAttribute("data-align", align);

    /* ---- Step 4: Refresh overlay after reflow ---- */
    requestAnimationFrame(() => {
      this.updateOverlay();
    });

    this.editor.emit("change", {});
  }

  /**
   * Reset image to natural size and remove all alignment / position.
   */
  private resetImageSize(): void {
    if (!this.state) return;
    const img = this.state.element;
    const target = this.state.figure ?? img;

    /* Clear size */
    img.style.width = "";
    img.style.height = "";
    img.style.maxWidth = "100%";
    img.removeAttribute("width");
    img.removeAttribute("height");

    /* Clear all inline styles on target */
    target.style.float = "none";
    target.style.display = "";
    target.style.marginLeft = "";
    target.style.marginRight = "";
    target.style.marginTop = "";
    target.style.marginBottom = "";
    target.style.position = "";
    target.style.textAlign = "";
    target.removeAttribute("data-align");

    img.style.display = "";
    img.style.marginLeft = "";
    img.style.marginRight = "";

    /* If there's a wrapper, unwrap the figure/img out of it */
    const wrapper = target.parentElement;
    if (wrapper && wrapper.classList.contains("we-image-wrapper")) {
      wrapper.parentNode?.insertBefore(target, wrapper);
      wrapper.remove();
    }

    requestAnimationFrame(() => {
      this.updateOverlay();
    });

    this.editor.emit("change", {});
  }

  /** Delete the selected image from the content. */
  private deleteSelectedImage(): void {
    if (!this.state) return;
    const figure = this.state.figure;
    const img = this.state.element;
    const target = figure ?? img;

    /* Also remove the wrapper if it exists */
    const wrapper = target.parentElement;

    this.deselectImage();

    if (wrapper && wrapper.classList.contains("we-image-wrapper")) {
      wrapper.remove();
    } else {
      target.remove();
    }

    this.editor.emit("change", {});
  }

  /* ================================================================ */
  /*  IMAGE INSERTION MODAL                                            */
  /* ================================================================ */

  private showImageModal(): void {
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
          <h3 class="we-modal__title">Insert Image</h3>
          <button type="button" class="we-modal__close" aria-label="Close">&times;</button>
        </div>
        <div class="we-modal__body">
          <div class="we-modal__tabs">
            <button type="button" class="we-modal__tab we-modal__tab--active" data-tab="url">Image URL</button>
            <button type="button" class="we-modal__tab" data-tab="upload">Upload</button>
          </div>
          <div class="we-modal__tab-content" data-tab-content="url">
            <label class="we-modal__label">
              Image URL
              <input type="url" class="we-modal__input" placeholder="https://example.com/photo.jpg" data-field="url" />
            </label>
          </div>
          <div class="we-modal__tab-content we-modal__tab-content--hidden" data-tab-content="upload">
            <label class="we-modal__label">
              Choose file
              <input type="file" class="we-modal__input" accept="${this.acceptedTypes.join(",")}" data-field="file" />
            </label>
            <div class="we-modal__preview" data-field="preview"></div>
          </div>
          <label class="we-modal__label">
            Alt text (accessibility)
            <input type="text" class="we-modal__input" placeholder="Describe the image" data-field="alt" />
          </label>
          <label class="we-modal__label">
            Caption (optional)
            <input type="text" class="we-modal__input" placeholder="Image caption" data-field="caption" />
          </label>
          <label class="we-modal__label">
            Width (optional, e.g. 400px or 100%)
            <input type="text" class="we-modal__input" placeholder="auto" data-field="width" />
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
        </div>
        <div class="we-modal__footer">
          <button type="button" class="we-modal__btn we-modal__btn--cancel">Cancel</button>
          <button type="button" class="we-modal__btn we-modal__btn--primary">Insert</button>
        </div>
      `,
    });

    /* Tab switching */
    const tabs = modal.querySelectorAll<HTMLButtonElement>(".we-modal__tab");
    const tabContents = modal.querySelectorAll<HTMLElement>(".we-modal__tab-content");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("we-modal__tab--active"));
        tab.classList.add("we-modal__tab--active");
        const tgt = tab.getAttribute("data-tab")!;
        tabContents.forEach((tc) => {
          tc.classList.toggle("we-modal__tab-content--hidden", tc.getAttribute("data-tab-content") !== tgt);
        });
      });
    });

    /* File preview */
    const fileInput = modal.querySelector<HTMLInputElement>('[data-field="file"]')!;
    const previewArea = modal.querySelector<HTMLElement>('[data-field="preview"]')!;
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          previewArea.innerHTML = `<img src="${reader.result as string}" style="max-width:100%;max-height:200px;" alt="Preview" />`;
        };
        reader.readAsDataURL(file);
      }
    });

    /* Close */
    const close = (): void => overlay.remove();
    modal.querySelector(".we-modal__close")!.addEventListener("click", close);
    modal.querySelector(".we-modal__btn--cancel")!.addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    /* Insert */
    modal.querySelector(".we-modal__btn--primary")!.addEventListener("click", async () => {
      const urlInput = modal.querySelector<HTMLInputElement>('[data-field="url"]')!;
      const altInput = modal.querySelector<HTMLInputElement>('[data-field="alt"]')!;
      const captionInput = modal.querySelector<HTMLInputElement>('[data-field="caption"]')!;
      const widthInput = modal.querySelector<HTMLInputElement>('[data-field="width"]')!;
      const alignSelect = modal.querySelector<HTMLSelectElement>('[data-field="align"]')!;

      const alt = altInput.value || "Image";
      const caption = captionInput.value;
      const width = widthInput.value;
      const align = alignSelect.value;
      let src = urlInput.value.trim();

      const file = fileInput.files?.[0];
      if (file && !src) src = await this.fileToSrc(file);

      if (!src) {
        urlInput.focus();
        urlInput.classList.add("we-modal__input--error");
        return;
      }

      const html = this.buildImageHTML(src, alt, caption, width, align);
      this.editor.restoreSelection();
      this.editor.insertHTML(html);
      this.editor.emit("change", {});
      close();
    });
  }

  /* ================================================================ */
  /*  File processing                                                  */
  /* ================================================================ */

  private async fileToSrc(file: File): Promise<string> {
    if (file.size > this.maxSize) {
      alert(`Image too large. Max: ${(this.maxSize / 1024 / 1024).toFixed(1)} MB.`);
      return "";
    }
    if (!this.acceptedTypes.includes(file.type)) {
      alert(`Unsupported format. Accepted: ${this.acceptedTypes.join(", ")}`);
      return "";
    }
    if (this.uploadHandler) {
      try { return await this.uploadHandler(file); }
      catch (err) { console.error("[WysiwygEditor] Upload failed:", err); alert("Upload failed."); return ""; }
    }
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => { alert("Failed to read file."); resolve(""); };
      reader.readAsDataURL(file);
    });
  }

  private async processFile(file: File): Promise<void> {
    const src = await this.fileToSrc(file);
    if (src) {
      this.editor.insertHTML(this.buildImageHTML(src, "Image", "", "", ""));
      this.editor.emit("change", {});
    }
  }

  /* ================================================================ */
  /*  HTML builder                                                     */
  /* ================================================================ */

  /**
   * Build the HTML for an inserted image.
   *
   * When alignment is specified, the <figure> is wrapped in a
   * <div class="we-image-wrapper"> with flexbox alignment.
   * This ensures text ALWAYS stays below the image.
   */
  private buildImageHTML(
    src: string, alt: string, caption: string,
    width: string, align: string
  ): string {
    const imgStyles = ["max-width:100%", "height:auto", "cursor:pointer"];
    if (width) imgStyles.push(`width:${width}`);
    const imgStyle = ` style="${imgStyles.join(";")}"`;

    const captionHTML = caption
      ? `<figcaption class="we-image-caption">${this.escapeHTML(caption)}</figcaption>`
      : "";

    const figure =
      `<figure class="we-image-figure">` +
      `<img src="${this.escapeAttr(src)}" alt="${this.escapeAttr(alt)}"${imgStyle} class="we-image" />` +
      captionHTML +
      `</figure>`;

    /* If alignment is specified, wrap in a flex container */
    if (align) {
      let justify = "flex-start";
      if (align === "center") justify = "center";
      if (align === "right") justify = "flex-end";

      return (
        `<div class="we-image-wrapper" data-align="${align}" ` +
        `style="display:flex;width:100%;justify-content:${justify};margin-bottom:0.5em">` +
        figure +
        `</div>` +
        `<p><br></p>`
      );
    }

    /* No alignment — insert figure directly */
    return figure + `<p><br></p>`;
  }

  /* ================================================================ */
  /*  Escaping helpers                                                 */
  /* ================================================================ */

  private escapeHTML(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  private escapeAttr(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}