import type { App } from "obsidian";
import type { ContentSlotType } from "../types";
import { ICONS } from "../icons";

export const ICON_NAMES = Object.keys(ICONS);

export const CONTENT_SLOT_OPTIONS: Record<ContentSlotType, string> = {
	none: "Empty",
	stats: "Stats",
	heading: "Heading",
	"moc-cards": "MOC Cards",
	"quick-links": "Quick Links",
	"vault-activity": "Vault Activity",
	divider: "Divider",
	heatmap: "Heatmap",
	timeline: "Activity Timeline",
	clock: "Clock",
	filetypes: "File Types",
	tasks: "Task Summary",
};

interface SettingTab {
	id: string;
	name: string;
	icon: string;
}

const SETTING_TABS: SettingTab[] = [
	{ id: "general", name: "General", icon: "gear" },
	{ id: "header", name: "Header", icon: "type" },
	{ id: "layout", name: "Dashboard", icon: "layout-grid" },
	{ id: "presets", name: "Presets", icon: "wand" },
	{ id: "components", name: "Components", icon: "component" },
];

interface DividerControlSettings {
	show: boolean;
	label: string;
	labelPlaceholder: string;
	onShow: (value: boolean) => Promise<void>;
	onLabel: (value: string) => Promise<void>;
}

let vaultFoldersCache: string[] | null = null;
let vaultFoldersCacheAt = 0;

/** Drop the cached vault-folder list (e.g. after a folder rename/move). */
export function clearVaultFoldersCache(): void {
	vaultFoldersCache = null;
	vaultFoldersCacheAt = 0;
}

function getVaultFolders(app: App): string[] {
	const now = Date.now();
	if (vaultFoldersCache && now - vaultFoldersCacheAt < 5000) {
		return vaultFoldersCache;
	}
	const folders = new Set<string>();
	for (const file of app.vault.getMarkdownFiles()) {
		const parts = file.path.split("/");
		if (parts.length > 1) {
			// Collect every unique folder path
			let current = "";
			for (let i = 0; i < parts.length - 1; i++) {
				current = current ? `${current}/${parts[i]}` : parts[i];
				folders.add(current);
			}
		}
	}
	vaultFoldersCache = Array.from(folders).sort();
	vaultFoldersCacheAt = now;
	return vaultFoldersCache;
}

// ── SVG Icons ──────────────────────────────────────────────────

const SVG = {
	chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
};

export { SETTING_TABS, getVaultFolders, SVG };
export type { SettingTab, DividerControlSettings };
