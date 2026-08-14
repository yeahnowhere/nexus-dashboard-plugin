// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import {
	renderRow,
	renderColumn,
	getRowProportion,
	parseProportion,
	getRowProportionKey,
	getRowProportionSaved,
} from "../renderer/layout";
import { makeContext } from "./helpers/render-context";
import type {
	DashboardConfig,
	DashboardBlock,
	RowConfig,
	ColumnConfig,
	SectionConfig,
} from "../types";

function host(): HTMLElement {
	return document.createElement("div");
}

function sectionBlock(): SectionConfig {
	return { kind: "section", columns: 1, cards: [] };
}

function makeConfig(blocks: DashboardBlock[]): DashboardConfig {
	return {
		header: { text: "NEXUS", font: "monospace", color: "#fff", size: 1 },
		stats: { enabled: true, items: [] },
		blocks,
		graph: {},
	} as unknown as DashboardConfig;
}

function rowOf(count: number, overrides: Partial<RowConfig> = {}): RowConfig {
	return {
		kind: "row",
		children: Array.from({ length: count }, () => sectionBlock()),
		...overrides,
	};
}

function columnOf(count: number, overrides: Partial<ColumnConfig> = {}): ColumnConfig {
	return {
		kind: "column",
		children: Array.from({ length: count }, () => sectionBlock()),
		...overrides,
	};
}

function makeDispatch() {
	return vi.fn(async (el: HTMLElement) => {
		el.createDiv({ cls: "stub-block" });
	});
}

describe("parseProportion", () => {
	it("parses equal and unequal proportions", () => {
		expect(parseProportion("50/50", 2)).toEqual(["50%", "50%"]);
		expect(parseProportion("30/70", 2)).toEqual(["30%", "70%"]);
	});

	it("falls back to equal widths for invalid tokens", () => {
		expect(parseProportion("100", 2)).toEqual(["100%", "50%"]);
		expect(parseProportion("", 3)).toEqual([
			"33.333333333333336%",
			"33.333333333333336%",
			"33.333333333333336%",
		]);
	});
});

describe("getRowProportion", () => {
	it("builds an equal-width proportion string", () => {
		expect(getRowProportion(rowOf(2))).toBe("50/50");
		expect(getRowProportion(rowOf(3))).toBe("33/33/34");
		expect(getRowProportion(rowOf(2, { columns: 3 }))).toBe("33/33/34");
	});
});

describe("getRowProportionKey", () => {
	it("scopes keys to the source path and index", () => {
		expect(getRowProportionKey("Dashboard.md", 0)).toBe("Dashboard.md:row:0");
		expect(getRowProportionKey("Dashboard.md", 2, "col")).toBe("Dashboard.md:col:2");
	});
});

describe("getRowProportionSaved", () => {
	it("returns the saved proportion for the row key", () => {
		const ctx = makeContext({ settings: { rowSizes: { "Dashboard.md:row:0": "60/40" } } });
		expect(getRowProportionSaved(ctx, 0)).toBe("60/40");
	});

	it("migrates a legacy key and persists it", () => {
		const ctx = makeContext({ settings: { rowSizes: { "Dashboard.md:0": "60/40" } } });
		expect(getRowProportionSaved(ctx, 0)).toBe("60/40");
		expect(ctx.settings.rowSizes["Dashboard.md:row:0"]).toBe("60/40");
		expect(ctx.settings.rowSizes["Dashboard.md:0"]).toBeUndefined();
		expect(ctx.saveSettings).toHaveBeenCalled();
	});

	it("returns null when nothing is saved", () => {
		const ctx = makeContext();
		expect(getRowProportionSaved(ctx, 0)).toBeNull();
	});
});

describe("renderRow", () => {
	it("renders columns and dividers and dispatches each child", () => {
		const ctx = makeContext();
		const el = host();
		const row = rowOf(3);
		const dispatch = makeDispatch();
		renderRow(ctx, el, row, makeConfig([row]), dispatch);

		const rowEl = el.querySelector<HTMLElement>(".nexus-row");
		expect(rowEl).not.toBeNull();
		expect(rowEl?.style.getPropertyValue("--nexus-row-cols")).toBe("3");
		expect(rowEl?.style.getPropertyValue("--nexus-row-proportion")).toBe("33/33/34");
		expect(rowEl?.querySelectorAll(".nexus-row-col").length).toBe(3);
		expect(rowEl?.querySelectorAll(".nexus-row-divider").length).toBe(2);
		expect(dispatch).toHaveBeenCalledTimes(3);
		expect(rowEl?.querySelectorAll(".stub-block").length).toBe(3);
	});

	it("renders nothing for an empty row", () => {
		const ctx = makeContext();
		const el = host();
		renderRow(ctx, el, rowOf(0), makeConfig([]), makeDispatch());
		expect(el.querySelector(".nexus-row")).toBeNull();
	});

	it("caps columns at the configured count", () => {
		const ctx = makeContext();
		const el = host();
		const row = rowOf(3, { columns: 2 });
		const dispatch = makeDispatch();
		renderRow(ctx, el, row, makeConfig([row]), dispatch);

		expect(el.querySelectorAll(".nexus-row-col").length).toBe(2);
		expect(el.querySelectorAll(".nexus-row-divider").length).toBe(1);
		expect(dispatch).toHaveBeenCalledTimes(2);
	});

	it("applies a custom proportion to column widths", () => {
		const ctx = makeContext();
		const el = host();
		const row = rowOf(2, { proportion: "70/30" });
		renderRow(ctx, el, row, makeConfig([row]), makeDispatch());

		const cols = el.querySelectorAll<HTMLElement>(".nexus-row-col");
		expect(cols[0]?.style.getPropertyValue("--nexus-row-width")).toBe("70%");
		expect(cols[1]?.style.getPropertyValue("--nexus-row-width")).toBe("30%");
	});

	it("prefers a saved proportion over the row proportion", () => {
		const ctx = makeContext({
			settings: { rowSizes: { "Dashboard.md:row:0": "80/20" } },
		});
		const el = host();
		const row = rowOf(2, { proportion: "70/30" });
		renderRow(ctx, el, row, makeConfig([row]), makeDispatch());

		const cols = el.querySelectorAll<HTMLElement>(".nexus-row-col");
		expect(cols[0]?.style.getPropertyValue("--nexus-row-width")).toBe("80%");
	});

	it("applies a gap to the row", () => {
		const ctx = makeContext();
		const el = host();
		const row = rowOf(2, { gap: "1rem" });
		renderRow(ctx, el, row, makeConfig([row]), makeDispatch());

		expect(el.querySelector<HTMLElement>(".nexus-row")?.style.gap).toBe("1rem");
	});
});

describe("renderColumn", () => {
	it("stacks children with dividers and applies spacing", () => {
		const el = host();
		const column = columnOf(3, { spacing: "0.5rem" });
		const dispatch = makeDispatch();
		renderColumn(el, column, makeConfig([column]), dispatch);

		const columnEl = el.querySelector<HTMLElement>(".nexus-column");
		expect(columnEl).not.toBeNull();
		expect(columnEl?.style.gap).toBe("0.5rem");
		expect(columnEl?.querySelectorAll(".nexus-column-item").length).toBe(3);
		expect(columnEl?.querySelectorAll(".nexus-column-divider").length).toBe(2);
		expect(dispatch).toHaveBeenCalledTimes(3);
	});

	it("maps align values to align-items", () => {
		const el = host();
		renderColumn(el, columnOf(1, { align: "left" }), makeConfig([]), makeDispatch());
		expect(el.querySelector<HTMLElement>(".nexus-column")?.style.alignItems).toBe("flex-start");

		const el2 = host();
		renderColumn(el2, columnOf(1, { align: "right" }), makeConfig([]), makeDispatch());
		expect(el2.querySelector<HTMLElement>(".nexus-column")?.style.alignItems).toBe("flex-end");

		const el3 = host();
		renderColumn(el3, columnOf(1, { align: "center" }), makeConfig([]), makeDispatch());
		expect(el3.querySelector<HTMLElement>(".nexus-column")?.style.alignItems).toBe("center");

		const el4 = host();
		renderColumn(el4, columnOf(1, { align: "stretch" }), makeConfig([]), makeDispatch());
		expect(el4.querySelector<HTMLElement>(".nexus-column")?.style.alignItems).not.toBe("stretch");
	});

	it("renders nothing for an empty column", () => {
		const el = host();
		renderColumn(el, columnOf(0), makeConfig([]), makeDispatch());
		expect(el.querySelector(".nexus-column")).toBeNull();
	});
});
