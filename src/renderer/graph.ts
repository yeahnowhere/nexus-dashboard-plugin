import type { DashboardBlock, DashboardConfig } from "../types";
import type { RendererContext } from "./context";

/** Recursively collect card paths from all block types */
export function collectCardPaths(
	ctx: RendererContext,
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
			collectCardPaths(ctx, block.children, paths, exclude);
		} else if (block.kind === "column") {
			collectCardPaths(ctx, block.children, paths, exclude);
		}
	}
}

/** Inject card paths into Obsidian's metadataCache for Graph View */
export function injectGraphLinks(ctx: RendererContext, config: DashboardConfig): void {
	const paths: string[] = [];
	const exclude = config.graph.exclude;
	collectCardPaths(ctx, config.blocks, paths, exclude);
	if (paths.length === 0) return;

	const sourcePath = ctx.sourcePath;
	const resolvedLinks = ctx.app.metadataCache.resolvedLinks;

	if (!resolvedLinks[sourcePath]) {
		resolvedLinks[sourcePath] = {};
	}

	for (const p of paths) {
		const file = ctx.app.vault.getAbstractFileByPath(p);
		if (file) {
			resolvedLinks[sourcePath][p] = (resolvedLinks[sourcePath][p] || 0) + 1;
		}
	}

	ctx.app.metadataCache.trigger("resolve", sourcePath);
}
