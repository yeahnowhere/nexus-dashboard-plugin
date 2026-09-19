import { Setting } from "obsidian";
import type { NexusSettingTab } from "../index";
import { getAvailableFonts, getFontByName, renderFiglet } from "../../figlet";

/** Render the Header tab: ASCII art title, font, color, size, alignment, and live preview. */
export function renderHeaderTab(tab: NexusSettingTab, containerEl: HTMLElement): void {
	containerEl.createEl("p", {
		text: "Configure the default appearance of the ASCII art header.",
		cls: "setting-item-description",
	});

	new Setting(containerEl)
		.setName("Show header")
		.setDesc("Toggle the ASCII art header on the dashboard")
		.addToggle((toggle) =>
			toggle.setValue(tab.plugin.settings.showHeader).onChange(async (value) => {
				tab.plugin.settings.showHeader = value;
				await tab.plugin.saveSettings();
			}),
		);

	const fonts = getAvailableFonts();

	new Setting(containerEl)
		.setName("Dashboard title")
		.setDesc("Text rendered as the ASCII art header on your dashboard")
		.addText((text) =>
			text
				.setPlaceholder("NEXUS")
				.setValue(tab.plugin.settings.headerText)
				.onChange(async (value) => {
					tab.plugin.settings.headerText = value || "NEXUS";
					await tab.plugin.saveSettings();
					updateAsciiPreview(tab);
				}),
		);

	new Setting(containerEl)
		.setName("Default font")
		.setDesc("FIGlet font used when no font is specified in the code block")
		.addDropdown((dropdown) => {
			for (const font of fonts) {
				dropdown.addOption(font, font);
			}
			dropdown.setValue(tab.plugin.settings.asciiDefaultFont);
			dropdown.onChange(async (value) => {
				tab.plugin.settings.asciiDefaultFont = value;
				await tab.plugin.saveSettings();
				updateAsciiPreview(tab);
			});
		});

	new Setting(containerEl)
		.setName("Default color")
		.setDesc("Default text color (CSS color value)")
		.addText((text) =>
			text
				.setPlaceholder("#8A5CF6")
				.setValue(tab.plugin.settings.asciiDefaultColor)
				.onChange(async (value) => {
					tab.plugin.settings.asciiDefaultColor = value;
					await tab.plugin.saveSettings();
					updateAsciiPreview(tab);
				}),
		);

	new Setting(containerEl)
		.setName("Default size")
		.setDesc("Desktop font size multiplier (0.3–3.0)")
		.addSlider((slider) => {
			slider
				.setLimits(0.3, 3.0, 0.1)
				.setValue(tab.plugin.settings.asciiDefaultSize)
				.setDynamicTooltip()
				.onChange(async (value) => {
					tab.plugin.settings.asciiDefaultSize = value;
					await tab.plugin.saveSettings();
					updateAsciiPreview(tab);
				});
		});

	new Setting(containerEl)
		.setName("Mobile size")
		.setDesc("Mobile font size multiplier (0.3–2.0)")
		.addSlider((slider) => {
			slider
				.setLimits(0.3, 2.0, 0.1)
				.setValue(tab.plugin.settings.asciiMobileSize)
				.setDynamicTooltip()
				.onChange(async (value) => {
					tab.plugin.settings.asciiMobileSize = value;
					await tab.plugin.saveSettings();
					updateAsciiPreview(tab);
				});
		});

	new Setting(containerEl)
		.setName("Default alignment")
		.setDesc("Text alignment when no align is specified in the code block")
		.addDropdown((dropdown) => {
			dropdown.addOption("left", "Left");
			dropdown.addOption("center", "Center");
			dropdown.addOption("right", "Right");
			dropdown.setValue(tab.plugin.settings.asciiDefaultAlign);
			dropdown.onChange(async (value) => {
				tab.plugin.settings.asciiDefaultAlign = value as "left" | "center" | "right";
				await tab.plugin.saveSettings();
				updateAsciiPreview(tab);
			});
		});

	// Preview
	const previewContainer = containerEl.createDiv({ cls: "nexus-settings-preview" });
	renderAsciiPreview(tab, previewContainer);
}

/** Re-render just the transient ASCII art preview in the header tab. */
function updateAsciiPreview(tab: NexusSettingTab): void {
	const previewContainer = tab.containerEl.querySelector(".nexus-settings-preview");
	if (previewContainer) {
		previewContainer.empty();
		renderAsciiPreview(tab, previewContainer as HTMLElement);
	}
}

function renderAsciiPreview(tab: NexusSettingTab, container: HTMLElement): void {
	const font = getFontByName(tab.plugin.settings.asciiDefaultFont);
	const preview = renderFiglet(tab.plugin.settings.headerText || "PREVIEW", { font });
	const pre = container.createEl("pre", { text: preview, cls: "ascii-header-preview" });
	pre.style.color = tab.plugin.settings.asciiDefaultColor;
	pre.style.setProperty("--nexus-ascii-size", String(tab.plugin.settings.asciiDefaultSize));
	pre.style.textAlign = tab.plugin.settings.asciiDefaultAlign;
	pre.style.overflowX = "auto";
	pre.style.fontFamily = "monospace";
	pre.style.lineHeight = "1";
}
