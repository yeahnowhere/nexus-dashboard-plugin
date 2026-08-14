import { describe, it, expect } from "vitest";
import {
	buildTimelineEvents,
	collectModifiedEvents,
	collectRenameEvents,
	isWithinPath,
	pairDeleteCreateEvents,
	TimelineSource,
	TimelineOptions,
} from "../timeline";
import { ActivityEvent } from "../types";

const now = Date.now();

function makeOpts(overrides: Partial<TimelineOptions> = {}): TimelineOptions {
	return {
		onlyMarkdown: false,
		include: [],
		excludeFolders: [],
		excludeExt: [],
		types: [],
		count: 20,
		...overrides,
	};
}

describe("isWithinPath", () => {
	it("matches the prefix itself and nested paths", () => {
		expect(isWithinPath("A/B.md", "A")).toBe(true);
		expect(isWithinPath("A", "A")).toBe(true);
		expect(isWithinPath("AB.md", "A")).toBe(false);
		expect(isWithinPath("A/B.md", "")).toBe(true);
		expect(isWithinPath("A/B.md", "A/")).toBe(true);
	});
});

describe("buildTimelineEvents", () => {
	const baseSource: TimelineSource = {
		log: [],
		files: [],
	};

	it("filters log entries by types whitelist", () => {
		const source: TimelineSource = {
			...baseSource,
			log: [
				{ time: now, action: "created", path: "a.md" },
				{ time: now - 10, action: "deleted", path: "b.md" },
			],
		};
		const result = buildTimelineEvents(source, makeOpts({ types: ["created"] }));
		expect(result.map((e) => e.action)).toEqual(["created"]);
	});

	it("does not backfill when types whitelist excludes modified", () => {
		const source: TimelineSource = {
			...baseSource,
			files: [{ path: "recent.md", extension: "md", mtime: now - 5 }],
		};
		const result = buildTimelineEvents(source, makeOpts({ types: ["created"], count: 5 }));
		expect(result).toEqual([]);
	});

	it("backfills recently-modified files even when the log already has entries", () => {
		const source: TimelineSource = {
			...baseSource,
			log: [{ time: now, action: "created", path: "log.md" }],
			files: [
				{ path: "old.md", extension: "md", mtime: now - 100 },
				{ path: "mid.md", extension: "md", mtime: now - 50 },
				{ path: "new.md", extension: "md", mtime: now - 10 },
			],
		};
		const result = buildTimelineEvents(source, makeOpts({ count: 3 }));
		expect(result.map((e) => e.path)).toEqual(["log.md", "new.md", "mid.md", "old.md"]);
	});

	it("backfill respects onlyMarkdown, include and exclude filters", () => {
		const source: TimelineSource = {
			...baseSource,
			log: [],
			files: [
				{ path: "A/keep.md", extension: "md", mtime: now - 10 },
				{ path: "A/drop.png", extension: "png", mtime: now - 20 },
				{ path: "A/drop/keep.md", extension: "md", mtime: now - 15 },
				{ path: "B/keep.md", extension: "md", mtime: now - 30 },
			],
		};
		const result = buildTimelineEvents(
			source,
			makeOpts({ count: 5, onlyMarkdown: true, include: ["A"], excludeFolders: ["A/drop"] }),
		);
		expect(result.map((e) => e.path)).toEqual(["A/keep.md"]);
	});

	it("excludes paths already present in the log from backfill", () => {
		const source: TimelineSource = {
			...baseSource,
			log: [{ time: now, action: "created", path: "same.md" }],
			files: [
				{ path: "same.md", extension: "md", mtime: now - 10 },
				{ path: "other.md", extension: "md", mtime: now - 20 },
			],
		};
		const result = buildTimelineEvents(source, makeOpts({ count: 2 }));
		expect(result.map((e) => e.path)).toEqual(["same.md", "other.md"]);
	});

	it("coalesces consecutive same-path same-action edits within the window", () => {
		const source: TimelineSource = {
			...baseSource,
			log: [
				{ time: now, action: "modified", path: "a.md" },
				{ time: now - 10_000, action: "modified", path: "a.md" },
				{ time: now - 20_000, action: "created", path: "a.md" },
			],
		};
		const result = buildTimelineEvents(source, makeOpts());
		expect(result.length).toBe(2);
		expect(result.map((e) => e.action)).toEqual(["modified", "created"]);
		expect(result[0].time).toBe(now);
	});

	it("keeps separate edits that are outside the coalescing window", () => {
		const source: TimelineSource = {
			...baseSource,
			log: [
				{ time: now, action: "modified", path: "a.md" },
				{ time: now - 120_000, action: "modified", path: "a.md" },
			],
		};
		const result = buildTimelineEvents(source, makeOpts());
		expect(result.length).toBe(2);
	});

	it("coalescing can be disabled", () => {
		const source: TimelineSource = {
			...baseSource,
			log: [
				{ time: now, action: "modified", path: "a.md" },
				{ time: now - 10_000, action: "modified", path: "a.md" },
			],
		};
		const result = buildTimelineEvents(source, makeOpts({ coalesceMs: 0 }));
		expect(result.length).toBe(2);
	});

	it("returns newest first", () => {
		const source: TimelineSource = {
			...baseSource,
			log: [
				{ time: now - 30, action: "modified", path: "a.md" },
				{ time: now, action: "modified", path: "b.md" },
				{ time: now - 10, action: "modified", path: "c.md" },
			],
		};
		const result = buildTimelineEvents(source, makeOpts());
		expect(result.map((e) => e.path)).toEqual(["b.md", "c.md", "a.md"]);
	});
});

describe("collectModifiedEvents", () => {
	const lookbackMs = 7 * 24 * 60 * 60 * 1000;

	it("records a modified event for files changed on disk without a logged event", () => {
		const files = [{ path: "a.md", extension: "md", mtime: now - 1000 }];
		const result = collectModifiedEvents(files, [], { lookbackMs });
		expect(result).toEqual([{ time: now - 1000, action: "modified", path: "a.md" }]);
	});

	it("skips files already covered by a newer logged event", () => {
		const files = [{ path: "a.md", extension: "md", mtime: now - 1000 }];
		const log: ActivityEvent[] = [{ time: now, action: "modified", path: "a.md" }];
		const result = collectModifiedEvents(files, log, { lookbackMs });
		expect(result).toEqual([]);
	});

	it("skips files whose mtime is within the tolerance of the logged event", () => {
		const files = [{ path: "a.md", extension: "md", mtime: now - 500 }];
		const log: ActivityEvent[] = [{ time: now, action: "modified", path: "a.md" }];
		const result = collectModifiedEvents(files, log, { lookbackMs, toleranceMs: 1000 });
		expect(result).toEqual([]);
	});

	it("skips files older than the lookback window", () => {
		const files = [{ path: "a.md", extension: "md", mtime: now - lookbackMs - 10_000 }];
		const result = collectModifiedEvents(files, [], { lookbackMs });
		expect(result).toEqual([]);
	});

	it("skips non-markdown files when onlyMarkdown is set", () => {
		const files = [{ path: "a.png", extension: "png", mtime: now - 1000 }];
		const result = collectModifiedEvents(files, [], { lookbackMs, onlyMarkdown: true });
		expect(result).toEqual([]);
	});

	it("returns events newest first", () => {
		const files = [
			{ path: "a.md", extension: "md", mtime: now - 3000 },
			{ path: "b.md", extension: "md", mtime: now - 1000 },
		];
		const result = collectModifiedEvents(files, [], { lookbackMs });
		expect(result.map((e) => e.path)).toEqual(["b.md", "a.md"]);
	});
});

describe("pairDeleteCreateEvents", () => {
	const del = (time: number, path: string): ActivityEvent => ({ time, action: "deleted", path });
	const created = (time: number, path: string): ActivityEvent => ({ time, action: "created", path });

	it("pairs a delete+create in the same folder into a renamed event", () => {
		const result = pairDeleteCreateEvents([del(now - 1000, "old.md"), created(now - 900, "new.md")]);
		expect(result).toEqual([
			{ time: now - 900, action: "renamed", path: "new.md", oldPath: "old.md" },
		]);
	});

	it("leaves a standalone delete unchanged", () => {
		const events = [del(now - 1000, "old.md")];
		expect(pairDeleteCreateEvents(events)).toEqual(events);
	});

	it("leaves a standalone create unchanged", () => {
		const events = [created(now - 1000, "new.md")];
		expect(pairDeleteCreateEvents(events)).toEqual(events);
	});

	it("does not pair across different folders", () => {
		const result = pairDeleteCreateEvents([
			del(now - 1000, "A/old.md"),
			created(now - 900, "B/new.md"),
		]);
		expect(result).toHaveLength(2);
		expect(result.every((e) => e.action !== "renamed")).toBe(true);
	});

	it("does not pair different extensions", () => {
		const result = pairDeleteCreateEvents([del(now - 1000, "old.md"), created(now - 900, "new.txt")]);
		expect(result).toHaveLength(2);
		expect(result.every((e) => e.action !== "renamed")).toBe(true);
	});

	it("pairs when the create fires slightly before the delete (Obsidian order varies)", () => {
		const result = pairDeleteCreateEvents([del(now - 1000, "old.md"), created(now - 2000, "new.md")]);
		expect(result).toEqual([
			{ time: now - 1000, action: "renamed", path: "new.md", oldPath: "old.md" },
		]);
	});

	it("does not pair when the create falls outside the window", () => {
		const result = pairDeleteCreateEvents(
			[del(now - 10_000, "old.md"), created(now - 1000, "new.md")],
			5000,
		);
		expect(result).toHaveLength(2);
		expect(result.every((e) => e.action !== "renamed")).toBe(true);
	});

	it("returns events newest first and preserves unpaired events", () => {
		const result = pairDeleteCreateEvents([
			created(now - 50, "unrelated.md"),
			del(now - 3000, "old.md"),
			created(now - 2900, "new.md"),
		]);
		expect(result.map((e) => e.action)).toEqual(["created", "renamed"]);
		expect(result[1]).toEqual({
			time: now - 2900,
			action: "renamed",
			path: "new.md",
			oldPath: "old.md",
		});
	});
});

describe("buildTimelineEvents rename pairing", () => {
	it("pairs a logged delete+create into a renamed entry", () => {
		const source: TimelineSource = {
			log: [
				{ time: now - 1000, action: "deleted", path: "old.md" },
				{ time: now - 900, action: "created", path: "new.md" },
			],
			files: [],
		};
		const result = buildTimelineEvents(source, makeOpts());
		expect(result).toEqual([
			{ time: now - 900, action: "renamed", path: "new.md", oldPath: "old.md" },
		]);
	});

	it("can be disabled via pairRenameMs false", () => {
		const source: TimelineSource = {
			log: [
				{ time: now - 1000, action: "deleted", path: "old.md" },
				{ time: now - 900, action: "created", path: "new.md" },
			],
			files: [],
		};
		const result = buildTimelineEvents(source, makeOpts({ pairRenameMs: false }));
		expect(result.map((e) => e.action)).toEqual(["created", "deleted"]);
	});
});

describe("collectRenameEvents", () => {
	const lookbackMs = 7 * 24 * 60 * 60 * 1000;
	const del = (mtime: number): ActivityEvent => ({
		time: now - 60_000,
		action: "deleted",
		path: "old.md",
		mtime,
	});

	it("reclassifies a deleted event to a current file with the same mtime as renamed", () => {
		const files = [{ path: "new.md", extension: "md", mtime: now - 1000 }];
		const result = collectRenameEvents(files, [del(now - 1000)], { lookbackMs });
		expect(result.events).toEqual([
			{ time: now - 60_000, action: "renamed", path: "new.md", oldPath: "old.md" },
		]);
		expect(result.consumed).toEqual([del(now - 1000)]);
	});

	it("labels a cross-folder match as moved", () => {
		const files = [{ path: "Sub/new.md", extension: "md", mtime: now - 1000 }];
		const result = collectRenameEvents(files, [del(now - 1000)], { lookbackMs });
		expect(result.events[0].action).toBe("moved");
	});

	it("does not pair when mtimes differ", () => {
		const files = [{ path: "new.md", extension: "md", mtime: now - 9999 }];
		const result = collectRenameEvents(files, [del(now - 1000)], { lookbackMs });
		expect(result.events).toEqual([]);
		expect(result.consumed).toEqual([]);
	});

	it("skips deleted events without an mtime", () => {
		const files = [{ path: "new.md", extension: "md", mtime: now - 1000 }];
		const log: ActivityEvent[] = [{ time: now - 60_000, action: "deleted", path: "old.md" }];
		const result = collectRenameEvents(files, log, { lookbackMs });
		expect(result.events).toEqual([]);
		expect(result.consumed).toEqual([]);
	});

	it("skips deleted events outside the lookback window", () => {
		const files = [{ path: "new.md", extension: "md", mtime: now - 1000 }];
		const log: ActivityEvent[] = [
			{ time: now - lookbackMs - 10_000, action: "deleted", path: "old.md", mtime: now - 1000 },
		];
		const result = collectRenameEvents(files, log, { lookbackMs });
		expect(result.events).toEqual([]);
	});

	it("skips non-markdown candidates when onlyMarkdown is set", () => {
		const files = [{ path: "new.png", extension: "png", mtime: now - 1000 }];
		const result = collectRenameEvents(files, [del(now - 1000)], { lookbackMs, onlyMarkdown: true });
		expect(result.events).toEqual([]);
	});

	it("does not reuse a file already claimed as a rename target", () => {
		const files = [{ path: "new.md", extension: "md", mtime: now - 1000 }];
		const log: ActivityEvent[] = [
			{ time: now - 60_000, action: "deleted", path: "a.md", mtime: now - 1000 },
			{ time: now - 50_000, action: "deleted", path: "b.md", mtime: now - 1000 },
		];
		const result = collectRenameEvents(files, log, { lookbackMs });
		expect(result.events).toHaveLength(1);
		expect(result.consumed).toHaveLength(1);
	});

	it("skips a deleted event that display pairing already turns into a rename", () => {
		const files = [{ path: "new.md", extension: "md", mtime: now - 1000 }];
		const log: ActivityEvent[] = [
			{ time: now - 60_000, action: "deleted", path: "old.md", mtime: now - 1000 },
			{ time: now - 59_900, action: "created", path: "new.md" },
		];
		const result = collectRenameEvents(files, log, { lookbackMs });
		expect(result.events).toEqual([]);
		expect(result.consumed).toEqual([]);
	});
});
