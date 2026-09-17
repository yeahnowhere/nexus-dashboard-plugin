import type {
	NexusSettings,
	MocEntry,
	StatEntry,
	DividerDesign,
	NewNoteSettings,
	RowLayoutEntry,
	RowLayoutSlot,
	VaultListEntry,
} from "./types";

/** Default Map of Content entries shown on the dashboard when no user config exists. */
export const DEFAULT_MOCS: MocEntry[] = [
	{
		path: "MOC/Journal MOC.md",
		title: "Journal MOC",
		desc: "Personal reflections & daily logs",
		icon: "Journal",
	},
	{
		path: "MOC/Knowledge MOC.md",
		title: "Knowledge MOC",
		desc: "Learning notes & insights",
		icon: "Knowledge",
	},
	{
		path: "MOC/Personal MOC.md",
		title: "Personal MOC",
		desc: "Goals, habits & self-tracking",
		icon: "Personal",
	},
	{
		path: "MOC/Projects MOC.md",
		title: "Projects MOC",
		desc: "Active work & side quests",
		icon: "Project",
	},
	{
		path: "MOC/Resources MOC.md",
		title: "Resources MOC",
		desc: "Tools, references & bookmarks",
		icon: "Resources",
	},
	{
		path: "MOC/Tracker Index MOC.md",
		title: "Tracker Index MOC",
		desc: "Metrics, streaks & analytics",
		icon: "Trackers",
	},
];

/** Default vault folder stat counters displayed in the dashboard header. */
export const DEFAULT_STATS: StatEntry[] = [
	{ folder: "", label: "Files" },
	{ folder: "MOC", label: "MOCs" },
	{ folder: "Project", label: "Projects" },
	{ folder: "Knowledge/Tasks & Action Management", label: "Tasks" },
	{ folder: "Journal", label: "Journal" },
	{ folder: "", label: "SIze", metric: "size" },
	{ folder: "", label: "Tags", metric: "tags" },
];

/** Default configuration for the "+ New Note" button in the stats bar. */
export const DEFAULT_NEW_NOTE: NewNoteSettings = {
	enabled: true,
	label: "NEW NOTE",
	folder: "Journal",
	template: "",
};

/** Default vault-list sections shown when no user config exists. */
export const DEFAULT_VAULT_LISTS: VaultListEntry[] = [
	{
		name: "Project",
		path: "Project/Projects MOC",
		tags: "",
		count: 50,
		label: "Project",
	},
];

/** Default styling for dashboard section dividers (gradient line + label appearance). */
export const DEFAULT_DIVIDER_DESIGN: DividerDesign = {
	gradient: "linear-gradient(90deg, transparent, var(--background-modifier-border), transparent)",
	lineWidth: "1px",
	labelSize: "0.7rem",
	labelWeight: "600",
	labelColor: "var(--text-muted)",
	labelSpacing: "0.12em",
};

/** Named divider style presets that users can select from the settings UI. */
export const DIVIDER_PRESETS: Record<string, DividerDesign> = {
	default: { ...DEFAULT_DIVIDER_DESIGN },
	bold: {
		gradient: "linear-gradient(90deg, transparent, var(--interactive-accent), transparent)",
		lineWidth: "2px",
		labelSize: "0.8rem",
		labelWeight: "700",
		labelColor: "var(--interactive-accent)",
		labelSpacing: "0.16em",
	},
	subtle: {
		gradient: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
		lineWidth: "1px",
		labelSize: "0.65rem",
		labelWeight: "500",
		labelColor: "var(--text-faint)",
		labelSpacing: "0.08em",
	},
	gradient: {
		gradient:
			"linear-gradient(90deg, var(--interactive-accent), var(--background-modifier-border), var(--interactive-accent))",
		lineWidth: "1px",
		labelSize: "0.7rem",
		labelWeight: "600",
		labelColor: "var(--text-muted)",
		labelSpacing: "0.12em",
	},
	dashed: {
		gradient:
			"repeating-linear-gradient(90deg, var(--background-modifier-border), var(--background-modifier-border) 4px, transparent 4px, transparent 8px)",
		lineWidth: "1px",
		labelSize: "0.7rem",
		labelWeight: "600",
		labelColor: "var(--text-muted)",
		labelSpacing: "0.12em",
	},
};

/**
 * Default row layout used for fresh installs and empty `nexus-dashboard`
 * code blocks. Mirrors the dashboard the plugin ships with: stats up top,
 * a two-column timeline/nested-row section, and tasks + file types below.
 */
export const DEFAULT_ROW_LAYOUTS: RowLayoutEntry[] = [
	{
		name: "Row 1",
		columns: 1,
		proportion: "100",
		align: "center",
		slots: ["stats"],
		slotHeadings: {},
		id: "row-default-0",
	},
	{
		name: "Row 2",
		columns: 2,
		proportion: "30/70",
		align: "top",
		slots: [
			"timeline",
			[
				{
					id: "row-default-nested-1",
					name: "Row 2-3 Right",
					columns: 2,
					proportion: "64/36",
					align: "top",
					slots: ["moc-cards", "vault-activity"],
					slotHeadings: {},
					vaultListSlots: { "1": "Project" },
				},
				"heatmap",
			],
		],
		slotHeadings: {},
		id: "row-default-1",
	},
	{
		name: "Row 4",
		columns: 2,
		proportion: "50/50",
		align: "top",
		slots: ["tasks", "filetypes"],
		slotHeadings: {},
		id: "row-default-2",
	},
];

/**
 * Complete default configuration for the Nexus dashboard plugin.
 * Each property maps to a user-facing setting; the spread of nested
 * objects ensures callers get independent copies via {@link deepCloneDefaults}.
 */
export const DEFAULT_SETTINGS: NexusSettings = {
	headerText: "NEXUS",
	openOnStartup: false,
	mocs: DEFAULT_MOCS,
	stats: DEFAULT_STATS,
	statsNewNote: { ...DEFAULT_NEW_NOTE },
	showStats: true,
	showGraph: true,
	mocGridColumns: 2,
	dividerDesign: { ...DIVIDER_PRESETS.dashed },
	asciiDefaultFont: "ANSI Shadow",
	asciiDefaultColor: "#8A5CF6",
	asciiDefaultSize: 1.0,
	asciiMobileSize: 0.3,
	asciiDefaultAlign: "center",
	quickLinks: [],
	vaultLists: DEFAULT_VAULT_LISTS,
	fileTypeLists: [],
	rowSizes: {},
	collapseState: {},
	rowLayouts: DEFAULT_ROW_LAYOUTS,
	columnLayouts: [],
	showHeader: true,
	showMocCards: true,
	showMocDivider: true,
	mocDividerLabel: "MOC",
	showQuickLinks: false,
	showBookmarksAsLinks: false,
	showQuickLinksDivider: true,
	quickLinksDividerLabel: "Quick Links",
	showHeatmap: true,
	showHeatmapDivider: true,
	heatmapWeeks: 52,
	heatmapLabel: "CONTRIBUTION ACTIVITY",
	showActivityTimeline: true,
	showActivityTimelineDivider: true,
	activityTimelineLabel: "Timeline",
	showClock: false,
	showClockDivider: false,
	clockTimezone: "",
	clockShowDate: true,
	clockShowSeconds: true,
	clockFormat: "24h",
	clockLabel: "",
	showFileTypeChart: true,
	showFileTypeChartDivider: true,
	fileTypeChartLabel: "FILE TYPES",
	fileTypeLegendHeight: 180,
	showVaultActivity: true,
	showVaultActivityDivider: true,
	vaultActivityCount: 9,
	vaultActivityLabel: "",
	vaultActivityShowFade: true,
	vaultActivityMaxHeight: 300,
	activityTimelineShowFade: true,
	activityTimelineMaxHeight: 500,
	activityLog: [],
	activityLogMax: 500,
	activityTrackingEnabled: true,
	activityTaskTracking: true,
	activityTimelineOnlyMarkdown: true,
	activityTimelineIncludeFolders: "",
	activityTimelineShowRelative: false,
	activityTimelineGroup: "day",
	activityTimelineShowDate: true,
	taskSummaryShowFade: true,
	taskSummaryMaxHeight: 180,
	showTaskSummary: true,
	showTaskSummaryDivider: true,
	taskSummaryShowProgress: false,
	taskSummaryShowList: true,
	taskSummaryShowDue: true,
	taskSummaryCheckable: true,
	taskSummaryPath: "Knowledge/Tasks & Action Management",
	taskSummaryTags: "",
	taskSummaryCount: 30,
	taskSummaryLabel: "TODO",
};

/**
 * Deep-clones a single row-layout slot, recursing into nested rows and
 * stacking columns so mutations on the clone never affect the source.
 */
function cloneRowLayoutSlot(slot: RowLayoutSlot): RowLayoutSlot {
	if (Array.isArray(slot)) {
		return slot.map((sub) => (typeof sub === "object" ? cloneRowLayout(sub) : sub));
	}
	if (slot && typeof slot === "object") return cloneRowLayout(slot);
	return slot;
}

/**
 * Deep-clones a row layout, including nested rows and per-slot override maps.
 */
function cloneRowLayout(row: RowLayoutEntry): RowLayoutEntry {
	return {
		...row,
		slots: (row.slots || []).map(cloneRowLayoutSlot),
		slotHeadings: row.slotHeadings
			? Object.fromEntries(Object.entries(row.slotHeadings).map(([key, cfg]) => [key, { ...cfg }]))
			: undefined,
		vaultListSlots: row.vaultListSlots ? { ...row.vaultListSlots } : undefined,
		fileTypeListSlots: row.fileTypeListSlots ? { ...row.fileTypeListSlots } : undefined,
		dividerSlots: row.dividerSlots ? { ...row.dividerSlots } : undefined,
	};
}

/**
 * Returns a deep copy of {@link DEFAULT_SETTINGS} with all nested arrays and
 * objects cloned so mutations won't affect the original defaults.
 *
 * @returns A fresh {@link NexusSettings} instance safe to mutate.
 * @example
 * ```ts
 * const settings = deepCloneDefaults();
 * settings.mocs.push({ path: "MOC/New.md", title: "New" });
 * // DEFAULT_SETTINGS.mocs is unchanged
 * ```
 */
export function deepCloneDefaults(): NexusSettings {
	return {
		...DEFAULT_SETTINGS,
		mocs: DEFAULT_MOCS.map((m) => ({ ...m })),
		stats: DEFAULT_STATS.map((s) => ({ ...s })),
		statsNewNote: { ...DEFAULT_NEW_NOTE },
		dividerDesign: { ...DEFAULT_SETTINGS.dividerDesign },
		quickLinks: DEFAULT_SETTINGS.quickLinks.map((l) => ({ ...l })),
		vaultLists: DEFAULT_SETTINGS.vaultLists.map((v) => ({ ...v })),
		fileTypeLists: DEFAULT_SETTINGS.fileTypeLists.map((v) => ({ ...v })),
		rowSizes: { ...DEFAULT_SETTINGS.rowSizes },
		collapseState: { ...DEFAULT_SETTINGS.collapseState },
		rowLayouts: DEFAULT_SETTINGS.rowLayouts.map(cloneRowLayout),
		columnLayouts: DEFAULT_SETTINGS.columnLayouts.map((s) => ({ ...s, slots: [...s.slots] })),
		activityLog: DEFAULT_SETTINGS.activityLog.map((e) => ({ ...e })),
	};
}

/**
 * Merges partially-loaded data over a deep-cloned default, preserving
 * type safety for arrays and objects.
 *
 * This is the centralised replacement for the 170-line `loadSettings()`
 * manual-block pattern — every new setting field is handled automatically
 * without adding another 3-line typeof-check block.
 *
 * @param data - Raw data from `plugin.loadData()` (may be `null`/`undefined`).
 * @returns A fully-populated {@link NexusSettings} safe to mutate.
 */
export function mergeSettings(data: Partial<NexusSettings> | null | undefined): NexusSettings {
	if (!data) return deepCloneDefaults();

	return {
		...deepCloneDefaults(),
		...data,
		mocs: Array.isArray(data.mocs) ? data.mocs.map((m) => ({ ...m })) : deepCloneDefaults().mocs,
		stats: Array.isArray(data.stats) ? data.stats.map((s) => ({ ...s })) : deepCloneDefaults().stats,
		statsNewNote:
			data.statsNewNote && typeof data.statsNewNote === "object"
				? { ...deepCloneDefaults().statsNewNote, ...data.statsNewNote }
				: deepCloneDefaults().statsNewNote,
		quickLinks: Array.isArray(data.quickLinks)
			? data.quickLinks.map((l) => ({ ...l }))
			: deepCloneDefaults().quickLinks,
		vaultLists: Array.isArray(data.vaultLists)
			? data.vaultLists.map((v) => ({ ...v }))
			: deepCloneDefaults().vaultLists,
		fileTypeLists: Array.isArray(data.fileTypeLists)
			? data.fileTypeLists.map((v) => ({ ...v }))
			: deepCloneDefaults().fileTypeLists,
		rowLayouts: Array.isArray(data.rowLayouts)
			? data.rowLayouts.map(cloneRowLayout)
			: deepCloneDefaults().rowLayouts,
		columnLayouts: Array.isArray(data.columnLayouts)
			? data.columnLayouts.map((s) => ({ ...s, slots: s.slots ? [...s.slots] : [] }))
			: deepCloneDefaults().columnLayouts,
		activityLog: Array.isArray(data.activityLog)
			? data.activityLog.map((e) => ({ ...e }))
			: deepCloneDefaults().activityLog,
		dividerDesign:
			data.dividerDesign && typeof data.dividerDesign === "object"
				? { ...deepCloneDefaults().dividerDesign, ...data.dividerDesign }
				: deepCloneDefaults().dividerDesign,
		rowSizes: data.rowSizes && typeof data.rowSizes === "object" ? { ...data.rowSizes } : {},
		collapseState:
			data.collapseState && typeof data.collapseState === "object" ? { ...data.collapseState } : {},
	};
}

/** Human-readable display names for each key in {@link DIVIDER_PRESETS}. */
export const DIVIDER_PRESET_NAMES: Record<string, string> = {
	default: "Default",
	bold: "Bold",
	subtle: "Subtle",
	gradient: "Gradient",
	dashed: "Dashed",
};

/**
 * Matches a divider design against all known presets to identify which
 * named preset it corresponds to.
 *
 * @param d - The divider design to match.
 * @returns The preset key (e.g. `"bold"`, `"subtle"`), or `"custom"` when the
 *   design matches no known preset.
 * @example
 * ```ts
 * detectDividerPreset(DIVIDER_PRESETS.bold); // "bold"
 * detectDividerPreset({ ...DEFAULT_DIVIDER_DESIGN, lineWidth: "3px" }); // "custom"
 * ```
 */
export function detectDividerPreset(d: DividerDesign): string {
	for (const [key, preset] of Object.entries(DIVIDER_PRESETS)) {
		if (
			d.gradient === preset.gradient &&
			d.lineWidth === preset.lineWidth &&
			d.labelSize === preset.labelSize &&
			d.labelWeight === preset.labelWeight &&
			d.labelColor === preset.labelColor &&
			d.labelSpacing === preset.labelSpacing
		) {
			return key;
		}
	}
	return "custom";
}
