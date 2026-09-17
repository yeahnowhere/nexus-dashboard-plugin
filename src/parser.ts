import {
	DashboardConfig,
	DividerBlockConfig,
	SectionConfig,
	CardConfig,
	LinksConfig,
	LinkItem,
	RowConfig,
	ColumnConfig,
	VaultActivityConfig,
	StatsBlockConfig,
	HeatmapConfig,
	TimelineConfig,
	ClockConfig,
	FileTypeChartConfig,
	TaskSummaryConfig,
	StatItem,
	StatMetric,
	StatScope,
} from "./types";
import { ensureExtension as ensureExt, safeParseInt, splitCsv, applyListConfigKV } from "./utils";

function finalizeCard(partial: Partial<CardConfig>): CardConfig {
	return {
		type: partial.type ?? "big",
		label: partial.label ?? "",
		desc: partial.desc,
		path: partial.path ?? "",
		icon: partial.icon ?? "MOC",
	};
}

function finalizeLinkItem(partial: Partial<LinkItem>): LinkItem {
	return {
		url: partial.url ?? "",
		label: partial.label,
		desc: partial.desc,
	};
}

type ParseContext =
	| "root"
	| "header"
	| "stats"
	| "divider"
	| "section"
	| "cards"
	| "graph"
	| "links"
	| "row"
	| "column"
	| "vault-activity"
	| "section-divider"
	| "heatmap"
	| "timeline"
	| "clock"
	| "filetypes"
	| "tasks";

export function parseDashboard(raw: string): DashboardConfig {
	const trimmed = raw.trim();
	if (!trimmed) {
		return buildDefaultConfig();
	}

	const config: DashboardConfig = {
		header: { text: "", font: "", color: "", size: 1, enabled: false },
		stats: { enabled: false, items: [] },
		blocks: [],
		graph: { enabled: false, exclude: [] },
	};

	const lines = trimmed.split("\n");
	let context: ParseContext = "root";
	let currentDivider: DividerBlockConfig | null = null;
	let currentSection: SectionConfig | null = null;
	let currentCard: Partial<CardConfig> | null = null;
	let currentLinks: LinksConfig | null = null;
	let currentLinkItem: Partial<LinkItem> | null = null;
	let currentStatItem: Partial<StatItem> | null = null;
	let currentRow: RowConfig | null = null;
	let currentRowSectionsRemaining: number = 0;
	let currentColumn: ColumnConfig | null = null;
	let columnInsideRow = false;
	let columnIndent = -1;
	let currentVaultActivity: VaultActivityConfig | null = null;
	let currentHeatmap: HeatmapConfig | null = null;
	let currentTimeline: TimelineConfig | null = null;
	let currentClock: ClockConfig | null = null;
	let currentFileTypeChart: FileTypeChartConfig | null = null;
	let currentTaskSummary: TaskSummaryConfig | null = null;

	/**
	 * Prepare the parser for a leaf block (links/vault-activity/heatmap/timeline/
	 * clock/filetypes/tasks). Flushes any in-progress section into the current
	 * container, then — when nested inside an open column or an implicit row
	 * column — keeps that container open so the block lands beside the sections.
	 * For top-level blocks it closes any open column so the block renders standalone.
	 *
	 * Returns a divider title carried over from a released empty section, which
	 * the caller should use as the leaf block's label.
	 */
	const beginLeafBlock = (): string | undefined => {
		// A leaf block directly following an empty section marker (e.g.
		// `- section:\n  vault-activity:`) should take that section's place in the
		// container instead of leaving an invisible spacer behind it. When the
		// section carries a divider, carry its title onto the leaf as a label so
		// the divider isn't lost when the section is released.
		let carried: string | undefined;
		if (currentSection && currentSection.cards.length === 0) {
			if (currentSection.divider?.title) {
				carried = currentSection.divider.title;
			}
			currentSection = null;
		}
		flushCurrent();
		if (!currentColumn && !(currentRow && currentRowSectionsRemaining > 0)) {
			flushColumn();
		}
		return carried;
	};

	/**
	 * Capture a pending divider title that should become a leaf block's label
	 * (a `divider:` written immediately before the leaf, mirroring the old
	 * `links:` behavior). Must run before `beginLeafBlock()` so the divider
	 * isn't flushed to the top level.
	 */
	const takePendingLabel = (): string | undefined => {
		if (context === "divider" && currentDivider) {
			const title = currentDivider.title;
			currentDivider = null;
			return title || undefined;
		}
		return undefined;
	};

	/** Create the new-note config object on first mention of any `new-note` key. */
	const ensureStatsNewNote = (): NonNullable<DashboardConfig["stats"]["newNote"]> => {
		if (!config.stats.newNote) {
			config.stats.newNote = { enabled: false, label: "+ New Note", folder: "", template: "" };
		}
		return config.stats.newNote;
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].replace(/\r$/, "");
		const indent = line.search(/\S/);
		let t = line.trim();
		if (!t || t.startsWith("#")) continue;

		// Strip YAML list prefix for known keywords (e.g. "- section:" → "section:")
		if (t.startsWith("- ")) {
			const stripped = t.slice(2);
			if (
				/^(header|stats|graph|divider|section|links|row|column|vault-activity|filetypes|heatmap|timeline|clock|tasks):/.test(
					stripped,
				)
			) {
				t = stripped;
			}
		}

		// ── Context switches ──────────────────────────────
		if (t === "header:") {
			flushCurrent();
			flushColumn();
			context = "header";
			continue;
		}
		if (t.startsWith("stats:") && t.length > 6) {
			flushCurrent();
			flushColumn();
			const val = t.slice(6).trim();
			config.stats.enabled = val === "true";
			context = "stats";
			continue;
		}
		if (t === "stats:") {
			flushCurrent();
			flushColumn();
			context = "stats";
			continue;
		}
		if (t === "graph:") {
			flushCurrent();
			flushColumn();
			context = "graph";
			continue;
		}
		if (t === "divider:") {
			if (context === "section" || context === "cards") {
				if (currentSection && currentSection.divider) {
					// Already has a divider — flush section first, create standalone divider
					flushCurrent();
					flushColumn();
					context = "divider";
					currentDivider = { kind: "divider", title: "", type: undefined };
					continue;
				}
				// First divider for this section — attach it
				if (currentSection) {
					currentSection.divider = { kind: "divider", title: "", type: undefined };
				}
				context = "section-divider";
				continue;
			}
			flushCurrent();
			flushColumn();
			context = "divider";
			currentDivider = { kind: "divider", title: "", type: undefined };
			continue;
		}

		// ── Section inside column (before root section:) ───
		if (t === "section:" && context === "column") {
			flushCard();
			currentSection = { kind: "section", columns: 2, cards: [] };
			context = "section";
			continue;
		}

		// ── Row inside column (nested, before root row:) ───
		if (t === "row:" && context === "column") {
			flushCard();
			flushSection();
			context = "row";
			currentRow = { kind: "row", children: [] };
			currentRowSectionsRemaining = 2;
			continue;
		}

		if (t === "section:") {
			// If a divider was just defined (context === "divider"), attach it to this section
			// instead of flushing it as a standalone divider
			const pendingDivider = context === "divider" && currentDivider ? currentDivider : null;
			if (pendingDivider) {
				currentDivider = null;
			}
			flushCurrent();
			if (
				columnInsideRow &&
				currentRow &&
				currentColumn &&
				currentColumn.children.length > 0 &&
				indent <= columnIndent
			) {
				flushColumn();
			}
			context = "section";
			currentSection = { kind: "section", columns: 2, cards: [] };
			if (pendingDivider) {
				currentSection.divider = pendingDivider;
			}
			continue;
		}
		if (t === "cards:") {
			if (context !== "section") {
				context = "cards";
			}
			continue;
		}

		// ── Links block ─────────────────────────────────
		if (t === "links:") {
			const label = takePendingLabel() || beginLeafBlock();
			context = "links";
			currentLinks = { kind: "links", items: [] };
			if (label) {
				currentLinks.title = label;
			}
			continue;
		}

		// ── Row marker ──────────────────────────────────
		if (t === "row:") {
			flushCurrent();
			flushColumn();
			context = "row";
			currentRow = { kind: "row", children: [] };
			currentRowSectionsRemaining = 2; // default, overridden by columns:
			continue;
		}

		// ── Column inside row (nested, before root column:) ───
		if (t === "column:" && context === "row") {
			flushCard();
			flushSection();
			columnInsideRow = true;
			columnIndent = indent;
			currentRowSectionsRemaining--;
			context = "column";
			currentColumn = { kind: "column", children: [] };
			continue;
		}

		// ── Column marker ────────────────────────────────
		if (t === "column:") {
			flushCurrent();
			flushColumn();
			// If still inside a row (multiple columns in a row), maintain row context
			if (currentRow && currentRowSectionsRemaining > 0) {
				columnInsideRow = true;
				columnIndent = indent;
				currentRowSectionsRemaining--;
			}
			context = "column";
			currentColumn = { kind: "column", children: [] };
			continue;
		}

		// ── Leaf blocks (links/vault-activity/heatmap/timeline/clock/filetypes/tasks) ──
		// are nestable inside rows/columns. Each starts by flushing any in-progress
		// section into its container, then either keeps the open column/row slot
		// open (nesting) or closes the current column for a standalone block.
		if (t === "vault-activity:") {
			const label = takePendingLabel() || beginLeafBlock();
			context = "vault-activity";
			currentVaultActivity = { kind: "vault-activity", show: true, ...(label ? { label } : {}) };
			continue;
		}
		if (t === "heatmap:") {
			const label = takePendingLabel() || beginLeafBlock();
			context = "heatmap";
			currentHeatmap = { kind: "heatmap", show: true, ...(label ? { label } : {}) };
			continue;
		}
		if (t === "timeline:") {
			const label = takePendingLabel() || beginLeafBlock();
			context = "timeline";
			currentTimeline = { kind: "timeline", show: true, ...(label ? { label } : {}) };
			continue;
		}
		if (t === "clock:") {
			const label = takePendingLabel() || beginLeafBlock();
			context = "clock";
			currentClock = { kind: "clock", show: true, ...(label ? { label } : {}) };
			continue;
		}
		if (t === "filetypes:") {
			const label = takePendingLabel() || beginLeafBlock();
			context = "filetypes";
			currentFileTypeChart = { kind: "filetypes", show: true, ...(label ? { label } : {}) };
			continue;
		}
		if (t === "tasks:") {
			const label = takePendingLabel() || beginLeafBlock();
			context = "tasks";
			currentTaskSummary = { kind: "tasks", show: true, ...(label ? { label } : {}) };
			continue;
		}

		// ── New card entry ────────────────────────────────
		if (t.startsWith("- type:")) {
			flushCard();
			currentCard = { type: parseValue(t, "- type:") === "mini" ? "mini" : "big" };
			context = "cards";
			continue;
		}

		// ── New link item entry ────────────────────────────
		if (t.startsWith("- url:") && context === "links") {
			flushLinkItem();
			currentLinkItem = { url: parseValue(t, "- url:") };
			continue;
		}

		// ── New stats item entry ───────────────────────────
		if (context === "stats" && (t.startsWith("- label:") || t.startsWith("- path:"))) {
			flushStatItem();
			currentStatItem = {};
			if (t.startsWith("- label:")) {
				currentStatItem.label = parseValue(t, "- label:");
			} else {
				currentStatItem.folder = parseValue(t, "- path:");
			}
			continue;
		}

		// ── Key-value parsing ─────────────────────────────
		const kv = splitKV(t);
		if (!kv) continue;

		// Root-level keys recognized in ANY context
		switch (context) {
			case "header":
				if (!config.header.enabled) {
					config.header = { text: "", font: "", color: "", size: 1, enabled: true };
				}
				if (kv.key === "size") {
					if (kv.value === "small") {
						config.header.size = 0.6;
					} else if (kv.value === "normal") {
						config.header.size = 1;
					} else {
						const n = Number(kv.value);
						config.header.size = Number.isFinite(n) && n > 0 ? n : 1;
					}
				} else if (kv.key === "mobileSize") {
					const n = Number(kv.value);
					config.header.mobileSize = Number.isFinite(n) && n > 0 ? n : undefined;
				} else if (kv.key === "text" || kv.key === "font" || kv.key === "color" || kv.key === "align") {
					(config.header as unknown as Record<string, string | number | boolean | undefined>)[kv.key] =
						kv.value;
				}
				break;
			case "stats":
				if (kv.key === "show") {
					config.stats.enabled = kv.value === "true";
				} else if (kv.key === "new-note") {
					ensureStatsNewNote().enabled = kv.value === "true";
				} else if (kv.key === "new-note-folder") {
					ensureStatsNewNote().folder = kv.value;
				} else if (kv.key === "new-note-template") {
					ensureStatsNewNote().template = kv.value;
				} else if (kv.key === "new-note-label") {
					ensureStatsNewNote().label = kv.value;
				} else if (
					kv.key === "label" ||
					kv.key === "path" ||
					kv.key === "folder" ||
					kv.key === "metric" ||
					kv.key === "scope" ||
					kv.key === "recursive"
				) {
					if (!currentStatItem) currentStatItem = {};
					if (kv.key === "label") {
						currentStatItem.label = kv.value;
					} else if (kv.key === "path" || kv.key === "folder") {
						currentStatItem.folder = kv.value;
					} else if (kv.key === "metric") {
						currentStatItem.metric = kv.value as StatMetric;
					} else if (kv.key === "scope") {
						currentStatItem.scope = kv.value as StatScope;
					} else if (kv.key === "recursive") {
						currentStatItem.recursive = kv.value === "true";
					}
				}
				break;
			case "divider":
				if (currentDivider) applyDividerKV(currentDivider, kv);
				break;
			case "section-divider":
				if (kv.key === "title" || kv.key === "type") {
					if (currentSection?.divider) applyDividerKV(currentSection.divider, kv);
				} else {
					// Not a divider key — revert to section context
					context = "section";
					if (currentSection) applySectionKV(currentSection, kv);
				}
				break;
			case "section":
				if (currentSection) applySectionKV(currentSection, kv);
				break;
			case "cards":
				if (currentCard) applyCardKV(currentCard, kv);
				break;
			case "graph":
				if (kv.key === "exclude") {
					config.graph.exclude = splitCsv(kv.value);
				} else if (kv.key === "showGraph") {
					config.graph.enabled = kv.value === "true";
				}
				break;
			case "links":
				if (currentLinkItem) {
					applyLinkItemKV(currentLinkItem, kv);
				} else if (currentLinks) {
					applyLinksKV(currentLinks, kv);
				}
				break;
			case "row":
				if (currentRow) {
					applyRowKV(currentRow, kv);
					if (kv.key === "columns") {
						currentRowSectionsRemaining = safeParseInt(kv.value, 2, 1, 4) ?? 2;
					}
				}
				break;
			case "column":
				if (currentColumn) {
					if (kv.key === "spacing") currentColumn.spacing = kv.value;
					if (kv.key === "align")
						currentColumn.align = kv.value as "left" | "center" | "right" | "stretch";
				}
				break;
			case "heatmap":
				if (currentHeatmap) applyHeatmapKV(currentHeatmap, kv);
				break;
			case "timeline":
				if (currentTimeline) applyTimelineKV(currentTimeline, kv);
				break;
			case "clock":
				if (currentClock) applyClockKV(currentClock, kv);
				break;
			case "filetypes":
				if (currentFileTypeChart) applyFileTypeChartKV(currentFileTypeChart, kv);
				break;
			case "tasks":
				if (currentTaskSummary) applyTaskSummaryKV(currentTaskSummary, kv);
				break;
			case "vault-activity":
				if (currentVaultActivity) {
					applyListConfigKV(currentVaultActivity, kv, {
						label: (val, t) => {
							(t as VaultActivityConfig).label = val;
						},
					});
				}
				break;
		}
	}

	// Flush trailing block
	flushCurrent();
	flushColumn();
	flushRow();

	return config;

	/** Route a flushed block into the open container (column → row slot → top level). */
	function pushBlock(
		block:
			| LinksConfig
			| VaultActivityConfig
			| HeatmapConfig
			| TimelineConfig
			| ClockConfig
			| FileTypeChartConfig
			| TaskSummaryConfig,
	): void {
		if (currentColumn) {
			currentColumn.children.push(block);
			return;
		}
		if (currentRow && currentRowSectionsRemaining > 0) {
			currentRow.children.push(block);
			currentRowSectionsRemaining--;
			if (currentRowSectionsRemaining === 0) {
				flushRow();
			}
			return;
		}
		config.blocks.push(block);
	}

	function flushCurrent() {
		flushCard();
		flushLinkItem();
		flushStatItem();
		flushLinks();
		flushSection();
		flushDivider();
		flushVaultActivity();
		flushHeatmap();
		flushTimeline();
		flushClock();
		flushFileTypeChart();
		flushTaskSummary();
	}

	function flushCard() {
		if (currentSection && currentCard) {
			currentSection.cards.push(finalizeCard(currentCard));
			currentCard = null;
		}
	}

	function flushLinkItem() {
		if (currentLinks && currentLinkItem) {
			if (currentLinkItem.url) {
				currentLinks.items.push(finalizeLinkItem(currentLinkItem));
			}
			currentLinkItem = null;
		}
	}

	function flushStatItem() {
		if (currentStatItem) {
			if (currentStatItem.label || currentStatItem.folder) {
				config.stats.items.push(currentStatItem as StatItem);
			}
			currentStatItem = null;
		}
	}

	function flushLinks() {
		flushLinkItem();
		if (currentLinks) {
			pushBlock(currentLinks);
			currentLinks = null;
		}
	}

	function flushSection() {
		flushCard();
		if (currentSection) {
			if (currentColumn) {
				currentColumn.children.push(currentSection);
			} else if (currentRow && currentRowSectionsRemaining > 0) {
				currentRow.children.push(currentSection);
				currentRowSectionsRemaining--;
				if (currentRowSectionsRemaining === 0) {
					flushRow();
				}
			} else {
				config.blocks.push(currentSection);
			}
			currentSection = null;
		} else if (currentCard) {
			const implicitSection: SectionConfig = {
				kind: "section",
				columns: 2,
				cards: [finalizeCard(currentCard)],
			};
			if (currentColumn) {
				currentColumn.children.push(implicitSection);
			} else if (currentRow && currentRowSectionsRemaining > 0) {
				currentRow.children.push(implicitSection);
				currentRowSectionsRemaining--;
				if (currentRowSectionsRemaining === 0) {
					flushRow();
				}
			} else {
				config.blocks.push(implicitSection);
			}
			currentCard = null;
		}
	}

	function flushDivider() {
		if (currentDivider) {
			config.blocks.push(currentDivider);
			currentDivider = null;
		}
	}

	function flushRow() {
		if (currentRow) {
			if (currentRow.children.length > 0) {
				if (currentColumn) {
					currentColumn.children.push(currentRow);
				} else {
					config.blocks.push(currentRow);
				}
			}
			currentRow = null;
			currentRowSectionsRemaining = 0;
		}
	}

	function flushColumn() {
		if (currentColumn) {
			flushSection();
			if (currentColumn.children.length > 0) {
				if (columnInsideRow && currentRow) {
					currentRow.children.push(currentColumn);
					currentColumn = null;
					if (currentRowSectionsRemaining === 0) {
						flushRow();
					}
				} else {
					config.blocks.push(currentColumn);
				}
			}
			if (currentColumn) {
				currentColumn = null;
				columnInsideRow = false;
				columnIndent = -1;
			}
		}
	}

	function flushVaultActivity() {
		if (currentVaultActivity) {
			pushBlock(currentVaultActivity);
			currentVaultActivity = null;
		}
	}

	function flushHeatmap() {
		if (currentHeatmap) {
			pushBlock(currentHeatmap);
			currentHeatmap = null;
		}
	}

	function flushTimeline() {
		if (currentTimeline) {
			pushBlock(currentTimeline);
			currentTimeline = null;
		}
	}

	function flushClock() {
		if (currentClock) {
			pushBlock(currentClock);
			currentClock = null;
		}
	}

	function flushFileTypeChart() {
		if (currentFileTypeChart) {
			pushBlock(currentFileTypeChart);
			currentFileTypeChart = null;
		}
	}

	function flushTaskSummary() {
		if (currentTaskSummary) {
			pushBlock(currentTaskSummary);
			currentTaskSummary = null;
		}
	}
}

// ── KV apply helpers ─────────────────────────────────────

function applyDividerKV(divider: DividerBlockConfig, kv: { key: string; value: string }) {
	if (kv.key === "title") divider.title = kv.value;
	if (kv.key === "type") divider.type = kv.value;
}

function applySectionKV(section: SectionConfig, kv: { key: string; value: string }) {
	if (kv.key === "columns" || kv.key === "grid") {
		section.columns = safeParseInt(kv.value, 2, 1) ?? 2;
	}
}

function applyCardKV(card: Partial<CardConfig>, kv: { key: string; value: string }) {
	if (kv.key === "label") card.label = kv.value;
	if (kv.key === "desc") card.desc = kv.value;
	if (kv.key === "path") card.path = ensureExt(kv.value);
	if (kv.key === "icon") card.icon = kv.value;
	if (kv.key === "type") card.type = kv.value === "mini" ? "mini" : "big";
}

function applyLinksKV(links: LinksConfig, kv: { key: string; value: string }) {
	if (kv.key === "title") links.title = kv.value;
	if (kv.key === "columns") {
		links.columns = safeParseInt(kv.value, 3, 1);
	}
}

function applyLinkItemKV(item: Partial<LinkItem>, kv: { key: string; value: string }) {
	if (kv.key === "url") item.url = kv.value;
	if (kv.key === "label") item.label = kv.value;
	if (kv.key === "desc") item.desc = kv.value;
}

function applyRowKV(row: RowConfig, kv: { key: string; value: string }) {
	if (kv.key === "proportion") row.proportion = kv.value;
	if (kv.key === "align") row.align = kv.value as "top" | "center" | "stretch";
	if (kv.key === "gap") row.gap = kv.value;
}

// applyListConfigKV (from utils) handles vault-activity show/count/path/tags

function applyHeatmapKV(heatmap: HeatmapConfig, kv: { key: string; value: string }) {
	if (kv.key === "show") heatmap.show = kv.value === "true";
	if (kv.key === "weeks") {
		const n = parseInt(kv.value, 10);
		heatmap.weeks = Number.isFinite(n) && n > 0 ? n : undefined;
	}
	if (kv.key === "label") heatmap.label = kv.value;
}

function applyTimelineKV(timeline: TimelineConfig, kv: { key: string; value: string }) {
	if (kv.key === "show") timeline.show = kv.value === "true";
	if (kv.key === "label") timeline.label = kv.value;
	if (kv.key === "exclude") {
		timeline.exclude = splitCsv(kv.value);
	}
	if (kv.key === "excludeExt") {
		timeline.excludeExt = splitCsv(kv.value);
	}
	if (kv.key === "include") {
		timeline.include = splitCsv(kv.value);
	}
	if (kv.key === "types") {
		timeline.types = splitCsv(kv.value);
	}
	if (kv.key === "onlyMarkdown") timeline.onlyMarkdown = kv.value === "true";
	if (kv.key === "group") {
		timeline.group = kv.value === "file" ? "file" : "day";
	}
	if (kv.key === "relative") timeline.relative = kv.value === "true";
	if (kv.key === "showDate") timeline.showDate = kv.value === "true";
}

function applyClockKV(clock: ClockConfig, kv: { key: string; value: string }) {
	if (kv.key === "show") clock.show = kv.value === "true";
	if (kv.key === "timezone") clock.timezone = kv.value;
	if (kv.key === "showDate") clock.showDate = kv.value === "true";
	if (kv.key === "showSeconds") clock.showSeconds = kv.value === "true";
	if (kv.key === "format") clock.format = kv.value as "12h" | "24h";
	if (kv.key === "label") clock.label = kv.value;
}

function applyFileTypeChartKV(chart: FileTypeChartConfig, kv: { key: string; value: string }) {
	if (kv.key === "show") chart.show = kv.value === "true";
	if (kv.key === "label") chart.label = kv.value;
	if (kv.key === "path") chart.path = kv.value;
	if (kv.key === "height") {
		const n = parseInt(kv.value, 10);
		chart.maxLegendHeight = Number.isFinite(n) && n > 0 ? n : undefined;
	}
}

function applyTaskSummaryKV(ts: TaskSummaryConfig, kv: { key: string; value: string }) {
	if (kv.key === "show") ts.show = kv.value === "true";
	if (kv.key === "progress") ts.showProgress = kv.value === "true";
	if (kv.key === "showList") ts.showList = kv.value === "true";
	if (kv.key === "due") ts.showDue = kv.value === "true";
	if (kv.key === "checkable") ts.checkable = kv.value === "true";
	if (kv.key === "count") {
		const n = parseInt(kv.value, 10);
		ts.count = Number.isFinite(n) && n > 0 ? n : undefined;
	}
	if (kv.key === "path") ts.path = kv.value;
	if (kv.key === "tags") ts.tags = splitCsv(kv.value);
	if (kv.key === "label") ts.label = kv.value;
}

// ── Utility ──────────────────────────────────────────────

function splitKV(line: string): { key: string; value: string } | null {
	const idx = line.indexOf(":");
	if (idx === -1) return null;
	const key = line.slice(0, idx).trim();
	const value = line
		.slice(idx + 1)
		.trim()
		.replace(/^["']|["']$/g, "");
	return { key, value };
}

function parseValue(line: string, prefix: string): string {
	return line
		.slice(prefix.length)
		.trim()
		.replace(/^["']|["']$/g, "");
}

export function buildDefaultConfig(): DashboardConfig {
	const config: DashboardConfig = {
		header: { text: "", font: "ANSI Shadow", color: "#8A5CF6", size: 1, enabled: false },
		stats: { enabled: false, items: [] },
		blocks: [],
		graph: { enabled: false, exclude: [] },
	};

	// Default 2-row, 3-column layout for fresh users:
	// Row 1: Stats | Clock
	// Row 2: Timeline | MOC Cards | Heatmap
	config.blocks.push(
		{
			kind: "row",
			columns: 3,
			proportion: "33/33/34",
			children: [
				{ kind: "column", children: [{ kind: "stats", config: config.stats } as StatsBlockConfig] },
				{ kind: "column", children: [] },
				{ kind: "column", children: [] },
			],
		},
		{
			kind: "row",
			columns: 3,
			proportion: "33/34/33",
			children: [
				{ kind: "column", children: [] },
				{ kind: "column", children: [] },
				{ kind: "column", children: [] },
			],
		},
	);

	return config;
}
