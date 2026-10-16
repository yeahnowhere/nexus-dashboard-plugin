import type { App, TFile } from "obsidian";
import type { NexusSettings } from "../types";

/**
 * Per-render vault snapshot. Values are resolved lazily and memoized for the
 * lifetime of a single render pass, so N blocks scanning the vault pay for
 * one `getFiles()` / `getMarkdownFiles()` / recent-files sort per rebuild
 * instead of one each.
 */
export interface RenderSnapshot {
	/** Every vault file (`vault.getFiles()`), resolved once per render. */
	files(): TFile[];
	/** Markdown files only, resolved once per render. */
	markdownFiles(): TFile[];
	/** Files sorted newest-first, resolved once per render. */
	recentFiles(): TFile[];
}

/** Build a lazy, memoized snapshot for a single render pass. */
export function createRenderSnapshot(app: App, getRecentFiles: () => TFile[]): RenderSnapshot {
	let files: TFile[] | null = null;
	let markdownFiles: TFile[] | null = null;
	let recent: TFile[] | null = null;
	return {
		files: () => (files ??= app.vault.getFiles()),
		markdownFiles: () => (markdownFiles ??= app.vault.getMarkdownFiles()),
		recentFiles: () => (recent ??= getRecentFiles()),
	};
}

/** Dependency surface exposed to standalone component renderers. */
export interface RendererContext {
	app: App;
	settings: NexusSettings;
	sourcePath: string;
	snapshot: RenderSnapshot;
	getRecentFiles(): TFile[];
	saveSettings(): Promise<void>;
	rerender(): void;
	registerClockInterval(id: ReturnType<typeof setInterval>): void;
}
