import type { TFile } from "obsidian";
import type { FileTypeChartConfig } from "../types";
import type { RendererContext } from "./context";
import { renderDivider } from "./dividers";

/** Color palette (CSS vars) cycled across per-extension legend rows. */
export const FILETYPE_PALETTE = [
	"--nexus-ft-0",
	"--nexus-ft-1",
	"--nexus-ft-2",
	"--nexus-ft-3",
	"--nexus-ft-4",
	"--nexus-ft-5",
	"--nexus-ft-6",
	"--nexus-ft-7",
];

/** Filter vault files by an optional vault-relative folder path prefix (recursive). */
function filterByPath(files: TFile[], path: string | undefined): TFile[] {
	if (!path) return files;
	const needle = path.toLowerCase();
	return files.filter((f) => {
		const pathLower = f.path.toLowerCase();
		return pathLower === needle || pathLower.startsWith(needle + "/");
	});
}

/** Render the passive "Vault composition" stacked bar chart. */
export function renderFileTypeChart(
	ctx: RendererContext,
	containerEl: HTMLElement,
	config: FileTypeChartConfig,
): void {
	const label = config.label || (ctx.settings.showFileTypeChartDivider ? "FILE TYPES" : "");

	const files = filterByPath(ctx.app.vault.getFiles(), config.path);
	const total = files.length;
	if (total === 0) return;

	// Count files per distinct extension (lowercased), sorted by count desc.
	const perExt = new Map<string, number>();
	for (const file of files) {
		const ext = file.extension.toLowerCase();
		perExt.set(ext, (perExt.get(ext) || 0) + 1);
	}
	const items = Array.from(perExt.entries())
		.map(([ext, count]) => ({ label: ext || "(none)", count }))
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

	const wrapper = containerEl.createDiv({ cls: "nexus-section" });
	if (label) {
		renderDivider(ctx, wrapper, label);
	}

	const panel = wrapper.createDiv({ cls: "nexus-panel" });

	const root = panel.createDiv({ cls: "nexus-filetypes" });

	root.createDiv({ cls: "nexus-filetypes-total", text: `${total} files` });

	const bar = root.createDiv({ cls: "nexus-filetypes-bar" });
	for (let i = 0; i < items.length; i++) {
		const segment = bar.createDiv({ cls: "nexus-filetypes-bar-segment" });
		segment.style.width = `${(items[i].count / total) * 100}%`;
		segment.style.background = `var(${FILETYPE_PALETTE[i % FILETYPE_PALETTE.length]})`;
	}

	const legend = root.createDiv({ cls: "nexus-filetypes-legend" });
	const legendHeight = config.maxLegendHeight ?? ctx.settings.fileTypeLegendHeight;
	if (legendHeight > 0) {
		legend.style.maxHeight = `${legendHeight}px`;
	}
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const row = legend.createDiv({ cls: "nexus-filetypes-legend-row" });
		row.createDiv({ cls: "nexus-filetypes-legend-dot" }).style.background =
			`var(${FILETYPE_PALETTE[i % FILETYPE_PALETTE.length]})`;
		row.createDiv({ cls: "nexus-filetypes-legend-label", text: item.label });
		row.createDiv({ cls: "nexus-filetypes-legend-count", text: String(item.count) });
		row.createDiv({
			cls: "nexus-filetypes-legend-pct",
			text: `${Math.round((item.count / total) * 100)}%`,
		});
	}
}
