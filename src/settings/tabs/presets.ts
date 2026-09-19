import type { NexusSettingTab } from "../index";
import {
	DASHBOARD_PRESETS,
	DEFAULT_PRESET_ID,
	rowLayoutsEqual,
	type DashboardPreset,
} from "../../presets";
import { mergeSettings } from "../../defaults";
import { ConfirmModal } from "../confirm-modal";

/** Render the Presets tab: preloaded layout templates. */
export function renderPresetsTab(tab: NexusSettingTab, containerEl: HTMLElement): void {
	const list = containerEl.createDiv({ cls: "nexus-preset-list" });
	const activeId = activePresetId(tab);
	for (const preset of DASHBOARD_PRESETS) {
		renderPresetRow(tab, list, preset, preset.id === activeId);
	}
}

/** Id of the preset currently in use, or null when the layout is custom. */
function activePresetId(tab: NexusSettingTab): string | null {
	const current = tab.plugin.settings.rowLayouts;
	for (const preset of DASHBOARD_PRESETS) {
		if (rowLayoutsEqual(current, preset.rowLayouts)) return preset.id;
	}
	return null;
}

function renderPresetRow(
	tab: NexusSettingTab,
	containerEl: HTMLElement,
	preset: DashboardPreset,
	isActive: boolean,
): void {
	const row = containerEl.createDiv({ cls: "nexus-preset-row-card" });
	if (isActive) row.addClass("is-active");

	const info = row.createDiv({ cls: "nexus-preset-info" });
	const titleWrap = info.createDiv({ cls: "nexus-preset-title-wrap" });
	titleWrap.createEl("span", { text: preset.name, cls: "nexus-preset-name" });

	if (isActive) {
		titleWrap.createEl("span", { text: "Active", cls: "nexus-preset-badge is-active" });
	} else if (preset.id === DEFAULT_PRESET_ID) {
		titleWrap.createEl("span", { text: "Default", cls: "nexus-preset-badge is-default" });
	}

	if (preset.description) {
		info.createEl("p", { text: preset.description, cls: "nexus-preset-desc" });
	}

	const actions = row.createDiv({ cls: "nexus-preset-actions" });
	if (isActive) {
		actions.createEl("button", {
			text: "Using this layout",
			attr: { disabled: "disabled" },
		});
	} else {
		actions.createEl("button", { text: "Apply", cls: "mod-cta" }).addEventListener("click", () => {
			applyPreset(tab, preset);
		});
	}
}

/** Replace the current layout with a preset, keeping the user's own content. */
function applyPreset(tab: NexusSettingTab, preset: DashboardPreset): void {
	new ConfirmModal(
		tab.app,
		"Apply preset?",
		`Replace your current dashboard layout with "${preset.name}"? Your MOC cards, stats, vault lists, and quick links are kept.`,
		async () => {
			tab.plugin.settings = mergeSettings({
				...preset.settings,
				rowLayouts: preset.rowLayouts,
				columnLayouts: [],
			});
			await tab.saveAndRefresh();
		},
	).open();
}
