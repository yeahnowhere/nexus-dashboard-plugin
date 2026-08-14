import { Notice, TFile } from "obsidian";
import { computeStatValue, collectFileTags, dateStamp, statSummary, type StatFile } from "../stats";
import type { StatsConfig, NewNoteConfig } from "../types";
import type { RendererContext } from "./context";

/** Inline plus icon used by the "+ New Note" button. */
const PLUS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;

/** Render the stats bar (counts + optional "+ New Note" button). */
export function renderStatsBar(
	ctx: RendererContext,
	containerEl: HTMLElement,
	stats: StatsConfig,
): void {
	const bar = containerEl.createDiv({ cls: "nexus-stats" });
	const now = Date.now();

	// Snapshot the vault once per render (not per stat) so large vaults
	// don't get scanned N times. Tags are read lazily and memoized per path.
	const tFiles = ctx.app.vault.getFiles();
	const files: StatFile[] = tFiles.map((f) => ({
		path: f.path,
		extension: f.extension,
		size: f.stat.size,
		mtime: f.stat.mtime,
	}));
	const byPath = new Map(tFiles.map((f) => [f.path, f]));
	const tagCache = new Map<string, string[]>();
	const tagsOf = (path: string): string[] => {
		let cached = tagCache.get(path);
		if (cached === undefined) {
			const file = byPath.get(path);
			cached = file ? collectFileTags(ctx.app.metadataCache.getFileCache(file)) : [];
			tagCache.set(path, cached);
		}
		return cached;
	};

	for (const item of stats.items) {
		const value = computeStatValue(files, item, now, tagsOf);
		const card = bar.createEl("div", {
			cls: "nexus-stat-card",
			attr: { title: statSummary(item) },
		});
		card.createEl("span", { text: value, cls: "nexus-stat-num" });
		card.createEl("span", { text: item.label, cls: "nexus-stat-label" });
	}
	if (stats.newNote?.enabled) {
		renderNewNoteButton(ctx, bar, stats.newNote);
	}
}

function renderNewNoteButton(ctx: RendererContext, bar: HTMLElement, config: NewNoteConfig): void {
	const btn = bar.createEl("button", {
		cls: "nexus-stat-new-note",
		attr: { type: "button", "aria-label": "Create a new note" },
	});
	btn.innerHTML = PLUS_ICON_SVG;
	btn.createSpan({ text: config.label || "+ New Note", cls: "nexus-stat-new-note-label" });
	btn.addEventListener("click", () => void createNewNote(ctx, config));
}

async function createNewNote(ctx: RendererContext, config: NewNoteConfig): Promise<void> {
	const app = ctx.app;
	try {
		const folder = (config.folder || "").replace(/^\/+|\/+$/g, "");
		const fileName = `${dateStamp(new Date())}.md`;
		const targetPath = folder ? `${folder}/${fileName}` : fileName;

		const existing = app.vault.getAbstractFileByPath(targetPath);
		if (existing instanceof TFile) {
			await app.workspace.getLeaf("tab").openFile(existing);
			return;
		}

		if (folder && !app.vault.getAbstractFileByPath(folder)) {
			await app.vault.createFolder(folder);
		}

		let content = "";
		if (config.template) {
			const template = app.vault.getAbstractFileByPath(config.template);
			if (template instanceof TFile) {
				content = await app.vault.read(template);
			}
		}

		const file = await app.vault.create(targetPath, content);
		await app.workspace.getLeaf("tab").openFile(file);
	} catch (err) {
		// eslint-disable-next-line no-console
		console.error("[NEXUS] Failed to create new note:", err);
		new Notice("Nexus Dashboard: failed to create note");
	}
}
