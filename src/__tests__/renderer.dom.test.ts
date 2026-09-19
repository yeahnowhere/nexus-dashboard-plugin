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
