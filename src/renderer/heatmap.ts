import { dateKey } from "../utils";
import type { HeatmapConfig } from "../types";
import type { RendererContext } from "./context";
import { renderDivider } from "./dividers";

/** Actions that represent real file edits (creates, writes, renames, moves). */
const EDIT_ACTIONS = new Set(["created", "modified", "moved", "renamed"]);

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

/** Render a GitHub-style contribution heatmap with a today ring. */
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

	for (const file of ctx.app.vault.getMarkdownFiles()) {
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
	heatmapEl.style.setProperty("--nexus-heatmap-weeks", String(weeks));

	// Month labels row — one spanned label per month
	const monthRow = heatmapEl.createDiv({ cls: "nexus-heatmap-months" });
	const monthNames = [
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

	// Empty spacer for day-label gutter alignment
	const gutter = monthRow.createDiv({ cls: "nexus-heatmap-month-spacer" });
	gutter.style.visibility = "hidden";

	// Group consecutive weeks by month
	const monthCounts: { month: number; count: number }[] = [];
	let curMonth = -1;
	for (let w = 0; w < weeks; w++) {
		const weekStart = new Date(startDate);
		weekStart.setDate(weekStart.getDate() + w * 7);
		const m = weekStart.getMonth();
		if (m !== curMonth) {
			monthCounts.push({ month: m, count: 1 });
			curMonth = m;
		} else {
			monthCounts[monthCounts.length - 1].count++;
		}
	}

	let col = 2;
	for (const g of monthCounts) {
		const spacer = monthRow.createDiv({ cls: "nexus-heatmap-month-spacer" });
		spacer.textContent = monthNames[g.month];
		spacer.style.gridColumn = `${col} / span ${g.count}`;
		col += g.count;
	}

	// Day labels + grid
	const bodyEl = heatmapEl.createDiv({ cls: "nexus-heatmap-body" });
	const dayLabels = bodyEl.createDiv({ cls: "nexus-heatmap-days" });
	const dayAbbrevs = ["", "Mon", "", "Wed", "", "Fri", ""];
	for (const abbr of dayAbbrevs) {
		const lbl = dayLabels.createDiv({ cls: "nexus-heatmap-day-label" });
		if (abbr) lbl.textContent = abbr;
	}

	const gridEl = bodyEl.createDiv({ cls: "nexus-heatmap-grid" });
	gridEl.style.gridTemplateColumns = `repeat(${weeks}, 1fr)`;

	for (let d = 0; d < 7; d++) {
		for (let w = 0; w < weeks; w++) {
			const cellDate = new Date(startDate);
			cellDate.setDate(cellDate.getDate() + w * 7 + d);
			const key = dateKey(cellDate);
			const count = dayCounts.get(key) || 0;
			const cell = gridEl.createDiv({ cls: "nexus-heatmap-cell" });
			cell.title = `${key}: ${count} file${count !== 1 ? "s" : ""}`;

			if (cellDate > today) {
				cell.classList.add("nexus-heatmap-cell-empty");
			} else if (count === 0) {
				cell.classList.add("nexus-heatmap-cell-level-0");
			} else {
				const level = levelByCount.get(count) ?? 1;
				cell.classList.add(`nexus-heatmap-cell-level-${level}`);
			}

			if (key === todayKey) {
				cell.classList.add("nexus-heatmap-cell-today");
			}
		}
	}

	if (document.body.classList.contains("is-phone")) {
		requestAnimationFrame(() => {
			heatmapEl.scrollLeft = heatmapEl.scrollWidth;
		});
	}
}
