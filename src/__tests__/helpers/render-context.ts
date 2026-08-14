import "./obsidian-dom";
import { vi } from "vitest";
import { TFile } from "./obsidian-mock";
import { deepCloneDefaults } from "../../defaults";
import type { App, MetadataCache, Vault, Workspace } from "obsidian";
import type { NexusSettings } from "../../types";
import type { RendererContext } from "../../renderer/context";

/** Minimal list-item shape consumed by the task summary renderer. */
export interface FakeListItem {
	task?: string;
	position: { start: { line: number } };
}

/** Describes one file stored in the fake in-memory vault. */
export interface FakeFileSpec {
	path: string;
	mtime?: number;
	ctime?: number;
	size?: number;
	content?: string;
	listItems?: FakeListItem[];
	frontmatterTags?: string[];
}

export interface MakeContextOptions {
	/** Files to seed the fake vault with. */
	files?: FakeFileSpec[];
	/** Settings merged over a deep-cloned default snapshot. */
	settings?: Partial<NexusSettings>;
	sourcePath?: string;
	/** Explicit recent-file list returned by `getRecentFiles`. */
	recentFiles?: TFile[];
	/** Shallow-merges extra fields onto the fake `App`. */
	app?: Partial<App>;
	/** Seed `metadataCache.resolvedLinks` (used by the graph renderer). */
	resolvedLinks?: Record<string, Record<string, number>>;
}

export interface TestContext extends RendererContext {
	app: App;
	settings: NexusSettings;
	files: TFile[];
	getRecentFiles: ReturnType<typeof vi.fn>;
	saveSettings: ReturnType<typeof vi.fn>;
	rerender: ReturnType<typeof vi.fn>;
	registerClockInterval: ReturnType<typeof vi.fn>;
	openLinkText: ReturnType<typeof vi.fn>;
}

/** Build a fully-functional fake `RendererContext` for DOM render tests. */
export function makeContext(options: MakeContextOptions = {}): TestContext {
	const specs = options.files ?? [];

	const files = specs.map(
		(spec) =>
			new TFile({
				path: spec.path,
				mtime: spec.mtime,
				ctime: spec.ctime,
				size: spec.size,
			}),
	);
	const byPath = new Map(specs.map((spec) => [spec.path, spec]));

	const vault = {
		getMarkdownFiles: () => files.filter((f) => f.extension === "md"),
		getFiles: () => files,
		getAbstractFileByPath: (path: string) => {
			const file = files.find((f) => f.path === path);
			return file ?? null;
		},
		cachedRead: async (file: TFile) => byPath.get(file.path)?.content ?? "",
		read: async (file: TFile) => byPath.get(file.path)?.content ?? "",
		create: async (path: string, content: string) => {
			const spec: FakeFileSpec = { path, content };
			specs.push(spec);
			const file = new TFile({ path });
			files.push(file);
			byPath.set(path, spec);
			return file;
		},
		createFolder: async () => {},
		getName: () => "Test Vault",
	} as unknown as Vault;

	const metadataCache = {
		getFileCache: (file: TFile) => {
			const spec = byPath.get(file.path);
			if (!spec) return null;
			const cache: Record<string, unknown> = {};
			if (spec.listItems) cache.listItems = spec.listItems;
			if (spec.frontmatterTags) {
				cache.frontmatter = { tags: spec.frontmatterTags };
			}
			return cache;
		},
		resolvedLinks: options.resolvedLinks ?? {},
		trigger: vi.fn(),
	} as unknown as MetadataCache;

	const openLinkText = vi.fn();
	const openFile = vi.fn();
	const workspace = {
		openLinkText,
		getLeaf: vi.fn(() => ({ openFile })),
	} as unknown as Workspace;

	const app = {
		vault,
		metadataCache,
		workspace,
		internalPlugins: undefined,
	} as unknown as App;

	if (options.app) {
		Object.assign(app, options.app);
	}

	const settings = Object.assign(deepCloneDefaults(), options.settings ?? {}) as NexusSettings;

	const getRecentFiles = vi.fn(
		() => options.recentFiles ?? [...files].sort((a, b) => b.stat.mtime - a.stat.mtime),
	);

	return {
		app,
		settings,
		sourcePath: options.sourcePath ?? "Dashboard.md",
		files,
		getRecentFiles,
		saveSettings: vi.fn(async () => {}),
		rerender: vi.fn(),
		registerClockInterval: vi.fn(),
		openLinkText,
	};
}
