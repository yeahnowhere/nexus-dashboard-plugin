// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { collectCardPaths, injectGraphLinks } from "../renderer/graph";
import { makeContext } from "./helpers/render-context";
import type { CardConfig, DashboardBlock, DashboardConfig, SectionConfig } from "../types";

function card(path: string): CardConfig {
	return { type: "big", label: path, path, icon: "X" };
}

function section(paths: string[]): SectionConfig {
	return { kind: "section", columns: 1, cards: paths.map(card) };
}

function makeConfig(blocks: DashboardBlock[]): DashboardConfig {
	return {
		header: { text: "NEXUS", font: "monospace", color: "#fff", size: 1, enabled: true },
		stats: { enabled: false, items: [] },
		blocks,
		graph: { enabled: true, exclude: [] },
	};
}

function cacheOf(ctx: ReturnType<typeof makeContext>) {
	return ctx.app.metadataCache as unknown as {
		resolvedLinks: Record<string, Record<string, number>>;
		trigger: ReturnType<typeof vi.fn>;
	};
}

describe("injectGraphLinks", () => {
	it("injects all reachable card paths as weight-1 links under the source path", () => {
		const ctx = makeContext({
			files: [{ path: "MOC/Alpha.md" }, { path: "MOC/Beta.md" }, { path: "Note.md" }],
		});
		const rowBlock = {
			kind: "row",
			children: [{ kind: "column", children: [section(["Note.md"])] }],
		} as unknown as DashboardBlock;

		injectGraphLinks(
			ctx,
			makeConfig([section(["MOC/Alpha.md"]), rowBlock, section(["MOC/Beta.md"])]),
		);

		const cache = cacheOf(ctx);
		expect(cache.resolvedLinks["Dashboard.md"]).toEqual({
			"MOC/Alpha.md": 1,
			"Note.md": 1,
			"MOC/Beta.md": 1,
		});
	});

	it("fires the global resolved event instead of the per-file resolve event", () => {
		const ctx = makeContext({ files: [{ path: "MOC/Alpha.md" }] });
		injectGraphLinks(ctx, makeConfig([section(["MOC/Alpha.md"])]));

		const cache = cacheOf(ctx);
		expect(cache.trigger).toHaveBeenCalledWith("resolved");
		expect(cache.trigger).not.toHaveBeenCalledWith("resolve", "Dashboard.md");
	});

	it("does not accumulate synthetic link weights on re-render", () => {
		const ctx = makeContext({ files: [{ path: "MOC/Alpha.md" }] });
		const config = makeConfig([section(["MOC/Alpha.md"])]);

		injectGraphLinks(ctx, config);
		injectGraphLinks(ctx, config);

		expect(cacheOf(ctx).resolvedLinks["Dashboard.md"]["MOC/Alpha.md"]).toBe(1);
	});

	it("leaves a pre-existing higher weight untouched", () => {
		const ctx = makeContext({
			files: [{ path: "MOC/Alpha.md" }],
			resolvedLinks: { "Dashboard.md": { "MOC/Alpha.md": 5 } },
		});

		injectGraphLinks(ctx, makeConfig([section(["MOC/Alpha.md"])]));

		expect(cacheOf(ctx).resolvedLinks["Dashboard.md"]["MOC/Alpha.md"]).toBe(5);
	});

	it("skips card paths that do not exist in the vault", () => {
		const ctx = makeContext({ files: [{ path: "Note.md" }] });
		injectGraphLinks(ctx, makeConfig([section(["Missing.md", "Note.md"])]));

		expect(cacheOf(ctx).resolvedLinks["Dashboard.md"]).toEqual({ "Note.md": 1 });
	});

	it("respects graph.exclude", () => {
		const ctx = makeContext({ files: [{ path: "MOC/Alpha.md" }, { path: "Note.md" }] });
		const config = makeConfig([section(["MOC/Alpha.md", "Note.md"])]);
		config.graph.exclude = ["MOC"];

		injectGraphLinks(ctx, config);

		expect(cacheOf(ctx).resolvedLinks["Dashboard.md"]).toEqual({ "Note.md": 1 });
	});

	it("is a no-op when there are no card paths", () => {
		const ctx = makeContext({ files: [{ path: "Note.md" }] });
		injectGraphLinks(ctx, makeConfig([]));

		const cache = cacheOf(ctx);
		expect(cache.resolvedLinks["Dashboard.md"]).toBeUndefined();
		expect(cache.trigger).not.toHaveBeenCalled();
	});
});

describe("collectCardPaths", () => {
	it("collects paths recursively through rows and columns, deduped", () => {
		const ctx = makeContext({ files: [{ path: "A.md" }, { path: "B.md" }] });
		const rowBlock = {
			kind: "row",
			children: [{ kind: "column", children: [section(["A.md"]), section(["B.md", "A.md"])] }],
		} as unknown as DashboardBlock;

		const paths: string[] = [];
		collectCardPaths(ctx, [section(["A.md"]), rowBlock], paths, []);

		expect(paths).toEqual(["A.md", "B.md"]);
	});

	it("skips paths matching the exclude list", () => {
		const ctx = makeContext({ files: [{ path: "MOC/A.md" }, { path: "Note.md" }] });

		const paths: string[] = [];
		collectCardPaths(ctx, [section(["MOC/A.md", "Note.md"])], paths, ["MOC"]);

		expect(paths).toEqual(["Note.md"]);
	});
});
