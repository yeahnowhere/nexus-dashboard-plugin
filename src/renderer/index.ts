import { MarkdownRenderChild } from "obsidian";
import type NexusDashboardPlugin from "../main";
import { parseDashboard, hasBlockMarkers } from "../parser";
import type { DashboardConfig, DashboardBlock, ContentSlotType } from "../types";
import { renderHeader, renderHeading } from "./header";
import { renderStandaloneDivider } from "./dividers";
import { renderSection } from "./sections";
import { renderLinks } from "./links";
import { renderRow, renderColumn } from "./layout";
import { renderVaultActivity } from "./vault-activity";
import { renderHeatmap } from "./heatmap";
import { renderTimeline, formatRelativeTime } from "./timeline";
import { renderClock } from "./clock";
import { renderFileTypeChart } from "./filetypes";
import { renderTaskSummary } from "./task-summary";
import { renderStatsBar } from "./stats";
import { injectGraphLinks } from "./graph";
import { DashboardKeyboardNav } from "./keyboard-nav";
import { createRenderSnapshot } from "./context";
import type { RendererContext } from "./context";
import { buildConfigFromSettings as settingsBuildConfig } from "./settings-layout";

/**
 * Renders a single `nexus-dashboard` code block and keeps it live.
 *
 * Owns the render loop (coalesced rebuilds, scroll preservation, per-block
 * error isolation), the timers for clock/timeline refreshes, and the
 * keyboard-navigation controller. One instance per code block; created by the
 * plugin's code-block processor and `unload()`ed when Obsidian tears the block
 * down.
 */
export class NexusRenderer extends MarkdownRenderChild {
	private plugin: NexusDashboardPlugin;
	private source: string;
	private sourcePath: string;
	private rendering = false;
	private renderQueued = false;
	private clockIntervals: Set<ReturnType<typeof setInterval>> = new Set();
	private timelineRefreshInterval: ReturnType<typeof setInterval> | null = null;
	private keyboardNav: DashboardKeyboardNav;
	private firstRender = true;

	constructor(
		containerEl: HTMLElement,
		plugin: NexusDashboardPlugin,
		source: string,
		sourcePath: string,
	) {
		super(containerEl);
		this.plugin = plugin;
		this.source = source;
		this.sourcePath = sourcePath;
		containerEl.classList.add("nexus-dashboard-root");
		containerEl.setAttribute("tabindex", "-1");
		this.keyboardNav = new DashboardKeyboardNav(
			containerEl,
			() => this.plugin.settings.keyboardNav,
			() => this.plugin.settings.keyboardNavFocusOnOpen,
		);
	}

	/** Dependency bundle handed to the standalone component renderers. */
	private ctxCache: RendererContext | null = null;

	/**
	 * Context object reused for the whole render pass so its lazy vault
	 * snapshot is shared across blocks. Invalidated at the start of `_render`.
	 */
	private get ctx(): RendererContext {
		if (!this.ctxCache) {
			const plugin = this.plugin;
			this.ctxCache = {
				app: plugin.app,
				settings: plugin.settings,
				sourcePath: this.sourcePath,
				snapshot: createRenderSnapshot(plugin.app, () => plugin.getRecentFiles()),
				getRecentFiles: () => plugin.getRecentFiles(),
				saveSettings: () => plugin.saveSettings(),
				rerender: () => void this.render(),
				registerClockInterval: (id) => {
					this.clockIntervals.add(id);
				},
			};
		}
		return this.ctxCache;
	}

	async onload(): Promise<void> {
		this.plugin.activeRenderers.add(this);
		await this.render();
		this.startTimelineRefresh();
	}

	onunload(): void {
		this.plugin.activeRenderers.delete(this);
		this.keyboardNav.dispose();
		this.clearClockIntervals();
		if (this.timelineRefreshInterval) {
			clearInterval(this.timelineRefreshInterval);
			this.timelineRefreshInterval = null;
		}
	}

	private clearClockIntervals(): void {
		this.clockIntervals.forEach((id) => clearInterval(id));
		this.clockIntervals.clear();
	}

	/** Keep relative timeline times fresh on dashboards left open. */
	private startTimelineRefresh(): void {
		if (this.timelineRefreshInterval) return;
		this.timelineRefreshInterval = setInterval(() => {
			const nodes = this.containerEl.querySelectorAll<HTMLElement>(
				".nexus-timeline-time[data-relative='1']",
			);
			nodes.forEach((el) => {
				const ts = Number(el.dataset.ts);
				if (Number.isFinite(ts)) el.textContent = formatRelativeTime(ts);
			});
		}, 60_000);
	}

	async render(): Promise<void> {
		if (this.rendering) {
			this.renderQueued = true;
			return;
		}
		this.rendering = true;
		try {
			await this._render();
		} finally {
			this.rendering = false;
			if (this.renderQueued) {
				this.renderQueued = false;
				this.render();
			}
		}
	}

	private async _render(): Promise<void> {
		const { containerEl } = this;
		// Emptying the container collapses its height, which lets the surrounding
		// preview scroller clamp to the top before content is rebuilt.
		const scroller = this.findScroller();
		const scrollTop = scroller?.scrollTop ?? 0;
		this.ctxCache = null;
		this.clearClockIntervals();
		containerEl.empty();

		const sourceContent = this.source.trim();
		const { config: baseConfig, placed } = this.buildConfigFromSettings();

		let config: DashboardConfig;
		if (sourceContent) {
			const codeBlockConfig = parseDashboard(sourceContent);
			config = this.mergeConfigs(baseConfig, codeBlockConfig, sourceContent);
		} else {
			config = baseConfig;
		}

		// Scan blocks recursively for stats placed inside rows/columns
		// so the top-level fallback doesn't also render them
		this.scanBlocksForPlaced(config.blocks, placed);

		// ── Header ────────────────────────────────────────
		if (config.header.enabled) {
			renderHeader(containerEl, config.header);
		}

		// ── Stats bar ─────────────────────────────────────
		if (
			!placed.has("stats") &&
			config.stats.enabled &&
			(config.stats.items.length > 0 || config.stats.newNote?.enabled)
		) {
			renderStatsBar(this.ctx, containerEl, config.stats);
		}

		// ── Blocks (unified dispatch) ─────────────────────
		for (const block of config.blocks) {
			try {
				await this.renderBlock(containerEl, block, config);
			} catch (err) {
				// eslint-disable-next-line no-console
				console.error("[NEXUS RENDER ERROR] block render failed:", err);
			}
		}

		// ── Graph links (metadataCache injection) ─────────
		if (config.graph.enabled) {
			injectGraphLinks(this.ctx, config);
		}

		// ── Keyboard nav (rebuilt against the fresh DOM) ───
		this.keyboardNav.reset(this.firstRender);
		this.firstRender = false;

		if (scroller && scrollTop > 0) {
			scroller.scrollTop = scrollTop;
			requestAnimationFrame(() => {
				if (scroller.isConnected) scroller.scrollTop = scrollTop;
			});
		}
	}

	/** Nearest scrollable ancestor of the block, if any (the preview pane). */
	private findScroller(): HTMLElement | null {
		let el: HTMLElement | null = this.containerEl.parentElement;
		while (el) {
			const overflowY = getComputedStyle(el).overflowY;
			if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
				return el;
			}
			el = el.parentElement;
		}
		return null;
	}

	// ── Unified block dispatch ───────────────────────────────

	private async renderBlock(
		containerEl: HTMLElement,
		block: DashboardBlock,
		config: DashboardConfig,
	): Promise<void> {
		switch (block.kind) {
			case "divider":
				renderStandaloneDivider(this.ctx, containerEl, block);
				break;
			case "section":
				renderSection(this.ctx, containerEl, block);
				break;
			case "links":
				renderLinks(this.ctx, containerEl, block);
				break;
			case "row":
				await renderRow(this.ctx, containerEl, block, config, (el, child, cfg) =>
					this.renderBlock(el, child, cfg),
				);
				break;
			case "column":
				await renderColumn(containerEl, block, config, (el, child, cfg) =>
					this.renderBlock(el, child, cfg),
				);
				break;
			case "vault-activity":
				await renderVaultActivity(this.ctx, containerEl, block);
				break;
			case "stats":
				renderStatsBar(this.ctx, containerEl, block.config);
				break;
			case "heading":
				renderHeading(containerEl, block.config, config);
				break;
			case "heatmap":
				renderHeatmap(this.ctx, containerEl, block);
				break;
			case "timeline":
				renderTimeline(this.ctx, containerEl, block);
				break;
			case "clock":
				renderClock(this.ctx, containerEl, block);
				break;
			case "filetypes":
				renderFileTypeChart(this.ctx, containerEl, block);
				break;
			case "tasks":
				await renderTaskSummary(this.ctx, containerEl, block);
				break;
		}
	}

	// ── Config merge ───────────────────────────────────────────

	private mergeConfigs(
		base: DashboardConfig,
		override: DashboardConfig,
		source: string,
	): DashboardConfig {
		const merged: DashboardConfig = { ...base };

		// Header
		if (source.includes("header:")) {
			const entries = Object.entries(override.header).filter(([_, v]) => v);
			merged.header = { ...base.header, ...Object.fromEntries(entries), enabled: true };
		} else {
			merged.header = { ...base.header, enabled: false };
		}

		// Stats — respect settings toggle when code block doesn't override
		if (source.includes("stats:")) {
			merged.stats = {
				...base.stats,
				enabled: override.stats.enabled,
				items: override.stats.items.length > 0 ? override.stats.items : base.stats.items,
				newNote: override.stats.newNote ?? base.stats.newNote,
			};
		} else {
			merged.stats = { ...base.stats, enabled: false };
		}

		// Blocks — detect ALL block types
		if (hasBlockMarkers(source)) {
			merged.blocks = override.blocks;
		} else {
			merged.blocks = [];
		}

		// Graph — respect settings toggle when code block doesn't override
		if (source.includes("graph:")) {
			merged.graph = { ...base.graph, ...override.graph };
		}

		return merged;
	}

	// ── Build config from settings ─────────────────────────────

	private buildConfigFromSettings(): { config: DashboardConfig; placed: Set<ContentSlotType> } {
		return settingsBuildConfig(this.plugin.settings, this.ctx);
	}

	// ── Scan blocks recursively for stats placed inside rows/columns ──

	private scanBlocksForPlaced(blocks: DashboardConfig["blocks"], placed: Set<string>): void {
		for (const block of blocks) {
			if (block.kind === "stats") placed.add("stats");
			if (block.kind === "tasks") placed.add("tasks");
			if (block.kind === "row" || block.kind === "column") {
				this.scanBlocksForPlaced(block.children, placed);
			}
		}
	}
}
