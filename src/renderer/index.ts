import { MarkdownRenderChild } from "obsidian";
import type NexusDashboardPlugin from "../main";
import { parseDashboard, buildDefaultConfig } from "../parser";
import { splitCsv } from "../utils";
import type {
	DashboardConfig,
	DashboardBlock,
	ColumnConfig,
	ContentSlotType,
	HeatmapConfig,
	HeadingConfig,
	LinksConfig,
	RowConfig,
	TaskSummaryConfig,
	TimelineConfig,
	VaultActivityConfig,
	ClockConfig,
	FileTypeChartConfig,
	RowLayoutEntry,
	RowLayoutSlot,
} from "../types";
import { renderHeader, renderHeading } from "./header";
import { renderStandaloneDivider } from "./dividers";
import { renderSection } from "./sections";
import { renderLinks, buildBookmarkLinks } from "./links";
import { renderRow, renderColumn } from "./layout";
import { renderVaultActivity } from "./vault-activity";
import { renderHeatmap } from "./heatmap";
import { renderTimeline, formatRelativeTime } from "./timeline";
import { renderClock } from "./clock";
import { renderFileTypeChart } from "./filetypes";
import { renderTaskSummary } from "./task-summary";
import { renderStatsBar } from "./stats";
import { injectGraphLinks } from "./graph";
import type { RendererContext } from "./context";

export class NexusRenderer extends MarkdownRenderChild {
	private plugin: NexusDashboardPlugin;
	private source: string;
	private sourcePath: string;
	private rendering = false;
	private renderQueued = false;
	private clockIntervals: Set<ReturnType<typeof setInterval>> = new Set();
	private timelineRefreshInterval: ReturnType<typeof setInterval> | null = null;

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
	}

	/** Dependency bundle handed to the standalone component renderers. */
	private get ctx(): RendererContext {
		return {
			app: this.plugin.app,
			settings: this.plugin.settings,
			sourcePath: this.sourcePath,
			getRecentFiles: () => this.plugin.getRecentFiles(),
			saveSettings: () => this.plugin.saveSettings(),
			rerender: () => void this.render(),
			registerClockInterval: (id) => {
				this.clockIntervals.add(id);
			},
		};
	}

	async onload(): Promise<void> {
		this.plugin.activeRenderers.add(this);
		await this.render();
		this.startTimelineRefresh();
	}

	onunload(): void {
		this.plugin.activeRenderers.delete(this);
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
				renderRow(this.ctx, containerEl, block, config, (el, child, cfg) =>
					this.renderBlock(el, child, cfg),
				);
				break;
			case "column":
				renderColumn(containerEl, block, config, (el, child, cfg) => this.renderBlock(el, child, cfg));
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
		const hasBlocks =
			source.includes("section:") ||
			source.includes("divider:") ||
			source.includes("links:") ||
			source.includes("row:") ||
			source.includes("column:") ||
			source.includes("vault-activity:") ||
			source.includes("heatmap:") ||
			source.includes("timeline:") ||
			source.includes("clock:") ||
			source.includes("filetypes:") ||
			source.includes("tasks:");
		if (hasBlocks) {
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
		const opts = this.plugin.settings;
		const ctx = this.ctx;
		const config = buildDefaultConfig();

		config.header = {
			text: opts.headerText || "NEXUS",
			font: opts.asciiDefaultFont || "ANSI Shadow",
			color: opts.asciiDefaultColor || "#8A5CF6",
			size: opts.asciiDefaultSize ?? 1,
			mobileSize: opts.asciiMobileSize,
			enabled: opts.showHeader !== false,
			align: opts.asciiDefaultAlign || "center",
		};

		config.stats = {
			enabled: opts.showStats,
			items: (opts.stats || []).map((s) => ({
				label: s.label,
				folder: s.folder,
				metric: s.metric,
				scope: s.scope,
				recursive: s.recursive,
			})),
			newNote: {
				enabled: opts.statsNewNote?.enabled ?? false,
				label: opts.statsNewNote?.label || "+ New Note",
				folder: opts.statsNewNote?.folder || "",
				template: opts.statsNewNote?.template || "",
			},
		};

		config.graph = { enabled: opts.showGraph, exclude: [] };

		// Track which slot types are placed in layouts
		const placed = new Set<ContentSlotType>();

		const renderSlotChildren = (
			slot: ContentSlotType,
			headingOverride?: HeadingConfig,
			vaultListName?: string,
			dividerLabel?: string,
			fileTypeListName?: string,
		): DashboardBlock | null => {
			switch (slot) {
				case "moc-cards":
					if (opts.showMocCards !== false && opts.mocs && opts.mocs.length > 0) {
						placed.add("moc-cards");
						return {
							kind: "section",
							columns: opts.mocGridColumns,
							height: opts.mocCardsMaxHeight,
							cards: opts.mocs.map((moc) => ({
								type: "big" as const,
								label: moc.title,
								desc: moc.desc,
								path: moc.path,
								icon: moc.icon,
							})),
							divider: opts.showMocDivider
								? { kind: "divider", title: opts.mocDividerLabel || "MOC CARDS" }
								: undefined,
						};
					}
					return null;
				case "quick-links": {
					if (!opts.showQuickLinks) return null;

					const manualItems =
						opts.quickLinks?.length > 0
							? opts.quickLinks.map((link) => ({
									url: link.url,
									label: link.label,
								}))
							: [];

					const bookmarkBlock = opts.showBookmarksAsLinks ? buildBookmarkLinks(ctx) : null;
					const hasBookmarks = bookmarkBlock && bookmarkBlock.items.length > 0;

					if (manualItems.length === 0 && !hasBookmarks) return null;
					placed.add("quick-links");

					const dividerTitle = opts.showQuickLinksDivider
						? opts.quickLinksDividerLabel || "Quick Links"
						: undefined;

					const children: DashboardBlock[] = [];

					if (manualItems.length > 0) {
						children.push({
							kind: "links",
							title: dividerTitle,
							columns: 1,
							items: manualItems,
						} as LinksConfig);
					}

					if (bookmarkBlock && bookmarkBlock.items.length > 0) {
						children.push(bookmarkBlock);
					}

					if (children.length === 1) return children[0];

					return {
						kind: "column",
						noDividers: true,
						children: children as ColumnConfig["children"],
					};
				}
				case "vault-activity": {
					if (!opts.showVaultActivity) return null;
					// If a vault list name is specified, look it up
					if (vaultListName) {
						const vlEntry = opts.vaultLists.find((v) => v.name === vaultListName);
						if (vlEntry) {
							placed.add("vault-activity");
							return {
								kind: "vault-activity",
								show: true,
								count: vlEntry.count || opts.vaultActivityCount,
								path: vlEntry.path || undefined,
								tags: vlEntry.tags ? splitCsv(vlEntry.tags) : undefined,
								label: opts.showVaultActivityDivider ? vlEntry.label || undefined : undefined,
							} as VaultActivityConfig;
						}
					}
					// No vault list selected - fall back to the global config
					// (empty path/tags shows recently modified files from the whole vault)
					placed.add("vault-activity");
					return {
						kind: "vault-activity",
						show: true,
						count: opts.vaultActivityCount,
						label: opts.showVaultActivityDivider ? opts.vaultActivityLabel || undefined : undefined,
					} as VaultActivityConfig;
				}
				case "divider":
					placed.add("divider");
					return {
						kind: "section",
						columns: 1,
						cards: [],
						divider: {
							kind: "divider",
							title: dividerLabel || "",
							type: "custom",
						},
					};
				case "stats":
					if (!opts.showStats) return null;
					placed.add("stats");
					return { kind: "stats", config: config.stats };
				case "heading":
					placed.add("heading");
					return { kind: "heading", config: headingOverride || { text: "Section" } };
				case "heatmap":
					if (!opts.showHeatmap) return null;
					placed.add("heatmap");
					return {
						kind: "heatmap",
						show: true,
						weeks: opts.heatmapWeeks,
						label: opts.showHeatmapDivider ? opts.heatmapLabel : undefined,
					} as HeatmapConfig;
				case "timeline":
					if (!opts.showActivityTimeline) return null;
					placed.add("timeline");
					return {
						kind: "timeline",
						show: true,
						label: opts.showActivityTimelineDivider ? opts.activityTimelineLabel : undefined,
					} as TimelineConfig;
				case "clock":
					if (!opts.showClock) return null;
					placed.add("clock");
					return {
						kind: "clock",
						show: true,
						timezone: opts.clockTimezone,
						showDate: opts.clockShowDate,
						showSeconds: opts.clockShowSeconds,
						format: opts.clockFormat,
						label: opts.showClockDivider ? opts.clockLabel : undefined,
					} as ClockConfig;
				case "filetypes": {
					if (!opts.showFileTypeChart) return null;
					// If a file-type list name is specified, look it up for path/label overrides
					if (fileTypeListName) {
						const ftEntry = opts.fileTypeLists.find((f) => f.name === fileTypeListName);
						if (ftEntry) {
							placed.add("filetypes");
							return {
								kind: "filetypes",
								show: true,
								path: ftEntry.path || undefined,
								height: ftEntry.height ?? opts.fileTypeLegendHeight,
								label: opts.showFileTypeChartDivider ? ftEntry.label || undefined : undefined,
							} as FileTypeChartConfig;
						}
					}
					// No file-type list selected - fall back to the global config
					placed.add("filetypes");
					return {
						kind: "filetypes",
						show: true,
						height: opts.fileTypeLegendHeight,
						label: opts.showFileTypeChartDivider ? opts.fileTypeChartLabel : undefined,
					} as FileTypeChartConfig;
				}
				case "tasks":
					if (!opts.showTaskSummary) return null;
					placed.add("tasks");
					return {
						kind: "tasks",
						show: true,
						showProgress: opts.taskSummaryShowProgress,
						showList: opts.taskSummaryShowList,
						showDue: opts.taskSummaryShowDue,
						checkable: opts.taskSummaryCheckable,
						count: opts.taskSummaryCount,
						path: opts.taskSummaryPath,
						tags: opts.taskSummaryTags ? splitCsv(opts.taskSummaryTags) : undefined,
						label: opts.showTaskSummaryDivider ? opts.taskSummaryLabel : undefined,
					} as TaskSummaryConfig;
				default:
					return null;
			}
		};

		// ── Recursive row/column builders for row-layout slots ──

		/**
		 * Renders a single row-layout slot into a dashboard block.
		 * Plain content slots resolve through {@link renderSlotChildren}; nested
		 * {@link RowLayoutEntry} slots recurse into {@link buildRowChildren}.
		 */
		const buildSlotBlock = (
			slot: RowLayoutSlot,
			owner: RowLayoutEntry,
			key: string,
		): DashboardBlock | null => {
			if (typeof slot === "object") {
				// Arrays are handled by the caller (buildRowChildren)
				if (Array.isArray(slot)) return null;
				const nested = {
					kind: "row" as const,
					columns: slot.columns,
					proportion: slot.proportion,
					align: slot.align,
					children: buildRowChildren(slot) as RowConfig["children"],
				};
				return nested.children.length > 0 ? nested : null;
			}
			const headingCfg = owner.slotHeadings?.[key];
			const vlName = owner.vaultListSlots?.[key];
			const ftName = owner.fileTypeListSlots?.[key];
			const dvLabel = owner.dividerSlots?.[key];
			return renderSlotChildren(slot, headingCfg, vlName, dvLabel, ftName);
		};

		/** Renders the columns of a row layout (top-level or nested) into blocks. */
		const buildRowChildren = (row: RowLayoutEntry): DashboardBlock[] => {
			const children: DashboardBlock[] = [];
			for (let i = 0; i < row.columns; i++) {
				const slot = row.slots?.[i] || "none";
				if (Array.isArray(slot)) {
					// Sub-slots: create a ColumnConfig for this column
					const columnChildren: DashboardBlock[] = [];
					for (let j = 0; j < slot.length; j++) {
						const child = buildSlotBlock(slot[j], row, `${i}-${j}`);
						if (child) columnChildren.push(child);
					}
					children.push(
						columnChildren.length > 0
							? {
									kind: "column",
									spacing: "0.25rem",
									children: columnChildren as ColumnConfig["children"],
								}
							: { kind: "section", columns: 1, cards: [] },
					);
				} else {
					const child = buildSlotBlock(slot, row, String(i));
					children.push(child ?? { kind: "section", columns: 1, cards: [] });
				}
			}
			return children;
		};

		// ── Build layout blocks from row/column layouts ──

		// If user has custom row or column layouts, clear the default blocks
		// to prevent components from rendering both in slots AND in defaults
		const hasUserLayouts =
			(opts.rowLayouts && opts.rowLayouts.length > 0) ||
			(opts.columnLayouts && opts.columnLayouts.length > 0);
		if (hasUserLayouts) {
			config.blocks = [];
		}

		if (hasUserLayouts) {
			if (opts.rowLayouts && opts.rowLayouts.length > 0) {
				for (const rowLayout of opts.rowLayouts) {
					const children = buildRowChildren(rowLayout);
					if (children.length > 0) {
						config.blocks.push({
							kind: "row",
							columns: rowLayout.columns,
							proportion: rowLayout.proportion,
							align: rowLayout.align,
							children: children as RowConfig["children"],
						});
					}
				}
			}

			if (opts.columnLayouts && opts.columnLayouts.length > 0) {
				for (const columnLayout of opts.columnLayouts) {
					const children: DashboardBlock[] = [];
					for (let i = 0; i < (columnLayout.slots || []).length; i++) {
						const slot = columnLayout.slots[i];
						const vlName = columnLayout.vaultListSlots?.[String(i)];
						const ftName = columnLayout.fileTypeListSlots?.[String(i)];
						const dvLabel = columnLayout.dividerSlots?.[String(i)];
						const child = renderSlotChildren(slot, undefined, vlName, dvLabel, ftName);
						if (child) {
							children.push(child);
						}
					}
					if (children.length > 0) {
						config.blocks.push({
							kind: "column",
							spacing: columnLayout.spacing,
							align: columnLayout.align,
							children: children as ColumnConfig["children"],
						});
					}
				}
			}
		} else {
			// ── Default layout for fresh users (no user layouts configured) ──
			// Row 1: Stats | Clock
			// Row 2: Timeline | MOC Cards | Heatmap
			config.blocks = [];

			const row1Children: DashboardBlock[] = [];
			const r1Stats = renderSlotChildren("stats");
			if (r1Stats) row1Children.push(r1Stats);
			const r1Clock = renderSlotChildren("clock");
			if (r1Clock) row1Children.push(r1Clock);
			if (row1Children.length > 0) {
				config.blocks.push({
					kind: "row",
					columns: row1Children.length,
					proportion: "50/50",
					children: row1Children as RowConfig["children"],
				});
			}

			const row2Children: DashboardBlock[] = [];
			const r2Timeline = renderSlotChildren("timeline");
			if (r2Timeline) row2Children.push(r2Timeline);
			const r2Moc = renderSlotChildren("moc-cards");
			if (r2Moc) row2Children.push(r2Moc);
			const r2Heatmap = renderSlotChildren("heatmap");
			if (r2Heatmap) row2Children.push(r2Heatmap);
			if (row2Children.length > 0) {
				config.blocks.push({
					kind: "row",
					columns: row2Children.length,
					proportion: "33/34/33",
					children: row2Children as RowConfig["children"],
				});
			}
		}

		// ── Fallback: add unplaced content as standalone blocks ──
		// Only for fresh installs with no custom layouts. Once the user has
		// configured row/column layouts, those layouts are the source of truth
		// and unplaced components are intentionally hidden.
		if (!hasUserLayouts) {
			const fallbackTypes: ContentSlotType[] = [
				"moc-cards",
				"quick-links",
				"heatmap",
				"timeline",
				"clock",
				"filetypes",
			];
			for (const slotType of fallbackTypes) {
				if (!placed.has(slotType)) {
					const block = renderSlotChildren(slotType);
					if (block) config.blocks.push(block);
				}
			}
		}

		return { config, placed };
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
