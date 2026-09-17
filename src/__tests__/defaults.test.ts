import { describe, it, expect } from "vitest";
import {
	DEFAULT_SETTINGS,
	DEFAULT_MOCS,
	DEFAULT_STATS,
	DEFAULT_NEW_NOTE,
	DEFAULT_VAULT_LISTS,
	DEFAULT_ROW_LAYOUTS,
	DEFAULT_DIVIDER_DESIGN,
	DIVIDER_PRESETS,
	DIVIDER_PRESET_NAMES,
	detectDividerPreset,
	deepCloneDefaults,
	mergeSettings,
} from "../defaults";
import type { DividerDesign, NexusSettings, RowLayoutEntry, RowLayoutSlot } from "../types";

describe("DEFAULT_SETTINGS", () => {
	it("is a valid NexusSettings object", () => {
		expect(DEFAULT_SETTINGS).toBeDefined();
		expect(typeof DEFAULT_SETTINGS.headerText).toBe("string");
		expect(typeof DEFAULT_SETTINGS.openOnStartup).toBe("boolean");
		expect(Array.isArray(DEFAULT_SETTINGS.mocs)).toBe(true);
		expect(Array.isArray(DEFAULT_SETTINGS.stats)).toBe(true);
		expect(typeof DEFAULT_SETTINGS.showStats).toBe("boolean");
		expect(typeof DEFAULT_SETTINGS.showGraph).toBe("boolean");
		expect(typeof DEFAULT_SETTINGS.mocGridColumns).toBe("number");
		expect("miniGridColumns" in DEFAULT_SETTINGS).toBe(false);
	});
});

describe("per-component divider flags", () => {
	it("defaults new labelled components to shown dividers", () => {
		expect(DEFAULT_SETTINGS.showVaultActivityDivider).toBe(true);
		expect(DEFAULT_SETTINGS.showHeatmapDivider).toBe(true);
		expect(DEFAULT_SETTINGS.showActivityTimelineDivider).toBe(true);
		expect(DEFAULT_SETTINGS.showFileTypeChartDivider).toBe(true);
		expect(DEFAULT_SETTINGS.showTaskSummaryDivider).toBe(true);
	});

	it("defaults the file-type lists to empty", () => {
		expect(DEFAULT_SETTINGS.fileTypeLists).toEqual([]);
		expect("fileTypeChartPath" in DEFAULT_SETTINGS).toBe(false);
		expect(DEFAULT_SETTINGS.fileTypeLegendHeight).toBe(180);
	});

	it("defaults the MOC divider to shown", () => {
		expect(DEFAULT_SETTINGS.showMocDivider).toBe(true);
		expect(DEFAULT_SETTINGS.mocDividerLabel).toBe("MOC");
	});

	it("defaults the quick-links divider to shown", () => {
		expect(DEFAULT_SETTINGS.showQuickLinksDivider).toBe(true);
		expect(DEFAULT_SETTINGS.quickLinksDividerLabel).toBe("Quick Links");
	});

	it("defaults the clock divider to hidden", () => {
		expect(DEFAULT_SETTINGS.showClockDivider).toBe(false);
	});

	it("survives deepCloneDefaults and mergeSettings", () => {
		expect(deepCloneDefaults().showVaultActivityDivider).toBe(true);
		expect(mergeSettings(null).showClockDivider).toBe(false);
	});
});

describe("DEFAULT_MOCS", () => {
	it("has 6 default MOCs", () => {
		expect(DEFAULT_MOCS).toHaveLength(6);
	});

	it("each MOC has required fields", () => {
		for (const moc of DEFAULT_MOCS) {
			expect(typeof moc.path).toBe("string");
			expect(typeof moc.title).toBe("string");
			expect(typeof moc.desc).toBe("string");
			expect(typeof moc.icon).toBe("string");
			expect(moc.path).toBeTruthy();
			expect(moc.title).toBeTruthy();
		}
	});
});

describe("DEFAULT_STATS", () => {
	it("has 7 default stats", () => {
		expect(DEFAULT_STATS).toHaveLength(7);
	});

	it("includes the metric-based size and tag counters", () => {
		expect(DEFAULT_STATS).toEqual(
			expect.arrayContaining([
				{ folder: "", label: "SIze", metric: "size" },
				{ folder: "", label: "Tags", metric: "tags" },
			]),
		);
	});

	it("each stat has required fields", () => {
		for (const stat of DEFAULT_STATS) {
			expect(typeof stat.folder).toBe("string");
			expect(typeof stat.label).toBe("string");
			expect(stat.label).toBeTruthy();
		}
	});
});

describe("DEFAULT_NEW_NOTE", () => {
	it("is enabled by default with a Journal target", () => {
		expect(DEFAULT_NEW_NOTE.enabled).toBe(true);
		expect(DEFAULT_NEW_NOTE.label).toBe("NEW NOTE");
		expect(DEFAULT_NEW_NOTE.folder).toBe("Journal");
		expect(DEFAULT_NEW_NOTE.template).toBe("");
	});
});

describe("mergeSettings statsNewNote", () => {
	it("fills defaults when missing", () => {
		const result = mergeSettings({});
		expect(result.statsNewNote).toEqual(DEFAULT_NEW_NOTE);
	});

	it("merges partial overrides", () => {
		const result = mergeSettings({
			statsNewNote: { enabled: true, folder: "Inbox" },
		} as Partial<NexusSettings>);
		expect(result.statsNewNote.enabled).toBe(true);
		expect(result.statsNewNote.folder).toBe("Inbox");
		expect(result.statsNewNote.label).toBe("NEW NOTE");
		expect(result.statsNewNote.template).toBe("");
	});
});

describe("DIVIDER_PRESETS", () => {
	it("has 5 presets", () => {
		expect(Object.keys(DIVIDER_PRESETS)).toHaveLength(5);
	});

	it("each preset has all required fields", () => {
		for (const [, preset] of Object.entries(DIVIDER_PRESETS)) {
			expect(typeof preset.gradient).toBe("string");
			expect(typeof preset.lineWidth).toBe("string");
			expect(typeof preset.labelSize).toBe("string");
			expect(typeof preset.labelWeight).toBe("string");
			expect(typeof preset.labelColor).toBe("string");
			expect(typeof preset.labelSpacing).toBe("string");
		}
	});
});

describe("DIVIDER_PRESET_NAMES", () => {
	it("has matching keys with DIVIDER_PRESETS", () => {
		const presetKeys = Object.keys(DIVIDER_PRESETS).sort();
		const nameKeys = Object.keys(DIVIDER_PRESET_NAMES).sort();
		expect(presetKeys).toEqual(nameKeys);
	});
});

describe("detectDividerPreset", () => {
	it("detects default preset", () => {
		expect(detectDividerPreset(DEFAULT_DIVIDER_DESIGN)).toBe("default");
	});

	it("detects bold preset", () => {
		expect(detectDividerPreset(DIVIDER_PRESETS.bold)).toBe("bold");
	});

	it("returns custom for unknown design", () => {
		const custom: DividerDesign = {
			gradient: "custom",
			lineWidth: "1px",
			labelSize: "1rem",
			labelWeight: "400",
			labelColor: "red",
			labelSpacing: "0",
		};
		expect(detectDividerPreset(custom)).toBe("custom");
	});
});

describe("deepCloneDefaults", () => {
	it("returns a deep clone of defaults", () => {
		const clone = deepCloneDefaults();
		expect(clone).toEqual(DEFAULT_SETTINGS);
		expect(clone).not.toBe(DEFAULT_SETTINGS);
		expect(clone.mocs).not.toBe(DEFAULT_SETTINGS.mocs);
		expect(clone.stats).not.toBe(DEFAULT_SETTINGS.stats);
		expect(clone.dividerDesign).not.toBe(DEFAULT_SETTINGS.dividerDesign);
	});

	it("mutating clone does not affect defaults", () => {
		const clone = deepCloneDefaults();
		clone.headerText = "MODIFIED";
		clone.mocs.push({ path: "test", title: "test", desc: "test", icon: "test" });
		expect(DEFAULT_SETTINGS.headerText).toBe("NEXUS");
		expect(DEFAULT_SETTINGS.mocs).toHaveLength(6);
	});
});

describe("mergeSettings", () => {
	it("returns deep-cloned defaults when data is null", () => {
		const result = mergeSettings(null);
		expect(result.headerText).toBe("NEXUS");
		expect(result).not.toBe(DEFAULT_SETTINGS);
		expect(result.mocs).not.toBe(DEFAULT_SETTINGS.mocs);
	});

	it("returns deep-cloned defaults when data is undefined", () => {
		const result = mergeSettings(undefined);
		expect(result.headerText).toBe("NEXUS");
	});

	it("overlays scalar fields from partial data", () => {
		const result = mergeSettings({ headerText: "CUSTOM", showStats: false });
		expect(result.headerText).toBe("CUSTOM");
		expect(result.showStats).toBe(false);
		expect(result.openOnStartup).toBe(false); // from defaults
	});

	it("deep-clones array fields from partial data", () => {
		const result = mergeSettings({ mocs: [{ path: "a", title: "A", desc: "desc", icon: "!" }] });
		expect(result.mocs).toHaveLength(1);
		expect(result.mocs[0].path).toBe("a");
	});

	it("deep-clones dividerDesign", () => {
		const result = mergeSettings({ dividerDesign: { gradient: "custom" } as DividerDesign });
		expect(result.dividerDesign.gradient).toBe("custom");
		expect(result.dividerDesign.lineWidth).toBe(DEFAULT_SETTINGS.dividerDesign.lineWidth);
	});

	it("preserves task summary fields", () => {
		const result = mergeSettings({
			showTaskSummary: false,
			taskSummaryPath: "Custom/Path",
			taskSummaryCount: 5,
		});
		expect(result.showTaskSummary).toBe(false);
		expect(result.taskSummaryPath).toBe("Custom/Path");
		expect(result.taskSummaryCount).toBe(5);
		expect(result.taskSummaryShowProgress).toBe(false);
	});

	it("preserves vault activity fields", () => {
		const result = mergeSettings({ vaultActivityLabel: "CUSTOM LABEL" });
		expect(result.vaultActivityLabel).toBe("CUSTOM LABEL");
		expect(result.vaultActivityCount).toBe(9);
		expect(result.vaultActivityShowFade).toBe(true);
		expect(result.vaultActivityMaxHeight).toBe(300);
		expect(result.activityTimelineShowFade).toBe(true);
		expect(result.activityTimelineMaxHeight).toBe(500);
		expect(result.taskSummaryShowFade).toBe(true);
		expect(result.taskSummaryMaxHeight).toBe(180);
	});

	it("merges file-type legend height and clones list entries", () => {
		const result = mergeSettings({
			fileTypeLegendHeight: 260,
			fileTypeLists: [{ name: "Docs", path: "Docs", label: "", height: 220 }],
		});
		expect(result.fileTypeLegendHeight).toBe(260);
		expect(result.fileTypeLists).toEqual([{ name: "Docs", path: "Docs", label: "", height: 220 }]);
		result.fileTypeLists.pop();
		expect(result.fileTypeLists).toHaveLength(0);
	});

	it("provides activity tracking and timeline defaults", () => {
		const result = mergeSettings(null);
		expect(result.activityTrackingEnabled).toBe(true);
		expect(result.activityTaskTracking).toBe(true);
		expect(result.activityLogMax).toBe(500);
		expect(result.activityLog).toEqual([]);
		expect(result.activityTimelineOnlyMarkdown).toBe(true);
		expect(result.activityTimelineIncludeFolders).toBe("");
		expect(result.activityTimelineShowRelative).toBe(false);
		expect(result.activityTimelineGroup).toBe("day");
		expect(result.activityTimelineShowDate).toBe(true);
	});

	it("clones the activity log when merging", () => {
		const result = mergeSettings({
			activityLog: [{ time: 1, action: "created", path: "A.md" }],
		});
		expect(result.activityLog).toHaveLength(1);
		expect(result.activityLog[0].path).toBe("A.md");
		result.activityLog.pop();
		expect(result.activityLog).toHaveLength(0);
	});

	it("mutating result does not affect defaults", () => {
		const result = mergeSettings({ headerText: "X" });
		result.headerText = "Y";
		result.mocs.push({ path: "t", title: "t", desc: "t", icon: "t" });
		expect(DEFAULT_SETTINGS.headerText).toBe("NEXUS");
		expect(DEFAULT_SETTINGS.mocs).toHaveLength(6);
	});
});

describe("mergeSettings nested row layouts", () => {
	it("deep-clones nested rows embedded in row layout slots", () => {
		const nested: RowLayoutEntry = {
			name: "Nested",
			columns: 2,
			proportion: "50/50",
			align: "top",
			slots: ["moc-cards", "heatmap"],
		};
		const data = {
			rowLayouts: [
				{
					name: "Main",
					columns: 2,
					proportion: "30/70",
					align: "top",
					slots: ["timeline", [nested, "vault-activity"]],
				},
			],
		} as Partial<NexusSettings>;

		const result = mergeSettings(data);
		expect(result.rowLayouts[0].slots[1]).toHaveLength(2);
		const nestedClone = (result.rowLayouts[0].slots[1] as RowLayoutSlot[])[0] as RowLayoutEntry;
		expect(typeof nestedClone).toBe("object");
		expect(nestedClone.slots).toEqual(["moc-cards", "heatmap"]);

		// Mutating the clone must not affect the source slot object
		nestedClone.slots[0] = "clock";
		expect(nested.slots[0]).toBe("moc-cards");
	});

	it("deep-clones a whole-column nested row and its override maps", () => {
		const data = {
			rowLayouts: [
				{
					name: "Main",
					columns: 2,
					proportion: "50/50",
					align: "top",
					slots: [
						{
							name: "Nested",
							columns: 2,
							proportion: "50/50",
							align: "top",
							slots: ["heading", "none"],
							slotHeadings: { "0": { text: "Hi" } },
						},
						"none",
					],
				},
			],
		} as Partial<NexusSettings>;

		const result = mergeSettings(data);
		const nestedClone = result.rowLayouts[0].slots[0] as RowLayoutEntry;
		expect(nestedClone.slotHeadings?.["0"]?.text).toBe("Hi");

		nestedClone.slotHeadings!["0"]!.text = "Changed";
		const source = (data.rowLayouts![0].slots[0] as RowLayoutEntry).slotHeadings;
		expect(source?.["0"]?.text).toBe("Hi");
	});

	it("clones nested rows from deepCloneDefaults without sharing references", () => {
		const clone = deepCloneDefaults();
		expect(clone.rowLayouts).toEqual(DEFAULT_ROW_LAYOUTS);
		expect(clone).not.toBe(DEFAULT_SETTINGS);
	});
});

describe("DEFAULT_ROW_LAYOUTS", () => {
	it("ships the dashboard layout with a nested right column", () => {
		expect(DEFAULT_ROW_LAYOUTS).toHaveLength(3);

		const [row1, row2, row3] = DEFAULT_ROW_LAYOUTS;
		expect(row1.slots).toEqual(["stats"]);
		expect(row1.proportion).toBe("100");

		expect(row2.columns).toBe(2);
		expect(row2.proportion).toBe("30/70");
		expect(row2.slots[0]).toBe("timeline");
		const rightColumn = row2.slots[1] as RowLayoutSlot[];
		expect(rightColumn).toHaveLength(2);
		const nested = rightColumn[0] as RowLayoutEntry;
		expect(nested.name).toBe("Row 2-3 Right");
		expect(nested.slots).toEqual(["moc-cards", "vault-activity"]);
		expect(nested.vaultListSlots).toEqual({ "1": "Project" });
		expect(rightColumn[1]).toBe("heatmap");

		expect(row3.slots).toEqual(["tasks", "filetypes"]);
	});

	it("assigns stable ids to every default row", () => {
		for (const row of DEFAULT_ROW_LAYOUTS) {
			expect(row.id).toMatch(/^row-default-/);
		}
	});

	it("deep-clones the default layout without sharing nested references", () => {
		const clone = deepCloneDefaults();
		const nested = (clone.rowLayouts[1].slots[1] as RowLayoutSlot[])[0] as RowLayoutEntry;
		nested.slots[0] = "clock";
		if (nested.vaultListSlots) nested.vaultListSlots["1"] = "Other";

		const sourceNested = (DEFAULT_ROW_LAYOUTS[1].slots[1] as RowLayoutSlot[])[0] as RowLayoutEntry;
		expect(sourceNested.slots[0]).toBe("moc-cards");
		expect(sourceNested.vaultListSlots).toEqual({ "1": "Project" });
	});
});

describe("DEFAULT_VAULT_LISTS", () => {
	it("ships the Project vault list for the nested vault activity slot", () => {
		expect(DEFAULT_VAULT_LISTS).toEqual([
			{ name: "Project", path: "Project/Projects MOC", tags: "", count: 50, label: "Project" },
		]);
		expect(DEFAULT_SETTINGS.vaultLists).toEqual(DEFAULT_VAULT_LISTS);
	});
});
