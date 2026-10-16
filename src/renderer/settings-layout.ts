import { buildDefaultConfig } from "../parser";
import { splitCsv } from "../utils";
import { buildBookmarkLinks } from "./links";
import type {
	DashboardConfig,
	DashboardBlock,
	ColumnConfig,
	ContentSlotType,
	HeadingConfig,
	RowConfig,
	RowLayoutEntry,
	RowLayoutSlot,
	NexusSettings,
} from "../types";
import type { RendererContext } from "./context";

/** Shared state threaded through the settings→config builders. */
interface SlotBuildContext {
	opts: NexusSettings;
	ctx: RendererContext;
	config: DashboardConfig;
	/** Slot types actually placed in a layout (suppresses the top-level fallback). */
	placed: Set<ContentSlotType>;
}

/**
 * Resolve a single content slot into a dashboard block, applying per-slot
 * overrides (heading config, named vault/file-type lists, divider label).
 * Returns `null` when the slot is disabled or has no content.
 */
function renderSlot(
	bc: SlotBuildContext,
	slot: ContentSlotType,
	headingOverride?: HeadingConfig,
	vaultListName?: string,
	dividerLabel?: string,
	fileTypeListName?: string,
): DashboardBlock | null {
	const { opts, ctx, config, placed } = bc;
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
				});
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
					};
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
			};
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
			};
		case "timeline":
			if (!opts.showActivityTimeline) return null;
			placed.add("timeline");
			return {
				kind: "timeline",
				show: true,
				label: opts.showActivityTimelineDivider ? opts.activityTimelineLabel : undefined,
			};
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
			};
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
						maxLegendHeight: ftEntry.height ?? opts.fileTypeLegendHeight,
						label: opts.showFileTypeChartDivider ? ftEntry.label || undefined : undefined,
					};
				}
			}
			// No file-type list selected - fall back to the global config
			placed.add("filetypes");
			return {
				kind: "filetypes",
				show: true,
				maxLegendHeight: opts.fileTypeLegendHeight,
				label: opts.showFileTypeChartDivider ? opts.fileTypeChartLabel : undefined,
			};
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
			};
		default:
			return null;
	}
}

/**
 * Render a single row-layout slot into a dashboard block. Plain content slots
 * resolve through {@link renderSlot}; nested {@link RowLayoutEntry} slots recurse
 * via {@link buildRowChildren}.
 */
function buildSlotBlock(
	bc: SlotBuildContext,
	slot: RowLayoutSlot,
	owner: RowLayoutEntry,
	key: string,
): DashboardBlock | null {
	if (typeof slot === "object") {
		// Arrays are handled by the caller (buildRowChildren)
		if (Array.isArray(slot)) return null;
		const nested = {
			kind: "row" as const,
			columns: slot.columns,
			proportion: slot.proportion,
			align: slot.align,
			children: buildRowChildren(bc, slot) as RowConfig["children"],
		};
		return nested.children.length > 0 ? nested : null;
	}
	const headingCfg = owner.slotHeadings?.[key];
	const vlName = owner.vaultListSlots?.[key];
	const ftName = owner.fileTypeListSlots?.[key];
	const dvLabel = owner.dividerSlots?.[key];
	return renderSlot(bc, slot, headingCfg, vlName, dvLabel, ftName);
}

/** Render the columns of a row layout (top-level or nested) into blocks. */
function buildRowChildren(bc: SlotBuildContext, row: RowLayoutEntry): DashboardBlock[] {
	const children: DashboardBlock[] = [];
	for (let i = 0; i < row.columns; i++) {
		const slot = row.slots?.[i] || "none";
		if (Array.isArray(slot)) {
			// Sub-slots: create a ColumnConfig for this column
			const columnChildren: DashboardBlock[] = [];
			for (let j = 0; j < slot.length; j++) {
				const child = buildSlotBlock(bc, slot[j], row, `${i}-${j}`);
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
			const child = buildSlotBlock(bc, slot, row, String(i));
			children.push(child ?? { kind: "section", columns: 1, cards: [] });
		}
	}
	return children;
}

/** Build the `row` block for one row layout, or `null` if it renders nothing. */
function buildRowLayoutBlock(
	bc: SlotBuildContext,
	rowLayout: RowLayoutEntry,
): DashboardBlock | null {
	const children = buildRowChildren(bc, rowLayout);
	if (children.length === 0) return null;
	return {
		kind: "row",
		columns: rowLayout.columns,
		proportion: rowLayout.proportion,
		align: rowLayout.align,
		children: children as RowConfig["children"],
	};
}

/** Build the top-level `row` blocks for all configured column layouts. */
function buildColumnLayoutBlocks(
	bc: SlotBuildContext,
	columnLayouts: NexusSettings["columnLayouts"],
): DashboardBlock[] {
	const blocks: DashboardBlock[] = [];
	for (const columnLayout of columnLayouts) {
		const children: DashboardBlock[] = [];
		for (let i = 0; i < (columnLayout.slots || []).length; i++) {
			const slot = columnLayout.slots[i];
			const vlName = columnLayout.vaultListSlots?.[String(i)];
			const ftName = columnLayout.fileTypeListSlots?.[String(i)];
			const dvLabel = columnLayout.dividerSlots?.[String(i)];
			const child = renderSlot(bc, slot, undefined, vlName, dvLabel, ftName);
			if (child) {
				children.push(child);
			}
		}
		if (children.length > 0) {
			blocks.push({
				kind: "column",
				spacing: columnLayout.spacing,
				align: columnLayout.align,
				children: children as ColumnConfig["children"],
			});
		}
	}
	return blocks;
}

/** The layout shown to fresh users with no custom row/column layouts. */
function buildDefaultLayout(bc: SlotBuildContext): DashboardBlock[] {
	const blocks: DashboardBlock[] = [];

	// Row 1: Stats | Clock
	const row1Children: DashboardBlock[] = [];
	const r1Stats = renderSlot(bc, "stats");
	if (r1Stats) row1Children.push(r1Stats);
	const r1Clock = renderSlot(bc, "clock");
	if (r1Clock) row1Children.push(r1Clock);
	if (row1Children.length > 0) {
		blocks.push({
			kind: "row",
			columns: row1Children.length,
			proportion: "50/50",
			children: row1Children as RowConfig["children"],
		});
	}

	// Row 2: Timeline | MOC Cards | Heatmap
	const row2Children: DashboardBlock[] = [];
	const r2Timeline = renderSlot(bc, "timeline");
	if (r2Timeline) row2Children.push(r2Timeline);
	const r2Moc = renderSlot(bc, "moc-cards");
	if (r2Moc) row2Children.push(r2Moc);
	const r2Heatmap = renderSlot(bc, "heatmap");
	if (r2Heatmap) row2Children.push(r2Heatmap);
	if (row2Children.length > 0) {
		blocks.push({
			kind: "row",
			columns: row2Children.length,
			proportion: "33/34/33",
			children: row2Children as RowConfig["children"],
		});
	}

	return blocks;
}

/**
 * Append content that no layout slot claimed as standalone blocks. Only used
 * for fresh installs: once layouts are configured they are the source of truth.
 */
function buildFallbackBlocks(bc: SlotBuildContext): DashboardBlock[] {
	const blocks: DashboardBlock[] = [];
	const fallbackTypes: ContentSlotType[] = [
		"moc-cards",
		"quick-links",
		"heatmap",
		"timeline",
		"clock",
		"filetypes",
	];
	for (const slotType of fallbackTypes) {
		if (!bc.placed.has(slotType)) {
			const block = renderSlot(bc, slotType);
			if (block) blocks.push(block);
		}
	}
	return blocks;
}

/**
 * Build the dashboard config implied by the plugin settings — header/stats/graph
 * areas plus the row/column layout blocks. Also returns the set of content slot
 * types that were placed, so the caller can suppress duplicate top-level blocks.
 */
export function buildConfigFromSettings(
	opts: NexusSettings,
	ctx: RendererContext,
): { config: DashboardConfig; placed: Set<ContentSlotType> } {
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

	const placed = new Set<ContentSlotType>();
	const bc: SlotBuildContext = { opts, ctx, config, placed };

	const hasUserLayouts =
		(opts.rowLayouts && opts.rowLayouts.length > 0) ||
		(opts.columnLayouts && opts.columnLayouts.length > 0);

	if (hasUserLayouts) {
		// Custom layouts are the source of truth — no default/fallback blocks.
		config.blocks = [];
		for (const rowLayout of opts.rowLayouts ?? []) {
			const block = buildRowLayoutBlock(bc, rowLayout);
			if (block) config.blocks.push(block);
		}
		config.blocks.push(...buildColumnLayoutBlocks(bc, opts.columnLayouts ?? []));
	} else {
		config.blocks = buildDefaultLayout(bc);
		config.blocks.push(...buildFallbackBlocks(bc));
	}

	return { config, placed };
}
