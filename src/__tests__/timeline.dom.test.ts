// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderTimeline, formatRelativeTime, timelineDayInfo } from "../renderer/timeline";
import { Notice } from "./helpers/obsidian-mock";
import { makeContext } from "./helpers/render-context";
import type { TimelineConfig } from "../types";

function host(): HTMLElement {
	return document.createElement("div");
}

function makeConfig(overrides: Partial<TimelineConfig> = {}): TimelineConfig {
	return { kind: "timeline", show: true, ...overrides };
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date(2026, 7, 6, 12, 0, 0));
	Notice.instances = [];
});

afterEach(() => {
	vi.useRealTimers();
});

const day = (y: number, m: number, d: number, h = 9, min = 0): number =>
	new Date(y, m - 1, d, h, min, 0).getTime();

describe("renderTimeline", () => {
	it("renders the root with a section and divider label", () => {
		const ctx = makeContext();
		const el = host();
		renderTimeline(ctx, el, makeConfig({ label: "CHANGELOG" }));

		expect(el.querySelector(".nexus-timeline-root .nexus-section")).not.toBeNull();
		expect(el.querySelector(".nexus-timeline-root .nexus-panel")).not.toBeNull();
		expect(el.querySelector(".nexus-section-divider-label")?.textContent).toBe("CHANGELOG");
	});

	it("renders an empty state when there are no events", () => {
		const ctx = makeContext();
		const el = host();
		renderTimeline(ctx, el, makeConfig());

		const empty = el.querySelector(".nexus-timeline-empty");
		expect(empty).not.toBeNull();
		expect(empty?.textContent).toBe("No activity recorded yet.");
	});

	it("renders one row per recent file with a modified action", () => {
		const ctx = makeContext({
			files: [
				{ path: "b.md", mtime: day(2026, 8, 6, 11) },
				{ path: "a.md", mtime: day(2026, 8, 6, 10) },
			],
		});
		const el = host();
		renderTimeline(ctx, el, makeConfig({ showDate: false }));

		const rows = el.querySelectorAll(".nexus-timeline-row");
		expect(rows.length).toBe(2);
		const action = rows[0]?.querySelector(".nexus-timeline-action--modified");
		expect(action).not.toBeNull();
		expect(action?.querySelector(".nexus-timeline-glyph")?.textContent).toBe("~");
		expect(action?.textContent).toContain("MODIFIED");
	});

	it("groups rows by day with dataset keys when showDate is enabled", () => {
		const ctx = makeContext({
			files: [
				{ path: "a.md", mtime: day(2026, 8, 6, 11) },
				{ path: "b.md", mtime: day(2026, 8, 5, 10) },
			],
		});
		const el = host();
		renderTimeline(ctx, el, makeConfig());

		const days = el.querySelectorAll<HTMLElement>(".nexus-timeline-day");
		expect(days.length).toBe(2);
		expect(days[0]?.dataset.key).toBe("2026-08-06");
		expect(days[0]?.textContent).toBe("Today");
		expect(days[1]?.dataset.key).toBe("2026-08-05");
		expect(days[1]?.textContent).toBe("Yesterday");
	});

	it("renders relative timestamps when enabled and absolute otherwise", () => {
		const ctx = makeContext({
			files: [{ path: "a.md", mtime: day(2026, 8, 6, 11, 55) }],
		});
		const el = host();
		renderTimeline(ctx, el, makeConfig({ showDate: false, relative: true }));

		const relative = el.querySelector<HTMLElement>(".nexus-timeline-time");
		expect(relative?.dataset.relative).toBe("1");
		expect(relative?.dataset.ts).toBe(String(day(2026, 8, 6, 11, 55)));
		expect(relative?.textContent).toBe("5m ago");

		const el2 = host();
		renderTimeline(ctx, el2, makeConfig({ showDate: false, relative: false }));
		const absolute = el2.querySelector<HTMLElement>(".nexus-timeline-time");
		expect(absolute?.dataset.relative).toBeUndefined();
	});

	it("pairs a delete+create into a renamed row showing the old path", () => {
		const createdAt = day(2026, 8, 6, 11, 0) + 2000;
		const ctx = makeContext({
			settings: {
				activityLog: [
					{ time: day(2026, 8, 6, 11, 0), action: "deleted", path: "Notes/A.md" },
					{ time: createdAt, action: "created", path: "Notes/B.md" },
				],
			},
		});
		const el = host();
		renderTimeline(ctx, el, makeConfig({ showDate: false }));

		const row = el.querySelector(".nexus-timeline-row");
		expect(row?.querySelector(".nexus-timeline-action--renamed")).not.toBeNull();
		expect(row?.querySelector(".nexus-timeline-glyph")?.textContent).toBe("✎");
		expect(row?.querySelector(".nexus-timeline-path-old")?.textContent).toBe("Notes/A.md");
		expect(row?.querySelector(".nexus-timeline-path")?.textContent).toContain("Notes/B.md");
	});

	it("marks deleted rows and shows a Notice when clicked", () => {
		const ctx = makeContext({
			settings: {
				activityLog: [{ time: day(2026, 8, 6, 11), action: "deleted", path: "gone.md" }],
			},
		});
		const el = host();
		renderTimeline(ctx, el, makeConfig({ showDate: false }));

		const row = el.querySelector<HTMLElement>(".nexus-timeline-row");
		expect(row?.classList.contains("is-deleted")).toBe(true);

		row?.click();
		expect(Notice.instances[Notice.instances.length - 1]?.message).toBe(
			"This entry is no longer in the vault.",
		);
		expect(ctx.openLinkText).not.toHaveBeenCalled();
	});

	it("opens the file when a live row is clicked", () => {
		const ctx = makeContext({
			files: [{ path: "a.md", mtime: day(2026, 8, 6, 11) }],
		});
		const el = host();
		renderTimeline(ctx, el, makeConfig({ showDate: false }));

		el.querySelector<HTMLElement>(".nexus-timeline-row")?.click();
		expect(ctx.openLinkText).toHaveBeenCalledWith("a.md", "", false);
	});

	it("groups by file and shows a count badge", () => {
		const ctx = makeContext({
			settings: {
				activityLog: [
					{ time: day(2026, 8, 6, 11), action: "created", path: "a.md" },
					{ time: day(2026, 8, 6, 10), action: "modified", path: "a.md" },
				],
				activityTimelineGroup: "file",
			},
		});
		const el = host();
		renderTimeline(ctx, el, makeConfig({ showDate: false, group: "file" }));

		const rows = el.querySelectorAll(".nexus-timeline-row");
		expect(rows.length).toBe(1);
		expect(rows[0]?.querySelector(".nexus-timeline-badge")?.textContent).toBe("+1");
	});

	it("renders all events without a Show more button", () => {
		const ctx = makeContext({
			settings: {
				activityLog: [
					{ time: day(2026, 8, 6, 11), action: "modified", path: "a.md" },
					{ time: day(2026, 8, 6, 10), action: "modified", path: "b.md" },
					{ time: day(2026, 8, 6, 9), action: "modified", path: "c.md" },
				],
			},
		});
		const el = host();
		renderTimeline(ctx, el, makeConfig({ showDate: false }));

		expect(el.querySelectorAll(".nexus-timeline-row").length).toBe(3);
		expect(el.querySelector(".nexus-timeline-more")).toBeNull();
	});

	it("applies the fade mask and max-height", () => {
		const ctx = makeContext({
			files: [{ path: "a.md", mtime: day(2026, 8, 6, 11) }],
		});
		const el = host();
		renderTimeline(ctx, el, makeConfig({ showDate: false }));

		const list = el.querySelector<HTMLElement>(".nexus-timeline");
		expect(list?.classList.contains("nexus-fade-mask")).toBe(true);
		expect(list?.style.maxHeight).toBe("410px");
	});
});

describe("formatRelativeTime", () => {
	it("labels recent, hourly, daily, and older timestamps", () => {
		const now = new Date(2026, 7, 6, 12, 0, 0).getTime();
		expect(formatRelativeTime(now - 10_000)).toBe("just now");
		expect(formatRelativeTime(now - 5 * 60_000)).toBe("5m ago");
		expect(formatRelativeTime(now - 3 * 3_600_000)).toBe("3h ago");
		expect(formatRelativeTime(now - 2 * 86_400_000)).toBe("2d ago");
	});
});

describe("timelineDayInfo", () => {
	it("classifies today, yesterday, and older days", () => {
		expect(timelineDayInfo(day(2026, 8, 6, 8)).label).toBe("Today");
		expect(timelineDayInfo(day(2026, 8, 5, 8)).label).toBe("Yesterday");
		const older = timelineDayInfo(day(2026, 8, 1, 8));
		expect(older.label).toMatch(/Aug/);
		expect(older.key).toBe("2026-08-01");
	});
});
