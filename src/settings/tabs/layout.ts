import { Setting, setIcon } from "obsidian";
import type { NexusSettingTab } from "../index";
import type {
	ContentSlotType,
	RowLayoutEntry,
	RowLayoutSlot,
	ColumnLayoutEntry,
	HeadingConfig,
} from "../../types";
import { safeParseInt } from "../../utils";
import { CONTENT_SLOT_OPTIONS, collapseKey } from "../shared";
import { ConfirmModal } from "../confirm-modal";

/** Render the Dashboard tab: row/column layout builder. */
export function renderLayoutTab(tab: NexusSettingTab, containerEl: HTMLElement): void {
	containerEl.createEl("p", {
		text:
			"Build your dashboard layout by arranging rows, columns, and dividers. Assign content to each slot.",
		cls: "setting-item-description",
	});

	tab.renderCollapseAllBar(containerEl, tab.collectLayoutKeys());

	tab.ensureLayoutIds();

	// ── Row layouts ──────────────────────────────────
	new Setting(containerEl).setHeading().setName("Row layouts");
	containerEl.createEl("p", {
		text: "Rows place content side-by-side in columns. Assign a content slot to each column.",
		cls: "setting-item-description",
	});

	const rowLayouts = tab.plugin.settings.rowLayouts;
	for (let i = 0; i < rowLayouts.length; i++) {
		renderRowLayoutCard(tab, containerEl, rowLayouts[i], i);
	}

	new Setting(containerEl)
		.setName("Add row layout")
		.setDesc("Create a new row with columns")
		.addButton((btn) =>
			btn
				.setButtonText("+ Add Row")
				.setCta()
				.onClick(async () => {
					const n = rowLayouts.length + 1;
					rowLayouts.push({
						id: `row-${Date.now()}-${n}`,
						name: `Row ${n}`,
						columns: 2,
						proportion: "50/50",
						align: "top",
						slots: ["moc-cards", "none"],
					});
					await tab.saveAndRefresh();
				}),
		);

	// ── Column layouts ────────────────────────────────
	new Setting(containerEl).setHeading().setName("Column layouts");
	containerEl.createEl("p", {
		text:
			"Columns place content vertically. Add slots to build a vertical column of dashboard sections.",
		cls: "setting-item-description",
	});

	const columnLayouts = tab.plugin.settings.columnLayouts;
	for (let i = 0; i < columnLayouts.length; i++) {
		renderColumnLayoutCard(tab, containerEl, columnLayouts[i], i);
	}

	new Setting(containerEl)
		.setName("Add column layout")
		.setDesc("Create a new vertical column")
		.addButton((btn) =>
			btn
				.setButtonText("+ Add Column")
				.setCta()
				.onClick(async () => {
					const n = columnLayouts.length + 1;
					columnLayouts.push({
						id: `col-${Date.now()}-${n}`,
						name: `Column ${n}`,
						spacing: "1rem",
						align: "stretch",
						slots: ["moc-cards"],
					});
					await tab.saveAndRefresh();
				}),
		);

	// ── Saved row proportions ─────────────────────────
	const rowSizes = tab.plugin.settings.rowSizes;
	const sizeKeys = Object.keys(rowSizes);
	if (sizeKeys.length > 0) {
		new Setting(containerEl).setHeading().setName("Saved row proportions");
		containerEl.createEl("p", {
			text: "These proportions were saved by dragging column dividers in the dashboard.",
			cls: "setting-item-description",
		});
		for (const key of sizeKeys) {
			const val = rowSizes[key];
			new Setting(containerEl)
				.setName(key)
				.setDesc(`Proportion: ${val}`)
				.addButton((btn) =>
					btn
						.setButtonText("Reset")
						.setWarning()
						.onClick(async () => {
							delete tab.plugin.settings.rowSizes[key];
							await tab.saveAndRefresh();
						}),
				);
		}
	}
}

function renderRowLayoutCard(
	tab: NexusSettingTab,
	containerEl: HTMLElement,
	layout: RowLayoutEntry,
	index: number,
): void {
	const layoutId = layout.id || `row-${index}`;
	const isCollapsed = tab.isCollapsed(collapseKey("row", layoutId));

	const heading = containerEl.createDiv({ cls: "nexus-settings-moc-heading" });
	const { titleWrap, actions } = tab.setupDragAndDrop(
		heading,
		index,
		tab.plugin.settings.rowLayouts,
		isCollapsed,
	);

	// Title with slot summary
	const slots = layout.slots || [];
	const slotSummary = slots
		.map((s) => {
			if (Array.isArray(s)) {
				return s
					.map((sub) =>
						typeof sub === "object"
							? `⤷ ${sub.name || "Nested Row"}`
							: CONTENT_SLOT_OPTIONS[sub] || "Empty",
					)
					.join(" + ");
			}
			if (typeof s === "object") return `⤷ ${s.name || "Nested Row"}`;
			return CONTENT_SLOT_OPTIONS[s] || "Empty";
		})
		.join(" | ");
	titleWrap.createEl("span", { text: `${layout.name} (${layout.columns} cols: ${slotSummary})` });

	// Delete button
	const deleteBtn = actions.createEl("button", {
		cls: "nexus-settings-moc-btn--delete",
		attr: { "aria-label": "Remove" },
	});
	setIcon(deleteBtn, "trash");
	deleteBtn.addEventListener("click", async (e) => {
		e.stopPropagation();
		new ConfirmModal(
			tab.app,
			`Remove "${layout.name}"?`,
			"This row layout will be removed from your dashboard.",
			async () => {
				tab.plugin.settings.rowLayouts.splice(index, 1);
				await tab.saveAndRefresh();
			},
		).open();
	});

	// Toggle collapse
	heading.addEventListener("click", () => {
		tab.setCollapsed(collapseKey("row", layoutId), !isCollapsed);
		tab.saveAndRefresh();
	});

	if (isCollapsed) return;

	// ── Expanded content ──────────────────────────────────────

	// Visual row preview with slot labels
	const preview = containerEl.createDiv({ cls: "nexus-row-editor-visual" });
	const cols = layout.columns;
	const previewColEls: HTMLElement[] = [];
	const parts = layout.proportion.split("/").map((s) => parseInt(s.trim(), 10));

	for (let i = 0; i < cols; i++) {
		const colEl = preview.createDiv({ cls: "nexus-row-editor-col" });
		previewColEls.push(colEl);
		const width = Math.min(
			100,
			safeParseInt(String(parts[i] ?? 0), Math.floor(100 / cols), 1) ?? Math.floor(100 / cols),
		);
		colEl.style.width = `${width}%`;
		const slot = layout.slots?.[i] || "none";
		if (Array.isArray(slot)) {
			for (const sub of slot) {
				const subEl = colEl.createDiv({ cls: "nexus-row-editor-col-sub" });
				const subLabel =
					typeof sub === "object"
						? `⤷ Nested row: ${sub.name || "Nested Row"}`
						: CONTENT_SLOT_OPTIONS[sub] || "Empty";
				subEl.createEl("span", { text: subLabel, cls: "nexus-row-editor-col-label" });
			}
		} else if (typeof slot === "object") {
			const slotLabel = `Nested row: ${slot.name || "Nested Row"}`;
			colEl.createEl("span", { text: slotLabel, cls: "nexus-row-editor-col-label" });
		} else {
			const slotLabel = CONTENT_SLOT_OPTIONS[slot as ContentSlotType] || "Empty";
			colEl.createEl("span", { text: slotLabel, cls: "nexus-row-editor-col-label" });
		}
	}

	// Edit fields
	const fields = containerEl.createDiv({ cls: "nexus-row-editor-fields" });

	// Name
	const nameSetting = new Setting(fields);
	nameSetting.setName("Name");
	nameSetting.addText((text) =>
		text
			.setPlaceholder("Layout name")
			.setValue(layout.name)
			.onChange(async (value) => {
				tab.plugin.settings.rowLayouts[index].name = value || `Row ${index + 1}`;
				await tab.plugin.saveSettings();
			}),
	);

	// Columns
	const colSetting = new Setting(fields);
	colSetting.setName("Columns");
	colSetting.addSlider((slider) => {
		const applyColumns = (value: number) => {
			const safeCols = Number.isFinite(value) && value >= 1 ? value : 2;
			const layoutRef = tab.plugin.settings.rowLayouts[index];
			layoutRef.columns = safeCols;
			const part = Math.floor(100 / safeCols);
			const newParts: number[] = [];
			for (let j = 0; j < safeCols - 1; j++) {
				newParts.push(part);
			}
			newParts.push(100 - part * (safeCols - 1));
			layoutRef.proportion = newParts.join("/");
			const currentSlots = layoutRef.slots || [];
			while (currentSlots.length < safeCols) {
				currentSlots.push("none");
			}
			while (currentSlots.length > safeCols) {
				currentSlots.pop();
			}
			tab.pruneRowLayoutOverrides(layoutRef);
		};
		slider
			.setLimits(1, 4, 1)
			.setValue(layout.columns)
			.setDynamicTooltip()
			.onChange(async (value) => {
				applyColumns(value);
				await tab.saveAndRefresh();
			});
	});

	// Proportion
	const propSetting = new Setting(fields);
	propSetting.setName("Proportion");
	propSetting.setDesc("Slash-separated widths (e.g. 33/67 for 1:2)");
	propSetting.addText((text) =>
		text
			.setPlaceholder("50/50")
			.setValue(layout.proportion)
			.onChange(async (value) => {
				tab.plugin.settings.rowLayouts[index].proportion = value;
				await tab.plugin.saveSettings();
				tab.updateRowPreviewWidths(previewColEls, value, cols);
			}),
	);

	// Alignment
	const alignSetting = new Setting(fields);
	alignSetting.setName("Vertical align");
	alignSetting.addDropdown((dropdown) => {
		dropdown.addOption("top", "Top");
		dropdown.addOption("center", "Center");
		dropdown.addOption("stretch", "Stretch");
		dropdown.setValue(layout.align);
		dropdown.onChange(async (value) => {
			tab.plugin.settings.rowLayouts[index].align = value as "top" | "center" | "stretch";
			await tab.plugin.saveSettings();
		});
	});

	// ── Slot editors per column ──
	if (!layout.slotHeadings) layout.slotHeadings = {};

	renderRowSlotEditors(tab, fields, layout, false);
}

/** Builds a fresh nested row layout for embedding inside a slot. */
function newNestedRow(): RowLayoutEntry {
	return {
		id: `row-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
		name: "Nested Row",
		columns: 2,
		proportion: "50/50",
		align: "top",
		slots: ["none", "none"],
	};
}

/**
 * Per-column slot editors for a row layout. Recurses into nested rows so
 * rows-within-rows are fully editable. All mutations go through the passed
 * {@link RowLayoutEntry} reference, which is the live settings object.
 */
function renderRowSlotEditors(
	tab: NexusSettingTab,
	container: HTMLElement,
	row: RowLayoutEntry,
	isNested: boolean,
): void {
	for (let i = 0; i < row.columns; i++) {
		const slotVal = row.slots?.[i] || "none";

		const colHeading = container.createEl("div", { cls: "nexus-col-slot-heading" });
		colHeading.createEl("strong", { text: isNested ? `Nested column ${i + 1}` : `Column ${i + 1}` });

		// Whole column is a nested row
		if (!Array.isArray(slotVal) && typeof slotVal === "object") {
			renderNestedRowEditor(tab, container, slotVal, async () => {
				row.slots[i] = "none";
				await tab.saveAndRefresh();
			});
			continue;
		}

		const isSubSlot = Array.isArray(slotVal);
		const slotList: RowLayoutSlot[] = isSubSlot ? (slotVal as RowLayoutSlot[]) : [slotVal];

		for (let si = 0; si < slotList.length; si++) {
			const currentSlot = slotList[si];

			// Nested row inside a stacked sub-slot column
			if (!Array.isArray(currentSlot) && typeof currentSlot === "object") {
				renderNestedRowEditor(tab, container, currentSlot, async () => {
					const arr = row.slots[i] as RowLayoutSlot[];
					arr.splice(si, 1);
					if (arr.length === 1) row.slots[i] = arr[0];
					await tab.saveAndRefresh();
				});
				continue;
			}

			const subKey = isSubSlot ? `${i}-${si}` : String(i);

			const slotRow = container.createDiv({ cls: "nexus-column-slot-row" });
			slotRow.style.display = "flex";
			slotRow.style.alignItems = "center";
			slotRow.style.gap = "8px";

			if (isSubSlot) {
				const slotLabelEl = slotRow.createEl("span", {
					text: `Slot ${si + 1}:`,
					cls: "setting-item-description",
				});
				slotLabelEl.style.minWidth = "60px";
			}

			const slotSelect = slotRow.createEl("select", { cls: "dropdown" });
			for (const [key, label] of Object.entries(CONTENT_SLOT_OPTIONS)) {
				const opt = slotSelect.createEl("option", { text: label, value: key });
				if (!tab.isSlotEnabled(key as ContentSlotType)) opt.disabled = true;
				if (key === currentSlot) opt.selected = true;
			}
			slotSelect.addEventListener("change", async () => {
				const newVal = slotSelect.value as ContentSlotType;
				if (isSubSlot) {
					(row.slots[i] as RowLayoutSlot[])[si] = newVal;
				} else {
					row.slots[i] = newVal;
				}
				await tab.saveAndRefresh();
			});

			// Remove button for sub-slots
			if (isSubSlot && slotList.length > 1) {
				const removeBtn = slotRow.createEl("button", { cls: "nexus-row-editor-card-btn" });
				setIcon(removeBtn, "x");
				removeBtn.addEventListener("click", async () => {
					const arr = row.slots[i] as RowLayoutSlot[];
					const oldLen = arr.length;
					arr.splice(si, 1);
					if (arr.length === 1) {
						row.slots[i] = arr[0];
					}
					// Shift overrides down so configs follow their slots (#1/#2)
					for (const map of [
						row.slotHeadings,
						row.vaultListSlots,
						row.fileTypeListSlots,
						row.dividerSlots,
					]) {
						if (!map) continue;
						for (let p = si; p < arr.length; p++) {
							const from = `${i}-${p + 1}`;
							if (from in map) map[`${i}-${p}`] = map[from];
						}
						for (let p = arr.length; p < oldLen; p++) {
							delete map[`${i}-${p}`];
						}
						if (arr.length === 1 && `${i}-0` in map) {
							map[String(i)] = map[`${i}-0`];
							delete map[`${i}-0`];
						}
					}
					await tab.saveAndRefresh();
				});
			}

			// Heading config fields (when slot is "heading")
			if (currentSlot === "heading") {
				renderHeadingConfigEditor(
					container,
					subKey,
					isSubSlot,
					() => {
						return (row.slotHeadings || {})[subKey];
					},
					async (patch) => {
						const h = (row.slotHeadings ??= {});
						h[subKey] = { ...(h[subKey] || { text: "Section" }), ...patch };
						await tab.plugin.saveSettings();
					},
				);
			}

			// Vault list selector (when slot is "vault-activity")
			if (currentSlot === "vault-activity") {
				tab.addVaultListSelector(
					container,
					isSubSlot ? "68px" : "8px",
					row.vaultListSlots?.[subKey] || "",
					async (value) => {
						(row.vaultListSlots ??= {})[subKey] = value;
						await tab.plugin.saveSettings();
					},
				);
			}

			// File-type list selector (when slot is "filetypes")
			if (currentSlot === "filetypes") {
				tab.addFileTypeListSelector(
					container,
					isSubSlot ? "68px" : "8px",
					row.fileTypeListSlots?.[subKey] || "",
					async (value) => {
						(row.fileTypeListSlots ??= {})[subKey] = value;
						await tab.plugin.saveSettings();
					},
				);
			}

			// Divider label input (when slot is "divider")
			if (currentSlot === "divider") {
				tab.addDividerLabelInput(
					container,
					isSubSlot ? "68px" : "8px",
					row.dividerSlots?.[subKey] || "",
					async (value) => {
						(row.dividerSlots ??= {})[subKey] = value;
						await tab.plugin.saveSettings();
					},
				);
			}
		}

		// "+ Add Slot" button per column
		const addSlotRow = container.createDiv({ cls: "nexus-column-slot-row" });
		addSlotRow.style.paddingLeft = isSubSlot ? "68px" : "8px";
		const addSlotBtn = addSlotRow.createEl("button", { cls: "nexus-row-editor-card-btn" });
		addSlotBtn.textContent = "+ Add Slot";
		addSlotBtn.addEventListener("click", async () => {
			const current = row.slots[i];
			if (Array.isArray(current)) {
				current.push("none");
			} else {
				row.slots[i] = [current, "none"];
				// Migrate the single-slot config to the first sub-slot key (#3)
				for (const map of [
					row.slotHeadings,
					row.vaultListSlots,
					row.fileTypeListSlots,
					row.dividerSlots,
				]) {
					if (!map) continue;
					if (String(i) in map) {
						map[`${i}-0`] = map[String(i)];
						delete map[String(i)];
					}
				}
			}
			await tab.saveAndRefresh();
		});

		// "+ Add Nested Row" button per column
		const addNestedRow = container.createDiv({ cls: "nexus-column-slot-row" });
		addNestedRow.style.paddingLeft = isSubSlot ? "68px" : "8px";
		const addNestedBtn = addNestedRow.createEl("button", { cls: "nexus-row-editor-card-btn" });
		addNestedBtn.textContent = "+ Add Nested Row";
		addNestedBtn.addEventListener("click", async () => {
			const current = row.slots[i];
			const nested = newNestedRow();
			if (Array.isArray(current)) {
				current.push(nested);
			} else {
				row.slots[i] = [current, nested];
			}
			await tab.saveAndRefresh();
		});
	}
}

/**
 * Editor for a nested {@link RowLayoutEntry} embedded in a column slot.
 * Shows name/columns/proportion/align plus its own per-column slot editors.
 */
function renderNestedRowEditor(
	tab: NexusSettingTab,
	container: HTMLElement,
	nested: RowLayoutEntry,
	onRemove: () => Promise<void>,
): void {
	const wrap = container.createDiv({ cls: "nexus-row-editor-nested" });

	const header = wrap.createDiv({ cls: "nexus-row-editor-nested-header" });
	header.createEl("strong", { text: "Nested Row" });
	const removeBtn = header.createEl("button", { cls: "nexus-row-editor-card-btn" });
	setIcon(removeBtn, "x");
	removeBtn.addEventListener("click", async (e) => {
		e.stopPropagation();
		await onRemove();
	});

	if (!nested.slots) nested.slots = [];

	const nameSetting = new Setting(wrap);
	nameSetting.setName("Nested name");
	nameSetting.addText((text) =>
		text
			.setPlaceholder("Nested row")
			.setValue(nested.name)
			.onChange(async (value) => {
				nested.name = value || "Nested Row";
				await tab.plugin.saveSettings();
			}),
	);

	const colSetting = new Setting(wrap);
	colSetting.setName("Columns");
	colSetting.addSlider((slider) => {
		const applyColumns = (value: number) => {
			const safeCols = Number.isFinite(value) && value >= 1 ? value : 2;
			nested.columns = safeCols;
			const part = Math.floor(100 / safeCols);
			const newParts: number[] = [];
			for (let j = 0; j < safeCols - 1; j++) newParts.push(part);
			newParts.push(100 - part * (safeCols - 1));
			nested.proportion = newParts.join("/");
			const currentSlots = nested.slots || [];
			while (currentSlots.length < safeCols) currentSlots.push("none");
			while (currentSlots.length > safeCols) currentSlots.pop();
			tab.pruneRowLayoutOverrides(nested);
		};
		slider
			.setLimits(1, 4, 1)
			.setValue(nested.columns)
			.setDynamicTooltip()
			.onChange(async (value) => {
				applyColumns(value);
				await tab.saveAndRefresh();
			});
	});

	const propSetting = new Setting(wrap);
	propSetting.setName("Proportion");
	propSetting.setDesc("Slash-separated widths (e.g. 50/50)");
	propSetting.addText((text) =>
		text
			.setPlaceholder("50/50")
			.setValue(nested.proportion)
			.onChange(async (value) => {
				nested.proportion = value;
				await tab.plugin.saveSettings();
			}),
	);

	const alignSetting = new Setting(wrap);
	alignSetting.setName("Vertical align");
	alignSetting.addDropdown((dropdown) => {
		dropdown.addOption("top", "Top");
		dropdown.addOption("center", "Center");
		dropdown.addOption("stretch", "Stretch");
		dropdown.setValue(nested.align);
		dropdown.onChange(async (value) => {
			nested.align = value as "top" | "center" | "stretch";
			await tab.plugin.saveSettings();
		});
	});

	renderRowSlotEditors(tab, wrap, nested, true);
}

function renderColumnLayoutCard(
	tab: NexusSettingTab,
	containerEl: HTMLElement,
	layout: ColumnLayoutEntry,
	index: number,
): void {
	const layoutId = layout.id || String(index);
	const isCollapsed = tab.isCollapsed(collapseKey("col", layoutId));

	const heading = containerEl.createDiv({ cls: "nexus-settings-moc-heading" });
	const { titleWrap, actions } = tab.setupDragAndDrop(
		heading,
		index,
		tab.plugin.settings.columnLayouts,
		isCollapsed,
	);

	// Title with slot summary
	const slots = layout.slots || [];
	const slotSummary = slots.map((s) => CONTENT_SLOT_OPTIONS[s] || "Empty").join(" → ");
	titleWrap.createEl("span", { text: `${layout.name} (${slotSummary})` });

	// Delete button
	const deleteBtn = actions.createEl("button", {
		cls: "nexus-settings-moc-btn--delete",
		attr: { "aria-label": "Remove" },
	});
	setIcon(deleteBtn, "trash");
	deleteBtn.addEventListener("click", async (e) => {
		e.stopPropagation();
		new ConfirmModal(
			tab.app,
			`Remove "${layout.name}"?`,
			"This column layout will be removed from your dashboard.",
			async () => {
				tab.plugin.settings.columnLayouts.splice(index, 1);
				tab.deleteCollapsed(collapseKey("col", layoutId));
				await tab.saveAndRefresh();
			},
		).open();
	});

	// Toggle collapse
	heading.addEventListener("click", () => {
		tab.setCollapsed(collapseKey("col", layoutId), !isCollapsed);
		void tab.plugin.saveSettings();
		tab.display();
	});

	if (isCollapsed) return;

	// ── Expanded content ──────────────────────────────────────

	// Visual column preview
	const preview = containerEl.createDiv({ cls: "nexus-row-editor-visual" });
	preview.style.flexDirection = "column";
	preview.style.gap = "4px";
	const previewSlots = layout.slots || [];
	for (const slot of previewSlots) {
		const slotEl = preview.createDiv({ cls: "nexus-row-editor-col" });
		slotEl.style.width = "100%";
		slotEl.style.minHeight = "24px";
		slotEl.createEl("span", {
			text: CONTENT_SLOT_OPTIONS[slot] || "Empty",
			cls: "nexus-row-editor-col-label",
		});
	}

	// Edit fields
	const fields = containerEl.createDiv({ cls: "nexus-row-editor-fields" });

	// Name
	const nameSetting = new Setting(fields);
	nameSetting.setName("Name");
	nameSetting.addText((text) =>
		text
			.setPlaceholder("Column name")
			.setValue(layout.name)
			.onChange(async (value) => {
				tab.plugin.settings.columnLayouts[index].name = value || `Column ${index + 1}`;
				await tab.plugin.saveSettings();
			}),
	);

	// Spacing
	const spacingSetting = new Setting(fields);
	spacingSetting.setName("Spacing");
	spacingSetting.addText((text) =>
		text
			.setPlaceholder("1rem")
			.setValue(layout.spacing)
			.onChange(async (value) => {
				tab.plugin.settings.columnLayouts[index].spacing = value || "1rem";
				await tab.plugin.saveSettings();
			}),
	);

	// Alignment
	const alignSetting = new Setting(fields);
	alignSetting.setName("Horizontal align");
	alignSetting.addDropdown((dropdown) => {
		dropdown.addOption("stretch", "Stretch");
		dropdown.addOption("left", "Left");
		dropdown.addOption("center", "Center");
		dropdown.addOption("right", "Right");
		dropdown.setValue(layout.align);
		dropdown.onChange(async (value) => {
			tab.plugin.settings.columnLayouts[index].align = value as
				"left" | "center" | "right" | "stretch";
			await tab.plugin.saveSettings();
		});
	});

	// Slot list
	const colSlots = layout.slots || [];
	for (let i = 0; i < colSlots.length; i++) {
		const slotRow = fields.createDiv({ cls: "nexus-column-slot-row" });
		slotRow.style.display = "flex";
		slotRow.style.alignItems = "center";
		slotRow.style.gap = "8px";

		const slotLabel = slotRow.createEl("span", {
			text: `Slot ${i + 1}:`,
			cls: "setting-item-description",
		});
		slotLabel.style.minWidth = "60px";

		const slotSelect = slotRow.createEl("select", { cls: "dropdown" });
		for (const [key, label] of Object.entries(CONTENT_SLOT_OPTIONS)) {
			const opt = slotSelect.createEl("option", { text: label, value: key });
			if (!tab.isSlotEnabled(key as ContentSlotType)) opt.disabled = true;
			if (key === colSlots[i]) opt.selected = true;
		}
		slotSelect.addEventListener("change", async () => {
			tab.plugin.settings.columnLayouts[index].slots[i] = slotSelect.value as ContentSlotType;
			await tab.saveAndRefresh();
		});

		const removeBtn = slotRow.createEl("button", { cls: "nexus-row-editor-card-btn" });
		setIcon(removeBtn, "x");
		removeBtn.addEventListener("click", async () => {
			const layoutRef = tab.plugin.settings.columnLayouts[index];
			const oldLen = layoutRef.slots.length;
			layoutRef.slots.splice(i, 1);
			// Shift overrides down so configs follow their slots (#3)
			for (const map of [
				layoutRef.slotHeadings,
				layoutRef.vaultListSlots,
				layoutRef.fileTypeListSlots,
				layoutRef.dividerSlots,
			]) {
				if (!map) continue;
				for (let p = i; p < layoutRef.slots.length; p++) {
					const from = String(p + 1);
					if (from in map) map[String(p)] = map[from];
				}
				for (let p = layoutRef.slots.length; p < oldLen; p++) {
					delete map[String(p)];
				}
			}
			await tab.saveAndRefresh();
		});

		// Heading config fields (when slot is "heading")
		if (colSlots[i] === "heading") {
			const subKey = String(i);
			renderHeadingConfigEditor(
				fields,
				subKey,
				false,
				() => {
					return (tab.plugin.settings.columnLayouts[index].slotHeadings || {})[subKey];
				},
				async (patch) => {
					const h = (tab.plugin.settings.columnLayouts[index].slotHeadings ??= {});
					h[subKey] = { ...(h[subKey] || { text: "Section" }), ...patch };
					await tab.plugin.saveSettings();
				},
			);
		}

		// Vault list selector (when slot is "vault-activity")
		if (colSlots[i] === "vault-activity") {
			tab.addVaultListSelector(
				fields,
				"68px",
				tab.plugin.settings.columnLayouts[index].vaultListSlots?.[String(i)] || "",
				async (value) => {
					(tab.plugin.settings.columnLayouts[index].vaultListSlots ??= {})[String(i)] = value;
					await tab.plugin.saveSettings();
				},
			);
		}

		// File-type list selector (when slot is "filetypes")
		if (colSlots[i] === "filetypes") {
			tab.addFileTypeListSelector(
				fields,
				"68px",
				tab.plugin.settings.columnLayouts[index].fileTypeListSlots?.[String(i)] || "",
				async (value) => {
					(tab.plugin.settings.columnLayouts[index].fileTypeListSlots ??= {})[String(i)] = value;
					await tab.plugin.saveSettings();
				},
			);
		}

		// Divider label input (when slot is "divider")
		if (colSlots[i] === "divider") {
			tab.addDividerLabelInput(
				fields,
				"68px",
				tab.plugin.settings.columnLayouts[index].dividerSlots?.[String(i)] || "",
				async (value) => {
					(tab.plugin.settings.columnLayouts[index].dividerSlots ??= {})[String(i)] = value;
					await tab.plugin.saveSettings();
				},
			);
		}
	}

	// Add slot button
	const addSlotBtn = fields.createEl("button", { cls: "nexus-row-editor-card-btn" });
	addSlotBtn.textContent = "+ Add Slot";
	addSlotBtn.addEventListener("click", async () => {
		tab.plugin.settings.columnLayouts[index].slots.push("none");
		await tab.saveAndRefresh();
	});
}

function renderHeadingConfigEditor(
	fields: HTMLElement,
	_subKey: string,
	isSubSlot: boolean,
	getCfg: () => HeadingConfig | undefined,
	onUpdate: (patch: Partial<HeadingConfig>) => Promise<void>,
): void {
	const headingCfg = getCfg() || { text: "Section" };
	const pad = isSubSlot ? "68px" : "8px";

	const textRow = fields.createDiv({ cls: "nexus-column-slot-row" });
	textRow.style.display = "flex";
	textRow.style.alignItems = "center";
	textRow.style.gap = "8px";
	textRow.style.paddingLeft = pad;
	const textLabel = textRow.createEl("span", { text: "Text:", cls: "setting-item-description" });
	textLabel.style.minWidth = "40px";
	const textInput = textRow.createEl("input", { type: "text", cls: "setting-text-input" });
	textInput.value = headingCfg.text || "";
	textInput.placeholder = "Heading text";
	textInput.addEventListener("change", () => {
		void onUpdate({ text: textInput.value });
	});

	const colorRow = fields.createDiv({ cls: "nexus-column-slot-row" });
	colorRow.style.display = "flex";
	colorRow.style.alignItems = "center";
	colorRow.style.gap = "8px";
	colorRow.style.paddingLeft = pad;
	const colorLabel = colorRow.createEl("span", { text: "Color:", cls: "setting-item-description" });
	colorLabel.style.minWidth = "40px";
	const colorInput = colorRow.createEl("input", { type: "text", cls: "setting-text-input" });
	colorInput.value = headingCfg.color || "";
	colorInput.placeholder = "CSS color (optional)";
	colorInput.addEventListener("change", () => {
		void onUpdate({ color: colorInput.value || undefined });
	});

	const asRow = fields.createDiv({ cls: "nexus-column-slot-row" });
	asRow.style.display = "flex";
	asRow.style.alignItems = "center";
	asRow.style.gap = "8px";
	asRow.style.paddingLeft = pad;

	const alignLabel = asRow.createEl("span", { text: "Align:", cls: "setting-item-description" });
	alignLabel.style.minWidth = "40px";
	const alignSelect = asRow.createEl("select", { cls: "dropdown" });
	for (const [ak, al] of [
		["left", "Left"],
		["center", "Center"],
		["right", "Right"],
	]) {
		const opt = alignSelect.createEl("option", { text: al, value: ak });
		if (ak === (headingCfg.align || "left")) opt.selected = true;
	}
	alignSelect.addEventListener("change", () => {
		void onUpdate({ align: alignSelect.value as "left" | "center" | "right" });
	});

	const sizeLabel = asRow.createEl("span", { text: "Size:", cls: "setting-item-description" });
	sizeLabel.style.marginLeft = "12px";
	const sizeSelect = asRow.createEl("select", { cls: "dropdown" });
	for (const [sk, sl] of [
		["small", "Small"],
		["medium", "Medium"],
		["large", "Large"],
	]) {
		const opt = sizeSelect.createEl("option", { text: sl, value: sk });
		if (sk === (headingCfg.size || "medium")) opt.selected = true;
	}
	sizeSelect.addEventListener("change", () => {
		void onUpdate({ size: sizeSelect.value as "small" | "medium" | "large" });
	});
}
