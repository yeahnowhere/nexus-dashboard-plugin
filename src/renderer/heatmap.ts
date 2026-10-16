import { dateKey } from "../utils";
import type { HeatmapConfig } from "../types";
import type { RendererContext } from "./context";
import { renderDivider } from "./dividers";

/** Actions that represent real file edits (creates, writes, renames, moves). */
const EDIT_ACTIONS = new Set(["created", "modified", "moved", "renamed"]);

/**
 * Base SVG geometry, in user units. The whole chart scales to the panel width
 * via `viewBox` + `width: 100%`, so these numbers only set the proportions
 * (cell size, gutter, gaps) — never a pixel overflow.
 */
export const HEATMAP_GEOMETRY = {
	/** Day square edge length. */
	cell: 11,
	/** Gap between day squares. */
	gap: 2,
	/** Left gutter reserved for the Mon/Wed/Fri day labels. */
	dayLabelWidth: 28,
	/** Top band reserved for the month labels. */
	monthLabelHeight: 16,
	/** Day square corner radius. */
	cellRadius: 2,
} as const;

/** Column pitch (cell + gap) and derived grid metrics. */
const PITCH = HEATMAP_GEOMETRY.cell + HEATMAP_GEOMETRY.gap;

/** Months whose first day anchors a label. */
const MONTH_NAMES = [
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
];

/** Day-label rows (Mon, Wed, Fri) keyed by weekday index. */
const DAY_LABELS: Record<number, string> = { 1: "Mon", 3: "Wed", 5: "Fri" };

/**
 * Build an intensity level (1..4) for each distinct nonzero day count. Levels
 * are assigned by rank (quantile-ish), so common low counts stay light and a
 * single outlier day can't flatten the rest of the scale.
 */
export function computeLevelMap(counts: number[]): Map<number, number> {
	const map = new Map<number, number>();
	const unique = Array.from(new Set(counts.filter((c) => c > 0))).sort((a, b) => a - b);
	const n = unique.length;
	if (n === 0) return map;
	for (let i = 0; i < n; i++) {
		const fraction = (i + 1) / n;
		map.set(unique[i], Math.min(4, Math.max(1, Math.ceil(fraction * 4))));
	}
	return map;
}

/**
 * Render a GitHub-style contribution heatmap as a single, self-scaling SVG.
 * One coordinate system means the outer week columns can never be clipped by
 * nested-grid rounding; the chart simply scales to its panel.
 */
export function renderHeatmap(
	ctx: RendererContext,
	containerEl: HTMLElement,
	config: HeatmapConfig,
): void {
	const weeks = config.weeks || 20;
	const label = config.label || (ctx.settings.showHeatmapDivider ? "CONTRIBUTION ACTIVITY" : "");
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const todayKey = dateKey(today);

	// Calculate start date (beginning of week, going back N weeks)
	const startDate = new Date(today);
	startDate.setDate(startDate.getDate() - (weeks - 1) * 7 - startDate.getDay());

	// Count unique (path, day) edit activity. A file is counted via the log on
	// days the log records an edit for it (created/modified/moved/renamed only —
	// opens, task toggles and property edits are not edits). Files with no log
	// entry at all fall back to a single mtime count, so activity from before
	// the log window still shows — but a logged file's mtime is never counted,
	// so mtime can't inflate (or double-count) recent days.
	const dayCounts = new Map<string, number>();
	const counted = new Set<string>();
	const loggedPaths = new Set<string>();

	for (const event of ctx.settings.activityLog || []) {
		if (!EDIT_ACTIONS.has(event.action)) continue;
		loggedPaths.add(event.path);
		const key = dateKey(new Date(event.time));
		const pair = `${key}|${event.path}`;
		if (counted.has(pair)) continue;
		counted.add(pair);
		dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
	}

	for (const file of ctx.snapshot.markdownFiles()) {
		if (loggedPaths.has(file.path)) continue;
		const key = dateKey(new Date(file.stat.mtime));
		const pair = `${key}|${file.path}`;
		if (counted.has(pair)) continue;
		counted.add(pair);
		dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
	}

	// Collect displayed-day counts for the rank-based color scale
	const displayedCounts: number[] = [];
	for (let d = 0; d < 7; d++) {
		for (let w = 0; w < weeks; w++) {
			const cellDate = new Date(startDate);
			cellDate.setDate(cellDate.getDate() + w * 7 + d);
			if (cellDate > today) continue;
			const count = dayCounts.get(dateKey(cellDate)) || 0;
			if (count > 0) displayedCounts.push(count);
		}
	}
	const levelByCount = computeLevelMap(displayedCounts);

	const wrapper = containerEl.createDiv({ cls: "nexus-section" });
	if (label) {
		renderDivider(ctx, wrapper, label);
	}

	const panel = wrapper.createDiv({ cls: "nexus-panel" });
	const heatmapEl = panel.createDiv({ cls: "nexus-heatmap" });

	// One SVG, one coordinate system. The grid occupies the gutter + `weeks`
	// columns; the top band holds the month labels.
	const gridWidth = weeks * PITCH - HEATMAP_GEOMETRY.gap;
	const width = HEATMAP_GEOMETRY.dayLabelWidth + gridWidth;
	const height = HEATMAP_GEOMETRY.monthLabelHeight + 7 * PITCH - HEATMAP_GEOMETRY.gap;

	// Build the SVG off-DOM and attach it once: ~150 cells + labels would
	// otherwise each invalidate layout on the live tree as they are appended.
	const svgHost = document.createElement("div");
	const svg = svgHost.createSvg("svg", {
		cls: "nexus-heatmap-svg",
		attr: {
			viewBox: `0 0 ${width} ${height}`,
			preserveAspectRatio: "xMidYMid meet",
			role: "img",
			"aria-label": `Contribution activity, last ${weeks} weeks`,
		},
	});

	renderMonthLabels(svg, startDate, today, weeks);
	renderDayLabels(svg);

	// Day grid: one square per (week, weekday). Filled row-major by weekday so
	// columns read as weeks, exactly like GitHub.
	for (let d = 0; d < 7; d++) {
		for (let w = 0; w < weeks; w++) {
			const cellDate = new Date(startDate);
			cellDate.setDate(cellDate.getDate() + w * 7 + d);
			const key = dateKey(cellDate);
			const count = dayCounts.get(key) || 0;

			const classes = ["nexus-heatmap-cell"];
			if (cellDate > today) {
				classes.push("nexus-heatmap-cell-empty");
			} else if (count === 0) {
				classes.push("nexus-heatmap-cell-level-0");
			} else {
				const level = levelByCount.get(count) ?? 1;
				classes.push(`nexus-heatmap-cell-level-${level}`);
			}
			if (key === todayKey) classes.push("nexus-heatmap-cell-today");

			const x = HEATMAP_GEOMETRY.dayLabelWidth + w * PITCH;
			const y = HEATMAP_GEOMETRY.monthLabelHeight + d * PITCH;
			const rect = svg.createSvg("rect", {
				cls: classes,
				attr: {
					x,
					y,
					width: HEATMAP_GEOMETRY.cell,
					height: HEATMAP_GEOMETRY.cell,
					rx: HEATMAP_GEOMETRY.cellRadius,
				},
			});

			const title = rect.createSvg("title", {});
			title.textContent = `${key}: ${count} file${count !== 1 ? "s" : ""}`;
		}
	}

	heatmapEl.appendChild(svg);
}

/**
 * Draw one month label per month occurrence in the range, anchored to the week
 * column that contains that month's 1st (GitHub-style). Keyed chronologically
 * so a range that crosses a year boundary — or repeats a month name over 52+
 * weeks — keeps every label in order instead of colliding.
 */
function renderMonthLabels(svg: SVGSVGElement, startDate: Date, today: Date, weeks: number): void {
	const dayMs = 86_400_000;
	const utcDay = (d: Date): number => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
	const todayMonthKey = today.getFullYear() * 12 + today.getMonth();
	const entries: { month: number; col: number }[] = [];

	let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1, 12, 0, 0);
	while (cursor.getFullYear() * 12 + cursor.getMonth() <= todayMonthKey) {
		const offset = Math.round((utcDay(cursor) - utcDay(startDate)) / dayMs);
		if (offset >= 0) {
			const col = Math.floor(offset / 7);
			if (col >= 0 && col < weeks) entries.push({ month: cursor.getMonth(), col });
		}
		cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 12, 0, 0);
	}

	for (const entry of entries) {
		const text = svg.createSvg("text", {
			cls: "nexus-heatmap-month",
			attr: {
				x: HEATMAP_GEOMETRY.dayLabelWidth + entry.col * PITCH,
				y: HEATMAP_GEOMETRY.monthLabelHeight - 5,
				"text-anchor": "start",
			},
		});
		text.textContent = MONTH_NAMES[entry.month];
	}
}

/** Draw the Mon/Wed/Fri day labels in the left gutter. */
function renderDayLabels(svg: SVGSVGElement): void {
	for (const [day, text] of Object.entries(DAY_LABELS)) {
		const d = Number(day);
		const label = svg.createSvg("text", {
			cls: "nexus-heatmap-day",
			attr: {
				x: HEATMAP_GEOMETRY.dayLabelWidth - 6,
				y: HEATMAP_GEOMETRY.monthLabelHeight + d * PITCH + HEATMAP_GEOMETRY.cell / 2,
				"text-anchor": "end",
				"dominant-baseline": "central",
			},
		});
		label.textContent = text;
	}
}
