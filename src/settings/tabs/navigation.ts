import { Setting } from "obsidian";
import type { NexusSettingTab } from "../index";

/** Render the Navigation tab: arrow-key pointer control + auto-focus on open. */
export function renderNavigationTab(tab: NexusSettingTab, containerEl: HTMLElement): void {
	new Setting(containerEl)
		.setName("Keyboard navigation")
		.setDesc(
			"Use the arrow keys (or W/A/S/D) to move a pointer across the dashboard, Enter to step into a component, Esc to step back out, and Page Up/Page Down to scroll.",
		)
		.addToggle((toggle) =>
			toggle.setValue(tab.plugin.settings.keyboardNav).onChange(async (value) => {
				tab.plugin.settings.keyboardNav = value;
				await tab.plugin.saveSettings();
			}),
		);

	new Setting(containerEl)
		.setName("Focus dashboard on open")
		.setDesc("Give the dashboard keyboard focus when its note opens so the arrows work immediately.")
		.addToggle((toggle) =>
			toggle.setValue(tab.plugin.settings.keyboardNavFocusOnOpen).onChange(async (value) => {
				tab.plugin.settings.keyboardNavFocusOnOpen = value;
				await tab.plugin.saveSettings();
			}),
		);
}
