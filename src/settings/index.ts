import { App, Notice, PluginSettingTab, setIcon } from "obsidian";
import type NexusDashboardPlugin from "../main";
import type { ContentSlotType, RowLayoutEntry, RowLayoutSlot } from "../types";
import { renderFiglet } from "../figlet";
import { safeParseInt } from "../utils";
import { SETTING_TABS, SVG, collapseKey } from "./shared";
import { renderGeneralTab } from "./tabs/general";
import { renderHeaderTab } from "./tabs/header";
import { renderLayoutTab } from "./tabs/layout";
import { renderPresetsTab } from "./tabs/presets";
import { renderComponentsTab } from "./tabs/components";

export { ICON_NAMES, CONTENT_SLOT_OPTIONS, clearVaultFoldersCache } from "./shared";
export {
	renderMocCard,
	renderStatEntry,
	renderVaultListEntry,
	renderFileTypeListEntry,
} from "./tabs/components";

// ── Settings Tab ───────────────────────────────────────────────

export class NexusSettingTab extends PluginSettingTab {
	plugin: NexusDashboardPlugin;
	private draggedIndex: number | null = null;
	private activeTab = "general";

	/** True when the card (by persisted key) is collapsed; cards default to collapsed. */
	isCollapsed(key: string): boolean {
		return this.plugin.settings.collapseState[key] ?? true;
	}

	setCollapsed(key: string, value: boolean): void {
		this.plugin.settings.collapseState[key] = value;
	}

	deleteCollapsed(key: string): void {
		delete this.plugin.settings.collapseState[key];
	}

	/** Whether a content slot is available — toggled-off components appear greyed out. */
	isSlotEnabled(slot: ContentSlotType): boolean {
		const s = this.plugin.settings;
		switch (slot) {
			case "stats":
				return s.showStats;
			case "moc-cards":
				return s.showMocCards;
			case "quick-links":
				return s.showQuickLinks;
			case "vault-activity":
				return s.showVaultActivity;
			case "heatmap":
				return s.showHeatmap;
			case "timeline":
				return s.showActivityTimeline;
			case "clock":
				return s.showClock;
			case "filetypes":
				return s.showFileTypeChart;
			case "tasks":
				return s.showTaskSummary;
			case "none":
			case "heading":
			case "divider":
				return true;
		}
	}

	/** All persisted collapse keys shown on the Components tab. */
	collectComponentKeys(): string[] {
		const keys: string[] = [];
		for (const id of [
			"moc-cards",
			"stats",
			"vault-activity",
			"quick-links",
			"heatmap",
			"activity-timeline",
			"clock",
			"file-types",
			"task-summary",
			"divider-style",
		]) {
			keys.push(collapseKey("component", id));
		}
		for (let i = 0; i < this.plugin.settings.mocs.length; i++) {
			keys.push(collapseKey("moc", i));
		}
		return keys;
	}

	/** All persisted collapse keys shown on the Dashboard tab. */
	collectLayoutKeys(): string[] {
		const keys: string[] = [];
		this.plugin.settings.rowLayouts.forEach((l, i) => {
			keys.push(collapseKey("row", l.id || `row-${i}`));
		});
		this.plugin.settings.columnLayouts.forEach((l, i) => {
			keys.push(collapseKey("col", l.id || String(i)));
		});
		return keys;
	}

	/** Collapse/expand every card in the given key list at once. */
	renderCollapseAllBar(parent: HTMLElement, keys: string[]): void {
		const bar = parent.createDiv({ cls: "nexus-settings-collapse-bar" });
		const collapseBtn = bar.createEl("button", { text: "Collapse all", cls: "mod-cta" });
		collapseBtn.addEventListener("click", () => {
			for (const key of keys) this.setCollapsed(key, true);
			void this.plugin.saveSettings();
			this.renderActiveTab();
		});
		const expandBtn = bar.createEl("button", { text: "Expand all" });
		expandBtn.addEventListener("click", () => {
			for (const key of keys) this.setCollapsed(key, false);
			void this.plugin.saveSettings();
			this.renderActiveTab();
		});
	}

	constructor(app: App, plugin: NexusDashboardPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Save settings to disk and re-render only the active tab content.
	 * Preserves the title and tab bar DOM (avoids full-page churn on every edit).
	 */
	async saveAndRefresh(): Promise<void> {
		await this.plugin.saveSettings();
		this.renderActiveTab();
	}

	/** Re-render the currently-active tab content without touching the chrome. */
	private renderActiveTab(): void {
		const content = this.containerEl.querySelector<HTMLElement>(".nexus-settings-content");
		if (!content) return;
		content.empty();
		try {
			switch (this.activeTab) {
				case "general":
					renderGeneralTab(this, content);
					break;
				case "header":
					renderHeaderTab(this, content);
					break;
				case "layout":
					renderLayoutTab(this, content);
					break;
				case "presets":
					renderPresetsTab(this, content);
					break;
				case "components":
					renderComponentsTab(this, content);
					break;
			}
		} catch (err) {
			// eslint-disable-next-line no-console -- error guard; console is the only place the user can see render failures
			console.error("Nexus Dashboard: failed to render settings tab", err);
			new Notice("Nexus Dashboard: failed to render settings tab — see console");
			content.createEl("p", {
				text: "An error occurred while rendering this tab. Check the developer console for details.",
				cls: "setting-item-description",
			});
		}
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Title — centered ASCII art logo
		const titleEl = containerEl.createDiv({ cls: "nexus-settings-title" });
		titleEl.createEl("pre", {
			text: renderFiglet(this.plugin.settings.headerText || "nexus-dashboard"),
			cls: "nexus-settings-logo",
		});

		// ── Tab bar ──────────────────────────────────────
		const tabBar = containerEl.createDiv({ cls: "nexus-settings-tabs" });
		tabBar.setAttribute("role", "tablist");
		for (const tab of SETTING_TABS) {
			const isActive = tab.id === this.activeTab;
			const tabEl = tabBar.createDiv({
				cls: `nexus-settings-tab ${isActive ? "active" : ""}`,
				attr: {
					role: "tab",
					"aria-selected": isActive ? "true" : "false",
					tabindex: isActive ? "0" : "-1",
				},
			});
			setIcon(tabEl, tab.icon);
			tabEl.createEl("span", { text: tab.name });
			const activate = () => {
				this.activeTab = tab.id;
				this.display();
			};
			tabEl.addEventListener("click", activate);
			tabEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					activate();
				}
			});
		}

		// ── Tab content ──────────────────────────────────
		containerEl.createDiv({ cls: "nexus-settings-content" });
		this.renderActiveTab();
	}

	// ── Shared helpers ─────────────────────────────────────────

	setupDragAndDrop(
		heading: HTMLElement,
		index: number,
		arr: { splice: (start: number, deleteCount: number, ...items: unknown[]) => unknown[] },
		isCollapsed: boolean,
		showHandle = true,
	): { titleWrap: HTMLElement; actions: HTMLElement } {
		heading.draggable = true;

		if (showHandle) {
			const dragHandle = heading.createDiv({ cls: "nexus-settings-moc-drag", text: "⋮⋮" });
			dragHandle.draggable = false;
		}

		heading.addEventListener("dragstart", (e) => {
			this.draggedIndex = index;
			heading.classList.add("nexus-dragging");
			if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
		});

		heading.addEventListener("dragend", () => {
			heading.classList.remove("nexus-dragging");
			this.draggedIndex = null;
		});

		heading.addEventListener("dragover", (e) => {
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
			heading.classList.add("nexus-drag-over");
		});

		heading.addEventListener("dragleave", () => {
			heading.classList.remove("nexus-drag-over");
		});

		heading.addEventListener("drop", async (e) => {
			e.preventDefault();
			heading.classList.remove("nexus-drag-over");
			if (this.draggedIndex === null || this.draggedIndex === index) return;
			const [moved] = arr.splice(this.draggedIndex, 1);
			arr.splice(index, 0, moved);
			await this.saveAndRefresh();
		});

		const arrow = heading.createDiv({
			cls: `nexus-settings-moc-arrow ${isCollapsed ? "collapsed" : ""}`,
		});
		arrow.innerHTML = SVG.chevronDown;

		const titleWrap = heading.createDiv({ cls: "nexus-settings-moc-title" });
		titleWrap.addEventListener("click", (e) => e.stopPropagation());

		const actions = heading.createDiv({ cls: "nexus-settings-moc-actions" });
		actions.addEventListener("click", (e) => e.stopPropagation());

		return { titleWrap, actions };
	}

	addVaultListSelector(
		parent: HTMLElement,
		paddingLeft: string,
		currentValue: string,
		onChange: (value: string) => void,
	): void {
		const row = parent.createDiv({ cls: "nexus-column-slot-row" });
		row.style.display = "flex";
		row.style.alignItems = "center";
		row.style.gap = "8px";
		row.style.paddingLeft = paddingLeft;

		const label = row.createEl("span", { text: "List:", cls: "setting-item-description" });
		label.style.minWidth = "40px";

		const select = row.createEl("select", { cls: "dropdown" });
		select.createEl("option", { text: "— Select list —", value: "" });
		for (const vl of this.plugin.settings.vaultLists) {
			const opt = select.createEl("option", { text: vl.name, value: vl.name });
			if (vl.name === currentValue) opt.selected = true;
		}
		select.addEventListener("change", () => onChange(select.value));

		if (this.plugin.settings.vaultLists.length === 0) {
			const hint = row.createEl("span", {
				text: "Add vault lists in the Components tab first",
				cls: "setting-item-description",
			});
			hint.style.color = "var(--text-muted)";
			hint.style.fontStyle = "italic";
		}
	}

	addFileTypeListSelector(
		parent: HTMLElement,
		paddingLeft: string,
		currentValue: string,
		onChange: (value: string) => void,
	): void {
		const row = parent.createDiv({ cls: "nexus-column-slot-row" });
		row.style.display = "flex";
		row.style.alignItems = "center";
		row.style.gap = "8px";
		row.style.paddingLeft = paddingLeft;

		const label = row.createEl("span", { text: "List:", cls: "setting-item-description" });
		label.style.minWidth = "40px";

		const select = row.createEl("select", { cls: "dropdown" });
		select.createEl("option", { text: "— Select list —", value: "" });
		for (const ft of this.plugin.settings.fileTypeLists) {
			const opt = select.createEl("option", { text: ft.name, value: ft.name });
			if (ft.name === currentValue) opt.selected = true;
		}
		select.addEventListener("change", () => onChange(select.value));

		if (this.plugin.settings.fileTypeLists.length === 0) {
			const hint = row.createEl("span", {
				text: "Add file-type lists in the Components tab first",
				cls: "setting-item-description",
			});
			hint.style.color = "var(--text-muted)";
			hint.style.fontStyle = "italic";
		}
	}

	addDividerLabelInput(
		parent: HTMLElement,
		paddingLeft: string,
		currentValue: string,
		onChange: (value: string) => void,
	): void {
		const row = parent.createDiv({ cls: "nexus-column-slot-row" });
		row.style.display = "flex";
		row.style.alignItems = "center";
		row.style.gap = "8px";
		row.style.paddingLeft = paddingLeft;

		const label = row.createEl("span", { text: "Label:", cls: "setting-item-description" });
		label.style.minWidth = "40px";

		const input = row.createEl("input", { type: "text", cls: "setting-text-input" });
		input.value = currentValue;
		input.placeholder = "Recently Modified";
		input.addEventListener("change", () => onChange(input.value));
	}

	/** Assign stable ids to row/column layouts that lack one. */
	ensureLayoutIds(): void {
		const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
		for (let i = 0; i < this.plugin.settings.rowLayouts.length; i++) {
			if (!this.plugin.settings.rowLayouts[i].id) {
				this.plugin.settings.rowLayouts[i].id = `row-${stamp}-${i}`;
			}
		}
		for (let i = 0; i < this.plugin.settings.columnLayouts.length; i++) {
			if (!this.plugin.settings.columnLayouts[i].id) {
				this.plugin.settings.columnLayouts[i].id = `col-${stamp}-${i}`;
			}
		}
	}

	/** Live-update the row preview column widths from a "50/25/25" proportion string. */
	updateRowPreviewWidths(previewColEls: HTMLElement[], value: string, cols: number): void {
		const parts = value.split("/").map((s) => parseInt(s.trim(), 10));
		for (let i = 0; i < previewColEls.length; i++) {
			const pct = Number.isFinite(parts[i]) ? parts[i] : 100 / cols;
			previewColEls[i].style.width = `${Math.min(100, Math.max(0, pct))}%`;
		}
	}

	/** Drop out-of-range or malformed per-slot override keys after an import. */
	pruneSlotOverrides(map: Record<string, unknown> | undefined, slots: RowLayoutSlot[]): void {
		if (!map) return;
		for (const key of Object.keys(map)) {
			const m = /^(\d+)(?:-(\d+))?$/.exec(key);
			if (!m) {
				delete map[key];
				continue;
			}
			const col = parseInt(m[1], 10);
			if (col >= slots.length) {
				delete map[key];
				continue;
			}
			if (m[2] !== undefined) {
				const sub = parseInt(m[2], 10);
				const slotVal = slots[col];
				if (Array.isArray(slotVal)) {
					if (sub >= slotVal.length) delete map[key];
				} else {
					// `i-j` keys only apply to stacked sub-slot columns
					delete map[key];
				}
			}
		}
	}

	/** Prune a row layout's own overrides, then recurse into nested rows. */
	pruneRowLayoutOverrides(row: RowLayoutEntry): void {
		this.pruneSlotOverrides(row.slotHeadings, row.slots);
		this.pruneSlotOverrides(row.vaultListSlots, row.slots);
		this.pruneSlotOverrides(row.fileTypeListSlots, row.slots);
		this.pruneSlotOverrides(row.dividerSlots, row.slots);
		for (const slot of row.slots) {
			if (Array.isArray(slot)) {
				for (const sub of slot) {
					if (typeof sub === "object") this.pruneRowLayoutOverrides(sub);
				}
			} else if (typeof slot === "object") {
				this.pruneRowLayoutOverrides(slot);
			}
		}
	}

	/** Normalise a row layout (and any nested rows) to valid bounds. */
	sanitizeRowLayout(row: RowLayoutEntry): void {
		row.columns = Math.max(1, Math.min(12, safeParseInt(row.columns, 2, 1) ?? 2));
		if (!Array.isArray(row.slots)) row.slots = [];
		row.slots = row.slots.slice(0, 12);
		while (row.slots.length < row.columns) row.slots.push("none");
		row.slots = row.slots.slice(0, row.columns);
		for (const slot of row.slots) {
			if (Array.isArray(slot)) {
				for (const sub of slot) {
					if (typeof sub === "object") this.sanitizeRowLayout(sub);
				}
			} else if (typeof slot === "object") {
				this.sanitizeRowLayout(slot);
			}
		}
		this.pruneRowLayoutOverrides(row);
	}

	/** Normalise imported settings so arrays/overrides stay within valid bounds. */
	sanitizeImportedSettings(): void {
		const s = this.plugin.settings;

		if (Array.isArray(s.quickLinks)) {
			s.quickLinks = s.quickLinks
				.filter((l) => l && typeof l.url === "string")
				.map((l) => ({
					url: l.url,
					label: typeof l.label === "string" ? l.label : "",
				}))
				.slice(0, 50);
		}

		if (Array.isArray(s.rowLayouts)) {
			for (const row of s.rowLayouts) {
				this.sanitizeRowLayout(row);
			}
		}

		if (Array.isArray(s.columnLayouts)) {
			for (const col of s.columnLayouts) {
				if (!Array.isArray(col.slots)) col.slots = [];
				col.slots = col.slots.slice(0, 12);
				this.pruneSlotOverrides(col.slotHeadings, col.slots);
				this.pruneSlotOverrides(col.vaultListSlots, col.slots);
				this.pruneSlotOverrides(col.fileTypeListSlots, col.slots);
				this.pruneSlotOverrides(col.dividerSlots, col.slots);
			}
		}

		if (Array.isArray(s.vaultLists)) {
			for (const vl of s.vaultLists) {
				vl.count = Math.max(3, Math.min(50, safeParseInt(vl.count, 9, 3) ?? 9));
			}
		}
	}
}
