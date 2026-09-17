// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderFileTypeChart, FILETYPE_PALETTE } from "../renderer/filetypes";
import { makeContext } from "./helpers/render-context";
import type { FileTypeChartConfig } from "../types";

function host(): HTMLElement {
	return document.createElement("div");
}

function makeConfig(overrides: Partial<FileTypeChartConfig> = {}): FileTypeChartConfig {
	return { kind: "filetypes", show: true, ...overrides };
}

describe("renderFileTypeChart", () => {
	it("renders a composition bar with a total line", () => {
		const ctx = makeContext({
			files: [
				{ path: "a.md" },
				{ path: "b.md" },
				{ path: "pic.png" },
				{ path: "code.js" },
				{ path: "board.canvas" },
				{ path: "mystery.xyz" },
			],
		});
		const el = host();
		renderFileTypeChart(ctx, el, makeConfig());

		const bar = el.querySelector<HTMLElement>(".nexus-filetypes-bar");
		expect(bar).not.toBeNull();
		expect(el.querySelector(".nexus-panel .nexus-filetypes")).not.toBeNull();
		expect(bar?.querySelectorAll(".nexus-filetypes-bar-segment").length).toBe(5);

		const total = el.querySelector(".nexus-filetypes-total");
		expect(total?.textContent).toBe("6 files");
	});

	it("renders one legend row per extension with raw labels and counts", () => {
		const ctx = makeContext({
			files: [
				{ path: "a.md" },
				{ path: "b.md" },
				{ path: "pic.png" },
				{ path: "code.js" },
				{ path: "board.canvas" },
				{ path: "mystery.xyz" },
			],
		});
		const el = host();
		renderFileTypeChart(ctx, el, makeConfig());

		const rows = Array.from(el.querySelectorAll(".nexus-filetypes-legend-row"));
		expect(rows.length).toBe(5);
		expect(rows.map((r) => r.querySelector(".nexus-filetypes-legend-label")?.textContent)).toEqual([
			"md",
			"canvas",
			"js",
			"png",
			"xyz",
		]);
		expect(rows[0]?.querySelector(".nexus-filetypes-legend-count")?.textContent).toBe("2");
		expect(rows[0]?.querySelector(".nexus-filetypes-legend-pct")?.textContent).toBe("33%");
	});

	it("sorts rows by count descending", () => {
		const ctx = makeContext({
			files: [
				{ path: "a.png" },
				{ path: "b.md" },
				{ path: "c.md" },
				{ path: "d.md" },
				{ path: "e.js" },
			],
		});
		const el = host();
		renderFileTypeChart(ctx, el, makeConfig());

		const labels = Array.from(el.querySelectorAll(".nexus-filetypes-legend-label")).map(
			(n) => n.textContent,
		);
		expect(labels).toEqual(["md", "js", "png"]);
	});

	it("cycles colors through the palette for many extensions", () => {
		const files = Array.from({ length: 10 }, (_, i) => ({
			path: `file.${String.fromCharCode(97 + i)}`,
		}));
		const ctx = makeContext({ files });
		const el = host();
		renderFileTypeChart(ctx, el, makeConfig());

		const dots = Array.from(el.querySelectorAll<HTMLElement>(".nexus-filetypes-legend-dot"));
		expect(dots.length).toBe(10);
		expect(dots[0].style.background).toBe(`var(${FILETYPE_PALETTE[0]})`);
		expect(dots[8].style.background).toBe(`var(${FILETYPE_PALETTE[8 % FILETYPE_PALETTE.length]})`);
	});

	it("renders nothing when the vault has no files", () => {
		const ctx = makeContext({ files: [] });
		const el = host();
		renderFileTypeChart(ctx, el, makeConfig());
		expect(el.querySelector(".nexus-filetypes")).toBeNull();
	});

	it("scopes the chart to the configured folder path", () => {
		const ctx = makeContext({
			files: [
				{ path: "Projects/Active/a.md" },
				{ path: "Projects/Active/note.png" },
				{ path: "Projects/Archive/old.md" },
				{ path: "root.md" },
			],
		});
		const el = host();
		renderFileTypeChart(ctx, el, makeConfig({ path: "Projects/Active" }));

		expect(el.querySelector(".nexus-filetypes-total")?.textContent).toBe("2 files");
		const rows = Array.from(el.querySelectorAll(".nexus-filetypes-legend-row"));
		expect(rows.length).toBe(2);
		expect(rows[0]?.querySelector(".nexus-filetypes-legend-count")?.textContent).toBe("1");
		expect(rows[1]?.querySelector(".nexus-filetypes-legend-count")?.textContent).toBe("1");
	});

	it("shows the divider label from the config", () => {
		const ctx = makeContext({
			files: [{ path: "a.md" }],
			settings: { showFileTypeChartDivider: true },
		});
		const el = host();
		renderFileTypeChart(ctx, el, makeConfig({ label: "VAULT FILES" }));
		expect(el.querySelector(".nexus-section-divider-label")?.textContent).toBe("VAULT FILES");
	});

	it("falls back to the default label when no config label is set", () => {
		const ctx = makeContext({
			files: [{ path: "a.md" }],
			settings: { showFileTypeChartDivider: true },
		});
		const el = host();
		renderFileTypeChart(ctx, el, makeConfig());
		expect(el.querySelector(".nexus-section-divider-label")?.textContent).toBe("FILE TYPES");
	});

	it("caps the legend height from the config", () => {
		const ctx = makeContext({
			files: [{ path: "a.md" }, { path: "b.png" }, { path: "c.js" }],
			settings: { fileTypeLegendHeight: 220 },
		});
		const el = host();
		renderFileTypeChart(ctx, el, makeConfig({ maxLegendHeight: 300 }));

		const legend = el.querySelector<HTMLElement>(".nexus-filetypes-legend");
		expect(legend?.style.maxHeight).toBe("300px");
	});

	it("falls back to the global legend height setting", () => {
		const ctx = makeContext({
			files: [{ path: "a.md" }],
			settings: { fileTypeLegendHeight: 200 },
		});
		const el = host();
		renderFileTypeChart(ctx, el, makeConfig());

		const legend = el.querySelector<HTMLElement>(".nexus-filetypes-legend");
		expect(legend?.style.maxHeight).toBe("200px");
	});
});
