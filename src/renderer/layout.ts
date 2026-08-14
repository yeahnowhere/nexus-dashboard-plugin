import { safeParseInt } from "../utils";
import type { ColumnConfig, DashboardBlock, DashboardConfig, RowConfig } from "../types";
import type { RendererContext } from "./context";

type BlockDispatcher = (
	containerEl: HTMLElement,
	block: DashboardBlock,
	config: DashboardConfig,
) => Promise<void>;

/** Render a row of columns, dispatching each child block into its column. */
export function renderRow(
	ctx: RendererContext,
	containerEl: HTMLElement,
	row: RowConfig,
	config: DashboardConfig,
	dispatch: BlockDispatcher,
): void {
	if (row.children.length === 0) return;

	const cols = row.columns || row.children.length || 2;
	const defaultProportion = getRowProportion(row);
	const rowIndex = config.blocks.indexOf(row);

	// Load saved proportion from drag, then user-specified, then default
	const savedProportion = getRowProportionSaved(ctx, rowIndex >= 0 ? rowIndex : 0);
	const proportion = savedProportion || row.proportion || defaultProportion;

	const rowEl = containerEl.createDiv({ cls: "nexus-row" });
	rowEl.style.setProperty("--nexus-row-cols", String(cols));
	rowEl.style.setProperty("--nexus-row-proportion", proportion);

	// Apply gap property
	if (row.gap) {
		rowEl.style.gap = row.gap;
	}

	const children = row.children;
	const colWidths = parseProportion(proportion, cols);
	const isCustomProportion = proportion !== defaultProportion;

	for (let i = 0; i < children.length && i < cols; i++) {
		const colEl = rowEl.createDiv({ cls: "nexus-row-col" });
		if (isCustomProportion) {
			colEl.style.setProperty("--nexus-row-width", colWidths[i] || `${100 / cols}%`);
		}

		const child = children[i];
		void dispatch(colEl, child, config);

		if (i < children.length - 1 && i < cols - 1) {
			const dividerEl = rowEl.createDiv({ cls: "nexus-row-divider" });
			setupColumnDrag(ctx, dividerEl, rowEl, colWidths, i, rowIndex);
		}
	}
}

/** Render a column of stacked blocks, dispatching each child block. */
export function renderColumn(
	containerEl: HTMLElement,
	column: ColumnConfig,
	config: DashboardConfig,
	dispatch: BlockDispatcher,
): void {
	if (column.children.length === 0) return;

	const columnEl = containerEl.createDiv({ cls: "nexus-column" });

	// Apply spacing (vertical gap)
	if (column.spacing) {
		columnEl.style.gap = column.spacing;
	}

	// Apply horizontal alignment
	if (column.align && column.align !== "stretch") {
		columnEl.style.alignItems =
			column.align === "left" ? "flex-start" : column.align === "right" ? "flex-end" : "center";
	}

	// Render children with dividers between them
	for (let i = 0; i < column.children.length; i++) {
		const child = column.children[i];
		const itemEl = columnEl.createDiv({ cls: "nexus-column-item" });
		void dispatch(itemEl, child, config);

		if (i < column.children.length - 1 && !column.noDividers) {
			columnEl.createDiv({ cls: "nexus-column-divider" });
		}
	}
}

/** Default equal-width proportion string for a row (e.g. "33/34/33"). */
export function getRowProportion(row: RowConfig): string {
	const n = row.columns || row.children.length || 2;
	const part = Math.floor(100 / n);
	const parts = Array(n - 1).fill(part);
	parts.push(100 - part * (n - 1));
	return parts.join("/");
}

/** Parse a "50/50" proportion string into percentage widths for each column. */
export function parseProportion(proportion: string, cols: number): string[] {
	const parts = proportion.split("/").map((s) => s.trim());
	const widths: string[] = [];
	for (let i = 0; i < cols; i++) {
		const val = safeParseInt(parts[i] || "0", undefined, 1);
		if (val !== undefined) {
			widths.push(`${val}%`);
		} else {
			widths.push(`${100 / cols}%`);
		}
	}
	return widths;
}

/** Storage key for a row/column proportion override. */
export function getRowProportionKey(
	sourcePath: string,
	rowIndex: number,
	prefix: string = "row",
): string {
	return `${sourcePath}:${prefix}:${rowIndex}`;
}

/** Load a saved proportion override for a row (with legacy key migration). */
export function getRowProportionSaved(
	ctx: RendererContext,
	rowIndex: number,
	prefix: string = "row",
): string | null {
	const key = getRowProportionKey(ctx.sourcePath, rowIndex, prefix);
	const sizes = ctx.settings.rowSizes;
	if (sizes && sizes[key]) return sizes[key];

	// Auto-migrate legacy key (format: {sourcePath}:0)
	if (prefix === "row") {
		const legacyKey = `${ctx.sourcePath}:0`;
		if (sizes && sizes[legacyKey]) {
			const val = sizes[legacyKey];
			sizes[key] = val;
			delete sizes[legacyKey];
			void ctx.saveSettings();
			return val;
		}
	}
	return null;
}

/** Persist a drag-adjusted row proportion for the current source path. */
export function saveRowProportion(
	ctx: RendererContext,
	proportion: string,
	rowIndex: number,
): void {
	const key = getRowProportionKey(ctx.sourcePath, rowIndex, "row");
	const settings = ctx.settings;
	if (!settings.rowSizes) settings.rowSizes = {};
	settings.rowSizes[key] = proportion;
	void ctx.saveSettings();
}

/** Wire pointer-drag on a column divider to resize the adjacent columns. */
function setupColumnDrag(
	ctx: RendererContext,
	dividerEl: HTMLElement,
	rowEl: HTMLElement,
	_colWidths: string[],
	dividerIdx: number,
	rowIndex: number,
): void {
	const MIN_WIDTH = 20;
	const DIVIDER_WIDTH = 8;
	let isDragging = false;
	let startX = 0;
	let startLeftWidth = 0;

	const cols = rowEl.querySelectorAll(".nexus-row-col");
	const leftCol = cols[dividerIdx] as HTMLElement;
	const rightCol = cols[dividerIdx + 1] as HTMLElement;
	if (!leftCol || !rightCol) return;

	const onMouseMove = (e: MouseEvent) => {
		if (!isDragging) return;
		const rowRect = rowEl.getBoundingClientRect();
		const dx = e.clientX - startX;
		const rowWidth = rowRect.width;
		const numDividers = cols.length - 1;
		const availableWidth = rowWidth - numDividers * DIVIDER_WIDTH;

		let leftPct = ((startLeftWidth + dx) / availableWidth) * 100;
		leftPct = Math.max(MIN_WIDTH, Math.min(100 - MIN_WIDTH, leftPct));
		const rightPct = 100 - leftPct;

		leftCol.style.setProperty("--nexus-row-width", `${leftPct}%`);
		rightCol.style.setProperty("--nexus-row-width", `${rightPct}%`);
	};

	const onMouseUp = () => {
		if (!isDragging) return;
		isDragging = false;
		dividerEl.removeClass("dragging");
		document.removeEventListener("mousemove", onMouseMove);
		document.removeEventListener("mouseup", onMouseUp);

		const leftPct = parseFloat(leftCol.style.getPropertyValue("--nexus-row-width")) || 50;
		const rightPct = parseFloat(rightCol.style.getPropertyValue("--nexus-row-width")) || 50;
		const proportion = `${Math.round(leftPct)}/${Math.round(rightPct)}`;
		saveRowProportion(ctx, proportion, rowIndex);
	};

	dividerEl.addEventListener("mousedown", (e) => {
		isDragging = true;
		startX = e.clientX;
		startLeftWidth = leftCol.getBoundingClientRect().width;
		dividerEl.addClass("dragging");
		e.preventDefault();
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
	});
}
