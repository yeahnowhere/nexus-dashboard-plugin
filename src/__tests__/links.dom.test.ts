// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import {
	renderLinks,
	buildBookmarkLinks,
	flattenBookmarks,
	bookmarkToLinkItem,
} from "../renderer/links";
import { makeContext } from "./helpers/render-context";
import type { LinksConfig } from "../types";

function host(): HTMLElement {
	return document.createElement("div");
}

function makeLinksConfig(overrides: Partial<LinksConfig> = {}): LinksConfig {
	return { kind: "links", title: "", columns: 1, items: [], ...overrides };
}

describe("renderLinks", () => {
	it("renders one .nexus-link-pill per item with href/target/rel", () => {
		const ctx = makeContext();
		const el = host();
		renderLinks(
			ctx,
			el,
			makeLinksConfig({
				items: [{ url: "https://example.com", label: "Example" }, { url: "https://obsidian.md" }],
			}),
		);

		const pills = el.querySelectorAll<HTMLAnchorElement>(".nexus-link-pill");
		expect(pills.length).toBe(2);
		expect(pills[0]?.href).toBe("https://example.com/");
		expect(pills[0]?.target).toBe("_blank");
		expect(pills[0]?.rel).toBe("noopener");
		expect(pills[0]?.textContent).toBe("Example");
		expect(pills[1]?.textContent).toBe("https://obsidian.md");
	});

	it("renders no icon pills", () => {
		const ctx = makeContext();
		const el = host();
		renderLinks(ctx, el, makeLinksConfig({ items: [{ url: "https://example.com" }] }));

		const icon = el.querySelector(".nexus-link-pill-icon");
		expect(icon).toBeNull();
	});

	it("renders nothing when the item list is empty", () => {
		const ctx = makeContext();
		const el = host();
		renderLinks(ctx, el, makeLinksConfig());
		expect(el.querySelector(".nexus-links")).toBeNull();
	});

	it("renders a divider title when one is configured", () => {
		const ctx = makeContext();
		const el = host();
		renderLinks(ctx, el, makeLinksConfig({ title: "LINKS", items: [{ url: "https://x.com" }] }));

		const label = el.querySelector(".nexus-section-divider-label");
		expect(label?.textContent).toBe("LINKS");
	});
});

describe("flattenBookmarks", () => {
	it("flattens nested groups into a single-level array", () => {
		const flat = flattenBookmarks([
			{ type: "url", url: "https://a.com", title: "A" },
			{
				type: "group",
				title: "G",
				items: [
					{ type: "url", url: "https://b.com", title: "B" },
					{
						type: "group",
						title: "Nested",
						items: [{ type: "url", url: "https://c.com", title: "C" }],
					},
				],
			},
		]);
		expect(flat).toEqual([
			{ type: "url", url: "https://a.com", title: "A" },
			{ type: "url", url: "https://b.com", title: "B" },
			{ type: "url", url: "https://c.com", title: "C" },
		]);
	});
});

describe("bookmarkToLinkItem", () => {
	it("maps url bookmarks", () => {
		const ctx = makeContext();
		const result = bookmarkToLinkItem(ctx, {
			type: "url",
			url: "https://obsidian.md",
			title: "Obsidian",
		});
		expect(result).toEqual({ url: "https://obsidian.md", label: "Obsidian" });
	});

	it("maps file bookmarks to an obsidian://open URL", () => {
		const ctx = makeContext();
		const result = bookmarkToLinkItem(ctx, {
			type: "file",
			title: "Deep",
			path: "Projects/Deep.md",
		});
		expect(result).toEqual({
			url: "obsidian://open?vault=Test%20Vault&file=Projects%2FDeep.md",
			label: "Deep",
		});
	});

	it("maps folder bookmarks to an obsidian://open URL", () => {
		const ctx = makeContext();
		const result = bookmarkToLinkItem(ctx, {
			type: "folder",
			title: "Deep",
			path: "Projects/Deep",
		});
		expect(result).toEqual({
			url: "obsidian://open?vault=Test%20Vault&file=Projects%2FDeep",
			label: "Deep",
		});
	});

	it("maps search bookmarks to an obsidian://search URL", () => {
		const ctx = makeContext();
		const result = bookmarkToLinkItem(ctx, {
			type: "search",
			title: "daily note",
			query: "daily note",
		});
		expect(result).toEqual({
			url: "obsidian://search?vault=Test%20Vault&query=daily%20note",
			label: "daily note",
		});
	});

	it("returns null for unsupported bookmarks", () => {
		const ctx = makeContext();
		expect(bookmarkToLinkItem(ctx, { type: "url", title: "no url" })).toBeNull();
		expect(bookmarkToLinkItem(ctx, { type: "file", title: "no path" })).toBeNull();
		expect(bookmarkToLinkItem(ctx, { type: "unknown", title: "?" })).toBeNull();
	});
});

describe("buildBookmarkLinks", () => {
	it("returns null when internalPlugins is unavailable", () => {
		const ctx = makeContext();
		expect(buildBookmarkLinks(ctx)).toBeNull();
	});

	it("returns null when the bookmarks plugin is missing or disabled", () => {
		const ctx = makeContext({ app: { internalPlugins: {} as never } });
		expect(buildBookmarkLinks(ctx)).toBeNull();

		const disabled = makeContext({
			app: {
				internalPlugins: {
					plugins: { bookmarks: { enabled: false, instance: undefined } },
				} as never,
			},
		});
		expect(buildBookmarkLinks(disabled)).toBeNull();
	});

	it("maps url/file/folder bookmarks from the plugin instance", () => {
		const ctx = makeContext({
			app: {
				internalPlugins: {
					plugins: {
						bookmarks: {
							enabled: true,
							instance: {
								getBookmarks: () => [
									{ type: "url", url: "https://obsidian.md", title: "Obsidian" },
									{ type: "file", path: "Notes/A.md", title: "A" },
									{ type: "folder", path: "Journal", title: "Journal" },
								],
							},
						},
					},
				} as never,
			},
		});

		const result = buildBookmarkLinks(ctx);
		expect(result).not.toBeNull();
		expect(result?.title).toBe("Bookmarks");
		expect(result?.items).toEqual([
			{ url: "https://obsidian.md", label: "Obsidian" },
			{ url: "obsidian://open?vault=Test%20Vault&file=Notes%2FA.md", label: "A" },
			{ url: "obsidian://open?vault=Test%20Vault&file=Journal", label: "Journal" },
		]);
	});

	it("returns null when bookmarks exist but none are mappable", () => {
		const ctx = makeContext({
			app: {
				internalPlugins: {
					plugins: {
						bookmarks: {
							enabled: true,
							instance: { getBookmarks: () => [{ type: "file", title: "no path" }] },
						},
					},
				} as never,
			},
		});
		expect(buildBookmarkLinks(ctx)).toBeNull();
	});

	it("returns null when the instance exposes no bookmarks", () => {
		const ctx = makeContext({
			app: {
				internalPlugins: {
					plugins: {
						bookmarks: { enabled: true, instance: { data: { items: [] } } },
					},
				} as never,
			},
		});
		expect(buildBookmarkLinks(ctx)).toBeNull();
	});
});
