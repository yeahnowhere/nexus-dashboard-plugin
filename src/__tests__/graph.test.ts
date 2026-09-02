// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	clearInjectedGraphLinks,
	collectCardPaths,
	extractDashboardBlocks,
	injectAllGraphLinks,
	injectGraphLinks,
} from "../renderer/graph";
import { makeContext } from "./helpers/render-context";
import { DEFAULT_MOCS } from "../defaults";
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

// `injectedEdges` is module-level state shared across tests in this file;
// reset it so stale-edge removal in one test can't touch another's context.
beforeEach(() => {
	clearInjectedGraphLinks(makeContext().app);
});

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

describe("extractDashboardBlocks", () => {
	it("extracts every nexus-dashboard code block from a note", () => {
		const content = [
			"# Title",
			"```nexus-dashboard",
			"section:",
			"  cards:",
			"    - path: A.md",
			"```",
			"text between",
			"```nexus-dashboard",
			"section:",
			"  cards:",
			"    - path: B.md",
			"```",
			"",
		].join("\n");

		expect(extractDashboardBlocks(content)).toEqual([
			"section:\n  cards:\n    - path: A.md",
			"section:\n  cards:\n    - path: B.md",
		]);
	});

	it("returns an empty list for notes without dashboard blocks", () => {
		expect(extractDashboardBlocks("plain markdown")).toEqual([]);
		expect(extractDashboardBlocks("```other\nnexus-dashboard\n```\n")).toEqual([]);
	});
});

describe("injectAllGraphLinks", () => {
	const emptyBlock = "```nexus-dashboard\n```\n";
	const emptyDashboard = { path: "Nexus.md", content: emptyBlock };
	const mocFiles = DEFAULT_MOCS.map((m) => ({ path: m.path }));

	it("injects settings MOC edges for an empty dashboard block", async () => {
		const ctx = makeContext({ files: [emptyDashboard, ...mocFiles] });

		await injectAllGraphLinks(ctx.app, ctx.settings);

		expect(cacheOf(ctx).resolvedLinks["Nexus.md"]).toEqual(
			Object.fromEntries(DEFAULT_MOCS.map((m) => [m.path, 1])),
		);
		expect(cacheOf(ctx).trigger).toHaveBeenCalledWith("resolved");
	});

	it("skips everything when showGraph is off", async () => {
		const ctx = makeContext({ files: [emptyDashboard, ...mocFiles], settings: { showGraph: false } });

		await injectAllGraphLinks(ctx.app, ctx.settings);

		expect(cacheOf(ctx).resolvedLinks["Nexus.md"]).toBeUndefined();
		expect(cacheOf(ctx).trigger).not.toHaveBeenCalled();
	});

	it("injects parsed card paths for a non-empty dashboard block", async () => {
		const content = [
			"```nexus-dashboard",
			"section:",
			"  cards:",
			"    - type: big",
			"      path: MOC/Sub-A.md",
			"    - type: big",
			"      path: MOC/Sub-B.md",
			"```",
			"",
		].join("\n");
		const ctx = makeContext({
			files: [
				{ path: "MOC/Knowledge MOC.md", content },
				{ path: "MOC/Sub-A.md" },
				{ path: "MOC/Sub-B.md" },
			],
		});

		await injectAllGraphLinks(ctx.app, ctx.settings);

		expect(cacheOf(ctx).resolvedLinks["MOC/Knowledge MOC.md"]).toEqual({
			"MOC/Sub-A.md": 1,
			"MOC/Sub-B.md": 1,
		});
	});

	it("skips a block that opts out with graph: false", async () => {
		const content = [
			"```nexus-dashboard",
			"graph:",
			"  showGraph: false",
			"section:",
			"  cards:",
			"    - type: big",
			"      path: MOC/Sub.md",
			"```",
			"",
		].join("\n");
		const ctx = makeContext({
			files: [{ path: "MOC/Knowledge MOC.md", content }, { path: "MOC/Sub.md" }],
		});

		await injectAllGraphLinks(ctx.app, ctx.settings);

		expect(cacheOf(ctx).resolvedLinks["MOC/Knowledge MOC.md"]).toBeUndefined();
		expect(cacheOf(ctx).trigger).not.toHaveBeenCalled();
	});

	it("respects graph.exclude in a dashboard block", async () => {
		const content = [
			"```nexus-dashboard",
			"graph:",
			"  showGraph: true",
			"  exclude: Archived",
			"section:",
			"  cards:",
			"    - type: big",
			"      path: MOC/Archived/Old.md",
			"    - type: big",
			"      path: MOC/Sub.md",
			"```",
			"",
		].join("\n");
		const ctx = makeContext({
			files: [
				{ path: "MOC/Knowledge MOC.md", content },
				{ path: "MOC/Archived/Old.md" },
				{ path: "MOC/Sub.md" },
			],
		});

		await injectAllGraphLinks(ctx.app, ctx.settings);

		expect(cacheOf(ctx).resolvedLinks["MOC/Knowledge MOC.md"]).toEqual({ "MOC/Sub.md": 1 });
	});

	it("skips card paths that do not exist in the vault", async () => {
		const ctx = makeContext({
			files: [emptyDashboard],
			settings: { mocs: [{ path: "MOC/Missing.md", title: "Missing", desc: "", icon: "X" }] },
		});

		await injectAllGraphLinks(ctx.app, ctx.settings);

		expect(cacheOf(ctx).resolvedLinks["Nexus.md"]).toBeUndefined();
		expect(cacheOf(ctx).trigger).not.toHaveBeenCalled();
	});

	it("removes stale injected edges after the block changes", async () => {
		const withCard = (path: string) =>
			[
				"```nexus-dashboard",
				"section:",
				"  cards:",
				"    - type: big",
				`      path: ${path}`,
				"```",
				"",
			].join("\n");
		const ctx = makeContext({
			files: [
				{ path: "MOC/Knowledge MOC.md", content: withCard("MOC/Sub-A.md") },
				{ path: "MOC/Sub-A.md" },
				{ path: "MOC/Sub-B.md" },
			],
		});

		await injectAllGraphLinks(ctx.app, ctx.settings);
		expect(cacheOf(ctx).resolvedLinks["MOC/Knowledge MOC.md"]).toEqual({ "MOC/Sub-A.md": 1 });

		const spec = ctx.fileSpecs.find((s) => s.path === "MOC/Knowledge MOC.md");
		if (!spec) throw new Error("missing dashboard spec");
		spec.content = withCard("MOC/Sub-B.md");
		await injectAllGraphLinks(ctx.app, ctx.settings);

		expect(cacheOf(ctx).resolvedLinks["MOC/Knowledge MOC.md"]).toEqual({ "MOC/Sub-B.md": 1 });
	});

	it("preserves pre-existing higher link weights", async () => {
		const ctx = makeContext({
			files: [emptyDashboard],
			resolvedLinks: { "Nexus.md": { "MOC/Journal MOC.md": 3 } },
			settings: { mocs: [{ path: "MOC/Journal MOC.md", title: "J", desc: "", icon: "X" }] },
		});

		await injectAllGraphLinks(ctx.app, ctx.settings);

		expect(cacheOf(ctx).resolvedLinks["Nexus.md"]["MOC/Journal MOC.md"]).toBe(3);
		expect(cacheOf(ctx).trigger).not.toHaveBeenCalled();
	});

	it("only triggers resolved when the link set actually changed", async () => {
		const ctx = makeContext({ files: [emptyDashboard, ...mocFiles] });

		await injectAllGraphLinks(ctx.app, ctx.settings);
		await injectAllGraphLinks(ctx.app, ctx.settings);

		expect(cacheOf(ctx).trigger).toHaveBeenCalledTimes(1);
	});

	it("does not touch files without dashboard blocks", async () => {
		const ctx = makeContext({ files: [{ path: "Note.md", content: "plain" }] });

		await injectAllGraphLinks(ctx.app, ctx.settings);

		expect(cacheOf(ctx).resolvedLinks).toEqual({});
		expect(cacheOf(ctx).trigger).not.toHaveBeenCalled();
	});

	it("detects dashboard blocks by content even without cache sections", async () => {
		const ctx = makeContext({
			files: [{ path: "Nexus.md", content: emptyBlock }, ...mocFiles],
		});

		await injectAllGraphLinks(ctx.app, ctx.settings);

		expect(cacheOf(ctx).resolvedLinks["Nexus.md"]).toEqual(
			Object.fromEntries(DEFAULT_MOCS.map((m) => [m.path, 1])),
		);
		expect(cacheOf(ctx).trigger).toHaveBeenCalledWith("resolved");
	});

	it("clearInjectedGraphLinks removes all injected edges", async () => {
		const ctx = makeContext({ files: [emptyDashboard, ...mocFiles] });
		await injectAllGraphLinks(ctx.app, ctx.settings);
		expect(Object.keys(cacheOf(ctx).resolvedLinks["Nexus.md"])).toHaveLength(DEFAULT_MOCS.length);

		clearInjectedGraphLinks(ctx.app);

		expect(cacheOf(ctx).resolvedLinks["Nexus.md"]).toEqual({});
	});
});
