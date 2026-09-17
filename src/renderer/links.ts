import type { LinksConfig, ObsidianBookmarkItem } from "../types";
import type { RendererContext } from "./context";
import { renderDivider } from "./dividers";

/** Render quick-link pills. */
export function renderLinks(
	ctx: RendererContext,
	containerEl: HTMLElement,
	links: LinksConfig,
): void {
	if (links.items.length === 0) return;

	const wrapper = containerEl.createDiv({ cls: "nexus-links" });

	if (links.title) {
		renderDivider(ctx, wrapper, links.title);
	}

	const panel = wrapper.createDiv({ cls: "nexus-panel" });

	const pillsEl = panel.createDiv({ cls: "nexus-links-pills" });

	for (const item of links.items) {
		const pill = pillsEl.createEl("a", { cls: "nexus-link-pill" });
		pill.href = item.url;
		pill.target = "_blank";
		pill.rel = "noopener";

		pill.createEl("span", { text: item.label || item.url, cls: "nexus-link-pill-label" });
	}
}

/** Flatten nested bookmark groups into a single-level array. */
export function flattenBookmarks(items: ObsidianBookmarkItem[]): ObsidianBookmarkItem[] {
	const result: ObsidianBookmarkItem[] = [];
	for (const item of items) {
		if (item.type === "group") {
			if (item.items) {
				result.push(...flattenBookmarks(item.items));
			}
		} else {
			result.push(item);
		}
	}
	return result;
}

/** Convert an ObsidianBookmarkItem to a LinkItem (or null if unsupported). */
export function bookmarkToLinkItem(
	ctx: RendererContext,
	bookmark: ObsidianBookmarkItem,
): { url: string; label: string } | null {
	const vaultName = encodeURIComponent(ctx.app.vault.getName() || "");
	switch (bookmark.type) {
		case "file":
		case "heading":
		case "block": {
			if (!bookmark.path) return null;
			let url = `obsidian://open?vault=${vaultName}&file=${encodeURIComponent(bookmark.path)}`;
			if (bookmark.subpath) {
				url += encodeURIComponent(bookmark.subpath);
			}
			const name =
				bookmark.path
					.split("/")
					.pop()
					?.replace(/\.[^/.]+$/, "") || bookmark.title;
			return { url, label: name };
		}
		case "folder": {
			if (!bookmark.path) return null;
			const url = `obsidian://open?vault=${vaultName}&file=${encodeURIComponent(bookmark.path)}`;
			const name = bookmark.path.split("/").pop() || bookmark.title;
			return { url, label: name };
		}
		case "search": {
			const query = bookmark.query || bookmark.title;
			const url = `obsidian://search?vault=${vaultName}&query=${encodeURIComponent(query)}`;
			return { url, label: query };
		}
		case "url": {
			if (!bookmark.url) return null;
			return { url: bookmark.url, label: bookmark.title };
		}
		default:
			return null;
	}
}

/**
 * Reads bookmarks from Obsidian's built-in Bookmarks plugin.
 * Returns a LinksConfig block, or null if no bookmarks or plugin unavailable.
 */
export function buildBookmarkLinks(ctx: RendererContext): LinksConfig | null {
	try {
		const internalPlugins = ctx.app.internalPlugins;
		if (!internalPlugins) return null;

		const bookmarkPlugin = internalPlugins.plugins?.["bookmarks"];
		if (!bookmarkPlugin?.enabled) return null;

		const instance = bookmarkPlugin.instance;
		if (!instance) return null;

		const items: ObsidianBookmarkItem[] = instance.getBookmarks?.() ?? instance.data?.items ?? [];
		if (!items || items.length === 0) return null;

		const flat = flattenBookmarks(items);
		const linkItems = flat
			.map((b) => bookmarkToLinkItem(ctx, b))
			.filter((l): l is { url: string; label: string } => l !== null);

		if (linkItems.length === 0) return null;

		return {
			kind: "links",
			title: "Bookmarks",
			columns: 1,
			items: linkItems,
		} as LinksConfig;
	} catch {
		return null;
	}
}
