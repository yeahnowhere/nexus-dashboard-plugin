// @vitest-environment happy-dom
import "./helpers/obsidian-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { Notice, TFile, lastCopiedText } from "./helpers/obsidian-mock";
import { NexusSettingTab, renderMocCard, renderStatEntry } from "../settings";
import { DASHBOARD_PRESETS, rowLayoutsEqual } from "../presets";
import { DEFAULT_ROW_LAYOUTS, deepCloneDefaults } from "../defaults";
import type { NexusSettings } from "../types";

interface SettingsTestBed {
	tab: NexusSettingTab;
	plugin: { settings: NexusSettings; saveSettings: ReturnType<typeof vi.fn> };
}

function makeSettingsTab(partial: Partial<NexusSettings> = {}): SettingsTestBed {
	const settings = Object.assign(deepCloneDefaults(), partial) as NexusSettings;
	const vaultFiles = ["Journal/2026-01-01.md", "MOC/Books.md", "MOC/Journal MOC.md"].map(
		(path) => new TFile({ path }),
	);
	const app = {
		vault: {
			getMarkdownFiles: () => vaultFiles,
			getFiles: () => vaultFiles,
		},
	} as unknown as App;
	const plugin = {
		settings,
		saveSettings: vi.fn(async () => {}),
	} as never;
	const tab = new NexusSettingTab(app, plugin);
	return { tab, plugin };
}

function activeContent(tab: NexusSettingTab): HTMLElement {
	const content = tab.containerEl.querySelector<HTMLElement>(".nexus-settings-content");
	expect(content).not.toBeNull();
	return content!;
}

function clickTab(tab: NexusSettingTab, name: string): void {
	const el = Array.from(tab.containerEl.querySelectorAll<HTMLElement>(".nexus-settings-tab")).find(
		(t) => t.textContent?.includes(name),
	);
	expect(el).toBeDefined();
	el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function settingItem(content: HTMLElement, name: string): HTMLElement {
	const item = Array.from(content.querySelectorAll<HTMLElement>(".setting-item")).find(
		(s) => s.querySelector(".setting-item-name")?.textContent === name,
	);
	expect(item).toBeDefined();
	return item!;
}

function clickButtonIn(parent: HTMLElement, text: string): void {
	const btn = Array.from(parent.querySelectorAll<HTMLButtonElement>("button")).find(
		(b) => b.textContent?.trim() === text,
	);
	expect(btn).toBeDefined();
	btn!.click();
}

function componentCard(content: HTMLElement, title: string): HTMLElement {
	const card = Array.from(content.querySelectorAll<HTMLElement>(".nexus-component-card")).find((c) =>
		c.querySelector(".nexus-component-card-title-text")?.textContent?.includes(title),
	);
	expect(card).toBeDefined();
	return card!;
}

function confirmModalButton(text: string): HTMLButtonElement {
	const btn = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
		(b) => b.textContent?.trim() === text,
	);
	expect(btn).toBeDefined();
	return btn!;
}

beforeEach(() => {
	document.body.innerHTML = "";
	Notice.instances.length = 0;
});

describe("settings tab chrome", () => {
	it("renders the title, five tabs, and the General tab by default", () => {
		const { tab } = makeSettingsTab();
		tab.display();
		expect(tab.containerEl.querySelector(".nexus-settings-logo")).not.toBeNull();
		expect(tab.containerEl.querySelectorAll(".nexus-settings-tab")).toHaveLength(5);
		expect(tab.containerEl.querySelector(".nexus-settings-tab.active")?.textContent).toContain(
			"General",
		);
		const content = activeContent(tab);
		expect(content.textContent).toContain("Open on startup");
		expect(content.textContent).toContain("Export settings");
	});

	it("switches tabs and renders each module", () => {
		const { tab } = makeSettingsTab();
		tab.display();

		clickTab(tab, "Header");
		let content = activeContent(tab);
		expect(content.textContent).toContain("Show header");
		expect(content.textContent).toContain("Default alignment");
		expect(tab.containerEl.querySelector(".ascii-header-preview")).not.toBeNull();

		clickTab(tab, "Dashboard");
		content = activeContent(tab);
		expect(content.textContent).toContain("Row layouts");
		expect(content.textContent).toContain("Column layouts");
		expect(content.textContent).toContain("+ Add Row");

		clickTab(tab, "Presets");
		content = activeContent(tab);
		expect(content.querySelectorAll(".nexus-preset-row-card")).toHaveLength(DASHBOARD_PRESETS.length);
		expect(content.querySelector(".nexus-preset-badge.is-active")).not.toBeNull();

		clickTab(tab, "Components");
		content = activeContent(tab);
		expect(content.querySelectorAll(".nexus-component-card").length).toBeGreaterThan(0);
	});
});

describe("general tab", () => {
	it("updates the open-on-startup toggle and saves", async () => {
		const { tab, plugin } = makeSettingsTab({ openOnStartup: false });
		tab.display();
		const checkbox = settingItem(
			activeContent(tab),
			"Open on startup",
		).querySelector<HTMLInputElement>('input[type="checkbox"]')!;
		checkbox.checked = true;
		checkbox.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => expect(tab.plugin.settings.openOnStartup).toBe(true));
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it("exports settings as a downloaded JSON file", () => {
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:nexus-settings");
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
		const { tab } = makeSettingsTab();
		tab.display();
		clickButtonIn(activeContent(tab), "Export");
		expect(Notice.instances.some((n) => n.message === "Settings exported")).toBe(true);
	});

	it("resets settings to defaults via the confirm modal", async () => {
		const { tab, plugin } = makeSettingsTab({ openOnStartup: true, headerText: "CUSTOM" });
		tab.display();
		clickButtonIn(activeContent(tab), "Reset all settings");
		confirmModalButton("Confirm").click();
		await vi.waitFor(() => expect(tab.plugin.settings.openOnStartup).toBe(false));
		expect(tab.plugin.settings.headerText).toBe("NEXUS");
		expect(plugin.saveSettings).toHaveBeenCalled();
	});
});

describe("header tab", () => {
	it("edits the dashboard title and updates the ASCII preview", async () => {
		const { tab, plugin } = makeSettingsTab();
		tab.display();
		clickTab(tab, "Header");
		const input = settingItem(activeContent(tab), "Dashboard title").querySelector<HTMLInputElement>(
			"input.setting-text-input",
		)!;
		expect(input.value).toBe("NEXUS");
		input.value = "MY DASH";
		input.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => expect(tab.plugin.settings.headerText).toBe("MY DASH"));
		expect(plugin.saveSettings).toHaveBeenCalled();
	});
});

describe("layout tab", () => {
	it("adds a row layout via the + Add Row button", async () => {
		const { tab } = makeSettingsTab();
		tab.display();
		clickTab(tab, "Dashboard");
		const before = tab.plugin.settings.rowLayouts.length;
		clickButtonIn(activeContent(tab), "+ Add Row");
		await vi.waitFor(() => expect(tab.plugin.settings.rowLayouts.length).toBe(before + 1));
	});
});

describe("presets tab", () => {
	it("applies a preset after confirmation", async () => {
		const tweaked = structuredClone(DEFAULT_ROW_LAYOUTS);
		tweaked[0] = { ...tweaked[0], name: "Custom row" };
		const { tab, plugin } = makeSettingsTab({ rowLayouts: tweaked });
		tab.display();
		clickTab(tab, "Presets");
		expect(activeContent(tab).querySelector(".nexus-preset-badge.is-active")).toBeNull();
		clickButtonIn(activeContent(tab), "Apply");
		confirmModalButton("Confirm").click();
		await vi.waitFor(() => expect(plugin.saveSettings).toHaveBeenCalled());
		expect(rowLayoutsEqual(tab.plugin.settings.rowLayouts, DEFAULT_ROW_LAYOUTS)).toBe(true);
		expect(activeContent(tab).querySelector(".nexus-preset-badge.is-active")).not.toBeNull();
	});
});

describe("components tab", () => {
	it("expands a component card and toggles its component on/off", async () => {
		const { tab, plugin } = makeSettingsTab();
		tab.display();
		clickTab(tab, "Components");
		expect(activeContent(tab).querySelector(".nexus-component-card-body")).toBeNull();

		const mocCard = componentCard(activeContent(tab), "MOC Cards");
		mocCard.querySelector<HTMLElement>(".nexus-component-card-header")!.click();
		await vi.waitFor(() =>
			expect(tab.plugin.settings.collapseState["component:moc-cards"]).toBe(false),
		);

		const content = activeContent(tab);
		const mocCardExpanded = componentCard(content, "MOC Cards");
		const body = mocCardExpanded.querySelector(".nexus-component-card-body");
		expect(body).not.toBeNull();
		expect(body!.textContent).toContain("+ Add MOC");
		expect(content.querySelectorAll(".nexus-settings-moc-heading")).toHaveLength(6);

		const toggle = mocCardExpanded.querySelector<HTMLInputElement>(
			".nexus-component-card-toggle input",
		)!;
		toggle.checked = false;
		toggle.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => expect(tab.plugin.settings.showMocCards).toBe(false));
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it("collapses and expands all component cards", async () => {
		const { tab, plugin } = makeSettingsTab();
		tab.display();
		clickTab(tab, "Components");

		const bar = activeContent(tab).querySelector<HTMLElement>(".nexus-settings-collapse-bar")!;
		clickButtonIn(bar, "Expand all");
		await vi.waitFor(() =>
			expect(tab.plugin.settings.collapseState["component:moc-cards"]).toBe(false),
		);
		await vi.waitFor(() =>
			expect(activeContent(tab).querySelectorAll(".nexus-component-card-body")).toHaveLength(10),
		);
		expect(plugin.saveSettings).toHaveBeenCalled();

		const bar2 = activeContent(tab).querySelector<HTMLElement>(".nexus-settings-collapse-bar")!;
		clickButtonIn(bar2, "Collapse all");
		await vi.waitFor(() =>
			expect(tab.plugin.settings.collapseState["component:moc-cards"]).toBe(true),
		);
		expect(activeContent(tab).querySelector(".nexus-component-card-body")).toBeNull();
	});

	it("copies the stats config as a dashboard code block", async () => {
		const { tab } = makeSettingsTab();
		tab.display();
		clickTab(tab, "Components");

		const statsCard = componentCard(activeContent(tab), "Stats");
		statsCard.querySelector<HTMLElement>(".nexus-component-card-header")!.click();
		clickButtonIn(activeContent(tab), "Copy");
		expect(lastCopiedText()).toContain("stats:");
		expect(lastCopiedText()).toContain('label: "Files"');
		expect(Notice.instances.some((n) => n.message.includes("code block copied"))).toBe(true);
	});
});

describe("exported entry renderers", () => {
	it("renders and edits a MOC card", async () => {
		const { tab, plugin } = makeSettingsTab({ collapseState: { "moc:0": false } });
		const container = document.createElement("div");
		renderMocCard(tab, container, tab.plugin.settings.mocs[0], 0);

		const heading = container.querySelector(".nexus-settings-moc-heading");
		expect(heading?.textContent).toContain("Journal MOC");

		const input = container.querySelector<HTMLInputElement>(".nexus-note-path-input")!;
		expect(input).not.toBeNull();
		input.value = "MOC/New.md";
		input.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => expect(tab.plugin.settings.mocs[0].path).toBe("MOC/New.md"));
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it("renders a stat entry and updates its metric", async () => {
		const { tab, plugin } = makeSettingsTab();
		const container = document.createElement("div");
		renderStatEntry(tab, container, tab.plugin.settings.stats[0], 0);

		const summary = container.querySelector(".nexus-stat-entry-summary")!;
		expect(summary.textContent).not.toBe("");

		const metricSelect = container.querySelector<HTMLSelectElement>(
			".nexus-stat-entry-metric select",
		)!;
		expect(metricSelect.querySelectorAll("option")).toHaveLength(4);
		metricSelect.value = "tags";
		metricSelect.dispatchEvent(new Event("change", { bubbles: true }));
		await vi.waitFor(() => expect(tab.plugin.settings.stats[0].metric).toBe("tags"));
		expect(plugin.saveSettings).toHaveBeenCalled();
	});
});
