/**
 * @module plugins/TablePlugin
 * ------------------------------------------------------------------
 *  Full-featured table plugin:
 *
 *    INSERT:
 *      • Configurable rows × columns via modal
 *      • Header row toggle
 *      • Border style, width, colour
 *      • Cell padding, background colour
 *      • Table width (px, %, auto)
 *      • Table alignment (left, center, right)
 *
 *    EDIT (right-click context menu on any cell):
 *      • Insert row above / below
 *      • Insert column left / right
 *      • Delete row
 *      • Delete column
 *      • Merge selected cells (horizontal)
 *      • Split merged cell
 *      • Toggle header row
 *      • Cell properties (bg colour, text align, padding)
 *      • Table properties (border, width, alignment)
 *      • Delete entire table
 *
 *    INTERACTION:
 *      • Tab key moves between cells
 *      • Click to select a cell (highlighted)
 *      • Double-click to edit cell content
 * ------------------------------------------------------------------
 */

import { EditorPlugin, EditorAPI } from "../types";
import { createElement } from "../utils/dom";

/* ================================================================ */
/*  Types                                                            */
/* ================================================================ */

interface TableConfig {
  rows: number;
  cols: number;
  hasHeader: boolean;
  borderWidth: number;
  borderColor: string;
  borderStyle: string;
  cellPadding: number;
  tableWidth: string;
  tableAlign: string;
  headerBg: string;
  cellBg: string;
  stripedRows: boolean;
}

const DEFAULT_CONFIG: TableConfig = {
  rows: 3,
  cols: 3,
  hasHeader: true,
  borderWidth: 1,
  borderColor: "#d1d5db",
  borderStyle: "solid",
  cellPadding: 8,
  tableWidth: "100%",
  tableAlign: "left",
  headerBg: "#f3f4f6",
  cellBg: "#ffffff",
  stripedRows: false,
};

/* ================================================================ */
/*  Plugin                                                           */
/* ================================================================ */

export class TablePlugin implements EditorPlugin {
  readonly name = "table";

  private editor!: EditorAPI;
  private contextMenu: HTMLElement | null = null;
  private selectedCell: HTMLTableCellElement | null = null;
  private boundContextMenu = this.onContextMenu.bind(this);
  private boundClick = this.onContentClick.bind(this);
  private boundKeyDown = this.onKeyDown.bind(this);
  private boundDocClick = this.onDocumentClick.bind(this);

  init(editor: EditorAPI): void {
    this.editor = editor;
    this.editor.on("afterCommand", this.handleCommand);

    const ca = this.editor.getContentArea();
    ca.addEventListener("contextmenu", this.boundContextMenu);
    ca.addEventListener("click", this.boundClick);
    ca.addEventListener("keydown", this.boundKeyDown);
    document.addEventListener("mousedown", this.boundDocClick);
  }

  destroy(): void {
    this.editor.off("afterCommand", this.handleCommand);
    this.closeContextMenu();

    const ca = this.editor.getContentArea();
    ca.removeEventListener("contextmenu", this.boundContextMenu);
    ca.removeEventListener("click", this.boundClick);
    ca.removeEventListener("keydown", this.boundKeyDown);
    document.removeEventListener("mousedown", this.boundDocClick);
  }

  /* ================================================================ */
  /*  Command handler                                                  */
  /* ================================================================ */

  private handleCommand = (data?: unknown): void => {
    const payload = data as { action?: string } | undefined;
    if (payload?.action === "table") {
      this.showInsertModal();
    }
  };

  /* ================================================================ */
  /*  CONTENT EVENT HANDLERS                                           */
  /* ================================================================ */

  /**
   * Right-click on a table cell → show context menu.
   */
  private onContextMenu(e: MouseEvent): void {
    const cell = (e.target as HTMLElement).closest("td, th") as HTMLTableCellElement | null;
    if (!cell) return;

    const table = cell.closest("table.we-table");
    if (!table) return;

    e.preventDefault();
    e.stopPropagation();

    this.selectCell(cell);
    this.showContextMenu(e.clientX, e.clientY, cell);
  }

  /**
   * Click on a table cell → select it visually.
   */
  private onContentClick(e: MouseEvent): void {
    const cell = (e.target as HTMLElement).closest("td, th") as HTMLTableCellElement | null;

    if (cell && cell.closest("table.we-table")) {
      this.selectCell(cell);
    } else {
      this.deselectCell();
    }
  }

  /**
   * Tab key navigation between cells.
   */
  private onKeyDown(e: KeyboardEvent): void {
    if (e.key !== "Tab") return;

    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return;

    const cell = (sel.anchorNode as HTMLElement).closest?.("td, th")
      || (sel.anchorNode.parentElement as HTMLElement)?.closest?.("td, th");

    if (!cell || !cell.closest("table.we-table")) return;

    e.preventDefault();

    const table = cell.closest("table.we-table") as HTMLTableElement;
    const allCells = Array.from(table.querySelectorAll("td, th"));
    const idx = allCells.indexOf(cell as HTMLTableCellElement);

    if (e.shiftKey) {
      /* Move to previous cell */
      if (idx > 0) {
        this.focusCell(allCells[idx - 1] as HTMLTableCellElement);
      }
    } else {
      /* Move to next cell, or create new row at end */
      if (idx < allCells.length - 1) {
        this.focusCell(allCells[idx + 1] as HTMLTableCellElement);
      } else {
        /* At last cell — add a new row */
        this.insertRowBelow(cell as HTMLTableCellElement);
        const newCells = Array.from(table.querySelectorAll("td, th"));
        this.focusCell(newCells[newCells.length - table.rows[0].cells.length] as HTMLTableCellElement);
      }
    }
  }

  /**
   * Close context menu when clicking outside it.
   */
  private onDocumentClick(e: MouseEvent): void {
    if (this.contextMenu && !this.contextMenu.contains(e.target as Node)) {
      this.closeContextMenu();
    }
  }

  /* ================================================================ */
  /*  CELL SELECTION                                                   */
  /* ================================================================ */

  private selectCell(cell: HTMLTableCellElement): void {
    this.deselectCell();
    this.selectedCell = cell;
    cell.classList.add("we-table__cell--selected");
  }

  private deselectCell(): void {
    if (this.selectedCell) {
      this.selectedCell.classList.remove("we-table__cell--selected");
      this.selectedCell = null;
    }
    /* Also clear any other selected cells */
    this.editor.getContentArea()
      .querySelectorAll(".we-table__cell--selected")
      .forEach((c) => c.classList.remove("we-table__cell--selected"));
  }

  private focusCell(cell: HTMLTableCellElement): void {
    this.selectCell(cell);
    cell.focus();
    /* Place cursor at end of cell content */
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  /* ================================================================ */
  /*  CONTEXT MENU                                                     */
  /* ================================================================ */

  private showContextMenu(x: number, y: number, cell: HTMLTableCellElement): void {
    this.closeContextMenu();

    const table = cell.closest("table.we-table") as HTMLTableElement;
    const row = cell.parentElement as HTMLTableRowElement;
    const isHeader = cell.tagName === "TH";
    const isMerged = (cell.colSpan > 1 || cell.rowSpan > 1);
    const totalRows = table.rows.length;
    const totalCols = table.rows[0]?.cells.length ?? 0;

    this.contextMenu = createElement("div", {
      className: "we-table-context-menu",
      parent: document.body,
    });

    const items: Array<{ label: string; icon: string; action: () => void; danger?: boolean; divider?: boolean; disabled?: boolean }> = [
      {
        label: "Insert Row Above",
        icon: "↑",
        action: () => this.insertRowAbove(cell),
      },
      {
        label: "Insert Row Below",
        icon: "↓",
        action: () => this.insertRowBelow(cell),
      },
      {
        label: "Insert Column Left",
        icon: "←",
        action: () => this.insertColumnLeft(cell),
      },
      {
        label: "Insert Column Right",
        icon: "→",
        action: () => this.insertColumnRight(cell),
      },
      {
        label: "",
        icon: "",
        action: () => {},
        divider: true,
      },
      {
        label: "Delete Row",
        icon: "⊖",
        action: () => this.deleteRow(cell),
        disabled: totalRows <= 1,
      },
      {
        label: "Delete Column",
        icon: "⊘",
        action: () => this.deleteColumn(cell),
        disabled: totalCols <= 1,
      },
      {
        label: "",
        icon: "",
        action: () => {},
        divider: true,
      },
      {
        label: isMerged ? "Split Cell" : "Merge Right",
        icon: isMerged ? "◫" : "⊞",
        action: () => isMerged ? this.splitCell(cell) : this.mergeRight(cell),
      },
      {
        label: isHeader ? "Convert to Normal" : "Convert to Header",
        icon: "H",
        action: () => this.toggleCellType(cell),
      },
      {
        label: "",
        icon: "",
        action: () => {},
        divider: true,
      },
      {
        label: "Cell Properties…",
        icon: "◧",
        action: () => this.showCellPropertiesModal(cell),
      },
      {
        label: "Table Properties…",
        icon: "⊞",
        action: () => this.showTablePropertiesModal(table),
      },
      {
        label: "",
        icon: "",
        action: () => {},
        divider: true,
      },
      {
        label: "Delete Table",
        icon: "✕",
        action: () => this.deleteTable(table),
        danger: true,
      },
    ];

    for (const item of items) {
      if (item.divider) {
        createElement("div", {
          className: "we-table-context-menu__divider",
          parent: this.contextMenu,
        });
        continue;
      }

      const btn = createElement("button", {
        className: `we-table-context-menu__item${item.danger ? " we-table-context-menu__item--danger" : ""}`,
        innerHTML: `<span class="we-table-context-menu__icon">${item.icon}</span><span>${item.label}</span>`,
        attributes: { type: "button" },
        parent: this.contextMenu,
      });

      if (item.disabled) {
        btn.setAttribute("disabled", "true");
        btn.classList.add("we-table-context-menu__item--disabled");
      }

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeContextMenu();
        item.action();
        this.editor.emit("change", {});
      });
    }

    /* Position the menu */
    const menuWidth = 220;
    const menuHeight = this.contextMenu.offsetHeight || 400;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let posX = x;
    let posY = y;

    if (x + menuWidth > vw) posX = vw - menuWidth - 10;
    if (y + menuHeight > vh) posY = vh - menuHeight - 10;
    if (posX < 0) posX = 10;
    if (posY < 0) posY = 10;

    this.contextMenu.style.left = `${posX}px`;
    this.contextMenu.style.top = `${posY}px`;
  }

  private closeContextMenu(): void {
    if (this.contextMenu) {
      this.contextMenu.remove();
      this.contextMenu = null;
    }
  }

  /* ================================================================ */
  /*  ROW OPERATIONS                                                   */
  /* ================================================================ */

  private insertRowAbove(cell: HTMLTableCellElement): void {
    const row = cell.parentElement as HTMLTableRowElement;
    const table = cell.closest("table") as HTMLTableElement;
    const colCount = row.cells.length;
    const newRow = table.insertRow(row.rowIndex);
    for (let i = 0; i < colCount; i++) {
      const td = newRow.insertCell();
      this.applyDefaultCellStyles(td, table);
      td.innerHTML = "<br>";
    }
  }

  private insertRowBelow(cell: HTMLTableCellElement): void {
    const row = cell.parentElement as HTMLTableRowElement;
    const table = cell.closest("table") as HTMLTableElement;
    const colCount = row.cells.length;
    const idx = row.rowIndex + 1;
    const newRow = table.insertRow(idx < table.rows.length ? idx : -1);
    for (let i = 0; i < colCount; i++) {
      const td = newRow.insertCell();
      this.applyDefaultCellStyles(td, table);
      td.innerHTML = "<br>";
    }
  }

  private deleteRow(cell: HTMLTableCellElement): void {
    const table = cell.closest("table") as HTMLTableElement;
    const row = cell.parentElement as HTMLTableRowElement;
    if (table.rows.length <= 1) return;
    this.deselectCell();
    table.deleteRow(row.rowIndex);
  }

  /* ================================================================ */
  /*  COLUMN OPERATIONS                                                */
  /* ================================================================ */

  private insertColumnLeft(cell: HTMLTableCellElement): void {
    const table = cell.closest("table") as HTMLTableElement;
    const colIdx = cell.cellIndex;
    for (let r = 0; r < table.rows.length; r++) {
      const row = table.rows[r];
      const isHeaderRow = row.cells[0]?.tagName === "TH";
      const newCell = isHeaderRow
        ? document.createElement("th")
        : row.insertCell(colIdx);

      if (isHeaderRow) {
        row.insertBefore(newCell, row.cells[colIdx]);
      }

      this.applyDefaultCellStyles(newCell, table);
      newCell.innerHTML = "<br>";
    }
  }

  private insertColumnRight(cell: HTMLTableCellElement): void {
    const table = cell.closest("table") as HTMLTableElement;
    const colIdx = cell.cellIndex + 1;
    for (let r = 0; r < table.rows.length; r++) {
      const row = table.rows[r];
      const isHeaderRow = row.cells[0]?.tagName === "TH";
      const newCell = isHeaderRow
        ? document.createElement("th")
        : row.insertCell(colIdx < row.cells.length ? colIdx : -1);

      if (isHeaderRow) {
        if (colIdx < row.cells.length) {
          row.insertBefore(newCell, row.cells[colIdx]);
        } else {
          row.appendChild(newCell);
        }
      }

      this.applyDefaultCellStyles(newCell, table);
      newCell.innerHTML = "<br>";
    }
  }

  private deleteColumn(cell: HTMLTableCellElement): void {
    const table = cell.closest("table") as HTMLTableElement;
    const colIdx = cell.cellIndex;
    if (table.rows[0].cells.length <= 1) return;
    this.deselectCell();
    for (let r = table.rows.length - 1; r >= 0; r--) {
      const row = table.rows[r];
      if (colIdx < row.cells.length) {
        row.deleteCell(colIdx);
      }
    }
  }

  /* ================================================================ */
  /*  CELL OPERATIONS                                                  */
  /* ================================================================ */

  private mergeRight(cell: HTMLTableCellElement): void {
    const row = cell.parentElement as HTMLTableRowElement;
    const nextIdx = cell.cellIndex + cell.colSpan;
    if (nextIdx >= row.cells.length) return;

    const nextCell = row.cells[nextIdx];
    /* Merge content */
    const content = nextCell.innerHTML.trim();
    if (content && content !== "<br>") {
      cell.innerHTML += " " + content;
    }
    cell.colSpan += nextCell.colSpan;
    nextCell.remove();
  }

  private splitCell(cell: HTMLTableCellElement): void {
    if (cell.colSpan <= 1 && cell.rowSpan <= 1) return;

    const row = cell.parentElement as HTMLTableRowElement;
    const table = cell.closest("table") as HTMLTableElement;
    const extraCols = cell.colSpan - 1;

    cell.colSpan = 1;
    cell.rowSpan = 1;

    /* Insert empty cells after the split cell */
    for (let i = 0; i < extraCols; i++) {
      const newCell = row.insertCell(cell.cellIndex + 1 + i);
      this.applyDefaultCellStyles(newCell, table);
      newCell.innerHTML = "<br>";
    }
  }

  private toggleCellType(cell: HTMLTableCellElement): void {
    const row = cell.parentElement as HTMLTableRowElement;
    const table = cell.closest("table") as HTMLTableElement;
    const isHeader = cell.tagName === "TH";
    const newTag = isHeader ? "td" : "th";

    /* Replace all cells in the row */
    for (let i = 0; i < row.cells.length; i++) {
      const oldCell = row.cells[i];
      const newCell = document.createElement(newTag);
      newCell.innerHTML = oldCell.innerHTML;
      newCell.className = isHeader ? "we-table__cell" : "we-table__cell we-table__cell--header";
      /* Copy styles */
      newCell.style.cssText = oldCell.style.cssText;
      if (!isHeader) {
        newCell.style.fontWeight = "600";
        newCell.style.backgroundColor = table.getAttribute("data-header-bg") || "#f3f4f6";
      }
      oldCell.replaceWith(newCell);
    }

    this.deselectCell();
  }

  private deleteTable(table: HTMLTableElement): void {
    this.deselectCell();
    this.closeContextMenu();
    table.remove();
  }

  /* ================================================================ */
  /*  HELPER: apply default cell styles from the table's config        */
  /* ================================================================ */

  private applyDefaultCellStyles(cell: HTMLElement, table: HTMLTableElement): void {
    cell.className = "we-table__cell";
    const bw = table.getAttribute("data-border-width") || "1";
    const bc = table.getAttribute("data-border-color") || "#d1d5db";
    const bs = table.getAttribute("data-border-style") || "solid";
    const cp = table.getAttribute("data-cell-padding") || "8";
    const cbg = table.getAttribute("data-cell-bg") || "";

    cell.style.border = `${bw}px ${bs} ${bc}`;
    cell.style.padding = `${cp}px`;
    if (cbg && cbg !== "#ffffff") {
      cell.style.backgroundColor = cbg;
    }
    cell.setAttribute("contenteditable", "true");
  }

  /* ================================================================ */
  /*  CELL PROPERTIES MODAL                                            */
  /* ================================================================ */

  private showCellPropertiesModal(cell: HTMLTableCellElement): void {
    const style = window.getComputedStyle(cell);
    const overlay = createElement("div", { className: "we-modal-overlay", parent: document.body });

    const modal = createElement("div", {
      className: "we-modal",
      parent: overlay,
      innerHTML: `
        <div class="we-modal__header">
          <h3 class="we-modal__title">Cell Properties</h3>
          <button type="button" class="we-modal__close" aria-label="Close">&times;</button>
        </div>
        <div class="we-modal__body">
          <label class="we-modal__label">
            Background Color
            <input type="color" class="we-modal__input" data-field="bgColor"
              value="${this.rgbToHex(style.backgroundColor)}" />
          </label>
          <label class="we-modal__label">
            Text Alignment
            <select class="we-modal__input" data-field="textAlign">
              <option value="left" ${style.textAlign === "left" ? "selected" : ""}>Left</option>
              <option value="center" ${style.textAlign === "center" ? "selected" : ""}>Center</option>
              <option value="right" ${style.textAlign === "right" ? "selected" : ""}>Right</option>
            </select>
          </label>
          <label class="we-modal__label">
            Vertical Alignment
            <select class="we-modal__input" data-field="vAlign">
              <option value="top" ${style.verticalAlign === "top" ? "selected" : ""}>Top</option>
              <option value="middle" ${style.verticalAlign === "middle" ? "selected" : ""}>Middle</option>
              <option value="bottom" ${style.verticalAlign === "bottom" ? "selected" : ""}>Bottom</option>
            </select>
          </label>
          <label class="we-modal__label">
            Padding (px)
            <input type="number" class="we-modal__input" data-field="padding"
              value="${parseInt(style.padding, 10) || 8}" min="0" max="50" />
          </label>
          <label class="we-modal__label">
            Width (e.g. 100px, 25%, auto)
            <input type="text" class="we-modal__input" data-field="width"
              value="${cell.style.width || "auto"}" placeholder="auto" />
          </label>
        </div>
        <div class="we-modal__footer">
          <button type="button" class="we-modal__btn we-modal__btn--cancel">Cancel</button>
          <button type="button" class="we-modal__btn we-modal__btn--primary">Apply</button>
        </div>
      `,
    });

    const close = (): void => overlay.remove();
    modal.querySelector(".we-modal__close")!.addEventListener("click", close);
    modal.querySelector(".we-modal__btn--cancel")!.addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    modal.querySelector(".we-modal__btn--primary")!.addEventListener("click", () => {
      const bg = (modal.querySelector('[data-field="bgColor"]') as HTMLInputElement).value;
      const align = (modal.querySelector('[data-field="textAlign"]') as HTMLSelectElement).value;
      const vAlign = (modal.querySelector('[data-field="vAlign"]') as HTMLSelectElement).value;
      const padding = (modal.querySelector('[data-field="padding"]') as HTMLInputElement).value;
      const width = (modal.querySelector('[data-field="width"]') as HTMLInputElement).value;

      cell.style.backgroundColor = bg;
      cell.style.textAlign = align;
      cell.style.verticalAlign = vAlign;
      cell.style.padding = `${padding}px`;
      if (width && width !== "auto") cell.style.width = width;
      else cell.style.width = "";

      this.editor.emit("change", {});
      close();
    });
  }

  /* ================================================================ */
  /*  TABLE PROPERTIES MODAL                                           */
  /* ================================================================ */

  private showTablePropertiesModal(table: HTMLTableElement): void {
    const bw = table.getAttribute("data-border-width") || "1";
    const bc = table.getAttribute("data-border-color") || "#d1d5db";
    const bs = table.getAttribute("data-border-style") || "solid";
    const cp = table.getAttribute("data-cell-padding") || "8";
    const tw = table.style.width || table.getAttribute("data-table-width") || "100%";
    const ta = table.getAttribute("data-table-align") || "left";
    const hbg = table.getAttribute("data-header-bg") || "#f3f4f6";
    const cbg = table.getAttribute("data-cell-bg") || "#ffffff";
    const striped = table.getAttribute("data-striped") === "true";

    const overlay = createElement("div", { className: "we-modal-overlay", parent: document.body });

    const modal = createElement("div", {
      className: "we-modal",
      parent: overlay,
      innerHTML: `
        <div class="we-modal__header">
          <h3 class="we-modal__title">Table Properties</h3>
          <button type="button" class="we-modal__close" aria-label="Close">&times;</button>
        </div>
        <div class="we-modal__body">
          <h4 style="margin:0 0 12px;font-size:0.95em;font-weight:600">Border</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <label class="we-modal__label">
              Width (px)
              <input type="number" class="we-modal__input" data-field="borderWidth" value="${bw}" min="0" max="20" />
            </label>
            <label class="we-modal__label">
              Style
              <select class="we-modal__input" data-field="borderStyle">
                <option value="solid" ${bs === "solid" ? "selected" : ""}>Solid</option>
                <option value="dashed" ${bs === "dashed" ? "selected" : ""}>Dashed</option>
                <option value="dotted" ${bs === "dotted" ? "selected" : ""}>Dotted</option>
                <option value="double" ${bs === "double" ? "selected" : ""}>Double</option>
                <option value="groove" ${bs === "groove" ? "selected" : ""}>Groove</option>
                <option value="ridge" ${bs === "ridge" ? "selected" : ""}>Ridge</option>
                <option value="none" ${bs === "none" ? "selected" : ""}>None</option>
              </select>
            </label>
          </div>
          <label class="we-modal__label">
            Border Color
            <input type="color" class="we-modal__input" data-field="borderColor" value="${bc}" />
          </label>

          <h4 style="margin:16px 0 12px;font-size:0.95em;font-weight:600">Layout</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <label class="we-modal__label">
              Table Width
              <input type="text" class="we-modal__input" data-field="tableWidth" value="${tw}" placeholder="100%, 500px, auto" />
            </label>
            <label class="we-modal__label">
              Alignment
              <select class="we-modal__input" data-field="tableAlign">
                <option value="left" ${ta === "left" ? "selected" : ""}>Left</option>
                <option value="center" ${ta === "center" ? "selected" : ""}>Center</option>
                <option value="right" ${ta === "right" ? "selected" : ""}>Right</option>
              </select>
            </label>
          </div>
          <label class="we-modal__label">
            Cell Padding (px)
            <input type="number" class="we-modal__input" data-field="cellPadding" value="${cp}" min="0" max="50" />
          </label>

          <h4 style="margin:16px 0 12px;font-size:0.95em;font-weight:600">Colors</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <label class="we-modal__label">
              Header Background
              <input type="color" class="we-modal__input" data-field="headerBg" value="${hbg}" />
            </label>
            <label class="we-modal__label">
              Cell Background
              <input type="color" class="we-modal__input" data-field="cellBg" value="${cbg}" />
            </label>
          </div>
          <label class="we-modal__label we-modal__label--checkbox">
            <input type="checkbox" data-field="striped" ${striped ? "checked" : ""} />
            Striped rows (alternate row colors)
          </label>
        </div>
        <div class="we-modal__footer">
          <button type="button" class="we-modal__btn we-modal__btn--danger">Delete Table</button>
          <button type="button" class="we-modal__btn we-modal__btn--cancel">Cancel</button>
          <button type="button" class="we-modal__btn we-modal__btn--primary">Apply</button>
        </div>
      `,
    });

    const close = (): void => overlay.remove();
    modal.querySelector(".we-modal__close")!.addEventListener("click", close);
    modal.querySelector(".we-modal__btn--cancel")!.addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    modal.querySelector(".we-modal__btn--danger")!.addEventListener("click", () => {
      this.deleteTable(table);
      this.editor.emit("change", {});
      close();
    });

    modal.querySelector(".we-modal__btn--primary")!.addEventListener("click", () => {
      const newBW = (modal.querySelector('[data-field="borderWidth"]') as HTMLInputElement).value;
      const newBS = (modal.querySelector('[data-field="borderStyle"]') as HTMLSelectElement).value;
      const newBC = (modal.querySelector('[data-field="borderColor"]') as HTMLInputElement).value;
      const newTW = (modal.querySelector('[data-field="tableWidth"]') as HTMLInputElement).value;
      const newTA = (modal.querySelector('[data-field="tableAlign"]') as HTMLSelectElement).value;
      const newCP = (modal.querySelector('[data-field="cellPadding"]') as HTMLInputElement).value;
      const newHBG = (modal.querySelector('[data-field="headerBg"]') as HTMLInputElement).value;
      const newCBG = (modal.querySelector('[data-field="cellBg"]') as HTMLInputElement).value;
      const newStriped = (modal.querySelector('[data-field="striped"]') as HTMLInputElement).checked;

      /* Store config as data attributes */
      table.setAttribute("data-border-width", newBW);
      table.setAttribute("data-border-style", newBS);
      table.setAttribute("data-border-color", newBC);
      table.setAttribute("data-table-width", newTW);
      table.setAttribute("data-table-align", newTA);
      table.setAttribute("data-cell-padding", newCP);
      table.setAttribute("data-header-bg", newHBG);
      table.setAttribute("data-cell-bg", newCBG);
      table.setAttribute("data-striped", String(newStriped));

      /* Apply to table element */
      table.style.width = newTW;
      table.style.borderCollapse = "collapse";

      if (newTA === "center") {
        table.style.marginLeft = "auto";
        table.style.marginRight = "auto";
      } else if (newTA === "right") {
        table.style.marginLeft = "auto";
        table.style.marginRight = "0";
      } else {
        table.style.marginLeft = "0";
        table.style.marginRight = "auto";
      }

      /* Apply to all cells */
      const border = `${newBW}px ${newBS} ${newBC}`;
      const allCells = table.querySelectorAll<HTMLElement>("td, th");
      allCells.forEach((c, idx) => {
        c.style.border = border;
        c.style.padding = `${newCP}px`;

        if (c.tagName === "TH") {
          c.style.backgroundColor = newHBG;
        } else {
          if (newStriped) {
            const row = (c as HTMLTableCellElement).parentElement as HTMLTableRowElement;
            const rowIdx = row.rowIndex;
            c.style.backgroundColor = rowIdx % 2 === 0 ? newCBG : this.lightenColor(newCBG, 8);
          } else {
            c.style.backgroundColor = newCBG;
          }
        }
      });

      this.editor.emit("change", {});
      close();
    });
  }

  /* ================================================================ */
  /*  INSERT TABLE MODAL                                               */
  /* ================================================================ */

  private showInsertModal(): void {
    this.editor.saveSelection();

    const overlay = createElement("div", { className: "we-modal-overlay", parent: document.body });

    const modal = createElement("div", {
      className: "we-modal",
      parent: overlay,
      innerHTML: `
        <div class="we-modal__header">
          <h3 class="we-modal__title">Insert Table</h3>
          <button type="button" class="we-modal__close" aria-label="Close">&times;</button>
        </div>
        <div class="we-modal__body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <label class="we-modal__label">
              Rows
              <input type="number" class="we-modal__input" data-field="rows" value="3" min="1" max="50" />
            </label>
            <label class="we-modal__label">
              Columns
              <input type="number" class="we-modal__input" data-field="cols" value="3" min="1" max="20" />
            </label>
          </div>
          <label class="we-modal__label we-modal__label--checkbox">
            <input type="checkbox" data-field="hasHeader" checked />
            Include header row
          </label>

          <h4 style="margin:16px 0 12px;font-size:0.95em;font-weight:600">Border</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
            <label class="we-modal__label">
              Width (px)
              <input type="number" class="we-modal__input" data-field="borderWidth" value="1" min="0" max="20" />
            </label>
            <label class="we-modal__label">
              Style
              <select class="we-modal__input" data-field="borderStyle">
                <option value="solid" selected>Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
                <option value="double">Double</option>
                <option value="none">None</option>
              </select>
            </label>
            <label class="we-modal__label">
              Color
              <input type="color" class="we-modal__input" data-field="borderColor" value="#d1d5db" />
            </label>
          </div>

          <h4 style="margin:16px 0 12px;font-size:0.95em;font-weight:600">Layout</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <label class="we-modal__label">
              Width
              <input type="text" class="we-modal__input" data-field="tableWidth" value="100%" placeholder="100%, 500px" />
            </label>
            <label class="we-modal__label">
              Cell Padding (px)
              <input type="number" class="we-modal__input" data-field="cellPadding" value="8" min="0" max="50" />
            </label>
          </div>
          <label class="we-modal__label">
            Alignment
            <select class="we-modal__input" data-field="tableAlign">
              <option value="left" selected>Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>

          <h4 style="margin:16px 0 12px;font-size:0.95em;font-weight:600">Colors</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <label class="we-modal__label">
              Header Background
              <input type="color" class="we-modal__input" data-field="headerBg" value="#f3f4f6" />
            </label>
            <label class="we-modal__label">
              Cell Background
              <input type="color" class="we-modal__input" data-field="cellBg" value="#ffffff" />
            </label>
          </div>
          <label class="we-modal__label we-modal__label--checkbox">
            <input type="checkbox" data-field="striped" />
            Striped rows
          </label>

          <div class="we-modal__preview" data-field="preview" style="overflow-x:auto;max-height:200px"></div>
        </div>
        <div class="we-modal__footer">
          <button type="button" class="we-modal__btn we-modal__btn--cancel">Cancel</button>
          <button type="button" class="we-modal__btn we-modal__btn--primary">Insert Table</button>
        </div>
      `,
    });

    /* Live preview */
    const updatePreview = (): void => {
      const config = this.readConfigFromModal(modal);
      const previewEl = modal.querySelector('[data-field="preview"]') as HTMLElement;
      previewEl.innerHTML = this.buildTableHTML(config);
    };

    /* Wire up all inputs to update preview */
    modal.querySelectorAll("input, select").forEach((el) => {
      el.addEventListener("input", updatePreview);
      el.addEventListener("change", updatePreview);
    });

    updatePreview();

    /* Close */
    const close = (): void => overlay.remove();
    modal.querySelector(".we-modal__close")!.addEventListener("click", close);
    modal.querySelector(".we-modal__btn--cancel")!.addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    /* Insert */
    modal.querySelector(".we-modal__btn--primary")!.addEventListener("click", () => {
      const config = this.readConfigFromModal(modal);
      const html = this.buildTableHTML(config) + "<p><br></p>";
      this.editor.restoreSelection();
      this.editor.insertHTML(html);
      this.editor.emit("change", {});
      close();
    });
  }

  /* ================================================================ */
  /*  Read config from modal fields                                    */
  /* ================================================================ */

  private readConfigFromModal(modal: HTMLElement): TableConfig {
    return {
      rows: parseInt((modal.querySelector('[data-field="rows"]') as HTMLInputElement)?.value || "3", 10),
      cols: parseInt((modal.querySelector('[data-field="cols"]') as HTMLInputElement)?.value || "3", 10),
      hasHeader: (modal.querySelector('[data-field="hasHeader"]') as HTMLInputElement)?.checked ?? true,
      borderWidth: parseInt((modal.querySelector('[data-field="borderWidth"]') as HTMLInputElement)?.value || "1", 10),
      borderColor: (modal.querySelector('[data-field="borderColor"]') as HTMLInputElement)?.value || "#d1d5db",
      borderStyle: (modal.querySelector('[data-field="borderStyle"]') as HTMLSelectElement)?.value || "solid",
      cellPadding: parseInt((modal.querySelector('[data-field="cellPadding"]') as HTMLInputElement)?.value || "8", 10),
      tableWidth: (modal.querySelector('[data-field="tableWidth"]') as HTMLInputElement)?.value || "100%",
      tableAlign: (modal.querySelector('[data-field="tableAlign"]') as HTMLSelectElement)?.value || "left",
      headerBg: (modal.querySelector('[data-field="headerBg"]') as HTMLInputElement)?.value || "#f3f4f6",
      cellBg: (modal.querySelector('[data-field="cellBg"]') as HTMLInputElement)?.value || "#ffffff",
      stripedRows: (modal.querySelector('[data-field="striped"]') as HTMLInputElement)?.checked ?? false,
    };
  }

  /* ================================================================ */
  /*  Build table HTML                                                 */
  /* ================================================================ */

  private buildTableHTML(config: TableConfig): string {
    const border = `${config.borderWidth}px ${config.borderStyle} ${config.borderColor}`;
    const padding = `${config.cellPadding}px`;

    /* Table alignment */
    let marginStyle = "margin-left:0;margin-right:auto;";
    if (config.tableAlign === "center") marginStyle = "margin-left:auto;margin-right:auto;";
    if (config.tableAlign === "right") marginStyle = "margin-left:auto;margin-right:0;";

    const tableAttrs = [
      `data-border-width="${config.borderWidth}"`,
      `data-border-style="${config.borderStyle}"`,
      `data-border-color="${config.borderColor}"`,
      `data-cell-padding="${config.cellPadding}"`,
      `data-table-width="${config.tableWidth}"`,
      `data-table-align="${config.tableAlign}"`,
      `data-header-bg="${config.headerBg}"`,
      `data-cell-bg="${config.cellBg}"`,
      `data-striped="${config.stripedRows}"`,
    ].join(" ");

    let html = `<table class="we-table" style="width:${config.tableWidth};border-collapse:collapse;${marginStyle}" ${tableAttrs}>`;

    for (let r = 0; r < config.rows; r++) {
      const isHeaderRow = config.hasHeader && r === 0;
      const tag = isHeaderRow ? "th" : "td";
      const cls = isHeaderRow ? "we-table__cell we-table__cell--header" : "we-table__cell";

      let bg = config.cellBg;
      if (isHeaderRow) {
        bg = config.headerBg;
      } else if (config.stripedRows && r % 2 === 0) {
        bg = this.lightenColor(config.cellBg, 8);
      }

      html += "<tr>";
      for (let c = 0; c < config.cols; c++) {
        const content = isHeaderRow ? `Header ${c + 1}` : "<br>";
        html += `<${tag} class="${cls}" style="border:${border};padding:${padding};background-color:${bg}" contenteditable="true">${content}</${tag}>`;
      }
      html += "</tr>";
    }

    html += "</table>";
    return html;
  }

  /* ================================================================ */
  /*  Utility functions                                                */
  /* ================================================================ */

  private rgbToHex(rgb: string): string {
    if (rgb.startsWith("#")) return rgb;
    const match = rgb.match(/\d+/g);
    if (!match || match.length < 3) return "#ffffff";
    const r = parseInt(match[0], 10);
    const g = parseInt(match[1], 10);
    const b = parseInt(match[2], 10);
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  private lightenColor(hex: string, amount: number): string {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const r = Math.min(255, parseInt(hex.substring(0, 2), 16) + amount);
    const g = Math.min(255, parseInt(hex.substring(2, 4), 16) + amount);
    const b = Math.min(255, parseInt(hex.substring(4, 6), 16) + amount);
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
}