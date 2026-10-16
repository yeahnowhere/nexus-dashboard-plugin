// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { NexusRenderer } from "../renderer/index";
import { Notice } from "./helpers/obsidian-mock";
import { makeContext } from "./helpers/render-context";
import type { MakeContextOptions } from "./helpers/render-context";
import type NexusDashboardPlugin from "../main";

function mount(
	source: string,
	options: MakeContextOptions = {},
): { el: HTMLElement; renderer: NexusRenderer } {
	const ctx = makeContext(options);
	const plugin = {
		app: ctx.app,
		settings: ctx.settings,
		getRecentFiles: ctx.getRecentFiles,
		saveSettings: ctx.saveSettings,
		activeRenderers: new Set<NexusRenderer>(),
	} as unknown as NexusDashboardPlugin;
	const el = document.createElement("div");
	const renderer = new NexusRenderer(el, plugin, source, ctx.sourcePath);
	return { el, renderer };
}

beforeEach(() => {
	Notice.instances = [];
});

describe("NexusRenderer block merge", () => {
	it("renders a standalone tasks: block instead of wiping it", async () => {
		const { el, renderer } = mount("tasks:");
		await renderer.onload();
		renderer.onunload();
		expect(el.querySelector(".nexus-tasks")).not.toBeNull();
	});

	it("renders every tasks: block in a multi-block source", async () => {
		const { el, renderer } = mount("tasks:\ntasks:\n- label: General");
		await renderer.onload();
		renderer.onunload();
		expect(el.querySelectorAll(".nexus-tasks").length).toBe(2);
	});

	it("applies the per-file-type-list legend height from settings", async () => {
		const { el, renderer } = mount("", {
			files: [{ path: "Docs/a.md" }, { path: "Docs/b.png" }],
			settings: {
				showFileTypeChart: true,
				fileTypeLists: [{ name: "Docs", path: "", label: "", height: 220 }],
				rowLayouts: [
					{
						name: "Row",
						columns: 1,
						proportion: "100",
						align: "stretch",
						slots: ["filetypes"],
						fileTypeListSlots: { "0": "Docs" },
					},
				],
			},
		});
		await renderer.onload();
		renderer.onunload();

		const legend = el.querySelector<HTMLElement>(".nexus-filetypes-legend");
		expect(legend).not.toBeNull();
		expect(legend?.style.maxHeight).toBe("220px");
	});

	it("falls back to the global legend height when no list override is set", async () => {
		const { el, renderer } = mount("", {
			files: [{ path: "a.md" }, { path: "b.png" }],
			settings: {
				showFileTypeChart: true,
				fileTypeLegendHeight: 160,
				rowLayouts: [
					{
						name: "Row",
						columns: 1,
						proportion: "100",
						align: "stretch",
						slots: ["filetypes"],
					},
				],
			},
		});
		await renderer.onload();
		renderer.onunload();

		const legend = el.querySelector<HTMLElement>(".nexus-filetypes-legend");
		expect(legend).not.toBeNull();
		expect(legend?.style.maxHeight).toBe("160px");
	});

	it("repopulates tasks when the metadata cache settles after a cold start", async () => {
		const ctx = makeContext({
			files: [{ path: "Tasks.md", content: "- [ ] Cold start task" }],
		});
		const plugin = {
			app: ctx.app,
			settings: ctx.settings,
			getRecentFiles: ctx.getRecentFiles,
			saveSettings: ctx.saveSettings,
			activeRenderers: new Set<NexusRenderer>(),
		} as unknown as NexusDashboardPlugin;
		const el = document.createElement("div");
		const renderer = new NexusRenderer(el, plugin, "tasks:", ctx.sourcePath);

		// First render happens before Obsidian finishes indexing: the metadata
		// cache exposes no `listItems`, so the block shows the empty state.
		await renderer.onload();
		expect(el.querySelector(".nexus-tasks-empty")).not.toBeNull();

		// The metadata cache settles and now exposes the file's list items.
		ctx.fileSpecs[0].listItems = [{ task: " ", position: { start: { line: 0 } } }];

		await renderer.render();
		renderer.onunload();
		expect(el.querySelector(".nexus-tasks-empty")).toBeNull();
		expect(el.querySelector(".nexus-tasks-stat-value")?.textContent).toBe("1");
		expect(el.querySelector(".nexus-tasks-item-text")?.textContent).toBe("Cold start task");
	});
});

/** Top-level (direct child) elements of the dashboard container with a class. */
function topLevel(el: HTMLElement, cls: string): HTMLElement[] {
	return Array.from(el.children).filter((c) => c.classList.contains(cls)) as HTMLElement[];
}

describe("buildConfigFromSettings layout assembly", () => {
	it("assembles row layouts including a nested row sub-slot", async () => {
		const { el, renderer } = mount("", {
			files: [{ path: "a.md" }],
			settings: {
				rowLayouts: [
					{ name: "R1", columns: 1, proportion: "100", align: "stretch", slots: ["stats"] },
					{
						name: "R2",
						columns: 2,
						proportion: "50/50",
						align: "top",
						slots: [
							"timeline",
							[
								{
									name: "Nested",
									columns: 2,
									proportion: "50/50",
									align: "top",
									slots: ["moc-cards", "heatmap"],
								},
							],
						],
					},
				],
			},
		});
		await renderer.onload();
		renderer.onunload();

		expect(topLevel(el, "nexus-row").length).toBe(2);
		// The array sub-slot recurses into a nested row inside a column.
		expect(el.querySelector(".nexus-column .nexus-row")).not.toBeNull();
		expect(el.querySelector(".nexus-stats")).not.toBeNull();
		expect(el.querySelector(".nexus-timeline-root")).not.toBeNull();
		expect(el.querySelector(".nexus-heatmap")).not.toBeNull();
	});

	it("falls back to the default layout and appends unplaced blocks", async () => {
		const { el, renderer } = mount("", {
			files: [{ path: "a.md" }],
			settings: {
				rowLayouts: [],
				columnLayouts: [],
				showClock: true,
				showFileTypeChart: true,
				showQuickLinks: false,
			},
		});
		await renderer.onload();
		renderer.onunload();

		// Row 1 (stats | clock) + row 2 (timeline | moc-cards | heatmap)
		expect(topLevel(el, "nexus-row").length).toBe(2);
		expect(el.querySelector(".nexus-stats")).not.toBeNull();
		expect(el.querySelector(".nexus-clock")).not.toBeNull();
		// Stats is placed inside a row, so no duplicate top-level stats bar.
		expect(topLevel(el, "nexus-stats").length).toBe(0);
		// filetypes never fits a default slot → appended as a standalone block.
		expect(el.querySelector(".nexus-filetypes")).not.toBeNull();
	});

	it("builds column layouts from settings", async () => {
		const { el, renderer } = mount("", {
			files: [{ path: "a.md" }],
			settings: {
				rowLayouts: [],
				columnLayouts: [
					{ name: "C1", slots: ["filetypes", "heatmap"], spacing: "1rem", align: "stretch" },
				],
			},
		});
		await renderer.onload();
		renderer.onunload();

		const columns = topLevel(el, "nexus-column");
		expect(columns.length).toBe(1);
		expect(columns[0].querySelector(".nexus-filetypes")).not.toBeNull();
		expect(columns[0].querySelector(".nexus-heatmap")).not.toBeNull();
	});
});
