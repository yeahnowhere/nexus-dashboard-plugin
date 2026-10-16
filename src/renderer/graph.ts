import type { App } from "obsidian";
import { parseDashboard } from "../parser";
import { mapWithConcurrency } from "../utils";
import type { DashboardBlock, DashboardConfig, NexusSettings } from "../types";
import type { RendererContext } from "./context";

/** Synthetic edges this plugin added to the metadata link cache, keyed `source\0target`. */
const injectedEdges = new Set<string>();

/** Per-dashboard-file scan cache: edges derived from its last-seen content. */
interface DashboardScanEntry {
	content: string;
	edges: string[];
}

const dashboardScanCache = new Map<string, DashboardScanEntry>();
/** Settings fingerprint the cache was built against (moc list + graph toggle). */
let scanSignature = "";
/** False until the first scan completes; forces one full pass before incrementals. */
let scanInitialized = false;

function edgeKey(source: string, target: string): string {
	return source + "\u0000" + target;
}

/** Edges depend on the moc list and the graph toggle, so a change invalidates all. */
function graphSettingsSignature(settings: NexusSettings): string {
	return `${settings.showGraph ? 1 : 0}|${settings.mocs.map((m) => m.path).join("\u0000")}`;
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

	// Only re-trigger Obsidian's graph recompute when an edge is actually new;
	// this runs on every dashboard rebuild, and "resolved" is expensive.
	let changed = false;
	for (const p of paths) {
		const file = ctx.app.vault.getAbstractFileByPath(p);
		if (file) {
			const before = resolvedLinks[sourcePath][p] ?? 0;
			resolvedLinks[sourcePath][p] = Math.max(before, 1);
			injectedEdges.add(edgeKey(sourcePath, p));
			if (before < 1) changed = true;
		}
	}

	if (changed) {
		ctx.app.metadataCache.trigger("resolved");
	}
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
	dashboardScanCache.clear();
	scanSignature = "";
	scanInitialized = false;
}

/**
 * Scan the vault for `nexus-dashboard` blocks and inject their card paths into
 * the metadata link cache so Graph View shows the dashboard → MOC → card
 * relationships without any dashboard file needing to be open.
 *
 * Pass `changedPaths` to scan incrementally: only those files are re-read from
 * the vault, while every other dashboard keeps its cached edges. The very first
 * scan always reads everything once (to discover which files are dashboards),
 * so callers don't need to track that — just report what changed.
 */
export async function injectAllGraphLinks(
	app: App,
	settings: NexusSettings,
	changedPaths?: string[],
): Promise<void> {
	const resolvedLinks = app.metadataCache.resolvedLinks;
	const incremental = scanInitialized && changedPaths !== undefined;

	// Settings that affect edges (moc list / graph toggle) change edges for
	// files that themselves didn't change, so every cached entry must be
	// rebuilt. The cached content is reused, so this needs no vault read.
	const signature = graphSettingsSignature(settings);
	const settingsChanged = signature !== scanSignature;
	if (settingsChanged) scanSignature = signature;

	// Incremental refresh that saw no relevant change and no settings change:
	// the cache is already valid, so there is nothing to re-derive. This makes
	// refreshes cheap when graph injection is off (or nothing that matters
	// changed) instead of re-walking the vault. First scans and settings
	// changes fall through.
	if (incremental && !settingsChanged && (changedPaths?.length ?? 0) === 0) return;

	const mdFiles = app.vault.getMarkdownFiles();
	const livePaths = new Set(mdFiles.map((f) => f.path));
	for (const path of [...dashboardScanCache.keys()]) {
		if (!livePaths.has(path)) dashboardScanCache.delete(path);
	}

	// A full scan reads every file; an incremental scan reads only the paths
	// reported as changed (still present in the vault). These reads are
	// in-memory (cachedRead does no disk I/O) and concurrency-limited.
	const dirty = incremental ? new Set(changedPaths ?? []) : null;
	const readTargets = dirty ? mdFiles.filter((f) => dirty.has(f.path)) : mdFiles;
	const readContents = await mapWithConcurrency(readTargets, 16, (f) => app.vault.cachedRead(f));
	const freshContent = new Map<string, string>();
	for (let i = 0; i < readTargets.length; i++) {
		freshContent.set(readTargets[i].path, readContents[i] ?? "");
	}

	for (const file of mdFiles) {
		const fresh = freshContent.get(file.path);
		const cached = dashboardScanCache.get(file.path);
		const content = fresh ?? cached?.content;

		// Never seen and not re-read this pass: it can't contain a block.
		if (content === undefined) continue;

		if (!content.includes("```nexus-dashboard")) {
			dashboardScanCache.delete(file.path);
			continue;
		}

		// Content unchanged and settings stable: reuse the cached edges (this
		// is what makes incremental scans cheap — no re-parse).
		if (cached && cached.content === content && !settingsChanged) continue;

		const edges: string[] = [];
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
				edges.push(edgeKey(file.path, p));
			}
		}

		dashboardScanCache.set(file.path, { content, edges });
	}

	scanInitialized = true;

	// Re-validate target existence at aggregation time (cheap O(1) lookups) so
	// a target being created/deleted doesn't require the dashboard file to change.
	const nextEdges = new Set<string>();
	for (const entry of dashboardScanCache.values()) {
		for (const key of entry.edges) {
			const sep = key.indexOf("\u0000");
			const target = key.slice(sep + 1);
			if (app.vault.getAbstractFileByPath(target)) nextEdges.add(key);
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
