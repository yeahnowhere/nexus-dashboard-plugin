import { describe, it, expect } from "vitest";
import { DASHBOARD_PRESETS, PRESET_COMPONENTS } from "../presets";
import { mergeSettings } from "../defaults";
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

describe("DASHBOARD_PRESETS", () => {
	it("exports the four built-in presets", () => {
		expect(DASHBOARD_PRESETS).toHaveLength(4);
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
				expect(found.has(component), `${preset.id} is missing ${component}`).toBe(true);
			}
		}
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
			...DASHBOARD_PRESETS[2].settings,
			rowLayouts: DASHBOARD_PRESETS[2].rowLayouts,
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
