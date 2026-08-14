import type { NexusSettings, RowLayoutEntry, ContentSlotType } from "./types";

/** The content components every built-in preset includes. */
export const PRESET_COMPONENTS: ContentSlotType[] = [
	"stats",
	"moc-cards",
	"quick-links",
	"vault-activity",
	"heatmap",
	"timeline",
	"clock",
	"filetypes",
	"tasks",
];

/**
 * A preloaded dashboard template shown in the Presets settings tab.
 * Applying one replaces the current layout and enables every component
 * it references, without touching the user's own content (MOC cards,
 * stats, vault lists, quick links).
 */
export interface DashboardPreset {
	/** Stable identifier used for collapse keys and deduplication. */
	id: string;
	/** Display name shown on the preset card. */
	name: string;
	/** Short description of the template's layout focus. */
	description: string;
	/** Row layouts that make up the dashboard structure. */
	rowLayouts: RowLayoutEntry[];
	/** Component toggles and flavor settings applied alongside the layout. */
	settings?: Partial<NexusSettings>;
}

/** Toggles that enable every content component in {@link PRESET_COMPONENTS}. */
const ALL_COMPONENTS_ON: Partial<NexusSettings> = {
	showStats: true,
	showMocCards: true,
	showQuickLinks: true,
	showVaultActivity: true,
	showHeatmap: true,
	showActivityTimeline: true,
	showClock: true,
	showFileTypeChart: true,
	showTaskSummary: true,
};

/**
 * Built-in dashboard presets. Every preset arranges all of the plugin's
 * content components in a distinct layout; the component toggles are set
 * so each slot actually renders after the preset is applied.
 */
export const DASHBOARD_PRESETS: DashboardPreset[] = [
	{
		id: "classic-overview",
		name: "Classic Overview",
		description:
			"A balanced start: timeline beside a nested MOC + vault activity block over the heatmap, with tasks and file types below.",
		rowLayouts: [
			{
				id: "preset-classic-row1",
				name: "Row 1",
				columns: 1,
				proportion: "100",
				align: "center",
				slots: ["stats"],
				slotHeadings: {},
			},
			{
				id: "preset-classic-row2",
				name: "Row 2",
				columns: 2,
				proportion: "30/70",
				align: "top",
				slots: [
					"timeline",
					[
						{
							id: "preset-classic-nested",
							name: "Right",
							columns: 2,
							proportion: "60/40",
							align: "top",
							slots: [["moc-cards", "quick-links"], "vault-activity"],
							slotHeadings: {},
						},
						"heatmap",
					],
				],
				slotHeadings: {},
			},
			{
				id: "preset-classic-row3",
				name: "Row 3",
				columns: 2,
				proportion: "50/50",
				align: "top",
				slots: [["tasks", "clock"], "filetypes"],
				slotHeadings: {},
			},
		],
		settings: ALL_COMPONENTS_ON,
	},
	{
		id: "moc-first",
		name: "MOC First",
		description:
			"MOC cards take center stage on a wide grid, with the activity feed, clock, and vault activity stacked alongside.",
		rowLayouts: [
			{
				id: "preset-moc-row1",
				name: "Row 1",
				columns: 1,
				proportion: "100",
				align: "center",
				slots: ["stats"],
				slotHeadings: {},
			},
			{
				id: "preset-moc-row2",
				name: "Row 2",
				columns: 2,
				proportion: "70/30",
				align: "top",
				slots: ["moc-cards", ["timeline", "clock", "vault-activity"]],
				slotHeadings: {},
			},
			{
				id: "preset-moc-row3",
				name: "Row 3",
				columns: 2,
				proportion: "50/50",
				align: "top",
				slots: [
					["heatmap", "quick-links"],
					["filetypes", "tasks"],
				],
				slotHeadings: {},
			},
		],
		settings: ALL_COMPONENTS_ON,
	},
	{
		id: "command-center",
		name: "Command Center",
		description:
			"Operations-focused: clock and quick links sit beside a wide timeline, with a nested content block above vault activity.",
		rowLayouts: [
			{
				id: "preset-cmd-row1",
				name: "Row 1",
				columns: 1,
				proportion: "100",
				align: "center",
				slots: ["stats"],
				slotHeadings: {},
			},
			{
				id: "preset-cmd-row2",
				name: "Row 2",
				columns: 2,
				proportion: "25/75",
				align: "top",
				slots: [["clock", "quick-links"], "timeline"],
				slotHeadings: {},
			},
			{
				id: "preset-cmd-row3",
				name: "Row 3",
				columns: 2,
				proportion: "60/40",
				align: "top",
				slots: [
					{
						id: "preset-cmd-nested",
						name: "Content",
						columns: 2,
						proportion: "50/50",
						align: "top",
						slots: [
							["moc-cards", "heatmap"],
							["tasks", "filetypes"],
						],
						slotHeadings: {},
					},
					"vault-activity",
				],
				slotHeadings: {},
			},
		],
		settings: ALL_COMPONENTS_ON,
	},
	{
		id: "focused",
		name: "Focused",
		description:
			"A calm, full-width reading flow: timeline and heatmap stacked wide, then a nested MOC + vault block beside quick links and clock.",
		rowLayouts: [
			{
				id: "preset-focus-row1",
				name: "Row 1",
				columns: 1,
				proportion: "100",
				align: "center",
				slots: ["stats"],
				slotHeadings: {},
			},
			{
				id: "preset-focus-row2",
				name: "Row 2",
				columns: 1,
				proportion: "100",
				align: "top",
				slots: [["timeline", "heatmap"]],
				slotHeadings: {},
			},
			{
				id: "preset-focus-row3",
				name: "Row 3",
				columns: 2,
				proportion: "50/50",
				align: "top",
				slots: [
					{
						id: "preset-focus-nested",
						name: "Left",
						columns: 2,
						proportion: "50/50",
						align: "top",
						slots: ["moc-cards", "vault-activity"],
						slotHeadings: {},
					},
					["quick-links", "clock"],
				],
				slotHeadings: {},
			},
			{
				id: "preset-focus-row4",
				name: "Row 4",
				columns: 2,
				proportion: "50/50",
				align: "top",
				slots: ["tasks", "filetypes"],
				slotHeadings: {},
			},
		],
		settings: ALL_COMPONENTS_ON,
	},
];
