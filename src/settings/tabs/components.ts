import {
	Notice,
	Setting,
	setIcon,
	ToggleComponent,
	TextComponent,
	DropdownComponent,
	ExtraButtonComponent,
	copy,
} from "obsidian";
import type { NexusSettingTab } from "../index";
import type {
	MocEntry,
	StatEntry,
	VaultListEntry,
	FileTypeListEntry,
	DividerDesign,
	StatMetric,
	StatScope,
} from "../../types";
import { SMALL_ICONS } from "../../icons";
import { DIVIDER_PRESETS, DIVIDER_PRESET_NAMES, detectDividerPreset } from "../../defaults";
import { safeParseInt } from "../../utils";
import { statSummary } from "../../stats";
import { ConfirmModal } from "../confirm-modal";
import { ICON_NAMES, DividerControlSettings, getVaultFolders, SVG, collapseKey } from "../shared";

/** Render the Components tab: card/link/stats configs that fill layout slots. */
export function renderComponentsTab(tab: NexusSettingTab, containerEl: HTMLElement): void {
	containerEl.createEl("p", {
		text: "Configure the content that fills your dashboard layout slots.",
		cls: "setting-item-description",
	});

	tab.renderCollapseAllBar(containerEl, tab.collectComponentKeys());

	renderMocCardsSection(tab, containerEl);
	renderStatsSection(tab, containerEl);
	renderVaultActivitySection(tab, containerEl);
	renderQuickLinksSection(tab, containerEl);
	renderHeatmapSection(tab, containerEl);
	renderActivityTimelineSection(tab, containerEl);
	renderClockSection(tab, containerEl);
	renderFileTypesSection(tab, containerEl);
	renderTaskSummarySection(tab, containerEl);
	renderDividerStyleSection(tab, containerEl);
}

// ── MOC Card with drag-and-drop + color picker ────────────

export function renderMocCard(
	tab: NexusSettingTab,
	containerEl: HTMLElement,
	moc: MocEntry,
	index: number,
): void {
	const isCollapsed = tab.isCollapsed(collapseKey("moc", index));

	const heading = containerEl.createDiv({ cls: "nexus-settings-moc-heading" });
	const { titleWrap, actions } = tab.setupDragAndDrop(
		heading,
		index,
		tab.plugin.settings.mocs,
		tab.isCollapsed(collapseKey("moc", index)),
		false,
	);

	// Title
	titleWrap.createEl("span", { text: moc.title || "Untitled" });

	// Delete button
	const removeBtn = actions.createEl("button", {
		cls: "nexus-settings-moc-btn--delete",
		attr: { "aria-label": "Remove" },
	});
	setIcon(removeBtn, "trash");
	removeBtn.addEventListener("click", async (e) => {
		e.stopPropagation();
		new ConfirmModal(
			tab.app,
			`Remove "${moc.title}"?`,
			"This MOC card will be removed from the dashboard. You can add it back later.",
			async () => {
				tab.plugin.settings.mocs.splice(index, 1);
				await tab.saveAndRefresh();
			},
		).open();
	});

	// Toggle collapse
	heading.addEventListener("click", () => {
		tab.setCollapsed(collapseKey("moc", index), !isCollapsed);
		void tab.plugin.saveSettings();
		tab.display();
	});

	if (isCollapsed) return;

	// Expanded fields
	const notePathSetting = new Setting(containerEl)
		.setName("Note path")
		.setDesc("Vault path to the MOC note");

	const notePathDatalistId = `nexus-note-paths-${index}`;
	const notePathInput = notePathSetting.settingEl.createEl("input", {
		cls: "nexus-note-path-input",
		attr: {
			type: "text",
			placeholder: "MOC/My MOC",
			value: moc.path,
			list: notePathDatalistId,
		},
	});
	notePathInput.addEventListener("change", async () => {
		tab.plugin.settings.mocs[index].path = notePathInput.value;
		await tab.plugin.saveSettings();
	});

	const datalist = notePathSetting.settingEl.createEl("datalist", {
		attr: { id: notePathDatalistId },
	});
	const mdFiles = tab.app.vault.getMarkdownFiles();
	for (const file of mdFiles) {
		datalist.createEl("option", { attr: { value: file.path } });
	}

	new Setting(containerEl)
		.setName("Title")
		.setDesc("Display title on the card")
		.addText((text) =>
			text
				.setPlaceholder("My MOC")
				.setValue(moc.title)
				.onChange(async (value) => {
					tab.plugin.settings.mocs[index].title = value;
					await tab.plugin.saveSettings();
				}),
		);

	new Setting(containerEl)
		.setName("Description")
		.setDesc("Short description below the title")
		.addText((text) =>
			text
				.setPlaceholder("Description here")
				.setValue(moc.desc)
				.onChange(async (value) => {
					tab.plugin.settings.mocs[index].desc = value;
					await tab.plugin.saveSettings();
				}),
		);

	// ── Icon picker (searchable with live preview) ──────
	const iconSetting = new Setting(containerEl)
		.setName("Icon")
		.setDesc("Type to search, click to select");

	const iconWrapper = iconSetting.settingEl.createDiv({ cls: "nexus-icon-picker-wrapper" });

	// Current icon preview + input row
	const iconRow = iconWrapper.createDiv({ cls: "nexus-icon-picker-row" });

	const iconPreview = iconRow.createDiv({ cls: "nexus-icon-picker-preview" });
	iconPreview.innerHTML = SMALL_ICONS[moc.icon] || SMALL_ICONS["MOC"] || "";

	const iconInput = iconRow.createEl("input", {
		cls: "nexus-icon-picker-input",
		attr: { type: "text", placeholder: "Search icons..." },
	});
	iconInput.value = moc.icon;

	// Icon grid (hidden by default, shown on focus)
	const iconGrid = iconWrapper.createDiv({ cls: "nexus-icon-picker-grid" });

	const renderIconGrid = (filter: string) => {
		iconGrid.empty();
		const lower = filter.toLowerCase();
		const matches = ICON_NAMES.filter((name) => name.toLowerCase().includes(lower));

		for (const name of matches) {
			const btn = iconGrid.createDiv({ cls: "nexus-icon-picker-item" });
			if (name === moc.icon) btn.classList.add("nexus-icon-picker-item-active");
			btn.innerHTML = SMALL_ICONS[name] || "";
			btn.createEl("span", { text: name, cls: "nexus-icon-picker-label" });
			btn.addEventListener("click", async () => {
				iconInput.value = name;
				iconPreview.innerHTML = SMALL_ICONS[name] || SMALL_ICONS["MOC"] || "";
				tab.plugin.settings.mocs[index].icon = name;
				await tab.plugin.saveSettings();
				// Update active state
				iconGrid
					.querySelectorAll(".nexus-icon-picker-item")
					.forEach((el) => el.classList.remove("nexus-icon-picker-item-active"));
				btn.classList.add("nexus-icon-picker-item-active");
			});
		}

		if (matches.length === 0) {
			iconGrid.createEl("div", {
				text: "No icons found",
				cls: "nexus-icon-picker-empty",
			});
		}
	};

	renderIconGrid("");

	iconInput.addEventListener("input", () => {
		renderIconGrid(iconInput.value);
		// Commit typed value so it isn't lost when the user clicks away (#17)
		iconPreview.innerHTML = SMALL_ICONS[iconInput.value] || SMALL_ICONS["MOC"] || "";
		tab.plugin.settings.mocs[index].icon = iconInput.value;
		void tab.plugin.saveSettings();
	});

	iconInput.addEventListener("focus", () => {
		iconGrid.classList.add("nexus-icon-picker-grid-open");
		renderIconGrid(iconInput.value);
	});

	iconInput.addEventListener("blur", () => {
		// Delay to allow click on grid item
		setTimeout(() => {
			iconGrid.classList.remove("nexus-icon-picker-grid-open");
		}, 200);
		tab.plugin.settings.mocs[index].icon = iconInput.value;
		void tab.plugin.saveSettings();
	});

	iconInput.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			iconInput.blur();
		}
		if (e.key === "Enter") {
			tab.plugin.settings.mocs[index].icon = iconInput.value;
			void tab.plugin.saveSettings();
			iconInput.blur();
		}
	});
}

// ── Stats entry ──────────────────────────────────────────────

export function renderStatEntry(
	tab: NexusSettingTab,
	containerEl: HTMLElement,
	stat: StatEntry,
	index: number,
): void {
	const folders = [...getVaultFolders(tab.app)];
	if (stat.folder && !folders.includes(stat.folder)) {
		folders.push(stat.folder);
		folders.sort();
	}

	const wrap = containerEl.createDiv({ cls: "nexus-stat-entry" });

	// Row 1: label | metric | delete
	const rowTop = wrap.createDiv({ cls: "nexus-stat-entry-row" });

	const labelField = rowTop.createDiv({ cls: "nexus-stat-entry-label" });
	new TextComponent(labelField)
		.setPlaceholder("Label")
		.setValue(stat.label)
		.onChange(async (value) => {
			tab.plugin.settings.stats[index].label = value;
			await tab.plugin.saveSettings();
		});

	const metricField = rowTop.createDiv({ cls: "nexus-stat-entry-metric" });
	new DropdownComponent(metricField)
		.addOption("files", "Files")
		.addOption("notes", "Notes")
		.addOption("size", "Size")
		.addOption("tags", "Tags")
		.setValue(stat.metric ?? "files")
		.onChange(async (value) => {
			tab.plugin.settings.stats[index].metric = value as StatMetric;
			await tab.plugin.saveSettings();
			updateSummary();
		});

	const deleteField = rowTop.createDiv({ cls: "nexus-stat-entry-delete" });
	new ExtraButtonComponent(deleteField)
		.setIcon("trash")
		.setTooltip("Remove")
		.onClick(async () => {
			new ConfirmModal(
				tab.app,
				`Remove stat "${stat.label}"?`,
				"This stat will be removed from the dashboard.",
				async () => {
					tab.plugin.settings.stats.splice(index, 1);
					await tab.saveAndRefresh();
				},
			).open();
		});

	// Row 2: filter | scope | recursion
	const rowBottom = wrap.createDiv({ cls: "nexus-stat-entry-row" });

	const filterField = rowBottom.createDiv({ cls: "nexus-stat-entry-filter" });
	const filterDropdown = new DropdownComponent(filterField).addOption("", "All files");
	for (const f of folders) {
		filterDropdown.addOption(f, f);
	}
	filterDropdown.setValue(stat.folder).onChange(async (value) => {
		tab.plugin.settings.stats[index].folder = value;
		await tab.plugin.saveSettings();
		updateSummary();
	});

	const scopeField = rowBottom.createDiv({ cls: "nexus-stat-entry-scope" });
	new DropdownComponent(scopeField)
		.addOption("all", "All time")
		.addOption("today", "Today")
		.addOption("week", "This week")
		.addOption("month", "This month")
		.addOption("year", "This year")
		.setValue(stat.scope ?? "all")
		.onChange(async (value) => {
			tab.plugin.settings.stats[index].scope = value as StatScope;
			await tab.plugin.saveSettings();
			updateSummary();
		});

	const recursiveField = rowBottom.createDiv({ cls: "nexus-stat-entry-recursive" });
	const recursive = stat.recursive ?? true;
	new DropdownComponent(recursiveField)
		.addOption("recursive", "Incl. subfolders")
		.addOption("direct", "Direct only")
		.setValue(recursive ? "recursive" : "direct")
		.onChange(async (value) => {
			tab.plugin.settings.stats[index].recursive = value === "recursive";
			await tab.plugin.saveSettings();
			updateSummary();
		});

	const summary = wrap.createEl("div", { cls: "nexus-stat-entry-summary" });
	const updateSummary = (): void => {
		const text = statSummary(stat);
		summary.setText(text);
		summary.setAttr("title", text);
	};
	updateSummary();
}

// ── Divider preview ───────────────────────────────────────

export function renderDividerPreview(
	tab: NexusSettingTab,
	containerEl: HTMLElement,
	labelText?: string,
): void {
	const existing = containerEl.querySelector(".nexus-settings-divider-preview");
	if (existing) existing.remove();

	const d = tab.plugin.settings.dividerDesign;
	const preview = containerEl.createDiv({ cls: "nexus-settings-divider-preview" });
	const row = preview.createDiv({ cls: "nexus-settings-divider-preview-row" });

	const lineLeft = row.createDiv({ cls: "nexus-settings-divider-preview-line" });
	lineLeft.style.background = d.gradient;
	lineLeft.style.height = d.lineWidth;

	const labelEl = row.createEl("span", {
		cls: "nexus-settings-divider-preview-label",
		text: labelText || "DIVIDER",
	});
	labelEl.style.fontSize = d.labelSize;
	labelEl.style.fontWeight = d.labelWeight;
	labelEl.style.color = d.labelColor;
	labelEl.style.letterSpacing = d.labelSpacing;

	const lineRight = row.createDiv({ cls: "nexus-settings-divider-preview-line" });
	lineRight.style.background = d.gradient;
	lineRight.style.height = d.lineWidth;
}

// ── Component cards ──────────────────────────────────────

function renderComponentCardHeader(
	tab: NexusSettingTab,
	containerEl: HTMLElement,
	id: string,
	title: string,
	description: string,
	enabled: boolean,
): { card: HTMLElement; header: HTMLElement; body: HTMLElement | null; isCollapsed: boolean } {
	const isCollapsed = tab.isCollapsed(collapseKey("component", id));

	const card = containerEl.createDiv({ cls: "nexus-component-card" });
	if (!enabled) card.classList.add("is-disabled");

	const header = card.createDiv({ cls: "nexus-component-card-header" });

	const chevron = header.createDiv({
		cls: `nexus-component-card-chevron ${isCollapsed ? "collapsed" : ""}`,
	});
	chevron.innerHTML = SVG.chevronDown;

	const titleWrap = header.createDiv({ cls: "nexus-component-card-title" });
	titleWrap.createEl("span", { text: title, cls: "nexus-component-card-title-text" });
	titleWrap.createEl("span", { text: description, cls: "nexus-component-card-title-desc" });

	return {
		card,
		header,
		body: isCollapsed ? null : card.createDiv({ cls: "nexus-component-card-body" }),
		isCollapsed,
	};
}

function renderComponentCard(
	tab: NexusSettingTab,
	containerEl: HTMLElement,
	id: string,
	title: string,
	description: string,
	enabled: boolean,
	dividerSettings: DividerControlSettings | null,
	onToggle: (value: boolean) => Promise<void>,
	renderBody: (bodyEl: HTMLElement) => void,
): void {
	const { header, body, isCollapsed } = renderComponentCardHeader(
		tab,
		containerEl,
		id,
		title,
		description,
		enabled,
	);

	const toggleEl = header.createDiv({ cls: "nexus-component-card-toggle" });
	const toggle = new ToggleComponent(toggleEl);
	toggle.setValue(enabled);
	toggle.onChange(async (value) => {
		await onToggle(value);
		tab.display();
	});

	header.addEventListener("click", (e) => {
		if (toggleEl.contains(e.target as Node)) return;
		tab.setCollapsed(collapseKey("component", id), !isCollapsed);
		void tab.plugin.saveSettings();
		tab.display();
	});

	if (!body) return;

	if (dividerSettings) {
		renderDividerControl(body, dividerSettings);
	}

	renderBody(body);
}

function renderDividerControl(parent: HTMLElement, settings: DividerControlSettings): void {
	const group = parent.createDiv({ cls: "nexus-settings-subgroup" });

	let labelInput: TextComponent | null = null;

	new Setting(group)
		.setName("Show divider")
		.setDesc("Show a divider above this component. Text shown inside the divider.")
		.addToggle((toggle) =>
			toggle.setValue(settings.show).onChange(async (value) => {
				await settings.onShow(value);
				labelInput?.setDisabled(!value);
			}),
		)
		.addText((text) => {
			labelInput = text
				.setPlaceholder(settings.labelPlaceholder)
				.setValue(settings.label)
				.setDisabled(!settings.show)
				.onChange(async (value) => {
					await settings.onLabel(value);
				});
		});
}

function renderSubgroup(parent: HTMLElement, title: string): HTMLElement {
	const group = parent.createDiv({ cls: "nexus-settings-subgroup" });
	group.createEl("div", { text: title, cls: "nexus-settings-subgroup-title" });
	return group;
}

// ── Component sections ───────────────────────────────────

function renderMocCardsSection(tab: NexusSettingTab, containerEl: HTMLElement): void {
	renderComponentCard(
		tab,
		containerEl,
		"moc-cards",
		"MOC Cards",
		"Map of content cards",
		tab.plugin.settings.showMocCards,
		{
			show: tab.plugin.settings.showMocDivider,
			label: tab.plugin.settings.mocDividerLabel,
			labelPlaceholder: "MOC CARDS",
			onShow: async (value) => {
				tab.plugin.settings.showMocDivider = value;
				await tab.plugin.saveSettings();
			},
			onLabel: async (value) => {
				tab.plugin.settings.mocDividerLabel = value || "MOC CARDS";
				await tab.plugin.saveSettings();
			},
		},
		async (value) => {
			tab.plugin.settings.showMocCards = value;
			await tab.plugin.saveSettings();
		},
		(body) => {
			body.createEl("p", {
				text: "Configure the MOC cards shown on your dashboard.",
				cls: "setting-item-description",
			});

			tab.plugin.settings.mocs.forEach((moc, i) => {
				renderMocCard(tab, body, moc, i);
			});

			new Setting(body)
				.setName("Add MOC card")
				.setDesc("Add a new card to the dashboard grid.")
				.addButton((btn) =>
					btn
						.setButtonText("+ Add MOC")
						.setCta()
						.onClick(async () => {
							tab.plugin.settings.mocs.push({
								path: "MOC/New MOC",
								title: "New MOC",
								desc: "Description here",
								icon: "MOC",
							});
							await tab.saveAndRefresh();
						}),
				);

			new Setting(body)
				.setName("MOC grid columns")
				.setDesc("Number of columns for the MOC card grid")
				.addSlider((slider) =>
					slider
						.setLimits(1, 4, 1)
						.setValue(tab.plugin.settings.mocGridColumns)
						.setDynamicTooltip()
						.onChange(async (value) => {
							tab.plugin.settings.mocGridColumns = value;
							await tab.plugin.saveSettings();
						}),
				);

			new Setting(body)
				.setName("MOC cards tray height")
				.setDesc(
					"0 = Auto (fits your cards); otherwise the tray height (px) — cards scroll when they exceed it",
				)
				.addSlider((slider) =>
					slider
						.setLimits(0, 800, 20)
						.setValue(tab.plugin.settings.mocCardsMaxHeight)
						.setDynamicTooltip()
						.onChange(async (value) => {
							tab.plugin.settings.mocCardsMaxHeight = value;
							await tab.plugin.saveSettings();
						}),
				);

			new Setting(body)
				.setName("Show graph links")
				.setDesc("Inject graph wikilinks on empty code blocks (can be overridden per-block)")
				.addToggle((toggle) =>
					toggle.setValue(tab.plugin.settings.showGraph).onChange(async (value) => {
						tab.plugin.settings.showGraph = value;
						await tab.plugin.saveSettings();
					}),
				);
		},
	);
}

function renderStatsSection(tab: NexusSettingTab, containerEl: HTMLElement): void {
	renderComponentCard(
		tab,
		containerEl,
		"stats",
		"Stats",
		"Vault statistics counters",
		tab.plugin.settings.showStats,
		null,
		async (value) => {
			tab.plugin.settings.showStats = value;
			await tab.plugin.saveSettings();
		},
		(body) => {
			body.createEl("p", {
				text: "Configure the stat counters shown on the dashboard.",
				cls: "setting-item-description",
			});

			tab.plugin.settings.stats.forEach((stat, i) => {
				try {
					renderStatEntry(tab, body, stat, i);
				} catch (err) {
					// eslint-disable-next-line no-console -- error guard; one bad entry shouldn't blank the tab
					console.error("[NEXUS] Failed to render stat entry:", err);
				}
			});

			new Setting(body)
				.setName("Add stat")
				.setDesc("Add a new stat counter")
				.addButton((btn) =>
					btn
						.setButtonText("+ Add Stat")
						.setCta()
						.onClick(async () => {
							tab.plugin.settings.stats.push({
								folder: "",
								label: "New Stat",
								metric: "files",
								scope: "all",
								recursive: true,
							});
							await tab.saveAndRefresh();
						}),
				);

			// ── New Note button ─────────────────────
			const nnGroup = renderSubgroup(body, "New Note button");

			new Setting(nnGroup)
				.setName("Show button")
				.setDesc('Show a "+ New Note" button next to the stats.')
				.addToggle((toggle) =>
					toggle.setValue(tab.plugin.settings.statsNewNote.enabled).onChange(async (value) => {
						tab.plugin.settings.statsNewNote.enabled = value;
						await tab.plugin.saveSettings();
					}),
				);

			new Setting(nnGroup)
				.setName("Button label")
				.setDesc(
					"Text shown on the button. New notes are named with today's date (e.g. 2026-08-06.md).",
				)
				.addText((text) =>
					text
						.setPlaceholder("+ New Note")
						.setValue(tab.plugin.settings.statsNewNote.label)
						.onChange(async (value) => {
							tab.plugin.settings.statsNewNote.label = value || "+ New Note";
							await tab.plugin.saveSettings();
						}),
				);

			const folders = getVaultFolders(tab.app);
			new Setting(nnGroup)
				.setName("Create note in")
				.setDesc("Folder for new notes (e.g. Journal, Inbox). Blank = vault root.")
				.addDropdown((dropdown) => {
					dropdown.addOption("", "Vault root");
					for (const f of folders) {
						dropdown.addOption(f, f);
					}
					dropdown.setValue(tab.plugin.settings.statsNewNote.folder);
					dropdown.onChange(async (value) => {
						tab.plugin.settings.statsNewNote.folder = value;
						await tab.plugin.saveSettings();
					});
				});

			new Setting(nnGroup)
				.setName("Template file")
				.setDesc("Optional template applied to new notes. Blank = empty note.")
				.addText((text) =>
					text
						.setPlaceholder("Templates/Daily Note")
						.setValue(tab.plugin.settings.statsNewNote.template)
						.onChange(async (value) => {
							tab.plugin.settings.statsNewNote.template = value.trim();
							await tab.plugin.saveSettings();
						}),
				);

			// ── Copy DSL ─────────────────────────────
			new Setting(body)
				.setName("Copy as code block")
				.setDesc("Copy your current stats configuration as a dashboard code block.")
				.addButton((btn) =>
					btn.setButtonText("Copy").onClick(() => {
						copy(buildStatsDsl(tab));
						new Notice("Nexus Dashboard: stats code block copied");
					}),
				);
		},
	);
}

function buildStatsDsl(tab: NexusSettingTab): string {
	const opts = tab.plugin.settings;
	const lines: string[] = ["stats:", "  show: true"];
	for (const s of opts.stats) {
		lines.push(`  - label: "${s.label}"`);
		lines.push(`    path: "${s.folder}"`);
		lines.push(`    metric: ${s.metric ?? "files"}`);
		lines.push(`    scope: ${s.scope ?? "all"}`);
		lines.push(`    recursive: ${s.recursive ?? true}`);
	}
	const nn = opts.statsNewNote;
	if (nn?.enabled) {
		lines.push(`  new-note: true`);
		if (nn.folder) lines.push(`  new-note-folder: "${nn.folder}"`);
		if (nn.template) lines.push(`  new-note-template: "${nn.template}"`);
		if (nn.label && nn.label !== "+ New Note") {
			lines.push(`  new-note-label: "${nn.label}"`);
		}
	}
	return lines.join("\n");
}

function renderVaultActivitySection(tab: NexusSettingTab, containerEl: HTMLElement): void {
	renderComponentCard(
		tab,
		containerEl,
		"vault-activity",
		"Vault Activity",
		"Terminal-style file lists",
		tab.plugin.settings.showVaultActivity,
		{
			show: tab.plugin.settings.showVaultActivityDivider,
			label: tab.plugin.settings.vaultActivityLabel,
			labelPlaceholder: "VAULT ACTIVITY",
			onShow: async (value) => {
				tab.plugin.settings.showVaultActivityDivider = value;
				await tab.plugin.saveSettings();
			},
			onLabel: async (value) => {
				tab.plugin.settings.vaultActivityLabel = value;
				await tab.plugin.saveSettings();
			},
		},
		async (value) => {
			tab.plugin.settings.showVaultActivity = value;
			await tab.plugin.saveSettings();
		},
		(body) => {
			body.createEl("p", {
				text:
					"Show a terminal-style list of files. Pick a preset per slot; a slot with no list selected shows recently modified files from the whole vault. Leave a list's label empty to hide its header.",
				cls: "setting-item-description",
			});

			const defaultGroup = renderSubgroup(body, "Default list");
			new Setting(defaultGroup)
				.setName("Count")
				.setDesc("Number of files shown in slots with no list selected")
				.addSlider((slider) =>
					slider
						.setLimits(3, 50, 1)
						.setValue(tab.plugin.settings.vaultActivityCount)
						.setDynamicTooltip()
						.onChange(async (value) => {
							tab.plugin.settings.vaultActivityCount = value;
							await tab.plugin.saveSettings();
						}),
				);

			new Setting(defaultGroup)
				.setName("Show fade mask")
				.setDesc("Fade the bottom of the list to hint at more content")
				.addToggle((toggle) =>
					toggle.setValue(tab.plugin.settings.vaultActivityShowFade).onChange(async (value) => {
						tab.plugin.settings.vaultActivityShowFade = value;
						await tab.plugin.saveSettings();
					}),
				);

			new Setting(defaultGroup)
				.setName("Maximum list height")
				.setDesc("Max height of the list before scrolling (120–800px)")
				.addSlider((slider) =>
					slider
						.setLimits(120, 800, 10)
						.setValue(tab.plugin.settings.vaultActivityMaxHeight)
						.setDynamicTooltip()
						.onChange(async (value) => {
							tab.plugin.settings.vaultActivityMaxHeight = value;
							await tab.plugin.saveSettings();
						}),
				);

			const listsGroup = renderSubgroup(body, "Vault lists");
			tab.plugin.settings.vaultLists.forEach((vl, i) => {
				renderVaultListEntry(tab, listsGroup, vl, i);
			});

			new Setting(listsGroup)
				.setName("Add vault activity list")
				.setDesc("Add a new named vault activity preset for use in layout slots.")
				.addButton((btn) =>
					btn
						.setButtonText("+ Add List")
						.setCta()
						.onClick(async () => {
							tab.plugin.settings.vaultLists.push({
								name: "New List",
								path: "",
								tags: "",
								count: tab.plugin.settings.vaultActivityCount,
								label: "",
							});
							await tab.saveAndRefresh();
						}),
				);
		},
	);
}

function renderQuickLinksSection(tab: NexusSettingTab, containerEl: HTMLElement): void {
	renderComponentCard(
		tab,
		containerEl,
		"quick-links",
		"Quick Links",
		"Links to open instantly",
		tab.plugin.settings.showQuickLinks,
		{
			show: tab.plugin.settings.showQuickLinksDivider,
			label: tab.plugin.settings.quickLinksDividerLabel,
			labelPlaceholder: "Quick Links",
			onShow: async (value) => {
				tab.plugin.settings.showQuickLinksDivider = value;
				await tab.plugin.saveSettings();
			},
			onLabel: async (value) => {
				tab.plugin.settings.quickLinksDividerLabel = value || "Quick Links";
				await tab.plugin.saveSettings();
			},
		},
		async (value) => {
			tab.plugin.settings.showQuickLinks = value;
			await tab.plugin.saveSettings();
		},
		(body) => {
			renderQuickLinksEditor(tab, body);

			tab.plugin.settings.showBookmarksAsLinks ??= false;
			new Setting(body)
				.setName("Show Obsidian bookmarks")
				.setDesc("Display items from the built-in Bookmarks plugin as quick links on the dashboard.")
				.addToggle((toggle) =>
					toggle.setValue(tab.plugin.settings.showBookmarksAsLinks).onChange(async (value) => {
						tab.plugin.settings.showBookmarksAsLinks = value;
						await tab.saveAndRefresh();
					}),
				);
		},
	);
}

function renderHeatmapSection(tab: NexusSettingTab, containerEl: HTMLElement): void {
	renderComponentCard(
		tab,
		containerEl,
		"heatmap",
		"Heatmap",
		"GitHub-style contribution calendar",
		tab.plugin.settings.showHeatmap,
		{
			show: tab.plugin.settings.showHeatmapDivider,
			label: tab.plugin.settings.heatmapLabel,
			labelPlaceholder: "CONTRIBUTION ACTIVITY",
			onShow: async (value) => {
				tab.plugin.settings.showHeatmapDivider = value;
				await tab.plugin.saveSettings();
			},
			onLabel: async (value) => {
				tab.plugin.settings.heatmapLabel = value;
				await tab.plugin.saveSettings();
			},
		},
		async (value) => {
			tab.plugin.settings.showHeatmap = value;
			await tab.plugin.saveSettings();
		},
		(body) => {
			new Setting(body)
				.setName("Weeks")
				.setDesc("Number of weeks to display (8–52)")
				.addSlider((slider) =>
					slider
						.setLimits(8, 52, 1)
						.setValue(tab.plugin.settings.heatmapWeeks)
						.setDynamicTooltip()
						.onChange(async (value) => {
							tab.plugin.settings.heatmapWeeks = value;
							await tab.plugin.saveSettings();
						}),
				);
		},
	);
}

function renderActivityTimelineSection(tab: NexusSettingTab, containerEl: HTMLElement): void {
	renderComponentCard(
		tab,
		containerEl,
		"activity-timeline",
		"Activity Timeline",
		"Chronological log of vault activity",
		tab.plugin.settings.showActivityTimeline,
		{
			show: tab.plugin.settings.showActivityTimelineDivider,
			label: tab.plugin.settings.activityTimelineLabel,
			labelPlaceholder: "ACTIVITY",
			onShow: async (value) => {
				tab.plugin.settings.showActivityTimelineDivider = value;
				await tab.plugin.saveSettings();
			},
			onLabel: async (value) => {
				tab.plugin.settings.activityTimelineLabel = value;
				await tab.plugin.saveSettings();
			},
		},
		async (value) => {
			tab.plugin.settings.showActivityTimeline = value;
			await tab.plugin.saveSettings();
		},
		(body) => {
			const listGroup = renderSubgroup(body, "List appearance");
			new Setting(listGroup)
				.setName("Show fade mask")
				.setDesc("Fade the bottom of the list to hint at more content")
				.addToggle((toggle) =>
					toggle.setValue(tab.plugin.settings.activityTimelineShowFade).onChange(async (value) => {
						tab.plugin.settings.activityTimelineShowFade = value;
						await tab.plugin.saveSettings();
					}),
				);

			new Setting(listGroup)
				.setName("Maximum list height")
				.setDesc("Max height of the list before scrolling (120–800px)")
				.addSlider((slider) =>
					slider
						.setLimits(120, 800, 10)
						.setValue(tab.plugin.settings.activityTimelineMaxHeight)
						.setDynamicTooltip()
						.onChange(async (value) => {
							tab.plugin.settings.activityTimelineMaxHeight = value;
							await tab.plugin.saveSettings();
						}),
				);

			new Setting(listGroup)
				.setName("Relative times")
				.setDesc('Show "3m ago" instead of clock times')
				.addToggle((toggle) =>
					toggle.setValue(tab.plugin.settings.activityTimelineShowRelative).onChange(async (value) => {
						tab.plugin.settings.activityTimelineShowRelative = value;
						await tab.plugin.saveSettings();
					}),
				);

			new Setting(listGroup)
				.setName("Show date separators")
				.setDesc('Show "Today" / "Yesterday" / date headings')
				.addToggle((toggle) =>
					toggle.setValue(tab.plugin.settings.activityTimelineShowDate).onChange(async (value) => {
						tab.plugin.settings.activityTimelineShowDate = value;
						await tab.plugin.saveSettings();
					}),
				);

			new Setting(listGroup)
				.setName("Group by")
				.setDesc("Group timeline entries by day or by file")
				.addDropdown((dropdown) => {
					dropdown.addOption("day", "Day");
					dropdown.addOption("file", "File");
					dropdown.setValue(tab.plugin.settings.activityTimelineGroup);
					dropdown.onChange(async (value) => {
						tab.plugin.settings.activityTimelineGroup = value as "day" | "file";
						await tab.plugin.saveSettings();
					});
				});

			const filterGroup = renderSubgroup(body, "Filtering");
			new Setting(filterGroup)
				.setName("Only markdown")
				.setDesc("Only show activity for markdown files")
				.addToggle((toggle) =>
					toggle.setValue(tab.plugin.settings.activityTimelineOnlyMarkdown).onChange(async (value) => {
						tab.plugin.settings.activityTimelineOnlyMarkdown = value;
						await tab.plugin.saveSettings();
					}),
				);

			new Setting(filterGroup)
				.setName("Include folders")
				.setDesc("Restrict to these folder paths (comma-separated). Empty shows everything.")
				.addText((text) =>
					text
						.setPlaceholder("Journal, Projects")
						.setValue(tab.plugin.settings.activityTimelineIncludeFolders)
						.onChange(async (value) => {
							tab.plugin.settings.activityTimelineIncludeFolders = value;
							await tab.plugin.saveSettings();
						}),
				);

			const trackingGroup = renderSubgroup(body, "Tracking");
			new Setting(trackingGroup)
				.setName("Enable activity tracking")
				.setDesc("Record vault file/folder events and persist them to data.json")
				.addToggle((toggle) =>
					toggle.setValue(tab.plugin.settings.activityTrackingEnabled).onChange(async (value) => {
						tab.plugin.settings.activityTrackingEnabled = value;
						await tab.plugin.saveSettings();
					}),
				);

			new Setting(trackingGroup)
				.setName("Track task checkboxes")
				.setDesc("Record when a task checkbox is toggled")
				.addToggle((toggle) =>
					toggle.setValue(tab.plugin.settings.activityTaskTracking).onChange(async (value) => {
						tab.plugin.settings.activityTaskTracking = value;
						await tab.plugin.saveSettings();
					}),
				);

			new Setting(trackingGroup)
				.setName("Log size")
				.setDesc("Maximum number of events kept in the activity log (50–5000)")
				.addSlider((slider) =>
					slider
						.setLimits(50, 5000, 50)
						.setValue(tab.plugin.settings.activityLogMax)
						.setDynamicTooltip()
						.onChange(async (value) => {
							tab.plugin.settings.activityLogMax = value;
							await tab.plugin.saveSettings();
						}),
				);

			new Setting(trackingGroup)
				.setName("Clear activity log")
				.setDesc("Remove all recorded activity events")
				.addButton((button) =>
					button
						.setButtonText("Clear")
						.setWarning()
						.onClick(() => {
							tab.plugin.clearActivityLog();
						}),
				);
		},
	);
}

function renderClockSection(tab: NexusSettingTab, containerEl: HTMLElement): void {
	renderComponentCard(
		tab,
		containerEl,
		"clock",
		"Clock",
		"Real-time digital clock",
		tab.plugin.settings.showClock,
		{
			show: tab.plugin.settings.showClockDivider,
			label: tab.plugin.settings.clockLabel,
			labelPlaceholder: "CLOCK",
			onShow: async (value) => {
				tab.plugin.settings.showClockDivider = value;
				await tab.plugin.saveSettings();
			},
			onLabel: async (value) => {
				tab.plugin.settings.clockLabel = value;
				await tab.plugin.saveSettings();
			},
		},
		async (value) => {
			tab.plugin.settings.showClock = value;
			await tab.plugin.saveSettings();
		},
		(body) => {
			new Setting(body)
				.setName("Timezone")
				.setDesc("IANA timezone (e.g. America/New_York). Leave empty for local time.")
				.addText((text) =>
					text
						.setPlaceholder("Local time")
						.setValue(tab.plugin.settings.clockTimezone)
						.onChange(async (value) => {
							tab.plugin.settings.clockTimezone = value;
							await tab.plugin.saveSettings();
						}),
				);

			new Setting(body)
				.setName("Show date")
				.setDesc("Show the date below the time")
				.addToggle((toggle) =>
					toggle.setValue(tab.plugin.settings.clockShowDate).onChange(async (value) => {
						tab.plugin.settings.clockShowDate = value;
						await tab.plugin.saveSettings();
					}),
				);

			new Setting(body)
				.setName("Show seconds")
				.setDesc("Show seconds in the clock")
				.addToggle((toggle) =>
					toggle.setValue(tab.plugin.settings.clockShowSeconds).onChange(async (value) => {
						tab.plugin.settings.clockShowSeconds = value;
						await tab.plugin.saveSettings();
					}),
				);

			new Setting(body)
				.setName("Format")
				.setDesc("12-hour or 24-hour format")
				.addDropdown((dropdown) => {
					dropdown.addOption("12h", "12-hour");
					dropdown.addOption("24h", "24-hour");
					dropdown.setValue(tab.plugin.settings.clockFormat);
					dropdown.onChange(async (value) => {
						tab.plugin.settings.clockFormat = value as "12h" | "24h";
						await tab.plugin.saveSettings();
					});
				});
		},
	);
}

function renderFileTypesSection(tab: NexusSettingTab, containerEl: HTMLElement): void {
	renderComponentCard(
		tab,
		containerEl,
		"file-types",
		"File Types",
		"Stacked bar of vault file composition",
		tab.plugin.settings.showFileTypeChart,
		{
			show: tab.plugin.settings.showFileTypeChartDivider,
			label: tab.plugin.settings.fileTypeChartLabel,
			labelPlaceholder: "FILE TYPES",
			onShow: async (value) => {
				tab.plugin.settings.showFileTypeChartDivider = value;
				await tab.plugin.saveSettings();
			},
			onLabel: async (value) => {
				tab.plugin.settings.fileTypeChartLabel = value;
				await tab.plugin.saveSettings();
			},
		},
		async (value) => {
			tab.plugin.settings.showFileTypeChart = value;
			await tab.plugin.saveSettings();
		},
		(body) => {
			const legendGroup = renderSubgroup(body, "Legend");
			new Setting(legendGroup)
				.setName("Maximum legend height")
				.setDesc("Max height of the extension legend before it scrolls (80–400px).")
				.addSlider((slider) =>
					slider
						.setLimits(80, 400, 10)
						.setValue(tab.plugin.settings.fileTypeLegendHeight)
						.setDynamicTooltip()
						.onChange(async (value) => {
							tab.plugin.settings.fileTypeLegendHeight = value;
							await tab.plugin.saveSettings();
						}),
				);

			const listsGroup = renderSubgroup(body, "File type lists");
			tab.plugin.settings.fileTypeLists.forEach((ft, i) => {
				renderFileTypeListEntry(tab, listsGroup, ft, i);
			});

			new Setting(listsGroup)
				.setName("Add file-type list")
				.setDesc("Add a new named file-type preset for use in layout slots.")
				.addButton((btn) =>
					btn
						.setButtonText("+ Add List")
						.setCta()
						.onClick(async () => {
							tab.plugin.settings.fileTypeLists.push({
								name: "New List",
								path: "",
								label: "",
							});
							await tab.saveAndRefresh();
						}),
				);
		},
	);
}

function renderTaskSummarySection(tab: NexusSettingTab, containerEl: HTMLElement): void {
	renderComponentCard(
		tab,
		containerEl,
		"task-summary",
		"Task Summary",
		"Open/done tasks with progress",
		tab.plugin.settings.showTaskSummary,
		{
			show: tab.plugin.settings.showTaskSummaryDivider,
			label: tab.plugin.settings.taskSummaryLabel,
			labelPlaceholder: "TASKS",
			onShow: async (value) => {
				tab.plugin.settings.showTaskSummaryDivider = value;
				await tab.plugin.saveSettings();
			},
			onLabel: async (value) => {
				tab.plugin.settings.taskSummaryLabel = value;
				await tab.plugin.saveSettings();
			},
		},
		async (value) => {
			tab.plugin.settings.showTaskSummary = value;
			await tab.plugin.saveSettings();
		},
		(body) => {
			const viewGroup = renderSubgroup(body, "Display");
			new Setting(viewGroup)
				.setName("Show progress bar")
				.setDesc("Show a progress bar below the stats counters")
				.addToggle((toggle) =>
					toggle.setValue(tab.plugin.settings.taskSummaryShowProgress).onChange(async (value) => {
						tab.plugin.settings.taskSummaryShowProgress = value;
						await tab.plugin.saveSettings();
					}),
				);

			new Setting(viewGroup)
				.setName("Show task list")
				.setDesc("Show a scrollable list of unchecked tasks")
				.addToggle((toggle) =>
					toggle.setValue(tab.plugin.settings.taskSummaryShowList).onChange(async (value) => {
						tab.plugin.settings.taskSummaryShowList = value;
						await tab.plugin.saveSettings();
					}),
				);

			new Setting(viewGroup)
				.setName("Show due dates")
				.setDesc("Group unchecked tasks by due date and highlight overdue/today tasks")
				.addToggle((toggle) =>
					toggle.setValue(tab.plugin.settings.taskSummaryShowDue).onChange(async (value) => {
						tab.plugin.settings.taskSummaryShowDue = value;
						await tab.plugin.saveSettings();
					}),
				);

			new Setting(viewGroup)
				.setName("Inline check-off")
				.setDesc("Allow checking tasks off directly from the dashboard")
				.addToggle((toggle) =>
					toggle.setValue(tab.plugin.settings.taskSummaryCheckable).onChange(async (value) => {
						tab.plugin.settings.taskSummaryCheckable = value;
						await tab.plugin.saveSettings();
					}),
				);

			new Setting(viewGroup)
				.setName("Show fade mask")
				.setDesc("Fade the bottom of the list to hint at more content")
				.addToggle((toggle) =>
					toggle.setValue(tab.plugin.settings.taskSummaryShowFade).onChange(async (value) => {
						tab.plugin.settings.taskSummaryShowFade = value;
						await tab.plugin.saveSettings();
					}),
				);

			new Setting(viewGroup)
				.setName("Maximum list height")
				.setDesc("Max height of the list before scrolling (120–800px)")
				.addSlider((slider) =>
					slider
						.setLimits(120, 800, 10)
						.setValue(tab.plugin.settings.taskSummaryMaxHeight)
						.setDynamicTooltip()
						.onChange(async (value) => {
							tab.plugin.settings.taskSummaryMaxHeight = value;
							await tab.plugin.saveSettings();
						}),
				);

			const filterGroup = renderSubgroup(body, "Filtering");
			new Setting(filterGroup)
				.setName("Folder filter")
				.setDesc("Only count tasks in this vault folder (leave empty for all)")
				.addText((text) =>
					text
						.setPlaceholder("Knowledge/Tasks & Action Management")
						.setValue(tab.plugin.settings.taskSummaryPath)
						.onChange(async (value) => {
							tab.plugin.settings.taskSummaryPath = value;
							await tab.plugin.saveSettings();
						}),
				);

			new Setting(filterGroup)
				.setName("Tag filter")
				.setDesc("Comma-separated frontmatter tags to filter task files (leave empty for all)")
				.addText((text) =>
					text
						.setPlaceholder("todo, tasks")
						.setValue(tab.plugin.settings.taskSummaryTags)
						.onChange(async (value) => {
							tab.plugin.settings.taskSummaryTags = value;
							await tab.plugin.saveSettings();
						}),
				);

			new Setting(filterGroup)
				.setName("Max tasks in list")
				.setDesc("Maximum number of tasks to display in the list (5–30)")
				.addSlider((slider) =>
					slider
						.setLimits(5, 30, 1)
						.setValue(tab.plugin.settings.taskSummaryCount)
						.setDynamicTooltip()
						.onChange(async (value) => {
							tab.plugin.settings.taskSummaryCount = value;
							await tab.plugin.saveSettings();
						}),
				);
		},
	);
}

function renderDividerStyleSection(tab: NexusSettingTab, containerEl: HTMLElement): void {
	const { header, body, isCollapsed } = renderComponentCardHeader(
		tab,
		containerEl,
		"divider-style",
		"Divider Style",
		"Global appearance of section dividers",
		true,
	);

	header.addEventListener("click", () => {
		tab.setCollapsed(collapseKey("component", "divider-style"), !isCollapsed);
		void tab.plugin.saveSettings();
		tab.display();
	});

	if (!body) return;

	body.createEl("p", {
		text: "Customize the appearance of section dividers. Labels are configured per component above.",
		cls: "setting-item-description",
	});

	const currentPreset = detectDividerPreset(tab.plugin.settings.dividerDesign);
	new Setting(body)
		.setName("Divider style")
		.setDesc("Choose a divider style preset")
		.addDropdown((dropdown) => {
			for (const [key, name] of Object.entries(DIVIDER_PRESET_NAMES)) {
				dropdown.addOption(key, name);
			}
			dropdown.addOption("custom", "Custom…");
			dropdown.setValue(currentPreset);
			dropdown.onChange(async (value) => {
				if (value === "custom") {
					await tab.plugin.saveSettings();
					tab.display();
					return;
				}
				const preset = DIVIDER_PRESETS[value];
				if (preset) {
					tab.plugin.settings.dividerDesign = { ...preset };
					await tab.plugin.saveSettings();
					renderDividerPreview(tab, dividerPreviewEl);
				}
			});
		});

	const dividerPreviewEl = body.createDiv();
	renderDividerPreview(tab, dividerPreviewEl);

	// Custom style fields when no preset matches
	if (currentPreset === "custom") {
		const customGroup = renderSubgroup(body, "Custom style");
		const dd = tab.plugin.settings.dividerDesign;
		const customFields: [string, string, keyof DividerDesign][] = [
			["Gradient", "CSS background (e.g. linear-gradient(90deg, #333, transparent))", "gradient"],
			["Line width", "CSS height (e.g. 2px)", "lineWidth"],
			["Label size", "CSS font-size (e.g. 0.75rem)", "labelSize"],
			["Label weight", "CSS font-weight (e.g. 600)", "labelWeight"],
			["Label color", "CSS color", "labelColor"],
			["Label spacing", "CSS margin (e.g. 0 0 0.5rem)", "labelSpacing"],
		];
		for (const [label, desc, key] of customFields) {
			new Setting(customGroup)
				.setName(label)
				.setDesc(desc)
				.addText((text) =>
					text.setValue(dd[key] || "").onChange(async (value) => {
						(tab.plugin.settings.dividerDesign as unknown as Record<string, string>)[key] = value;
						await tab.plugin.saveSettings();
						renderDividerPreview(tab, dividerPreviewEl);
					}),
				);
		}
	}
}

// ── Quick Links ─────────────────────────────────────────

/**
 * MOC-style quick links editor. Each link is a heading row with a drag
 * handle, chevron, label and trash button. Click to expand/collapse; drag
 * to reorder; trash to delete. Mirrors MOC Cards.
 */
function renderQuickLinksEditor(tab: NexusSettingTab, containerEl: HTMLElement): void {
	const links = tab.plugin.settings.quickLinks;

	if (links.length === 0) {
		const emptyRow = new Setting(containerEl);
		emptyRow.setName("Quick links");
		emptyRow.setDesc("No quick links yet.");
		emptyRow.addButton((btn) =>
			btn
				.setButtonText("+ Add Link")
				.setCta()
				.onClick(async () => {
					void addQuickLink(tab);
				}),
		);
		return;
	}

	links.forEach((link, index) => {
		const isCollapsed = tab.isCollapsed(collapseKey("quicklink", index));

		const heading = containerEl.createDiv({ cls: "nexus-settings-moc-heading" });
		const { titleWrap, actions } = tab.setupDragAndDrop(
			heading,
			index,
			tab.plugin.settings.quickLinks,
			tab.isCollapsed(collapseKey("quicklink", index)),
			true,
		);

		// Title
		titleWrap.createEl("span", { text: link.label || `Link ${index + 1}` });

		// Delete button
		const removeBtn = actions.createEl("button", {
			cls: "nexus-settings-moc-btn--delete",
			attr: { "aria-label": "Remove" },
		});
		setIcon(removeBtn, "trash");
		removeBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			new ConfirmModal(
				tab.app,
				`Remove "${link.label}"?`,
				"This quick link will be removed from the dashboard.",
				async () => {
					tab.plugin.settings.quickLinks.splice(index, 1);
					await tab.saveAndRefresh();
				},
			).open();
		});

		// Toggle collapse
		heading.addEventListener("click", () => {
			tab.setCollapsed(collapseKey("quicklink", index), !isCollapsed);
			void tab.plugin.saveSettings();
			tab.display();
		});

		if (isCollapsed) return;

		new Setting(containerEl).setName("Label").addText((text) =>
			text
				.setPlaceholder("Google")
				.setValue(link.label)
				.onChange(async (value) => {
					tab.plugin.settings.quickLinks[index].label = value;
					await tab.plugin.saveSettings();
				}),
		);

		new Setting(containerEl).setName("URL").addText((text) =>
			text
				.setPlaceholder("https://example.com")
				.setValue(link.url)
				.onChange(async (value) => {
					tab.plugin.settings.quickLinks[index].url = value;
					await tab.plugin.saveSettings();
				}),
		);
	});

	// "+ Add Link" button
	new Setting(containerEl)
		.setName("Add quick link")
		.setDesc("Add a new link to the dashboard.")
		.addButton((btn) =>
			btn
				.setButtonText("+ Add Link")
				.setCta()
				.onClick(async () => {
					await addQuickLink(tab);
				}),
		);
}

async function addQuickLink(tab: NexusSettingTab): Promise<void> {
	tab.plugin.settings.quickLinks.push({
		label: "New Link",
		url: "https://example.com",
	});
	await tab.saveAndRefresh();
}

// ── Vault List Entry ────────────────────────────────────

export function renderVaultListEntry(
	tab: NexusSettingTab,
	containerEl: HTMLElement,
	vl: VaultListEntry,
	index: number,
): void {
	const entry = containerEl.createDiv({ cls: "nexus-vault-list-entry" });

	const head = entry.createDiv({ cls: "nexus-vault-list-entry-head" });
	head.createSpan({ cls: "nexus-vault-list-entry-name", text: vl.name || "Untitled" });
	const removeBtn = head.createEl("button", {
		cls: "nexus-settings-moc-btn--delete",
		attr: { "aria-label": "Remove" },
	});
	setIcon(removeBtn, "trash");
	removeBtn.addEventListener("click", async () => {
		new ConfirmModal(
			tab.app,
			`Remove "${vl.name}"?`,
			"This vault list will be removed from the dashboard.",
			async () => {
				tab.plugin.settings.vaultLists.splice(index, 1);
				await tab.saveAndRefresh();
			},
		).open();
	});

	const grid = entry.createDiv({ cls: "nexus-vault-list-entry-grid" });

	addVaultListField(tab, grid, "Path", vl.path, (value) => {
		tab.plugin.settings.vaultLists[index].path = value;
	});
	addVaultListField(tab, grid, "Tags", vl.tags, (value) => {
		tab.plugin.settings.vaultLists[index].tags = value;
	});
	addVaultListField(tab, grid, "Count", String(vl.count), (value) => {
		const parsed = safeParseInt(value, undefined) ?? 9;
		tab.plugin.settings.vaultLists[index].count = Math.max(3, Math.min(50, parsed));
	});
	addVaultListField(tab, grid, "Label", vl.label, (value) => {
		tab.plugin.settings.vaultLists[index].label = value;
	});
}

// ── File-Type List Entry ────────────────────────────────

export function renderFileTypeListEntry(
	tab: NexusSettingTab,
	containerEl: HTMLElement,
	ft: FileTypeListEntry,
	index: number,
): void {
	const entry = containerEl.createDiv({ cls: "nexus-vault-list-entry" });

	const head = entry.createDiv({ cls: "nexus-vault-list-entry-head" });
	head.createSpan({ cls: "nexus-vault-list-entry-name", text: ft.name || "Untitled" });
	const removeBtn = head.createEl("button", {
		cls: "nexus-settings-moc-btn--delete",
		attr: { "aria-label": "Remove" },
	});
	setIcon(removeBtn, "trash");
	removeBtn.addEventListener("click", async () => {
		new ConfirmModal(
			tab.app,
			`Remove "${ft.name}"?`,
			"This file-type list will be removed from the dashboard.",
			async () => {
				tab.plugin.settings.fileTypeLists.splice(index, 1);
				await tab.saveAndRefresh();
			},
		).open();
	});

	const grid = entry.createDiv({ cls: "nexus-vault-list-entry-grid" });

	addVaultListField(tab, grid, "Name", ft.name, (value) => {
		tab.plugin.settings.fileTypeLists[index].name = value;
	});
	addVaultListField(tab, grid, "Path", ft.path, (value) => {
		tab.plugin.settings.fileTypeLists[index].path = value;
	});
	addVaultListField(tab, grid, "Label", ft.label, (value) => {
		tab.plugin.settings.fileTypeLists[index].label = value;
	});
	addVaultListNumberField(tab, grid, "Max Height", ft.height, (value) => {
		tab.plugin.settings.fileTypeLists[index].height = value;
	});
}

function addVaultListField(
	tab: NexusSettingTab,
	parent: HTMLElement,
	label: string,
	value: string,
	onValue: (value: string) => void,
): void {
	const field = parent.createDiv({ cls: "nexus-vault-list-entry-field" });
	field.createEl("label", { cls: "nexus-vault-list-entry-field-label", text: label });
	const input = field.createEl("input", {
		cls: "nexus-vault-list-entry-input",
		attr: { type: "text", value },
	});
	let timer: ReturnType<typeof setTimeout> | null = null;
	input.addEventListener("input", () => {
		onValue(input.value);
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			void tab.plugin.saveSettings();
		}, 200);
	});
}

function addVaultListNumberField(
	tab: NexusSettingTab,
	parent: HTMLElement,
	label: string,
	value: number | undefined,
	onValue: (value: number | undefined) => void,
): void {
	const field = parent.createDiv({ cls: "nexus-vault-list-entry-field" });
	field.createEl("label", { cls: "nexus-vault-list-entry-field-label", text: label });
	const input = field.createEl("input", {
		cls: "nexus-vault-list-entry-input",
		attr: { type: "number", min: "0", value: value != null ? String(value) : "" },
	});
	let timer: ReturnType<typeof setTimeout> | null = null;
	input.addEventListener("input", () => {
		const raw = input.value.trim();
		let next: number | undefined;
		if (raw !== "") {
			const parsed = parseInt(raw, 10);
			next = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
		}
		onValue(next);
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			void tab.plugin.saveSettings();
		}, 200);
	});
}
