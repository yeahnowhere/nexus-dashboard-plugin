import type { NexusSettings, RowLayoutEntry, RowLayoutSlot, ContentSlotType } from "./types";
import { DEFAULT_ROW_LAYOUTS } from "./defaults";

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
 * Component toggles matching a fresh install of the plugin. The default
 * layout renders stats, MOC cards, vault activity, heatmap, timeline, file
 * types, and tasks — but not quick links or the clock.
 */
const DEFAULT_COMPONENTS_ON: Partial<NexusSettings> = {
	...ALL_COMPONENTS_ON,
	showQuickLinks: false,
	showClock: false,
};

/**
 * Value settings that make up the shipped ("best") default dashboard. Included
 * alongside the component toggles so restoring {@link DEFAULT_PRESET} also
 * restores the panel sizes and vault-activity count the plugin ships with.
 */
const DEFAULT_PRESET_SETTINGS: Partial<NexusSettings> = {
	...DEFAULT_COMPONENTS_ON,
	vaultActivityCount: 50,
	vaultActivityMaxHeight: 240,
	activityTimelineMaxHeight: 410,
	taskSummaryMaxHeight: 120,
	fileTypeLegendHeight: 120,
	mocCardsMaxHeight: 240,
};

/** Stable id of the preset that restores the plugin's shipped layout. */
export const DEFAULT_PRESET_ID = "nexus-default";

/**
 * The out-of-box layout the plugin ships with. Restoring it replaces the
 * current row layout with {@link DEFAULT_ROW_LAYOUTS} and mirrors the
 * component toggles a fresh install uses.
 */
export const DEFAULT_PRESET: DashboardPreset = {
	id: DEFAULT_PRESET_ID,
	name: "Default Layout",
	description:
		"The layout the plugin ships with: stats across the top, a timeline beside a nested MOC + vault activity block, then tasks and file types below.",
	rowLayouts: DEFAULT_ROW_LAYOUTS,
	settings: DEFAULT_PRESET_SETTINGS,
};

/**
 * Built-in dashboard presets. The single entry restores the plugin's default
 * (shipped) layout; its component toggles are set so each slot actually
 * renders after the preset is applied.
 */
export const DASHBOARD_PRESETS: DashboardPreset[] = [DEFAULT_PRESET];

/** True when two optional per-slot override maps carry the same entries. */
function overridesEqual(
	a: Record<string, unknown> | undefined,
	b: Record<string, unknown> | undefined,
): boolean {
	if (!a && !b) return true;
	if (!a || !b) return false;
	const keysA = Object.keys(a);
	if (keysA.length !== Object.keys(b).length) return false;
	return keysA.every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));
}

function rowEquals(a: RowLayoutEntry, b: RowLayoutEntry): boolean {
	if (a.id !== b.id) return false;
	if (a.name !== b.name) return false;
	if (a.columns !== b.columns) return false;
	if (a.proportion !== b.proportion) return false;
	if (a.align !== b.align) return false;
	if (!overridesEqual(a.slotHeadings, b.slotHeadings)) return false;
	if (!overridesEqual(a.vaultListSlots, b.vaultListSlots)) return false;
	if (!overridesEqual(a.fileTypeListSlots, b.fileTypeListSlots)) return false;
	if (!overridesEqual(a.dividerSlots, b.dividerSlots)) return false;
	if (a.slots.length !== b.slots.length) return false;
	return a.slots.every((slot, i) => slotEquals(slot, b.slots[i]));
}

function slotEquals(a: RowLayoutSlot, b: RowLayoutSlot): boolean {
	if (typeof a === "string" || typeof b === "string") return a === b;
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
		return a.every((slot, i) => slotEquals(slot, b[i]));
	}
	return rowEquals(a, b);
}

/**
 * Structural equality for row layouts, including nested rows and per-slot
 * override maps. Used to detect which preset (if any) the current dashboard
 * layout matches — including copies produced by {@link mergeSettings}.
 */
export function rowLayoutsEqual(a: RowLayoutEntry[], b: RowLayoutEntry[]): boolean {
	if (!a || !b || a.length !== b.length) return false;
	return a.every((row, i) => rowEquals(row, b[i]));
}
