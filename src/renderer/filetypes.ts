import type { TFile } from "obsidian";
import type { FileTypeChartConfig } from "../types";
import type { RendererContext } from "./context";
import { renderDivider } from "./dividers";

/** Color ramp (strongest to lightest CSS vars) indexed by file-count level. */
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

/**
 * Map a file count to a palette index on a log scale. The largest count maps
 * to index 0 (strongest color) and smaller counts fan out toward the tail, so
 * a 1-file extension reads visibly lighter than a dominant one. Equal counts
 * always resolve to the same index.
 */
export function levelForCount(count: number, max: number, levels: number): number {
	if (max <= 0 || levels <= 1) return 0;
	const ratio = Math.log(count + 1) / Math.log(max + 1);
	return Math.min(levels - 1, Math.max(0, Math.round((1 - ratio) * (levels - 1))));
}

/** Render the passive "Vault composition" per-extension list. */
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
		.map(([ext, count]) => ({ label: ext || "no ext", count }))
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

	const wrapper = containerEl.createDiv({ cls: "nexus-section" });
	if (label) {
		renderDivider(ctx, wrapper, label);
	}

	const panel = wrapper.createDiv({ cls: "nexus-panel" });

	const root = panel.createDiv({ cls: "nexus-filetypes" });

	root.createDiv({ cls: "nexus-filetypes-total", text: `${total} files` });

	const legend = root.createDiv({ cls: "nexus-filetypes-legend" });
	const legendHeight = config.maxLegendHeight ?? ctx.settings.fileTypeLegendHeight;
	if (legendHeight > 0) {
		legend.style.maxHeight = `${legendHeight}px`;
	}
	const maxCount = items[0].count;
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const row = legend.createDiv({ cls: "nexus-filetypes-legend-row" });
		const level = levelForCount(item.count, maxCount, FILETYPE_PALETTE.length);
		row.createDiv({ cls: "nexus-filetypes-legend-dot" }).style.background =
			`var(${FILETYPE_PALETTE[level]})`;
		row.createDiv({ cls: "nexus-filetypes-legend-label", text: item.label });
		row.createDiv({ cls: "nexus-filetypes-legend-count", text: String(item.count) });
		row.createDiv({
			cls: "nexus-filetypes-legend-pct",
			text: `${Math.round((item.count / total) * 100)}%`,
		});
	}
}
