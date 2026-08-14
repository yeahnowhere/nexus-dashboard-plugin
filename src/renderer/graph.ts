import type { App, TFile } from "obsidian";
import { parseDashboard } from "../parser";
import type { DashboardBlock, DashboardConfig, NexusSettings } from "../types";
import type { RendererContext } from "./context";

/** Synthetic edges this plugin added to the metadata link cache, keyed `source\0target`. */
const injectedEdges = new Set<string>();

function edgeKey(source: string, target: string): string {
	return source + "\u0000" + target;
}

/** Recursively collect card paths from all block types, deduped */
function collectCardPathsFromBlocks(
	blocks: DashboardBlock[],
	paths: string[],
	exclude: string[],
): void {
	for (const block of blocks) {
		if (block.kind === "section") {
			for (const card of block.cards) {
				if (!paths.includes(card.path) && !exclude.some((ex) => card.path.includes(ex))) {
					paths.push(card.path);
				}
			}
		} else if (block.kind === "row") {
			collectCardPathsFromBlocks(block.children, paths, exclude);
		} else if (block.kind === "column") {
			collectCardPathsFromBlocks(block.children, paths, exclude);
		}
	}
}

/** Recursively collect card paths from all block types */
export function collectCardPaths(
	_ctx: RendererContext,
	blocks: DashboardBlock[],
	paths: string[],
	exclude: string[],
): void {
	collectCardPathsFromBlocks(blocks, paths, exclude);
}

/** Inject card paths into Obsidian's metadataCache for Graph View */
export function injectGraphLinks(ctx: RendererContext, config: DashboardConfig): void {
	const paths: string[] = [];
	const exclude = config.graph.exclude;
	collectCardPathsFromBlocks(config.blocks, paths, exclude);
	if (paths.length === 0) return;

	const sourcePath = ctx.sourcePath;
	const resolvedLinks = ctx.app.metadataCache.resolvedLinks;

	if (!resolvedLinks[sourcePath]) {
		resolvedLinks[sourcePath] = {};
	}

	for (const p of paths) {
		const file = ctx.app.vault.getAbstractFileByPath(p);
		if (file) {
			resolvedLinks[sourcePath][p] = Math.max(resolvedLinks[sourcePath][p] ?? 0, 1);
			injectedEdges.add(edgeKey(sourcePath, p));
		}
	}

	ctx.app.metadataCache.trigger("resolved");
}

/** Extract the raw source of every `nexus-dashboard` code block in a note. */
export function extractDashboardBlocks(content: string): string[] {
	const blocks: string[] = [];
	const re = /```nexus-dashboard\s*\n([\s\S]*?)```/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(content)) !== null) {
		blocks.push(match[1].trimEnd());
	}
	return blocks;
}

/**
 * Remove every synthetic edge this plugin injected into the metadata link
 * cache. Called on unload so disabling the plugin leaves no phantom links.
 */
export function clearInjectedGraphLinks(app: App): void {
	const resolvedLinks = app.metadataCache.resolvedLinks;
	for (const key of injectedEdges) {
		const sep = key.indexOf("\u0000");
		const source = key.slice(0, sep);
		const target = key.slice(sep + 1);
		const links = resolvedLinks[source];
		if (links && links[target] !== undefined) {
			delete links[target];
		}
	}
	injectedEdges.clear();
}

/**
 * Scan the whole vault for `nexus-dashboard` blocks and inject their card
 * paths into the metadata link cache so Graph View shows the dashboard →
 * MOC → card relationships without any dashboard file needing to be open.
 */
export async function injectAllGraphLinks(app: App, settings: NexusSettings): Promise<void> {
	const resolvedLinks = app.metadataCache.resolvedLinks;
	const candidates: TFile[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		const sections = cache?.sections;
		if (
			sections?.some((s) => s.type === "code" && (s as { info?: string }).info === "nexus-dashboard")
		) {
			candidates.push(file);
		}
	}

	const nextEdges = new Set<string>();
	for (const file of candidates) {
		const content = await app.vault.cachedRead(file);
		for (const source of extractDashboardBlocks(content)) {
			const empty = source.trim().length === 0;
			const parsed = parseDashboard(source);
			let enabled: boolean;
			let exclude: string[];
			if (empty) {
				enabled = settings.showGraph;
				exclude = [];
			} else if (source.includes("graph:")) {
				// Mirror the render-time merge: a `graph:` context overrides the
				// settings toggle (parser default `enabled` is false).
				const merged = { ...{ enabled: settings.showGraph, exclude: [] }, ...parsed.graph };
				enabled = merged.enabled;
				exclude = merged.exclude;
			} else {
				enabled = settings.showGraph;
				exclude = [];
			}
			if (!enabled) continue;

			const paths: string[] = [];
			if (empty) {
				for (const moc of settings.mocs) paths.push(moc.path);
			} else {
				collectCardPathsFromBlocks(parsed.blocks, paths, exclude);
			}

			for (const p of paths) {
				if (app.vault.getAbstractFileByPath(p)) {
					nextEdges.add(edgeKey(file.path, p));
				}
			}
		}
	}

	let changed = false;

	for (const key of injectedEdges) {
		if (nextEdges.has(key)) continue;
		const sep = key.indexOf("\u0000");
		const source = key.slice(0, sep);
		const target = key.slice(sep + 1);
		if (resolvedLinks[source]?.[target] === 1) {
			delete resolvedLinks[source][target];
			changed = true;
		}
	}

	for (const key of nextEdges) {
		const sep = key.indexOf("\u0000");
		const source = key.slice(0, sep);
		const target = key.slice(sep + 1);
		if (!resolvedLinks[source]) resolvedLinks[source] = {};
		const before = resolvedLinks[source][target] ?? 0;
		const after = Math.max(before, 1);
		resolvedLinks[source][target] = after;
		if (after !== before) changed = true;
	}

	injectedEdges.clear();
	for (const key of nextEdges) injectedEdges.add(key);

	if (changed) {
		app.metadataCache.trigger("resolved");
	}
}
