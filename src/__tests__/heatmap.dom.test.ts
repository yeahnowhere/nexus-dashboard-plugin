// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHeatmap, computeLevelMap } from "../renderer/heatmap";
import { makeContext } from "./helpers/render-context";
import type { HeatmapConfig } from "../types";

function host(): HTMLElement {
	return document.createElement("div");
}

function makeConfig(overrides: Partial<HeatmapConfig> = {}): HeatmapConfig {
	return { kind: "heatmap", show: true, ...overrides };
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date(2026, 7, 6, 12, 0, 0));
});

afterEach(() => {
	vi.useRealTimers();
});

const day = (y: number, m: number, d: number, h = 9): number =>
	new Date(y, m - 1, d, h, 0, 0).getTime();

describe("computeLevelMap", () => {
	it("maps increasing counts to increasing levels", () => {
		const map = computeLevelMap([1, 4, 12, 20]);
		const one = map.get(1) ?? 0;
		const four = map.get(4) ?? 0;
		const twelve = map.get(12) ?? 0;
		const twenty = map.get(20) ?? 0;
		expect(one).toBeLessThan(four);
		expect(four).toBeLessThan(twelve);
		expect(twelve).toBeLessThan(twenty);
		expect(twenty).toBe(5);
	});

	it("keeps a 12-edit day visibly darker than a 1-edit day", () => {
		const map = computeLevelMap([1, 12, 20]);
		expect(map.get(1)).toBe(2);
		expect(map.get(12)).toBe(4);
		expect(map.get(20)).toBe(5);
	});

	it("does not flatten the scale when an outlier day dominates", () => {
		const map = computeLevelMap([1, 12, 20, 300]);
		expect(map.get(1) ?? 0).toBeLessThan(map.get(12) ?? 0);
		expect(map.get(12)).toBe(3);
		expect(map.get(20)).toBe(4);
		expect(map.get(300)).toBe(5);
	});

	it("returns an empty map when there are no nonzero counts", () => {
		expect(computeLevelMap([0, 0, 0]).size).toBe(0);
	});
});

describe("renderHeatmap", () => {
	it("renders a grid with 7 * weeks cells and the weeks CSS variable", () => {
		const ctx = makeContext();
		const el = host();
		renderHeatmap(ctx, el, makeConfig({ weeks: 4 }));

		const heatmap = el.querySelector<HTMLElement>(".nexus-heatmap");
		expect(heatmap).not.toBeNull();
		expect(el.querySelector(".nexus-panel .nexus-heatmap")).not.toBeNull();
		expect(heatmap?.style.getPropertyValue("--nexus-heatmap-weeks")).toBe("4");
		const grid = heatmap?.querySelector<HTMLElement>(".nexus-heatmap-grid");
		expect(grid?.querySelectorAll(".nexus-heatmap-cell").length).toBe(28);
	});

	it("marks cells after today as empty", () => {
		const ctx = makeContext();
		const el = host();
		renderHeatmap(ctx, el, makeConfig({ weeks: 4 }));

		const heatmap = el.querySelector<HTMLElement>(".nexus-heatmap");
		const grid = heatmap?.querySelector<HTMLElement>(".nexus-heatmap-grid");
		expect(grid?.querySelectorAll(".nexus-heatmap-cell-empty").length).toBeGreaterThan(0);
	});

	it("tags today's cell and levels active days from file mtimes", () => {
		const ctx = makeContext({
			files: [
				{ path: "today.md", mtime: day(2026, 8, 6) },
				{ path: "yesterday.md", mtime: day(2026, 8, 5) },
			],
		});
		const el = host();
		renderHeatmap(ctx, el, makeConfig({ weeks: 4 }));

		const heatmap = el.querySelector<HTMLElement>(".nexus-heatmap");
		const grid = heatmap?.querySelector<HTMLElement>(".nexus-heatmap-grid");
		const cells = Array.from(grid?.querySelectorAll<HTMLElement>(".nexus-heatmap-cell") ?? []);

		const todayCell = cells.find((c) => c.classList.contains("nexus-heatmap-cell-today"));
		expect(todayCell).toBeDefined();
		expect(todayCell?.title).toContain("2026-08-06");
		expect(
			todayCell?.className.split(" ").some((c) => /^nexus-heatmap-cell-level-[1-5]$/.test(c)),
		).toBe(true);
	});

	it("counts activity-log events that have no matching vault file", () => {
		const ctx = makeContext({
			settings: {
				activityLog: [{ time: day(2026, 8, 4), action: "created", path: "gone.md" }],
			},
		});
		const el = host();
		renderHeatmap(ctx, el, makeConfig({ weeks: 4 }));

		const summary = el.querySelector(".nexus-heatmap-summary")?.textContent;
		expect(summary).toBe("1 activity · 0-day streak");
	});

	it("gives busier days visibly darker levels than a 1-edit day", () => {
		const files = [
			...Array.from({ length: 20 }, (_, i) => ({ path: `today-${i}.md`, mtime: day(2026, 8, 6) })),
			...Array.from({ length: 12 }, (_, i) => ({ path: `yesterday-${i}.md`, mtime: day(2026, 8, 5) })),
			{ path: "quiet.md", mtime: day(2026, 8, 4) },
		];
		const ctx = makeContext({ files });
		const el = host();
		renderHeatmap(ctx, el, makeConfig({ weeks: 4 }));

		const grid = el.querySelector<HTMLElement>(".nexus-heatmap-grid");
		const cells = Array.from(grid?.querySelectorAll<HTMLElement>(".nexus-heatmap-cell") ?? []);
		const levelOf = (key: string): number => {
			const cell = cells.find((c) => c.title.startsWith(`${key}:`));
			const match = cell?.className.match(/nexus-heatmap-cell-level-(\d)/);
			return match ? Number(match[1]) : 0;
		};
		const today = levelOf("2026-08-06");
		const yesterday = levelOf("2026-08-05");
		const quiet = levelOf("2026-08-04");
		expect(quiet).toBeGreaterThan(0);
		expect(yesterday).toBeGreaterThan(quiet);
		expect(today).toBeGreaterThan(yesterday);
	});

	it("counts only edit actions, ignoring opens/tasks/property edits", () => {
		const ctx = makeContext({
			settings: {
				activityLog: [
					{ time: day(2026, 8, 6, 9), action: "created", path: "a.md" },
					{ time: day(2026, 8, 6, 10), action: "modified", path: "b.md" },
					{ time: day(2026, 8, 6, 11), action: "moved", path: "c.md" },
					{ time: day(2026, 8, 6, 12), action: "renamed", path: "d.md" },
					{ time: day(2026, 8, 6, 13), action: "opened", path: "e.md" },
					{ time: day(2026, 8, 6, 14), action: "task", path: "f.md" },
					{ time: day(2026, 8, 6, 15), action: "property", path: "g.md" },
					{ time: day(2026, 8, 6, 16), action: "deleted", path: "h.md" },
				],
			},
		});
		const el = host();
		renderHeatmap(ctx, el, makeConfig({ weeks: 4 }));

		const summary = el.querySelector(".nexus-heatmap-summary")?.textContent;
		expect(summary).toBe("4 activities · 1-day streak");
	});

	it("falls back to mtime for a file whose only log entry is an older day", () => {
		const ctx = makeContext({
			files: [{ path: "recent.md", mtime: day(2026, 8, 6) }],
			settings: {
				activityLog: [{ time: day(2026, 8, 1), action: "created", path: "recent.md" }],
			},
		});
		const el = host();
		renderHeatmap(ctx, el, makeConfig({ weeks: 4 }));

		const summary = el.querySelector(".nexus-heatmap-summary")?.textContent;
		expect(summary).toBe("2 activities · 1-day streak");
	});

	it("summarizes total activity and current streak", () => {
		const ctx = makeContext({
			files: [
				{ path: "a.md", mtime: day(2026, 8, 6) },
				{ path: "b.md", mtime: day(2026, 8, 6, 10) },
				{ path: "c.md", mtime: day(2026, 8, 5) },
			],
		});
		const el = host();
		renderHeatmap(ctx, el, makeConfig({ weeks: 4 }));

		const summary = el.querySelector(".nexus-heatmap-summary")?.textContent;
		expect(summary).toBe("3 activities · 2-day streak");
	});

	it("renders month labels, day labels, and the legend", () => {
		const ctx = makeContext();
		const el = host();
		renderHeatmap(ctx, el, makeConfig({ weeks: 20 }));

		const heatmap = el.querySelector<HTMLElement>(".nexus-heatmap");
		expect(heatmap?.querySelectorAll(".nexus-heatmap-month-spacer").length).toBeGreaterThan(1);
		expect(heatmap?.querySelectorAll(".nexus-heatmap-day-label").length).toBe(7);
		const legend = heatmap?.querySelector(".nexus-heatmap-legend");
		expect(legend?.textContent).toContain("Less");
		expect(legend?.textContent).toContain("More");
	});

	it("renders the divider label from config", () => {
		const ctx = makeContext();
		const el = host();
		renderHeatmap(ctx, el, makeConfig({ label: "TRAFFIC" }));

		expect(el.querySelector(".nexus-section-divider-label")?.textContent).toBe("TRAFFIC");
	});

	it("falls back to the default label when none is set", () => {
		const ctx = makeContext();
		const el = host();
		renderHeatmap(ctx, el, makeConfig());

		expect(el.querySelector(".nexus-section-divider-label")?.textContent).toBe(
			"CONTRIBUTION ACTIVITY",
		);
	});
});
