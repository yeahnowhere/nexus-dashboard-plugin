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
import {
	ensureExtension as ensureExt,
	safeParseInt,
	splitCsv,
	applyListConfigKV,
	parseBool,
} from "./utils";

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

/** Contexts in which a `- type:` line may begin a card. */
const CARD_CONTEXTS = new Set<ParseContext>([
	"root",
	"section",
	"cards",
	"column",
	"row",
	"section-divider",
]);

/**
 * Keywords that open a top-level dashboard section — either a config area
 * (`header`/`stats`/`graph`) or a renderable content block.
 */
export const DASHBOARD_KEYWORDS = [
	"header",
	"stats",
	"graph",
	"divider",
	"section",
	"links",
	"row",
	"column",
	"vault-activity",
	"filetypes",
	"heatmap",
	"timeline",
	"clock",
	"tasks",
] as const;

/**
 * Content blocks that live in `DashboardConfig.blocks` (i.e. everything except
 * the `header`/`stats`/`graph` config areas).
 */
export const CONTENT_BLOCK_KEYWORDS = [
	"section",
	"divider",
	"links",
	"row",
	"column",
	"vault-activity",
	"heatmap",
	"timeline",
	"clock",
	"filetypes",
	"tasks",
] as const;

/**
 * Whether a code block declares any renderable content block. Used to decide
 * between the settings-driven layout and an explicit block list.
 * @param source - Raw code-block text
 * @returns `true` if any `CONTENT_BLOCK_KEYWORDS` marker (`section:`, …) is present
 */
export function hasBlockMarkers(source: string): boolean {
	return CONTENT_BLOCK_KEYWORDS.some((keyword) => source.includes(keyword + ":"));
}

/**
 * Parse the body of a ```` ```nexus-dashboard ```` code block into a
 * `DashboardConfig`.
 *
 * The grammar is a small YAML-like, indentation-tolerant key/value language:
 * a line ending in `:` opens a named context (`section:`, `row:`, `heatmap:`, …)
 * and its `key: value` children configure that block. `- type:` begins a card;
 * card/block keys are read relative to the current context. Unknown keys are
 * ignored, and an empty block falls back to {@link buildDefaultConfig}.
 *
 * @param raw - Raw text inside the code block (may be empty or whitespace)
 * @returns A fully-populated `DashboardConfig`; never throws on malformed input
 */
export function parseDashboard(raw: string): DashboardConfig {
	const trimmed = raw.trim();
	if (!trimmed) {
		return buildDefaultConfig();
	}
	return new DashboardParser().parse(trimmed);
}

/** A fresh `DashboardConfig` with header/stats/graph areas initialised. */
function emptyConfig(): DashboardConfig {
	return {
		header: { text: "", font: "", color: "", size: 1, enabled: false },
		stats: { enabled: false, items: [] },
		blocks: [],
		graph: { enabled: false, exclude: [] },
	};
}

/**
 * Stateful line-by-line parser for dashboard code blocks. Instantiated fresh per
 * {@link parseDashboard} call so no state leaks between parses.
 */
class DashboardParser {
	private config: DashboardConfig = emptyConfig();
	private context: ParseContext = "root";
	private currentDivider: DividerBlockConfig | null = null;
	private currentSection: SectionConfig | null = null;
	private currentCard: Partial<CardConfig> | null = null;
	private currentLinks: LinksConfig | null = null;
	private currentLinkItem: Partial<LinkItem> | null = null;
	private currentStatItem: Partial<StatItem> | null = null;
	private currentRow: RowConfig | null = null;
	private currentRowSectionsRemaining = 0;
	private currentColumn: ColumnConfig | null = null;
	private columnInsideRow = false;
	private columnIndent = -1;
	private currentVaultActivity: VaultActivityConfig | null = null;
	private currentHeatmap: HeatmapConfig | null = null;
	private currentTimeline: TimelineConfig | null = null;
	private currentClock: ClockConfig | null = null;
	private currentFileTypeChart: FileTypeChartConfig | null = null;
	private currentTaskSummary: TaskSummaryConfig | null = null;

	parse(trimmed: string): DashboardConfig {
		const lines = trimmed.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].replace(/\r$/, "");
			const indent = line.search(/\S/);
			let t = line.trim();
			if (!t || t.startsWith("#")) continue;

			// Strip YAML list prefix for known keywords (e.g. "- section:" → "section:")
			if (t.startsWith("- ")) {
				const stripped = t.slice(2);
				if (DASHBOARD_KEYWORDS.some((keyword) => stripped.startsWith(keyword + ":"))) {
					t = stripped;
				}
			}

			this.handleLine(t, indent);
		}

		// Flush trailing block
		this.flushCurrent();
		this.flushColumn();
		this.flushRow();

		return this.config;
	}

	/** Dispatch a single trimmed, non-empty, non-comment line. */
	private handleLine(t: string, indent: number): void {
		if (this.handleStructuralDirective(t, indent)) return;
		if (this.handleLeafDirective(t)) return;
		if (this.handleEntryDirective(t)) return;

		// ── Key-value parsing ─────────────────────────────
		const kv = splitKV(t);
		if (!kv) return;
		this.applyKV(kv);
	}

	/** Context-switching directives (header/stats/graph/divider/section/row/column). */
	private handleStructuralDirective(t: string, indent: number): boolean {
		if (t === "header:") {
			this.flushCurrent();
			this.flushColumn();
			this.context = "header";
			return true;
		}
		if (t.startsWith("stats:") && t.length > 6) {
			this.flushCurrent();
			this.flushColumn();
			const val = t.slice(6).trim();
			this.config.stats.enabled = parseBool(val);
			this.context = "stats";
			return true;
		}
		if (t === "stats:") {
			this.flushCurrent();
			this.flushColumn();
			this.context = "stats";
			return true;
		}
		if (t === "graph:") {
			this.flushCurrent();
			this.flushColumn();
			this.context = "graph";
			return true;
		}
		if (t === "divider:") {
			if (this.context === "section" || this.context === "cards") {
				if (this.currentSection && this.currentSection.divider) {
					// Already has a divider — flush section first, create standalone divider
					this.flushCurrent();
					this.flushColumn();
					this.context = "divider";
					this.currentDivider = { kind: "divider", title: "", type: undefined };
					return true;
				}
				// First divider for this section — attach it
				if (this.currentSection) {
					this.currentSection.divider = { kind: "divider", title: "", type: undefined };
				}
				this.context = "section-divider";
				return true;
			}
			this.flushCurrent();
			this.flushColumn();
			this.context = "divider";
			this.currentDivider = { kind: "divider", title: "", type: undefined };
			return true;
		}

		// ── Section inside column (before root section:) ───
		if (t === "section:" && this.context === "column") {
			this.flushCard();
			this.currentSection = { kind: "section", columns: 2, cards: [] };
			this.context = "section";
			return true;
		}

		// ── Row inside column (nested, before root row:) ───
		if (t === "row:" && this.context === "column") {
			this.flushCard();
			this.flushSection();
			this.context = "row";
			this.currentRow = { kind: "row", children: [] };
			this.currentRowSectionsRemaining = 2;
			return true;
		}

		if (t === "section:") {
			// If a divider was just defined (context === "divider"), attach it to this section
			// instead of flushing it as a standalone divider
			const pendingDivider =
				this.context === "divider" && this.currentDivider ? this.currentDivider : null;
			if (pendingDivider) {
				this.currentDivider = null;
			}
			this.flushCurrent();
			if (
				this.columnInsideRow &&
				this.currentRow &&
				this.currentColumn &&
				this.currentColumn.children.length > 0 &&
				indent <= this.columnIndent
			) {
				this.flushColumn();
			}
			this.context = "section";
			this.currentSection = { kind: "section", columns: 2, cards: [] };
			if (pendingDivider) {
				this.currentSection.divider = pendingDivider;
			}
			return true;
		}
		if (t === "cards:") {
			if (this.context !== "section") {
				this.context = "cards";
			}
			return true;
		}

		// ── Links block ─────────────────────────────────
		if (t === "links:") {
			const label = this.takePendingLabel() || this.beginLeafBlock();
			this.context = "links";
			this.currentLinks = { kind: "links", items: [] };
			if (label) {
				this.currentLinks.title = label;
			}
			return true;
		}

		// ── Row marker ──────────────────────────────────
		if (t === "row:") {
			this.flushCurrent();
			this.flushColumn();
			this.context = "row";
			this.currentRow = { kind: "row", children: [] };
			this.currentRowSectionsRemaining = 2; // default, overridden by columns:
			return true;
		}

		// ── Column inside row (nested, before root column:) ───
		if (t === "column:" && this.context === "row") {
			this.flushCard();
			this.flushSection();
			this.columnInsideRow = true;
			this.columnIndent = indent;
			this.currentRowSectionsRemaining--;
			this.context = "column";
			this.currentColumn = { kind: "column", children: [] };
			return true;
		}

		// ── Column marker ────────────────────────────────
		if (t === "column:") {
			this.flushCurrent();
			this.flushColumn();
			// If still inside a row (multiple columns in a row), maintain row context
			if (this.currentRow && this.currentRowSectionsRemaining > 0) {
				this.columnInsideRow = true;
				this.columnIndent = indent;
				this.currentRowSectionsRemaining--;
			}
			this.context = "column";
			this.currentColumn = { kind: "column", children: [] };
			return true;
		}

		return false;
	}

	/**
	 * Leaf blocks (links/vault-activity/heatmap/timeline/clock/filetypes/tasks)
	 * are nestable inside rows/columns. Each starts by flushing any in-progress
	 * section into its container, then either keeps the open column/row slot
	 * open (nesting) or closes the current column for a standalone block.
	 */
	private handleLeafDirective(t: string): boolean {
		if (t === "vault-activity:") {
			const label = this.takePendingLabel() || this.beginLeafBlock();
			this.context = "vault-activity";
			this.currentVaultActivity = { kind: "vault-activity", show: true, ...(label ? { label } : {}) };
			return true;
		}
		if (t === "heatmap:") {
			const label = this.takePendingLabel() || this.beginLeafBlock();
			this.context = "heatmap";
			this.currentHeatmap = { kind: "heatmap", show: true, ...(label ? { label } : {}) };
			return true;
		}
		if (t === "timeline:") {
			const label = this.takePendingLabel() || this.beginLeafBlock();
			this.context = "timeline";
			this.currentTimeline = { kind: "timeline", show: true, ...(label ? { label } : {}) };
			return true;
		}
		if (t === "clock:") {
			const label = this.takePendingLabel() || this.beginLeafBlock();
			this.context = "clock";
			this.currentClock = { kind: "clock", show: true, ...(label ? { label } : {}) };
			return true;
		}
		if (t === "filetypes:") {
			const label = this.takePendingLabel() || this.beginLeafBlock();
			this.context = "filetypes";
			this.currentFileTypeChart = { kind: "filetypes", show: true, ...(label ? { label } : {}) };
			return true;
		}
		if (t === "tasks:") {
			const label = this.takePendingLabel() || this.beginLeafBlock();
			this.context = "tasks";
			this.currentTaskSummary = { kind: "tasks", show: true, ...(label ? { label } : {}) };
			return true;
		}
		return false;
	}

	/** New list-entry directives (card / link item / stat item). */
	private handleEntryDirective(t: string): boolean {
		// ── New card entry ────────────────────────────────
		// Only start a card when the current context can hold cards; a `- type:`
		// inside e.g. a links/stats/leaf block would otherwise silently switch
		// the parser into cards mode and hijack the following keys.
		if (t.startsWith("- type:") && CARD_CONTEXTS.has(this.context)) {
			this.flushCard();
			this.currentCard = { type: parseValue(t, "- type:") === "mini" ? "mini" : "big" };
			this.context = "cards";
			return true;
		}

		// ── New link item entry ────────────────────────────
		if (t.startsWith("- url:") && this.context === "links") {
			this.flushLinkItem();
			this.currentLinkItem = { url: parseValue(t, "- url:") };
			return true;
		}

		// ── New stats item entry ───────────────────────────
		if (this.context === "stats" && (t.startsWith("- label:") || t.startsWith("- path:"))) {
			this.flushStatItem();
			this.currentStatItem = {};
			if (t.startsWith("- label:")) {
				this.currentStatItem.label = parseValue(t, "- label:");
			} else {
				this.currentStatItem.folder = parseValue(t, "- path:");
			}
			return true;
		}

		return false;
	}

	/**
	 * Capture a pending divider title that should become a leaf block's label
	 * (a `divider:` written immediately before the leaf, mirroring the old
	 * `links:` behavior). Must run before `beginLeafBlock()` so the divider
	 * isn't flushed to the top level.
	 */
	private takePendingLabel(): string | undefined {
		if (this.context === "divider" && this.currentDivider) {
			const title = this.currentDivider.title;
			this.currentDivider = null;
			return title || undefined;
		}
		return undefined;
	}

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
	private beginLeafBlock(): string | undefined {
		// A leaf block directly following an empty section marker (e.g.
		// `- section:\n  vault-activity:`) should take that section's place in the
		// container instead of leaving an invisible spacer behind it. When the
		// section carries a divider, carry its title onto the leaf as a label so
		// the divider isn't lost when the section is released.
		let carried: string | undefined;
		if (this.currentSection && this.currentSection.cards.length === 0) {
			if (this.currentSection.divider?.title) {
				carried = this.currentSection.divider.title;
			}
			this.currentSection = null;
		}
		this.flushCurrent();
		if (!this.currentColumn && !(this.currentRow && this.currentRowSectionsRemaining > 0)) {
			this.flushColumn();
		}
		return carried;
	}

	/** Create the new-note config object on first mention of any `new-note` key. */
	private ensureStatsNewNote(): NonNullable<DashboardConfig["stats"]["newNote"]> {
		if (!this.config.stats.newNote) {
			this.config.stats.newNote = { enabled: false, label: "+ New Note", folder: "", template: "" };
		}
		return this.config.stats.newNote;
	}

	/** Apply a `key: value` pair to the block selected by the current context. */
	private applyKV(kv: { key: string; value: string }): void {
		switch (this.context) {
			case "header":
				if (!this.config.header.enabled) {
					this.config.header = { text: "", font: "", color: "", size: 1, enabled: true };
				}
				if (kv.key === "size") {
					if (kv.value === "small") {
						this.config.header.size = 0.6;
					} else if (kv.value === "normal") {
						this.config.header.size = 1;
					} else {
						const n = Number(kv.value);
						this.config.header.size = Number.isFinite(n) && n > 0 ? n : 1;
					}
				} else if (kv.key === "mobileSize") {
					const n = Number(kv.value);
					this.config.header.mobileSize = Number.isFinite(n) && n > 0 ? n : undefined;
				} else if (kv.key === "text" || kv.key === "font" || kv.key === "color" || kv.key === "align") {
					(this.config.header as unknown as Record<string, string | number | boolean | undefined>)[
						kv.key
					] = kv.value;
				}
				break;
			case "stats":
				if (kv.key === "show") {
					this.config.stats.enabled = parseBool(kv.value);
				} else if (kv.key === "new-note") {
					this.ensureStatsNewNote().enabled = parseBool(kv.value);
				} else if (kv.key === "new-note-folder") {
					this.ensureStatsNewNote().folder = kv.value;
				} else if (kv.key === "new-note-template") {
					this.ensureStatsNewNote().template = kv.value;
				} else if (kv.key === "new-note-label") {
					this.ensureStatsNewNote().label = kv.value;
				} else if (
					kv.key === "label" ||
					kv.key === "path" ||
					kv.key === "folder" ||
					kv.key === "metric" ||
					kv.key === "scope" ||
					kv.key === "recursive"
				) {
					if (!this.currentStatItem) this.currentStatItem = {};
					if (kv.key === "label") {
						this.currentStatItem.label = kv.value;
					} else if (kv.key === "path" || kv.key === "folder") {
						this.currentStatItem.folder = kv.value;
					} else if (kv.key === "metric") {
						this.currentStatItem.metric = kv.value as StatMetric;
					} else if (kv.key === "scope") {
						this.currentStatItem.scope = kv.value as StatScope;
					} else if (kv.key === "recursive") {
						this.currentStatItem.recursive = parseBool(kv.value);
					}
				}
				break;
			case "divider":
				if (this.currentDivider) applyDividerKV(this.currentDivider, kv);
				break;
			case "section-divider":
				if (kv.key === "title" || kv.key === "type") {
					if (this.currentSection?.divider) applyDividerKV(this.currentSection.divider, kv);
				} else {
					// Not a divider key — revert to section context
					this.context = "section";
					if (this.currentSection) applySectionKV(this.currentSection, kv);
				}
				break;
			case "section":
				if (this.currentSection) applySectionKV(this.currentSection, kv);
				break;
			case "cards":
				if (this.currentCard) applyCardKV(this.currentCard, kv);
				break;
			case "graph":
				if (kv.key === "exclude") {
					this.config.graph.exclude = splitCsv(kv.value);
				} else if (kv.key === "showGraph") {
					this.config.graph.enabled = parseBool(kv.value);
				}
				break;
			case "links":
				if (this.currentLinkItem) {
					applyLinkItemKV(this.currentLinkItem, kv);
				} else if (this.currentLinks) {
					applyLinksKV(this.currentLinks, kv);
				}
				break;
			case "row":
				if (this.currentRow) {
					applyRowKV(this.currentRow, kv);
					if (kv.key === "columns") {
						this.currentRowSectionsRemaining = safeParseInt(kv.value, 2, 1, 4) ?? 2;
					}
				}
				break;
			case "column":
				if (this.currentColumn) {
					if (kv.key === "spacing") this.currentColumn.spacing = kv.value;
					if (kv.key === "align")
						this.currentColumn.align = kv.value as "left" | "center" | "right" | "stretch";
				}
				break;
			case "heatmap":
				if (this.currentHeatmap) applyHeatmapKV(this.currentHeatmap, kv);
				break;
			case "timeline":
				if (this.currentTimeline) applyTimelineKV(this.currentTimeline, kv);
				break;
			case "clock":
				if (this.currentClock) applyClockKV(this.currentClock, kv);
				break;
			case "filetypes":
				if (this.currentFileTypeChart) applyFileTypeChartKV(this.currentFileTypeChart, kv);
				break;
			case "tasks":
				if (this.currentTaskSummary) applyTaskSummaryKV(this.currentTaskSummary, kv);
				break;
			case "vault-activity":
				if (this.currentVaultActivity) {
					applyListConfigKV(this.currentVaultActivity, kv, {
						label: (val, t) => {
							(t as VaultActivityConfig).label = val;
						},
					});
				}
				break;
		}
	}

	/** Route a flushed block into the open container (column → row slot → top level). */
	private pushBlock(
		block:
			| LinksConfig
			| VaultActivityConfig
			| HeatmapConfig
			| TimelineConfig
			| ClockConfig
			| FileTypeChartConfig
			| TaskSummaryConfig,
	): void {
		if (this.currentColumn) {
			this.currentColumn.children.push(block);
			return;
		}
		if (this.currentRow && this.currentRowSectionsRemaining > 0) {
			this.currentRow.children.push(block);
			this.currentRowSectionsRemaining--;
			if (this.currentRowSectionsRemaining === 0) {
				this.flushRow();
			}
			return;
		}
		this.config.blocks.push(block);
	}

	private flushCurrent(): void {
		this.flushCard();
		this.flushLinkItem();
		this.flushStatItem();
		this.flushLinks();
		this.flushSection();
		this.flushDivider();
		this.flushVaultActivity();
		this.flushHeatmap();
		this.flushTimeline();
		this.flushClock();
		this.flushFileTypeChart();
		this.flushTaskSummary();
	}

	private flushCard(): void {
		if (this.currentSection && this.currentCard) {
			this.currentSection.cards.push(finalizeCard(this.currentCard));
			this.currentCard = null;
		}
	}

	private flushLinkItem(): void {
		if (this.currentLinks && this.currentLinkItem) {
			if (this.currentLinkItem.url) {
				this.currentLinks.items.push(finalizeLinkItem(this.currentLinkItem));
			}
			this.currentLinkItem = null;
		}
	}

	private flushStatItem(): void {
		if (this.currentStatItem) {
			if (this.currentStatItem.label || this.currentStatItem.folder) {
				this.config.stats.items.push(this.currentStatItem as StatItem);
			}
			this.currentStatItem = null;
		}
	}

	private flushLinks(): void {
		this.flushLinkItem();
		if (this.currentLinks) {
			this.pushBlock(this.currentLinks);
			this.currentLinks = null;
		}
	}

	private flushSection(): void {
		this.flushCard();
		if (this.currentSection) {
			if (this.currentColumn) {
				this.currentColumn.children.push(this.currentSection);
			} else if (this.currentRow && this.currentRowSectionsRemaining > 0) {
				this.currentRow.children.push(this.currentSection);
				this.currentRowSectionsRemaining--;
				if (this.currentRowSectionsRemaining === 0) {
					this.flushRow();
				}
			} else {
				this.config.blocks.push(this.currentSection);
			}
			this.currentSection = null;
		} else if (this.currentCard) {
			const implicitSection: SectionConfig = {
				kind: "section",
				columns: 2,
				cards: [finalizeCard(this.currentCard)],
			};
			if (this.currentColumn) {
				this.currentColumn.children.push(implicitSection);
			} else if (this.currentRow && this.currentRowSectionsRemaining > 0) {
				this.currentRow.children.push(implicitSection);
				this.currentRowSectionsRemaining--;
				if (this.currentRowSectionsRemaining === 0) {
					this.flushRow();
				}
			} else {
				this.config.blocks.push(implicitSection);
			}
			this.currentCard = null;
		}
	}

	private flushDivider(): void {
		if (this.currentDivider) {
			this.config.blocks.push(this.currentDivider);
			this.currentDivider = null;
		}
	}

	private flushRow(): void {
		if (this.currentRow) {
			if (this.currentRow.children.length > 0) {
				if (this.currentColumn) {
					this.currentColumn.children.push(this.currentRow);
				} else {
					this.config.blocks.push(this.currentRow);
				}
			}
			this.currentRow = null;
			this.currentRowSectionsRemaining = 0;
		}
	}

	private flushColumn(): void {
		if (this.currentColumn) {
			this.flushSection();
			if (this.currentColumn.children.length > 0) {
				if (this.columnInsideRow && this.currentRow) {
					this.currentRow.children.push(this.currentColumn);
					this.currentColumn = null;
					if (this.currentRowSectionsRemaining === 0) {
						this.flushRow();
					}
				} else {
					this.config.blocks.push(this.currentColumn);
				}
			}
			if (this.currentColumn) {
				this.currentColumn = null;
				this.columnInsideRow = false;
				this.columnIndent = -1;
			}
		}
	}

	private flushVaultActivity(): void {
		if (this.currentVaultActivity) {
			this.pushBlock(this.currentVaultActivity);
			this.currentVaultActivity = null;
		}
	}

	private flushHeatmap(): void {
		if (this.currentHeatmap) {
			this.pushBlock(this.currentHeatmap);
			this.currentHeatmap = null;
		}
	}

	private flushTimeline(): void {
		if (this.currentTimeline) {
			this.pushBlock(this.currentTimeline);
			this.currentTimeline = null;
		}
	}

	private flushClock(): void {
		if (this.currentClock) {
			this.pushBlock(this.currentClock);
			this.currentClock = null;
		}
	}

	private flushFileTypeChart(): void {
		if (this.currentFileTypeChart) {
			this.pushBlock(this.currentFileTypeChart);
			this.currentFileTypeChart = null;
		}
	}

	private flushTaskSummary(): void {
		if (this.currentTaskSummary) {
			this.pushBlock(this.currentTaskSummary);
			this.currentTaskSummary = null;
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
	if (kv.key === "height") {
		section.height = safeParseInt(kv.value, 0, 0) ?? 0;
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
	if (kv.key === "show") heatmap.show = parseBool(kv.value);
	if (kv.key === "weeks") {
		heatmap.weeks = safeParseInt(kv.value, undefined, 1);
	}
	if (kv.key === "label") heatmap.label = kv.value;
}

function applyTimelineKV(timeline: TimelineConfig, kv: { key: string; value: string }) {
	if (kv.key === "show") timeline.show = parseBool(kv.value);
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
	if (kv.key === "onlyMarkdown") timeline.onlyMarkdown = parseBool(kv.value);
	if (kv.key === "group") {
		timeline.group = kv.value === "file" ? "file" : "day";
	}
	if (kv.key === "relative") timeline.relative = parseBool(kv.value);
	if (kv.key === "showDate") timeline.showDate = parseBool(kv.value);
}

function applyClockKV(clock: ClockConfig, kv: { key: string; value: string }) {
	if (kv.key === "show") clock.show = parseBool(kv.value);
	if (kv.key === "timezone") clock.timezone = kv.value;
	if (kv.key === "showDate") clock.showDate = parseBool(kv.value);
	if (kv.key === "showSeconds") clock.showSeconds = parseBool(kv.value);
	if (kv.key === "format") clock.format = kv.value as "12h" | "24h";
	if (kv.key === "label") clock.label = kv.value;
}

function applyFileTypeChartKV(chart: FileTypeChartConfig, kv: { key: string; value: string }) {
	if (kv.key === "show") chart.show = parseBool(kv.value);
	if (kv.key === "label") chart.label = kv.value;
	if (kv.key === "path") chart.path = kv.value;
	if (kv.key === "height") {
		chart.maxLegendHeight = safeParseInt(kv.value, undefined, 1);
	}
}

function applyTaskSummaryKV(ts: TaskSummaryConfig, kv: { key: string; value: string }) {
	if (kv.key === "show") ts.show = parseBool(kv.value);
	if (kv.key === "progress") ts.showProgress = parseBool(kv.value);
	if (kv.key === "showList") ts.showList = parseBool(kv.value);
	if (kv.key === "due") ts.showDue = parseBool(kv.value);
	if (kv.key === "checkable") ts.checkable = parseBool(kv.value);
	if (kv.key === "count") {
		ts.count = safeParseInt(kv.value, undefined, 1);
	}
	if (kv.key === "path") ts.path = kv.value;
	if (kv.key === "tags") ts.tags = splitCsv(kv.value);
	if (kv.key === "label") ts.label = kv.value;
}

// ── Utility ──────────────────────────────────────────────

/**
 * Strip one pair of *matching* surrounding quotes. Mismatched quotes (e.g.
 * `"foo'`) are left intact rather than silently truncated.
 */
function stripQuotes(value: string): string {
	const first = value[0];
	if ((first === '"' || first === "'") && value.length >= 2 && value[value.length - 1] === first) {
		return value.slice(1, -1);
	}
	return value;
}

function splitKV(line: string): { key: string; value: string } | null {
	const idx = line.indexOf(":");
	if (idx === -1) return null;
	const key = line.slice(0, idx).trim();
	const value = stripQuotes(line.slice(idx + 1).trim());
	return { key, value };
}

function parseValue(line: string, prefix: string): string {
	return stripQuotes(line.slice(prefix.length).trim());
}

/**
 * Build the neutral base config used as a fallback for empty code blocks and as
 * the seed that {@link NexusRenderer} overrides with user settings.
 *
 * All optional blocks are disabled and `blocks` is empty, so callers control
 * exactly what renders.
 *
 * @returns A `DashboardConfig` with every block disabled
 */
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
