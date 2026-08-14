// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderTaskSummary } from "../renderer/task-summary";
import { Notice } from "./helpers/obsidian-mock";
import { makeContext } from "./helpers/render-context";
import type { FakeListItem } from "./helpers/render-context";
import type { TaskSummaryConfig } from "../types";

function host(): HTMLElement {
	return document.createElement("div");
}

function makeConfig(overrides: Partial<TaskSummaryConfig> = {}): TaskSummaryConfig {
	return { kind: "tasks", show: true, ...overrides };
}

function li(line: number, task?: string): FakeListItem {
	return { task, position: { start: { line } } };
}

const SAMPLE_CONTENT = [
	"- [ ] Write tests 📅 2026-08-01",
	"- [x] Ship it",
	"- [ ] Read a book",
	"- [ ] Call mom 📅 2026-08-20",
	"- [ ] Fix bug due: 2026-08-06",
].join("\n");

const SAMPLE_LIST_ITEMS: FakeListItem[] = [
	li(0, " "),
	li(1, "x"),
	li(2, " "),
	li(3, " "),
	li(4, " "),
];

async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date(2026, 7, 6, 12, 0, 0));
	Notice.instances = [];
});

afterEach(() => {
	vi.useRealTimers();
});

describe("renderTaskSummary", () => {
	it("renders an empty state when the vault has no tasks", async () => {
		const ctx = makeContext({ files: [{ path: "A.md", content: "no tasks here" }] });
		const el = host();
		await renderTaskSummary(ctx, el, makeConfig());

		const empty = el.querySelector(".nexus-tasks-empty");
		expect(empty).not.toBeNull();
		expect(empty?.textContent).toBe("No tasks found");
		expect(el.querySelector(".nexus-tasks-stats")).toBeNull();
	});

	it("renders stats and progress for a sample file", async () => {
		const ctx = makeContext({
			files: [{ path: "A.md", content: SAMPLE_CONTENT, listItems: SAMPLE_LIST_ITEMS }],
		});
		const el = host();
		await renderTaskSummary(ctx, el, makeConfig());

		const values = Array.from(el.querySelectorAll(".nexus-tasks-stat-value")).map(
			(n) => n.textContent,
		);
		expect(values).toEqual(["5", "1", "4", "20%"]);

		const fill = el.querySelector<HTMLElement>(".nexus-tasks-progress-fill");
		expect(fill?.style.width).toBe("20%");
		expect(el.querySelector(".nexus-tasks-progress-pct")?.textContent).toBe("20%");
	});

	it("renders the due-date summary strip", async () => {
		const ctx = makeContext({
			files: [{ path: "A.md", content: SAMPLE_CONTENT, listItems: SAMPLE_LIST_ITEMS }],
		});
		const el = host();
		await renderTaskSummary(ctx, el, makeConfig());

		const chips = Array.from(el.querySelectorAll(".nexus-tasks-due-chip")).map((n) => n.textContent);
		expect(chips).toEqual(["1 overdue", "1 today"]);
	});

	it("groups open tasks by due bucket in order", async () => {
		const ctx = makeContext({
			files: [{ path: "A.md", content: SAMPLE_CONTENT, listItems: SAMPLE_LIST_ITEMS }],
		});
		const el = host();
		await renderTaskSummary(ctx, el, makeConfig());

		const groups = Array.from(el.querySelectorAll(".nexus-tasks-group-header"));
		expect(groups.map((g) => g.querySelector(".nexus-tasks-group-name")?.textContent)).toEqual([
			"Overdue",
			"Today",
			"Upcoming",
			"No due date",
		]);
		expect(groups[0]?.querySelector(".nexus-tasks-group-count")?.textContent).toBe("1 task");

		const items = Array.from(el.querySelectorAll(".nexus-tasks-item-text")).map((n) => n.textContent);
		expect(items[0]).toContain("Write tests");
		expect(items[3]).toBe("Read a book");
	});

	it("marks due elements with the bucket class and title", async () => {
		const ctx = makeContext({
			files: [{ path: "A.md", content: SAMPLE_CONTENT, listItems: SAMPLE_LIST_ITEMS }],
		});
		const el = host();
		await renderTaskSummary(ctx, el, makeConfig());

		const due = el.querySelector<HTMLElement>(".nexus-tasks-due-overdue");
		expect(due).not.toBeNull();
		expect(due?.title).toBe("2026-08-01");
		expect(el.querySelector<HTMLElement>(".nexus-tasks-due-today")?.title).toBe("2026-08-06");
	});

	it("filters by config path", async () => {
		const ctx = makeContext({
			files: [
				{
					path: "Project/A.md",
					content: "- [ ] Project task",
					listItems: [li(0, " ")],
				},
				{
					path: "Other/B.md",
					content: "- [ ] Other task",
					listItems: [li(0, " ")],
				},
			],
		});
		const el = host();
		await renderTaskSummary(ctx, el, makeConfig({ path: "Project" }));

		expect(el.querySelector(".nexus-tasks-stat-value")?.textContent).toBe("1");
		expect(el.querySelector(".nexus-tasks-item-text")?.textContent).toBe("Project task");
	});

	it("filters by frontmatter tags", async () => {
		const ctx = makeContext({
			files: [
				{
					path: "A.md",
					content: "- [ ] Tagged task",
					listItems: [li(0, " ")],
					frontmatterTags: ["urgent"],
				},
				{
					path: "B.md",
					content: "- [ ] Untagged task",
					listItems: [li(0, " ")],
				},
			],
		});
		const el = host();
		await renderTaskSummary(ctx, el, makeConfig({ tags: ["urgent"] }));

		expect(el.querySelector(".nexus-tasks-stat-value")?.textContent).toBe("1");
		expect(el.querySelector(".nexus-tasks-item-text")?.textContent).toBe("Tagged task");
	});

	it("omits the progress bar when showProgress is false", async () => {
		const ctx = makeContext({
			files: [{ path: "A.md", content: SAMPLE_CONTENT, listItems: SAMPLE_LIST_ITEMS }],
		});
		const el = host();
		await renderTaskSummary(ctx, el, makeConfig({ showProgress: false }));

		expect(el.querySelector(".nexus-tasks-progress")).toBeNull();
		expect(el.querySelector(".nexus-tasks-stats")).not.toBeNull();
	});

	it("limits the list and shows a remaining-count line", async () => {
		const ctx = makeContext({
			files: [{ path: "A.md", content: SAMPLE_CONTENT, listItems: SAMPLE_LIST_ITEMS }],
		});
		const el = host();
		await renderTaskSummary(ctx, el, makeConfig({ count: 2 }));

		expect(el.querySelectorAll(".nexus-tasks-item").length).toBe(2);
		expect(el.querySelector(".nexus-tasks-more")?.textContent).toContain("+2 more");
	});

	it("renders checkboxes only when checkable", async () => {
		const ctx = makeContext({
			files: [{ path: "A.md", content: SAMPLE_CONTENT, listItems: SAMPLE_LIST_ITEMS }],
		});

		const withCheckbox = host();
		await renderTaskSummary(ctx, withCheckbox, makeConfig());
		expect(withCheckbox.querySelector(".nexus-tasks-checkbox")).not.toBeNull();

		const withoutCheckbox = host();
		await renderTaskSummary(ctx, withoutCheckbox, makeConfig({ checkable: false }));
		expect(withoutCheckbox.querySelector(".nexus-tasks-checkbox")).toBeNull();
	});

	it("opens the file at the task line when an item is clicked", async () => {
		const ctx = makeContext({
			files: [{ path: "A.md", content: SAMPLE_CONTENT, listItems: SAMPLE_LIST_ITEMS }],
		});
		const el = host();
		await renderTaskSummary(ctx, el, makeConfig());

		const item = el.querySelector<HTMLElement>(".nexus-tasks-item");
		item?.click();
		expect(ctx.openLinkText).toHaveBeenCalledWith("A.md", "", false, { state: { line: 0 } });
	});

	it("shows a Notice and rerenders when toggling a task fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const ctx = makeContext({
			files: [{ path: "A.md", content: SAMPLE_CONTENT, listItems: SAMPLE_LIST_ITEMS }],
		});
		const el = host();
		await renderTaskSummary(ctx, el, makeConfig());

		const checkbox = el.querySelector<HTMLInputElement>(".nexus-tasks-checkbox");
		expect(checkbox).not.toBeNull();
		checkbox?.dispatchEvent(new Event("change"));
		await flush();

		expect(Notice.instances[Notice.instances.length - 1]?.message).toBe(
			"Failed to update the task file",
		);
		expect(ctx.rerender).toHaveBeenCalled();
		vi.restoreAllMocks();
	});
});
