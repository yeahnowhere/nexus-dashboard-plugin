import { Notice, Setting } from "obsidian";
import type { NexusSettingTab } from "../index";
import { DEFAULT_SETTINGS, deepCloneDefaults } from "../../defaults";
import { ConfirmModal } from "../confirm-modal";

/** Render the General tab: startup toggle, export/import, and reset. */
export function renderGeneralTab(tab: NexusSettingTab, containerEl: HTMLElement): void {
	new Setting(containerEl)
		.setName("Open on startup")
		.setDesc("Automatically open the dashboard when Obsidian starts")
		.addToggle((toggle) =>
			toggle.setValue(tab.plugin.settings.openOnStartup).onChange(async (value) => {
				tab.plugin.settings.openOnStartup = value;
				await tab.plugin.saveSettings();
			}),
		);

	// ── Export / Import ─────────────────────────────
	new Setting(containerEl).setHeading().setName("Export / Import");

	new Setting(containerEl)
		.setName("Export settings")
		.setDesc("Download your current settings as a JSON file")
		.addButton((btn) =>
			btn
				.setButtonText("Export")
				.setCta()
				.onClick(() => exportSettings(tab)),
		);

	new Setting(containerEl)
		.setName("Import settings")
		.setDesc("Load settings from a previously exported JSON file")
		.addButton((btn) =>
			btn
				.setButtonText("Import")
				.setWarning()
				.onClick(() => void importSettings(tab)),
		);

	// ── Reset ──────────────────────────────────────
	new Setting(containerEl).setHeading().setName("Reset");

	new Setting(containerEl)
		.setName("Reset to defaults")
		.setDesc("Restore all MOC cards, stats, and layout to the original defaults.")
		.addButton((btn) =>
			btn
				.setButtonText("Reset all settings")
				.setWarning()
				.onClick(() => {
					new ConfirmModal(
						tab.app,
						"Reset all settings?",
						"This will restore all MOC cards, stats, and layout to the original defaults. This cannot be undone.",
						async () => {
							tab.plugin.settings = deepCloneDefaults();
							await tab.saveAndRefresh();
						},
					).open();
				}),
		);
}

/** Download the current settings as a JSON file. */
function exportSettings(tab: NexusSettingTab): void {
	const data = JSON.stringify(tab.plugin.settings, null, 2);
	const blob = new Blob([data], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "nexus-dashboard-settings.json";
	a.click();
	URL.revokeObjectURL(url);
	new Notice("Settings exported");
}

/** Load settings from a previously exported JSON file. */
async function importSettings(tab: NexusSettingTab): Promise<void> {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = ".json";
	input.onchange = async () => {
		const file = input.files?.[0];
		if (!file) return;
		try {
			const text = await file.text();
			const data = JSON.parse(text);
			if (!data || typeof data !== "object") {
				new Notice("Invalid settings file: not a valid JSON object");
				return;
			}
			if (data.mocs && !Array.isArray(data.mocs)) {
				new Notice("Invalid settings file: mocs must be an array");
				return;
			}
			if (data.stats && !Array.isArray(data.stats)) {
				new Notice("Invalid settings file: stats must be an array");
				return;
			}
			if (data.mocs) {
				const validMocs = data.mocs.every(
					(m: Record<string, unknown>) => m && typeof m.path === "string" && typeof m.title === "string",
				);
				if (!validMocs) {
					new Notice("Invalid settings file: malformed MOC entries");
					return;
				}
			}
			if (data.stats) {
				const validStats = data.stats.every(
					(s: Record<string, unknown>) =>
						s && typeof s.folder === "string" && typeof s.label === "string",
				);
				if (!validStats) {
					new Notice("Invalid settings file: malformed stat entries");
					return;
				}
			}
			if (data.vaultLists && !Array.isArray(data.vaultLists)) {
				new Notice("Invalid settings file: vaultLists must be an array");
				return;
			}
			if (data.vaultLists) {
				const validVl = data.vaultLists.every(
					(v: Record<string, unknown>) => v && typeof v.name === "string",
				);
				if (!validVl) {
					new Notice("Invalid settings file: malformed vault list entries");
					return;
				}
			}
			if (data.fileTypeLists && !Array.isArray(data.fileTypeLists)) {
				new Notice("Invalid settings file: fileTypeLists must be an array");
				return;
			}
			if (data.fileTypeLists) {
				const validFt = data.fileTypeLists.every(
					(v: Record<string, unknown>) =>
						v && typeof v.name === "string" && (v.height === undefined || typeof v.height === "number"),
				);
				if (!validFt) {
					new Notice("Invalid settings file: malformed file-type list entries");
					return;
				}
			}
			const validKeys = Object.keys(DEFAULT_SETTINGS);
			const filtered: Record<string, unknown> = {};
			for (const key of validKeys) {
				if (key in data) {
					filtered[key] = data[key];
				}
			}
			Object.assign(tab.plugin.settings, filtered);
			tab.sanitizeImportedSettings();
			await tab.saveAndRefresh();
			new Notice("Settings imported");
		} catch {
			new Notice("Invalid settings file");
		}
	};
	input.click();
}
