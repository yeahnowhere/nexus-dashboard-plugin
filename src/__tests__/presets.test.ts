import { describe, it, expect } from "vitest";
import {
	DASHBOARD_PRESETS,
	DEFAULT_PRESET_ID,
	PRESET_COMPONENTS,
	rowLayoutsEqual,
} from "../presets";
import { DEFAULT_ROW_LAYOUTS, mergeSettings } from "../defaults";
import type { NexusSettings, RowLayoutEntry, RowLayoutSlot } from "../types";

const VALID_SLOT_TYPES = new Set<string>([
	"stats",
	"heading",
	"moc-cards",
	"quick-links",
	"vault-activity",
	"divider",
	"heatmap",
	"timeline",
	"clock",
	"filetypes",
	"tasks",
	"none",
]);

const VALID_ALIGNS = new Set<string>(["top", "center", "stretch"]);

function collectSlots(slot: RowLayoutSlot, out: Set<string>): void {
	if (typeof slot === "string") {
		out.add(slot);
		return;
	}
	if (Array.isArray(slot)) {
		for (const sub of slot) collectSlots(sub, out);
		return;
	}
	for (const sub of slot.slots) collectSlots(sub, out);
}

function collectRowSlots(rows: RowLayoutEntry[]): Set<string> {
	const out = new Set<string>();
	for (const row of rows) for (const slot of row.slots) collectSlots(slot, out);
	return out;
}

function countNestedRows(rows: RowLayoutEntry[]): number {
	let count = 0;
	for (const row of rows) {
		for (const slot of row.slots) {
			if (typeof slot === "object" && !Array.isArray(slot)) count += 1;
		}
	}
	return count;
}

/** Components the default layout intentionally omits (fresh-install state). */
const SKIP_FOR_DEFAULT = new Set<string>(["quick-links", "clock"]);

/** True when a preset is the default (shipped) layout. */
function isDefaultPreset(preset: { id: string }): boolean {
	return preset.id === DEFAULT_PRESET_ID;
}

describe("DASHBOARD_PRESETS", () => {
	it("exports only the default preset", () => {
		expect(DASHBOARD_PRESETS).toHaveLength(1);
		expect(DASHBOARD_PRESETS[0].id).toBe(DEFAULT_PRESET_ID);
	});

	it("gives every preset a unique id and a name and description", () => {
		const ids = DASHBOARD_PRESETS.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const preset of DASHBOARD_PRESETS) {
			expect(preset.name.trim().length).toBeGreaterThan(0);
			expect(preset.description.trim().length).toBeGreaterThan(0);
		}
	});

	it("includes every content component in each preset", () => {
		for (const preset of DASHBOARD_PRESETS) {
			const found = collectRowSlots(preset.rowLayouts);
			for (const component of PRESET_COMPONENTS) {
				if (isDefaultPreset(preset) && SKIP_FOR_DEFAULT.has(component)) continue;
				expect(found.has(component), `${preset.id} is missing ${component}`).toBe(true);
			}
		}
	});

	it("mirrors the shipped layout in the default preset", () => {
		const preset = DASHBOARD_PRESETS.find(isDefaultPreset);
		expect(preset).toBeDefined();
		expect(preset?.rowLayouts).toEqual(DEFAULT_ROW_LAYOUTS);
		const slots = collectRowSlots(preset?.rowLayouts ?? []);
		expect(slots.has("quick-links")).toBe(false);
		expect(slots.has("clock")).toBe(false);
		expect(preset?.settings?.showStats).toBe(true);
		expect(preset?.settings?.showMocCards).toBe(true);
		expect(preset?.settings?.showQuickLinks).toBe(false);
		expect(preset?.settings?.showClock).toBe(false);
		expect(preset?.settings?.showTaskSummary).toBe(true);
		expect(preset?.settings?.vaultActivityCount).toBe(50);
		expect(preset?.settings?.vaultActivityMaxHeight).toBe(240);
		expect(preset?.settings?.activityTimelineMaxHeight).toBe(410);
		expect(preset?.settings?.taskSummaryMaxHeight).toBe(120);
		expect(preset?.settings?.fileTypeLegendHeight).toBe(120);
		expect(preset?.settings?.mocCardsMaxHeight).toBe(240);
	});

	it("uses only valid slot types, aligns, and row proportions", () => {
		for (const preset of DASHBOARD_PRESETS) {
			for (const row of preset.rowLayouts) {
				const slots = collectRowSlots([row]);
				for (const slot of slots) {
					expect(VALID_SLOT_TYPES.has(slot), `${preset.id} has invalid slot ${slot}`).toBe(true);
				}
				expect(VALID_ALIGNS.has(row.align), `${preset.id}/${row.name} has bad align`).toBe(true);
				expect(row.columns).toBeGreaterThan(0);
				expect(row.proportion.split("/")).toHaveLength(row.columns);
				for (const part of row.proportion.split("/")) {
					expect(Number.isFinite(parseFloat(part))).toBe(true);
				}
				for (const slot of row.slots) {
					if (typeof slot === "object" && !Array.isArray(slot)) {
						expect(VALID_ALIGNS.has(slot.align)).toBe(true);
						expect(slot.columns).toBeGreaterThan(0);
						expect(slot.proportion.split("/")).toHaveLength(slot.columns);
					}
				}
			}
		}
	});

	it("keeps every row and nested row id stable and unique within a preset", () => {
		for (const preset of DASHBOARD_PRESETS) {
			const ids = new Set<string>();
			for (const row of preset.rowLayouts) {
				expect(row.id).toBeDefined();
				ids.add(row.id as string);
				for (const slot of row.slots) {
					if (typeof slot === "object" && !Array.isArray(slot)) {
						expect(slot.id).toBeDefined();
						ids.add(slot.id as string);
					}
				}
			}
			expect(ids.size).toBe(preset.rowLayouts.length + countNestedRows(preset.rowLayouts));
		}
	});

	it("enables every component toggle a preset needs", () => {
		for (const preset of DASHBOARD_PRESETS) {
			const settings = preset.settings ?? {};
			for (const component of PRESET_COMPONENTS) {
				const toggle = `show${
					component === "stats"
						? "Stats"
						: component === "moc-cards"
							? "MocCards"
							: component === "quick-links"
								? "QuickLinks"
								: component === "vault-activity"
									? "VaultActivity"
									: component === "heatmap"
										? "Heatmap"
										: component === "timeline"
											? "ActivityTimeline"
											: component === "clock"
												? "Clock"
												: component === "filetypes"
													? "FileTypeChart"
													: "TaskSummary"
				}` as keyof NexusSettings;
				if (isDefaultPreset(preset) && SKIP_FOR_DEFAULT.has(component)) {
					expect(settings[toggle], `${preset.id} should keep ${toggle} off`).toBe(false);
					continue;
				}
				expect(settings[toggle], `${preset.id} should enable ${toggle}`).toBe(true);
			}
		}
	});

	it("deep-clones preset layouts when applied via mergeSettings", () => {
		const applied = mergeSettings({
			...DASHBOARD_PRESETS[0].settings,
			rowLayouts: DASHBOARD_PRESETS[0].rowLayouts,
			columnLayouts: [],
		});
		expect(applied.rowLayouts).toHaveLength(DASHBOARD_PRESETS[0].rowLayouts.length);
		expect(applied.rowLayouts[0]).not.toBe(DASHBOARD_PRESETS[0].rowLayouts[0]);
		expect(applied.rowLayouts[0].slots).not.toBe(DASHBOARD_PRESETS[0].rowLayouts[0].slots);
		// Mutating the applied copy must not leak into the shared preset data.
		applied.rowLayouts[0].name = "mutated";
		expect(DASHBOARD_PRESETS[0].rowLayouts[0].name).not.toBe("mutated");
	});

	it("clears column layouts when applied", () => {
		const applied = mergeSettings({
			...DASHBOARD_PRESETS[0].settings,
			rowLayouts: DASHBOARD_PRESETS[0].rowLayouts,
			columnLayouts: [],
		});
		expect(applied.columnLayouts).toEqual([]);
	});
});

describe("PRESET_COMPONENTS", () => {
	it("lists the nine dashboard content components", () => {
		expect(PRESET_COMPONENTS).toEqual([
			"stats",
			"moc-cards",
			"quick-links",
			"vault-activity",
			"heatmap",
			"timeline",
			"clock",
			"filetypes",
			"tasks",
		]);
	});
});

describe("rowLayoutsEqual", () => {
	it("matches a fresh-install deep clone of the default layout", () => {
		const freshInstall = mergeSettings(null).rowLayouts;
		expect(rowLayoutsEqual(freshInstall, DEFAULT_ROW_LAYOUTS)).toBe(true);
	});

	it("matches a preset layout that went through mergeSettings", () => {
		const applied = mergeSettings({ rowLayouts: DASHBOARD_PRESETS[0].rowLayouts });
		expect(rowLayoutsEqual(applied.rowLayouts, DASHBOARD_PRESETS[0].rowLayouts)).toBe(true);
	});

	it("rejects layouts with different rows or slots", () => {
		const tweaked = structuredClone(DEFAULT_ROW_LAYOUTS);
		(tweaked[0].slots[0] as RowLayoutSlot) = "heatmap";
		expect(rowLayoutsEqual(DEFAULT_ROW_LAYOUTS, tweaked)).toBe(false);
		expect(rowLayoutsEqual(DASHBOARD_PRESETS[0].rowLayouts, DEFAULT_ROW_LAYOUTS)).toBe(true);
	});

	it("is false for mismatched length or undefined input", () => {
		expect(rowLayoutsEqual([], [DEFAULT_ROW_LAYOUTS[0]])).toBe(false);
		expect(rowLayoutsEqual(DEFAULT_ROW_LAYOUTS, [] as RowLayoutEntry[])).toBe(false);
	});
});
