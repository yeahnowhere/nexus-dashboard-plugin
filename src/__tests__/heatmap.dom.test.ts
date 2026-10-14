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

function cellTitleFor(scoped: Element, key: string): string | undefined {
	const grid = scoped.querySelector<HTMLElement>(".nexus-heatmap-grid");
	const cells = Array.from(grid?.querySelectorAll<HTMLElement>(".nexus-heatmap-cell") ?? []);
	return cells.find((c) => c.title.startsWith(`${key}:`))?.title;
}

/** Month labels with their grid column (anchor) and span, in render order. */
function monthLabels(scoped: Element): { text: string; anchor: number; span: number }[] {
	const row = scoped.querySelector(".nexus-heatmap-months");
	const spacers = Array.from(
		row?.querySelectorAll<HTMLElement>(".nexus-heatmap-month-spacer") ?? [],
	);
	return spacers
		.filter((s) => s.textContent)
		.map((s) => {
			const m = s.style.gridColumn.match(/^(\d+) \/ span (\d+)$/);
			return {
				text: s.textContent ?? "",
				anchor: Number(m?.[1]) - 2,
				span: Number(m?.[2]),
			};
		});
}

/** Every month anchor must advance, so labels never overlap or go backwards. */
function anchorsMonotonic(labels: { text: string; anchor: number; span: number }[]): void {
	for (let i = 0; i < labels.length; i++) {
		expect(labels[i].anchor).toBeGreaterThanOrEqual(0);
		if (i > 0) expect(labels[i].anchor).toBeGreaterThan(labels[i - 1].anchor);
	}
}

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
		expect(twenty).toBe(4);
	});

	it("keeps a 12-edit day visibly darker than a 1-edit day", () => {
		const map = computeLevelMap([1, 12, 20]);
		expect(map.get(1)).toBe(2);
		expect(map.get(12)).toBe(3);
		expect(map.get(20)).toBe(4);
	});

	it("does not flatten the scale when an outlier day dominates", () => {
		const map = computeLevelMap([1, 12, 20, 300]);
		expect(map.get(1) ?? 0).toBeLessThan(map.get(12) ?? 0);
		expect(map.get(12)).toBe(2);
		expect(map.get(20)).toBe(3);
		expect(map.get(300)).toBe(4);
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
			todayCell?.className.split(" ").some((c) => /^nexus-heatmap-cell-level-[1-4]$/.test(c)),
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

		expect(cellTitleFor(el, "2026-08-04")).toBe("2026-08-04: 1 file");
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

		expect(cellTitleFor(el, "2026-08-06")).toBe("2026-08-06: 4 files");
	});

	it("counts mtime only for files with no log entry", () => {
		const ctx = makeContext({
			files: [
				{ path: "logged.md", mtime: day(2026, 8, 6) },
				{ path: "untracked.md", mtime: day(2026, 8, 5) },
			],
			settings: {
				activityLog: [{ time: day(2026, 8, 1), action: "created", path: "logged.md" }],
			},
		});
		const el = host();
		renderHeatmap(ctx, el, makeConfig({ weeks: 4 }));

		expect(cellTitleFor(el, "2026-08-01")).toBe("2026-08-01: 1 file");
		expect(cellTitleFor(el, "2026-08-06")).toBe("2026-08-06: 0 files");
		expect(cellTitleFor(el, "2026-08-05")).toBe("2026-08-05: 1 file");
	});

	it("renders month labels and day labels", () => {
		const ctx = makeContext();
		const el = host();
		renderHeatmap(ctx, el, makeConfig({ weeks: 20 }));

		const heatmap = el.querySelector<HTMLElement>(".nexus-heatmap");
		expect(heatmap?.querySelectorAll(".nexus-heatmap-month-spacer").length).toBeGreaterThan(1);
		expect(heatmap?.querySelectorAll(".nexus-heatmap-day-label").length).toBe(7);
	});

	it("anchors month labels to the week column where each month starts", () => {
		const ctx = makeContext();
		const el = host();
		renderHeatmap(ctx, el, makeConfig({ weeks: 20 }));

		const heatmap = el.querySelector<HTMLElement>(".nexus-heatmap");
		const labels = Array.from(
			heatmap?.querySelectorAll<HTMLElement>(".nexus-heatmap-month-spacer") ?? [],
		).filter((s) => s.textContent);

		// System time is 2026-08-06 with 20 weeks: range starts Sun 2026-03-22.
		// March is cut at the left edge, so labels run Apr..Aug and each label
		// begins at the column containing that month's 1st (grid line start+2).
		expect(labels.map((l) => l.textContent)).toEqual(["Apr", "May", "Jun", "Jul", "Aug"]);

		const parse = (gc: string): { start: number; span: number } => {
			const m = gc.match(/^(\d+) \/ span (\d+)$/);
			return { start: Number(m?.[1]), span: Number(m?.[2]) };
		};

		const dayMs = 86_400_000;
		// Exact calendar-day distance (date-only UTC), matching the renderer.
		const utcDay = (d: Date): number => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
		const rangeStart = new Date(2026, 2, 22);
		const colFor = (month: number): number => {
			const first = new Date(2026, month, 1);
			return Math.floor((utcDay(first) - utcDay(rangeStart)) / dayMs / 7);
		};

		const starts = labels.map((l) => parse(l.style.gridColumn).start);
		const anchors = starts.map((s) => s - 2);
		expect(anchors).toEqual([3, 4, 5, 6, 7].map((m) => colFor(m)));

		for (let i = 0; i < starts.length; i++) {
			expect(starts[i]).toBeGreaterThanOrEqual(2);
			if (i > 0) expect(starts[i]).toBeGreaterThan(starts[i - 1]);
		}

		const last = parse(labels[labels.length - 1].style.gridColumn);
		expect(last.start + last.span).toBeLessThanOrEqual(22);
	});

	it("anchors a month whose 1st falls on the week column's last day without shifting right", () => {
		// 2026-08-06 with 20 weeks starts Sun 2026-03-22, so Aug 1 2026 (a Saturday)
		// is the last day of its week column. The label must sit on that column,
		// not one column to the right.
		const ctx = makeContext();
		const el = host();
		renderHeatmap(ctx, el, makeConfig({ weeks: 20 }));

		const labels = monthLabels(el);
		const aug = labels.find((l) => l.text === "Aug");
		expect(aug).toBeDefined();

		const utcDay = (d: Date): number => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
		const dayMs = 86_400_000;
		const start = new Date(2026, 2, 22);
		const aug1 = new Date(2026, 7, 1);
		const expectedCol = Math.floor((utcDay(aug1) - utcDay(start)) / dayMs / 7);
		expect(aug?.anchor).toBe(expectedCol);
	});

	it("keeps month labels chronological when the range crosses a year boundary", () => {
		vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0)); // 2026-01-15, 8 weeks → starts Sun 2025-11-23
		const ctx = makeContext();
		const el = host();
		renderHeatmap(ctx, el, makeConfig({ weeks: 8 }));

		const labels = monthLabels(el);
		expect(labels.map((l) => l.text)).toEqual(["Dec", "Jan"]);
		anchorsMonotonic(labels);
		expect(labels[0].anchor).toBe(1);
		expect(labels[1].anchor).toBe(5);
	});

	it("shows repeated month names across a range longer than a year without colliding", () => {
		vi.setSystemTime(new Date(2025, 0, 1, 12, 0, 0)); // 2025-01-01, 53 weeks → starts Sun 2023-12-31
		const ctx = makeContext();
		const el = host();
		renderHeatmap(ctx, el, makeConfig({ weeks: 53 }));

		const labels = monthLabels(el);
		// Jan appears in both 2024 and 2025 — a month-only key would drop/overlap it.
		expect(labels.map((l) => l.text)).toEqual([
			"Jan",
			"Feb",
			"Mar",
			"Apr",
			"May",
			"Jun",
			"Jul",
			"Aug",
			"Sep",
			"Oct",
			"Nov",
			"Dec",
			"Jan",
		]);
		anchorsMonotonic(labels);
		expect(labels[0].anchor).toBe(0);
		expect(labels[labels.length - 1].anchor).toBe(52);
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
