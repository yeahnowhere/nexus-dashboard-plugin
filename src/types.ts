/**
 * Union of all dashboard block types that can appear in the layout.
 */
export type DashboardBlock =
	| DividerBlockConfig
	| SectionConfig
	| VaultActivityConfig
	| RowConfig
	| ColumnConfig
	| LinksConfig
	| StatsBlockConfig
	| HeadingBlockConfig
	| HeatmapConfig
	| TimelineConfig
	| ClockConfig
	| FileTypeChartConfig
	| TaskSummaryConfig;

/**
 * Valid identifiers for named content slots used in row and column layouts.
 */
export type ContentSlotType =
	| "stats"
	| "heading"
	| "moc-cards"
	| "quick-links"
	| "vault-activity"
	| "divider"
	| "heatmap"
	| "timeline"
	| "clock"
	| "filetypes"
	| "tasks"
	| "none";

/** Root configuration object for the entire dashboard layout. */
export interface DashboardConfig {
	header: HeaderConfig;
	stats: StatsConfig;
	/** Ordered list of blocks rendered top-to-bottom on the dashboard. */
	blocks: DashboardBlock[];
	graph: GraphConfig;
}

/** Configuration for the dashboard title header rendered at the top of the view. */
export interface HeaderConfig {
	text: string;
	/** CSS font-family string applied to the header text. */
	font: string;
	color: string;
	/** Font size in pixels for desktop view. */
	size: number;
	/** Optional override font size in pixels for mobile view. */
	mobileSize?: number;
	enabled: boolean;
	align?: "left" | "center" | "right";
}

/** Metric computed for a single stat counter. */
export type StatMetric = "files" | "notes" | "size" | "tags";

/** Time window used to filter files for a stat counter. */
export type StatScope = "all" | "today" | "week" | "month" | "year";

/** Configuration for the statistics counter section displayed at the top of the dashboard. */
export interface StatsConfig {
	enabled: boolean;
	/** List of folder-based stat counters to display. */
	items: StatItem[];
	/** Optional "+ New Note" button rendered alongside the counters. */
	newNote?: NewNoteConfig;
}

/** A single stat counter that counts notes in the given vault folder. */
export interface StatItem {
	label: string;
	/** Vault-relative folder path to count notes in (e.g. "Daily Notes"). */
	folder: string;
	/** Metric to compute for the folder. Defaults to `"files"`. */
	metric?: StatMetric;
	/** Time window to filter files by. Defaults to `"all"`. */
	scope?: StatScope;
	/** When `true`, include files in subfolders recursively. Defaults to `true`. */
	recursive?: boolean;
}

/** Configuration for the "+ New Note" quick-create button. */
export interface NewNoteConfig {
	enabled: boolean;
	/** Button text. */
	label: string;
	/** Vault-relative folder where new notes are created. */
	folder: string;
	/** Optional template file applied to new notes. */
	template?: string;
}

/**
 * A visual divider/separator block with an optional title label.
 * @remarks Renders as a horizontal rule with a centered title.
 */
export interface DividerBlockConfig {
	kind: "divider";
	/** Title text displayed in the center of the divider line. */
	title: string;
	/** Optional CSS class or style variant for the divider. */
	type?: string;
}

/** A grid section containing multiple cards arranged in columns. */
export interface SectionConfig {
	kind: "section";
	/** Number of card columns to render in this section. */
	columns: number;
	cards: CardConfig[];
	/** Optional divider rendered above or below this section. */
	divider?: DividerBlockConfig;
	/** Optional height (px) of the card tray; `0`/absent = Auto (fit cards). */
	height?: number;
}

/** A single clickable card linking to a vault path. */
export interface CardConfig {
	/** `"big"` renders a large card; `"mini"` renders a compact card. */
	type: "big" | "mini";
	/** Primary label text shown on the card. */
	label: string;
	/** Optional secondary description text displayed below the label. */
	desc?: string;
	/** Vault-relative file or folder path opened when the card is clicked. */
	path: string;
	/** Icon identifier or emoji displayed on the card. */
	icon: string;
}

/** Configuration for the local graph view embedded on the dashboard. */
export interface GraphConfig {
	enabled: boolean;
	/** Vault-relative folder paths to exclude from the graph. */
	exclude: string[];
}

/** A single external or internal link with optional label and description. */
export interface LinkItem {
	/** URL to navigate to when the link is clicked. */
	url: string;
	/** Display text for the link. Falls back to the URL if omitted. */
	label?: string;
	/** Optional short description shown below the link. */
	desc?: string;
}

/** A quick-links block displaying a grid of clickable link items. */
export interface LinksConfig {
	kind: "links";
	/** Section title displayed above the links grid. */
	title?: string;
	/** Number of columns in the links grid. */
	columns?: number;
	items: LinkItem[];
}

/**
 * A horizontal row layout that arranges child blocks side-by-side.
 * @remarks Children are laid out left-to-right; use `proportion` with
 * CSS grid fractions (e.g. `"1fr 2fr"`) to control relative widths.
 */
export interface RowConfig {
	kind: "row";
	/** Number of columns in the grid. If omitted, inferred from children count. */
	columns?: number;
	/**
	 * CSS grid-template-columns value controlling child widths
	 * (e.g. `"1fr 1fr"` or `"2fr 1fr"`).
	 */
	proportion?: string;
	/** CSS gap value between children (e.g. `"1rem"`). */
	gap?: string;
	/** Vertical alignment of children within the row. */
	align?: "top" | "center" | "stretch";
	/**
	 * Ordered child blocks rendered left-to-right inside this row.
	 * @remarks Cannot contain nested `RowConfig` — use `ColumnConfig` for nesting.
	 */
	children: (
		| SectionConfig
		| ColumnConfig
		| StatsBlockConfig
		| HeadingBlockConfig
		| VaultActivityConfig
		| LinksConfig
		| HeatmapConfig
		| TimelineConfig
		| ClockConfig
		| FileTypeChartConfig
		| TaskSummaryConfig
	)[];
}

/**
 * A vertical column layout that arranges child blocks top-to-bottom.
 * @remarks Columns can be nested inside rows to form two-dimensional layouts.
 */
export interface ColumnConfig {
	kind: "column";
	/** CSS gap value between children (e.g. `"0.5rem"`). */
	spacing?: string;
	/** Horizontal alignment of children within the column. */
	align?: "left" | "center" | "right" | "stretch";
	/** Skip the invisible hover divider that would otherwise be inserted between children. */
	noDividers?: boolean;
	/**
	 * Ordered child blocks rendered top-to-bottom inside this column.
	 */
	children: (
		| SectionConfig
		| RowConfig
		| StatsBlockConfig
		| HeadingBlockConfig
		| VaultActivityConfig
		| LinksConfig
		| HeatmapConfig
		| TimelineConfig
		| ClockConfig
		| FileTypeChartConfig
		| TaskSummaryConfig
	)[];
}

/** A standalone stats counter block that can be placed anywhere in the layout. */
export interface StatsBlockConfig {
	kind: "stats";
	config: StatsConfig;
}

/** Styling configuration for heading text. */
export interface HeadingConfig {
	text: string;
	/** CSS color value for the heading text. */
	color?: string;
	align?: "left" | "center" | "right";
	/** Predefined size preset rather than a raw pixel value. */
	size?: "small" | "medium" | "large";
}

/** A heading text block that can be placed anywhere in the layout. */
export interface HeadingBlockConfig {
	kind: "heading";
	config: HeadingConfig;
}

/**
 * Configuration for the vault-activity section.
 * @remarks Displays recent file activity (creates, edits, renames)
 * across the vault, filtered by path and/or tags.
 */
export interface VaultActivityConfig {
	kind: "vault-activity";
	show: boolean;
	count?: number;
	/** Vault-relative path prefix to scope activity tracking. */
	path?: string;
	/** Comma-separated tag filter applied to activity entries. */
	tags?: string[];
	/** Custom heading label displayed above the activity list. */
	label?: string;
}

/** Configuration for the contribution-style heatmap calendar. */
export interface HeatmapConfig {
	kind: "heatmap";
	show: boolean;
	/** Number of weeks to display in the heatmap grid. */
	weeks?: number;
	/** Custom heading label displayed above the heatmap. */
	label?: string;
}

/** A single entry in the persisted vault activity log. */
export interface ActivityEvent {
	/** Unix timestamp (ms) when the event occurred. */
	time: number;
	/** Type of activity. */
	action:
		| "created"
		| "modified"
		| "deleted"
		| "moved"
		| "renamed"
		| "opened"
		| "task"
		| "property"
		| "folder-created"
		| "folder-deleted"
		| "folder-renamed";
	/** Vault-relative path of the affected file or folder. */
	path: string;
	/** Previous path (for `moved` / `renamed` / `folder-renamed` events). */
	oldPath?: string;
	/** File mtime (ms) at event time; set on `deleted` events so an external
	 * rename (delete+create of a file with the same mtime) can be recovered. */
	mtime?: number;
	/** Extra context: task text, changed property keys, or event tag. */
	detail?: string;
}

/** Configuration for the activity timeline section. */
export interface TimelineConfig {
	kind: "timeline";
	show: boolean;
	/** Custom heading label displayed above the timeline. */
	label?: string;
	/** Vault-relative folder paths to exclude from timeline entries. */
	exclude?: string[];
	/** Only show markdown files. */
	onlyMarkdown?: boolean;
	/** Vault-relative folder paths to include (empty means all folders). */
	include?: string[];
	/** File extensions to exclude (e.g. `[".png", ".jpg"]`). */
	excludeExt?: string[];
	/** Whitelist of actions to display (e.g. `["created", "deleted"]`). */
	types?: string[];
	/** Group entries by `"day"` or by `"file"`. */
	group?: "day" | "file";
	/** Show relative times instead of clock times. */
	relative?: boolean;
	/** Show day separators ("Today", "Yesterday", date). */
	showDate?: boolean;
}

/** Configuration for the live clock widget. */
export interface ClockConfig {
	kind: "clock";
	show: boolean;
	/** IANA timezone identifier (e.g. "America/New_York"). Defaults to system timezone. */
	timezone?: string;
	/** Whether to display the current date alongside the time. */
	showDate?: boolean;
	/** Whether to display seconds in the time readout. */
	showSeconds?: boolean;
	/** Time display format. `"12h"` uses AM/PM; `"24h"` uses 24-hour notation. */
	format?: "12h" | "24h";
	/** Custom heading label displayed above the clock. */
	label?: string;
}

/** Configuration for the file-type composition bar. */
export interface FileTypeChartConfig {
	kind: "filetypes";
	show: boolean;
	/** Custom heading label displayed above the chart. */
	label?: string;
	/** Vault-relative folder path to scope the chart (empty = whole vault). */
	path?: string;
	/** Max height (px) of the legend area before it scrolls. */
	maxLegendHeight?: number;
}

/** Configuration for the task summary widget. */
export interface TaskSummaryConfig {
	kind: "tasks";
	show: boolean;
	/** Show the progress bar below stats. */
	showProgress?: boolean;
	/** Show the scrollable unchecked task list. */
	showList?: boolean;
	/** Group unchecked tasks by due date and highlight overdue/today tasks. */
	showDue?: boolean;
	/** Allow checking tasks off inline from the dashboard. */
	checkable?: boolean;
	/** Maximum number of tasks to display in the list. */
	count?: number;
	/** Vault-relative folder path to filter tasks (e.g. "Knowledge/Tasks & Action Management"). */
	path?: string;
	/** Frontmatter tags to filter task files. */
	tags?: string[];
	/** Custom heading label displayed above the task summary. */
	label?: string;
}

// ── Settings interfaces ───────────────────────────────────────

/** A single map-of-content (MOC) card entry linking to a note. */
export interface MocEntry {
	/** Vault-relative path to the MOC note. */
	path: string;
	/** Display title for the card. */
	title: string;
	/** Short description shown below the title. */
	desc: string;
	/** Icon identifier or emoji displayed on the card. */
	icon: string;
}

/** A single quick-link entry displayed in the quick-links grid. */
export interface QuickLinkEntry {
	/** Display text for the link. */
	label: string;
	/** URL to open when the link is clicked. */
	url: string;
}

/**
 * Structure of an item stored in Obsidian's built-in Bookmarks plugin.
 * This type mirrors the internal plugin data (not exported by the Obsidian API).
 */
export interface ObsidianBookmarkItem {
	/** Bookmark type: file, folder, search, group, url, or graph. */
	type: string;
	/** Display title for the bookmark. */
	title: string;
	/** Vault-relative path (for file/folder types). */
	path?: string;
	/** Subpath within a file (for heading/block types). */
	subpath?: string;
	/** Search query (for search type). */
	query?: string;
	/** External URL (for url type). */
	url?: string;
	/** Nested items (for group type). */
	items?: ObsidianBookmarkItem[];
	/** Creation time. */
	ctime?: number;
}

/** A named file-type preset scoped to a folder, assignable to layout slots. */
export interface FileTypeListEntry {
	/** Display name for this file-type list preset. */
	name: string;
	/** Vault-relative path prefix used to scope the chart (empty = whole vault). */
	path: string;
	/** Divider label shown above the chart. Empty to hide the divider. */
	label: string;
	/** Max legend height (px) for this preset; falls back to the global setting. */
	height?: number;
}

/** A vault-list entry representing a filterable collection of vault notes. */
export interface VaultListEntry {
	/** Display name for this vault list section. */
	name: string;
	/** Vault-relative path prefix used to filter notes. */
	path: string;
	/** Comma-separated list of tags used to filter notes. */
	tags: string;
	/** Maximum number of notes to show in this list. */
	count: number;
	/** Divider label shown above this list. Empty to hide the divider. */
	label: string;
}

/**
 * A single slot assignment inside a row layout.
 * - A plain {@link ContentSlotType} fills the whole column.
 * - An array stacks multiple slots vertically in one column.
 * - A {@link RowLayoutEntry} nests a full row layout inside the column,
 *   allowing arbitrary widget nesting (rows within rows).
 */
export type RowLayoutSlot = ContentSlotType | RowLayoutEntry | (ContentSlotType | RowLayoutEntry)[];

/**
 * A named row layout template used in the dashboard builder.
 * @remarks `slots` define which content types appear in each column;
 * `slotHeadings`, `vaultListSlots`, and `dividerSlots` provide
 * per-slot overrides keyed by slot identifier.
 */
export interface RowLayoutEntry {
	/** Stable id used for collapse state and reordering. */
	id?: string;
	/** User-facing name for this layout in the settings UI. */
	name: string;
	columns: number;
	/** CSS grid-template-columns value controlling column widths. */
	proportion: string;
	align: "top" | "center" | "stretch";
	/**
	 * Content slot assignments for each column.
	 * A nested array stacks multiple slots inside a single column and a
	 * nested {@link RowLayoutEntry} embeds a full sub-row.
	 */
	slots: RowLayoutSlot[];
	/** Per-slot heading overrides keyed by slot identifier. */
	slotHeadings?: Record<string, HeadingConfig>;
	/** Maps slot identifiers to vault-list names for vault-list slots. */
	vaultListSlots?: Record<string, string>;
	/** Maps slot identifiers to file-type list names for file-types slots. */
	fileTypeListSlots?: Record<string, string>;
	/** Maps slot identifiers to divider label overrides for divider slots. */
	dividerSlots?: Record<string, string>;
}

/**
 * A named column layout template used in the dashboard builder.
 * @remarks Children are stacked vertically within the column.
 * Per-slot overrides follow the same keying convention as `RowLayoutEntry`.
 */
export interface ColumnLayoutEntry {
	/** Stable id used for collapse state and reordering. */
	id?: string;
	/** User-facing name for this layout in the settings UI. */
	name: string;
	/** CSS gap value between children (e.g. `"0.5rem"`). */
	spacing: string;
	align: "left" | "center" | "right" | "stretch";
	/** Ordered content slot assignments rendered top-to-bottom. */
	slots: ContentSlotType[];
	/** Per-slot heading overrides keyed by slot identifier. */
	slotHeadings?: Record<string, HeadingConfig>;
	/** Maps slot identifiers to vault-list names for vault-list slots. */
	vaultListSlots?: Record<string, string>;
	/** Maps slot identifiers to file-type list names for file-types slots. */
	fileTypeListSlots?: Record<string, string>;
	/** Maps slot identifiers to divider label overrides for divider slots. */
	dividerSlots?: Record<string, string>;
}

/** A single stat-counter entry shown in the dashboard header area. */
export interface StatEntry {
	/** Vault-relative folder path to count notes in. */
	folder: string;
	/** Display label next to the count (e.g. "Notes", "Projects"). */
	label: string;
	/** Metric to compute for the folder. Defaults to `"files"`. */
	metric?: StatMetric;
	/** Time window to filter files by. Defaults to `"all"`. */
	scope?: StatScope;
	/** When `true`, include files in subfolders recursively. Defaults to `true`. */
	recursive?: boolean;
}

/** Persisted settings for the "+ New Note" quick-create button. */
export interface NewNoteSettings {
	/** Whether the button is shown. */
	enabled: boolean;
	/** Button text. */
	label: string;
	/** Vault-relative folder where new notes are created. */
	folder: string;
	/** Optional template file applied to new notes. */
	template: string;
}

/** Visual styling configuration for divider lines rendered across the dashboard. */
export interface DividerDesign {
	/** CSS background gradient value for the divider line. */
	gradient: string;
	/** CSS height/thickness of the divider line (e.g. `"2px"`). */
	lineWidth: string;
	/** CSS font-size for the divider label text. */
	labelSize: string;
	/** CSS font-weight for the divider label text. */
	labelWeight: string;
	/** CSS color for the divider label text. */
	labelColor: string;
	/** CSS margin/spacing around the divider label. */
	labelSpacing: string;
}

/**
 * Master settings object persisted by the Obsidian plugin.
 * @remarks This is the primary data structure stored in the plugin's
 * `data.json` file. Every field maps 1-to-1 with a settings UI control.
 */
export interface NexusSettings {
	/** Text displayed in the ASCII-art header at the top of the dashboard. */
	headerText: string;
	/** When `true`, the dashboard opens automatically on Obsidian startup. */
	openOnStartup: boolean;
	/** Map-of-content card entries displayed on the dashboard. */
	mocs: MocEntry[];
	/** Stat-counter entries displayed in the header area. */
	stats: StatEntry[];
	/** Settings for the "+ New Note" button shown in the stats bar. */
	statsNewNote: NewNoteSettings;
	/** Whether the stats counter section is visible. */
	showStats: boolean;
	/** Whether the local graph view is visible. */
	showGraph: boolean;
	/** Number of grid columns for large MOC cards. */
	mocGridColumns: number;
	/** Maximum height of the MOC cards grid before scrolling (px). */
	mocCardsMaxHeight: number;
	/** Visual styling applied to all divider lines. */
	dividerDesign: DividerDesign;
	/** CSS font-family string for the ASCII header text. */
	asciiDefaultFont: string;
	/** CSS color value for the ASCII header text. */
	asciiDefaultColor: string;
	/** Font size in pixels for the ASCII header on desktop. */
	asciiDefaultSize: number;
	/** Font size in pixels for the ASCII header on mobile. */
	asciiMobileSize: number;
	/** Horizontal alignment of the ASCII header text. */
	asciiDefaultAlign: "left" | "center" | "right";
	/** Quick-link entries displayed in the quick-links grid. */
	quickLinks: QuickLinkEntry[];
	/**
	 * CSS grid-template-columns overrides for named row layouts,
	 * keyed by layout name.
	 */
	rowSizes: Record<string, string>;
	/** Persisted card-collapse state for the settings tabs, keyed by `scope:id`. */
	collapseState: Record<string, boolean>;
	/** Row layout templates available in the dashboard builder. */
	rowLayouts: RowLayoutEntry[];
	/** Column layout templates available in the dashboard builder. */
	columnLayouts: ColumnLayoutEntry[];
	/** Vault file-list entries displayed on the dashboard. */
	vaultLists: VaultListEntry[];
	/** Named file-type presets assignable to dashboard layout slots. */
	fileTypeLists: FileTypeListEntry[];
	/** Whether the dashboard header is visible. */
	showHeader: boolean;
	/** Whether the MOC cards section is visible. */
	showMocCards: boolean;
	/** Whether a divider is shown above the MOC cards section. */
	showMocDivider: boolean;
	/** Label text for the divider above the MOC cards section. */
	mocDividerLabel: string;
	/** Whether the quick-links grid is visible. */
	showQuickLinks: boolean;
	/** Whether to show Obsidian built-in Bookmarks as a separate links section. */
	showBookmarksAsLinks: boolean;
	/** Whether a divider is shown above the quick-links section. */
	showQuickLinksDivider: boolean;
	/** Label text for the divider above the quick-links section. */
	quickLinksDividerLabel: string;
	/** Whether the heatmap calendar is visible. */
	showHeatmap: boolean;
	/** Whether a divider is shown above the heatmap section. */
	showHeatmapDivider: boolean;
	/** Number of weeks to display in the heatmap. */
	heatmapWeeks: number;
	/** Custom heading label for the heatmap section. */
	heatmapLabel: string;
	/** Whether the activity timeline is visible. */
	showActivityTimeline: boolean;
	/** Whether a divider is shown above the activity timeline. */
	showActivityTimelineDivider: boolean;
	/** Custom heading label for the activity timeline. */
	activityTimelineLabel: string;
	/** Whether the live clock widget is visible. */
	showClock: boolean;
	/** Whether a divider is shown above the clock widget. */
	showClockDivider: boolean;
	/** IANA timezone identifier for the clock (e.g. "UTC", "Europe/London"). */
	clockTimezone: string;
	/** Whether the clock displays the current date. */
	clockShowDate: boolean;
	/** Whether the clock displays seconds. */
	clockShowSeconds: boolean;
	/** Time format for the clock. `"12h"` uses AM/PM; `"24h"` uses 24-hour notation. */
	clockFormat: "12h" | "24h";
	/** Custom heading label for the clock widget. */
	clockLabel: string;
	/** Whether the file-type distribution chart is visible. */
	showFileTypeChart: boolean;
	/** Whether a divider is shown above the file-type chart. */
	showFileTypeChartDivider: boolean;
	/** Custom heading label for the file-type chart. */
	fileTypeChartLabel: string;
	/** Max legend height (px) for the file-type chart legend before scrolling. */
	fileTypeLegendHeight: number;
	/** Whether the task summary widget is visible. */
	showTaskSummary: boolean;
	/** Whether a divider is shown above the task summary. */
	showTaskSummaryDivider: boolean;
	/** Whether to show the progress bar in the task summary. */
	taskSummaryShowProgress: boolean;
	/** Whether to show the unchecked task list in the task summary. */
	taskSummaryShowList: boolean;
	/** Whether to group tasks by due date and highlight overdue/today tasks. */
	taskSummaryShowDue: boolean;
	/** Whether tasks can be checked off inline from the dashboard. */
	taskSummaryCheckable: boolean;
	/** Vault-relative folder path to filter tasks. */
	taskSummaryPath: string;
	/** Comma-separated frontmatter tags used to filter task files. */
	taskSummaryTags: string;
	/** Maximum number of tasks to display in the list. */
	taskSummaryCount: number;
	/** Custom heading label for the task summary. */
	taskSummaryLabel: string;
	/** Whether the vault-activity section is visible. */
	showVaultActivity: boolean;
	/** Whether a divider is shown above the vault-activity section. */
	showVaultActivityDivider: boolean;
	/** Maximum number of entries in the vault-activity list. */
	vaultActivityCount: number;
	/** Custom heading label for the vault-activity section. */
	vaultActivityLabel: string;
	/** Whether the vault-activity list shows the bottom fade mask. */
	vaultActivityShowFade: boolean;
	/** Maximum height of the vault-activity list before scrolling (px). */
	vaultActivityMaxHeight: number;
	/** Whether the activity timeline shows the bottom fade mask. */
	activityTimelineShowFade: boolean;
	/** Maximum height of the activity timeline before scrolling (px). */
	activityTimelineMaxHeight: number;
	/** Persisted vault activity events (newest first). */
	activityLog: ActivityEvent[];
	/** Maximum number of activity events to persist. */
	activityLogMax: number;
	/** Whether global vault activity tracking is enabled. */
	activityTrackingEnabled: boolean;
	/** Whether task (checkbox) changes are tracked while editing. */
	activityTaskTracking: boolean;
	/** Only show markdown files in the activity timeline. */
	activityTimelineOnlyMarkdown: boolean;
	/** Comma-separated vault-relative folders to include in the timeline. */
	activityTimelineIncludeFolders: string;
	/** Show relative times in the activity timeline. */
	activityTimelineShowRelative: boolean;
	/** Group activity timeline entries by day or by file. */
	activityTimelineGroup: "day" | "file";
	/** Show day separators in the activity timeline. */
	activityTimelineShowDate: boolean;
	/** Whether the task summary list shows the bottom fade mask. */
	taskSummaryShowFade: boolean;
	/** Maximum height of the task summary list before scrolling (px). */
	taskSummaryMaxHeight: number;
}
