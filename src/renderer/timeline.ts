import { Notice, TFile } from "obsidian";
import { buildTimelineEvents as buildTimelineEventsBase } from "../timeline";
import { splitCsv, dateKey } from "../utils";
import type { ActivityEvent, TimelineConfig } from "../types";
import type { RendererContext } from "./context";
import { renderDivider } from "./dividers";

/** Terminal-style labels + glyphs for each timeline action. */
const TIMELINE_ACTIONS: Record<string, { label: string; glyph: string }> = {
	created: { label: "CREATED", glyph: "+" },
	modified: { label: "MODIFIED", glyph: "~" },
	deleted: { label: "DELETED", glyph: "✕" },
	moved: { label: "MOVED", glyph: "⇄" },
	renamed: { label: "RENAMED", glyph: "✎" },
	opened: { label: "OPENED", glyph: "▶" },
	task: { label: "TASK", glyph: "✓" },
	property: { label: "PROPERTY", glyph: "#" },
	"folder-created": { label: "FOLDER+", glyph: "▸" },
	"folder-deleted": { label: "FOLDER-", glyph: "▾" },
	"folder-renamed": { label: "FOLDER⇄", glyph: "▸" },
};

/** Shared clock-time formatter for timeline rows. */
const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
});

/** Format a timestamp as a relative "X ago" string (minutes/hours/days granularity). */
export function formatRelativeTime(ts: number): string {
	const s = Math.round((Date.now() - ts) / 1000);
	if (s < 60) return "just now";
	const m = Math.round(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.round(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.round(h / 24);
	if (d < 7) return `${d}d ago`;
	return new Date(ts).toLocaleDateString();
}

/** Day-grouping info for a timestamp ("Today" / "Yesterday" / short date). */
export function timelineDayInfo(time: number): { key: string; label: string } {
	const d = new Date(time);
	const key = dateKey(d);
	const now = new Date();
	if (key === dateKey(now)) return { key, label: "Today" };
	const yesterday = new Date(now);
	yesterday.setDate(yesterday.getDate() - 1);
	if (key === dateKey(yesterday)) return { key, label: "Yesterday" };
	return {
		key,
		label: d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
	};
}

/** Render a timeline block with a self-contained refresh scope. */
export function renderTimeline(
	ctx: RendererContext,
	containerEl: HTMLElement,
	config: TimelineConfig,
): void {
	const opts = ctx.settings;
	const label =
		config.label ||
		(opts.showActivityTimelineDivider ? opts.activityTimelineLabel || "ACTIVITY" : "");
	const baseCount = config.count || opts.activityTimelineCount || 20;
	const state: { base: number; displayed: number } = {
		base: baseCount,
		displayed: baseCount,
	};

	// Scope refreshes to this block so "Show more" doesn't wipe
	// the other sections of the dashboard.
	const root = containerEl.createDiv({ cls: "nexus-timeline-root" });

	const build = () => {
		root.empty();
		const wrapper = root.createDiv({ cls: "nexus-section" });
		if (label) {
			renderDivider(ctx, wrapper, label);
		}
		renderTimelineBody(ctx, wrapper, config, state, build);
	};

	build();
}

function renderTimelineBody(
	ctx: RendererContext,
	wrapper: HTMLElement,
	config: TimelineConfig,
	state: { base: number; displayed: number },
	refresh: () => void,
): void {
	const opts = ctx.settings;
	const showMore = config.showMore ?? opts.activityTimelineShowMore;
	const group = config.group || opts.activityTimelineGroup || "day";

	const events = buildTimelineEventsFor(ctx, config);

	if (events.length === 0) {
		wrapper.createDiv({
			cls: "nexus-timeline-empty",
			text: "No activity recorded yet.",
		});
		return;
	}

	const listEl = wrapper.createDiv({
		cls: `nexus-timeline${opts.activityTimelineShowFade ? " nexus-fade-mask" : ""}`,
	});
	listEl.style.maxHeight = `${opts.activityTimelineMaxHeight}px`;

	const limit = Math.min(state.displayed, events.length);
	const slice = events.slice(0, limit);

	if (group === "file") {
		renderTimelineByFile(ctx, listEl, slice, config);
	} else {
		renderTimelineByDay(ctx, listEl, slice, config);
	}

	if (showMore && events.length > limit) {
		const moreEl = wrapper.createEl("button", {
			cls: "nexus-timeline-more",
			text: `Show more (${events.length - limit} more)`,
		});
		moreEl.addEventListener("click", () => {
			state.displayed += state.base;
			refresh();
		});
	}
}

/** Resolve a TimelineConfig into ActivityEvents using settings defaults + ctx data. */
export function buildTimelineEventsFor(
	ctx: RendererContext,
	config: TimelineConfig,
): ActivityEvent[] {
	const opts = ctx.settings;
	const onlyMarkdown = config.onlyMarkdown ?? opts.activityTimelineOnlyMarkdown;
	const include =
		config.include && config.include.length > 0
			? config.include
			: splitCsv(opts.activityTimelineIncludeFolders || "");
	const excludeFolders = config.exclude || [];
	const excludeExt = config.excludeExt || [];
	const types = config.types || [];
	const count = config.count || opts.activityTimelineCount || 20;

	return buildTimelineEventsBase(
		{
			log: opts.activityLog || [],
			files: ctx.getRecentFiles().map((f) => ({
				path: f.path,
				extension: f.extension,
				mtime: f.stat.mtime,
			})),
		},
		{ onlyMarkdown, include, excludeFolders, excludeExt, types, count },
	);
}

function renderTimelineByDay(
	ctx: RendererContext,
	listEl: HTMLElement,
	events: ActivityEvent[],
	config: TimelineConfig,
): void {
	const opts = ctx.settings;
	const showDate = config.showDate ?? opts.activityTimelineShowDate;
	let lastKey: string | null = null;
	for (const event of events) {
		if (showDate) {
			const { key, label } = timelineDayInfo(event.time);
			if (key !== lastKey) {
				lastKey = key;
				listEl.createDiv({ cls: "nexus-timeline-day", text: label }).dataset.key = key;
			}
		}
		renderTimelineRow(ctx, listEl, event, config);
	}
}

function renderTimelineByFile(
	ctx: RendererContext,
	listEl: HTMLElement,
	events: ActivityEvent[],
	config: TimelineConfig,
): void {
	const counts = new Map<string, number>();
	for (const ev of events) {
		counts.set(ev.path, (counts.get(ev.path) || 0) + 1);
	}
	const seen = new Set<string>();
	for (const ev of events) {
		if (seen.has(ev.path)) continue;
		seen.add(ev.path);
		renderTimelineRow(ctx, listEl, ev, config, counts.get(ev.path) || 1);
	}
}

function renderTimelineRow(
	ctx: RendererContext,
	listEl: HTMLElement,
	event: ActivityEvent,
	config: TimelineConfig,
	total = 1,
): void {
	const opts = ctx.settings;
	const showRelative = config.relative ?? opts.activityTimelineShowRelative;
	const meta = TIMELINE_ACTIONS[event.action] || { label: event.action, glyph: "•" };

	const row = listEl.createDiv({ cls: "nexus-timeline-row" });

	const timeEl = row.createEl("span", { cls: "nexus-timeline-time" });
	if (showRelative) {
		timeEl.dataset.relative = "1";
		timeEl.dataset.ts = String(event.time);
		timeEl.textContent = formatRelativeTime(event.time);
	} else {
		timeEl.textContent = TIME_FORMATTER.format(new Date(event.time));
	}

	const actionEl = row.createEl("span", {
		cls: `nexus-timeline-action nexus-timeline-action--${event.action}`,
	});
	actionEl.createEl("span", { text: meta.glyph, cls: "nexus-timeline-glyph" });
	actionEl.appendText(" " + meta.label);

	const pathEl = row.createEl("span", { cls: "nexus-timeline-path" });
	if (
		event.oldPath &&
		(event.action === "moved" || event.action === "renamed" || event.action === "folder-renamed")
	) {
		pathEl.createEl("span", { text: event.oldPath, cls: "nexus-timeline-path-old" });
		pathEl.appendText(" → ");
		pathEl.appendText(event.path);
	} else {
		pathEl.appendText(event.path);
	}
	if (event.detail) {
		pathEl.createEl("span", { text: ` · ${event.detail}`, cls: "nexus-timeline-detail" });
	}

	row.title = new Date(event.time).toLocaleString();

	if (total > 1) {
		row.createEl("span", { text: `+${total - 1}`, cls: "nexus-timeline-badge" });
	}

	const file = ctx.app.vault.getAbstractFileByPath(event.path);
	const isFile = file instanceof TFile;
	const isDeleted = event.action === "deleted" || event.action === "folder-deleted" || !file;

	if (isDeleted) {
		row.classList.add("is-deleted");
	}

	row.addEventListener("click", () => {
		if (isFile) {
			ctx.app.workspace.openLinkText(event.path, "", false);
		} else {
			new Notice("This entry is no longer in the vault.");
		}
	});
}
