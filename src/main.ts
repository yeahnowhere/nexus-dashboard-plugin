import {
	Editor,
	MarkdownView,
	MarkdownFileInfo,
	Plugin,
	Notice,
	TFile,
	TAbstractFile,
	moment,
} from "obsidian";
import { NexusSettings, ActivityEvent } from "./types";
import { DEFAULT_SETTINGS, mergeSettings, deepCloneDefaults } from "./defaults";
import { hasExtension, ensureExtension } from "./utils";
import { NexusSettingTab, clearVaultFoldersCache } from "./settings";
import { NexusRenderer } from "./renderer/index";
import { clearInjectedGraphLinks, injectAllGraphLinks } from "./renderer/graph";
import {
	STARTUP_RECONCILE_LOOKBACK_MS,
	collectModifiedEvents,
	collectRenameEvents,
	TimelineFileMeta,
} from "./timeline";

export default class NexusDashboardPlugin extends Plugin {
	settings: NexusSettings = DEFAULT_SETTINGS;
	activeRenderers: Set<NexusRenderer> = new Set();

	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private taskCheckTimer: ReturnType<typeof setTimeout> | null = null;
	private propertyCheckTimer: ReturnType<typeof setTimeout> | null = null;
	private graphRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	private dashboardRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	private taskCheckQueue: Array<{ file: TFile; editor: Editor }> = [];
	private propertyCheckQueue: Set<string> = new Set();
	private taskSnapshot = new Map<string, Map<number, string>>();
	private propertySnapshot = new Map<string, string>();
	private recentFiles: { at: number; files: TFile[] } | null = null;
	private fileMtimes = new Map<string, number>();
	private pluginLoadTime = Date.now();
	private startupMuted = true;

	async onload() {
		this.pluginLoadTime = Date.now();
		setTimeout(() => {
			this.startupMuted = false;
			this.reconcileStartupChanges();
		}, 5000);

		await this.loadSettings();
		this.purgeStartupArtifacts();
		this.purgeActivityLogNoise();
		this.primeFileMtimes();

		// ── Migration: append .md to extension-free MOC paths ──
		let migrated = false;
		for (const moc of this.settings.mocs) {
			if (!hasExtension(moc.path)) {
				moc.path = ensureExtension(moc.path);
				migrated = true;
			}
		}
		if (migrated) {
			await this.saveSettings();
		}

		// ── Nexus Dashboard code block ──────────────────────
		this.registerMarkdownCodeBlockProcessor("nexus-dashboard", (source, el, ctx) => {
			const renderer = new NexusRenderer(el, this, source, ctx.sourcePath);
			ctx.addChild(renderer);
		});

		// ── Ribbon icon ─────────────────────────────────────
		this.addRibbonIcon("layout-dashboard", "Open Nexus Dashboard", () => {
			this.openDashboard();
		});

		// ── Commands ────────────────────────────────────────
		this.addCommand({
			id: "open-nexus-dashboard",
			name: "Open dashboard",
			callback: () => this.openDashboard(),
		});

		this.addCommand({
			id: "insert-nexus-dashboard",
			name: "Insert Nexus Dashboard code block",
			editorCallback: (editor) => {
				editor.replaceSelection("```nexus-dashboard\n```\n");
			},
		});

		this.addCommand({
			id: "insert-ascii-block",
			name: "Insert ASCII art block",
			editorCallback: (editor: Editor, _ctx: MarkdownView | MarkdownFileInfo) => {
				const cursor = editor.getCursor();
				const insert = "```nexus-dashboard\nheader:\n  text: \n```\n";
				editor.replaceRange(insert, cursor);
				editor.setCursor({ line: cursor.line + 3, ch: 8 });
			},
		});

		this.addCommand({
			id: "render-selection-ascii",
			name: "Render selection as ASCII art",
			editorCallback: (editor: Editor, _ctx: MarkdownView | MarkdownFileInfo) => {
				const selection = editor.getSelection();
				if (selection) {
					editor.replaceSelection(`\n\`\`\`nexus-dashboard\nheader:\n  text: ${selection}\n\`\`\`\n`);
				}
			},
		});

		this.addCommand({
			id: "clear-activity-log",
			name: "Clear activity log",
			callback: () => {
				this.clearActivityLog();
			},
		});

		this.addSettingTab(new NexusSettingTab(this.app, this));

		// ── Update paths on file rename/move ───────────────
		this.registerEvent(
			this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
				clearVaultFoldersCache();
				if (file instanceof TFile) {
					const oldPathLower = oldPath.toLowerCase();
					const newPath = file.path;

					// Update settings MOCs
					for (const moc of this.settings.mocs) {
						if (moc.path.toLowerCase() === oldPathLower) moc.path = newPath;
					}

					// Update paths inside nexus-dashboard code blocks in all vault notes
					this.updateCodeBlockPaths(oldPath, newPath);
				}
				this.saveData(this.settings);
			}),
		);

		// ── Global activity tracking ────────────────────────
		this.registerActivityTracking();

		// ── Synthetic graph links ───────────────────────────
		// Inject dashboard → MOC → card edges into the metadata link cache at
		// load (and on vault changes) so Graph View shows the relationships
		// even before any dashboard file is opened.
		this.app.workspace.onLayoutReady(() => {
			setTimeout(() => {
				void injectAllGraphLinks(this.app, this.settings);
			}, 3000);
		});
		this.registerEvent(this.app.vault.on("create", () => this.scheduleGraphRefresh()));
		this.registerEvent(this.app.vault.on("modify", () => this.scheduleGraphRefresh()));
		this.registerEvent(this.app.vault.on("delete", () => this.scheduleGraphRefresh()));
		this.registerEvent(this.app.vault.on("rename", () => this.scheduleGraphRefresh()));
		this.registerEvent(this.app.metadataCache.on("changed", () => this.scheduleGraphRefresh()));

		// Re-render open dashboards once the metadata cache settles. On a cold
		// start, a `tasks:` block renders before Obsidian finishes indexing and
		// `getFileCache` returns no `listItems` → the block shows "No tasks
		// found" until a re-render happens. Listening on "changed" (not
		// "resolved") is loop-free: our own render never emits "changed",
		// while graph injection re-emits "resolved".
		this.registerEvent(this.app.metadataCache.on("changed", () => this.scheduleDashboardRefresh()));

		// ── Open on startup ─────────────────────────────────
		if (this.settings.openOnStartup) {
			this.app.workspace.onLayoutReady(() => {
				this.openDashboard();
			});
		}
	}

	onunload() {
		// Remove synthetic graph edges so disabling the plugin leaves no phantom links.
		clearInjectedGraphLinks(this.app);
		// Flush any pending activity-log write so events aren't lost on quit.
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
			void this.saveData(this.settings);
		}
	}

	// ── Dashboard finder ───────────────────────────────────

	private async findDashboardFile(): Promise<TFile | null> {
		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			const content = await this.app.vault.cachedRead(file);
			if (content.includes("```nexus-dashboard")) {
				return file;
			}
		}
		return null;
	}

	async openDashboard(): Promise<void> {
		const { workspace } = this.app;

		// Find existing dashboard note by content
		const existingFile = await this.findDashboardFile();

		if (existingFile instanceof TFile) {
			await workspace.openLinkText(existingFile.path, "", false);
		} else {
			// Create the dashboard note
			const content = "```nexus-dashboard\n```\n";
			const file = await this.app.vault.create("Nexus Dashboard.md", content);
			await workspace.openLinkText(file.path, "", false);
			new Notice("Nexus Dashboard created");
		}
	}

	// ── Settings ───────────────────────────────────────────

	async loadSettings() {
		try {
			const data = await this.loadData();
			this.settings = mergeSettings(data);
		} catch {
			this.settings = deepCloneDefaults();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.rerenderDashboards();
		this.scheduleGraphRefresh();
	}

	/** Debounced re-scan of the vault for graph-link injection. */
	private scheduleGraphRefresh(): void {
		if (this.graphRefreshTimer) return;
		this.graphRefreshTimer = setTimeout(() => {
			this.graphRefreshTimer = null;
			void injectAllGraphLinks(this.app, this.settings);
		}, 600);
	}

	/** Debounced re-render of open dashboards after metadata settles. */
	private scheduleDashboardRefresh(): void {
		if (this.dashboardRefreshTimer) return;
		this.dashboardRefreshTimer = setTimeout(() => {
			this.dashboardRefreshTimer = null;
			this.rerenderDashboards();
		}, 800);
	}

	// ── Activity log ───────────────────────────────────────

	/** Append an event to the persisted activity log (newest first). */
	recordActivity(event: Omit<ActivityEvent, "time">): void {
		if (!this.settings.activityTrackingEnabled) return;
		// Ignore vault indexing / sync bursts that fire right after load.
		if (this.startupMuted) return;
		this.settings.activityLog.unshift({ ...event, time: Date.now() });
		const max = Math.max(50, this.settings.activityLogMax || 500);
		if (this.settings.activityLog.length > max) {
			this.settings.activityLog.length = max;
		}
		this.schedulePersist();
	}

	clearActivityLog(): void {
		this.settings.activityLog = [];
		void this.saveData(this.settings);
		this.rerenderDashboards();
	}

	/**
	 * One-time pass after the startup mute window: recover "modified" events
	 * for files that changed on disk while Obsidian wasn't running (e.g. edits
	 * made by external tools) so the timeline reflects them. Runs only when
	 * tracking is enabled, and merges events into the log exactly once.
	 */
	private reconcileStartupChanges(): void {
		if (!this.settings.activityTrackingEnabled) return;

		const files: TimelineFileMeta[] = this.app.vault.getMarkdownFiles().map((f) => ({
			path: f.path,
			extension: f.extension,
			mtime: f.stat.mtime,
		}));

		const opts = {
			lookbackMs: STARTUP_RECONCILE_LOOKBACK_MS,
			toleranceMs: 1000,
			onlyMarkdown: true,
		};

		// External renames surface as a "deleted" event for the old path plus a
		// file on disk whose mtime matches (renames preserve mtime). Recover
		// them as renamed/moved and drop the misleading "deleted" rows.
		const rename = collectRenameEvents(files, this.settings.activityLog, opts);
		const renameTargets = new Set(rename.events.map((e) => e.path));

		const modified = collectModifiedEvents(
			files.filter((f) => !renameTargets.has(f.path)),
			this.settings.activityLog,
			opts,
		);

		const events = [...rename.events, ...modified];
		if (events.length === 0 && rename.consumed.length === 0) return;

		const consumedPaths = new Map(rename.consumed.map((c) => [c.path + "@" + c.time, true] as const));
		this.settings.activityLog = this.settings.activityLog.filter(
			(ev) => !(ev.action === "deleted" && consumedPaths.has(ev.path + "@" + ev.time)),
		);
		this.settings.activityLog.push(...events);
		this.settings.activityLog.sort((a, b) => b.time - a.time);
		const max = Math.max(50, this.settings.activityLogMax || 500);
		if (this.settings.activityLog.length > max) {
			this.settings.activityLog.length = max;
		}
		this.schedulePersist();
	}

	/**
	 * Vault files sorted by mtime (newest first), cached for a short TTL so
	 * the timeline backfill doesn't re-sort the whole vault on every render.
	 */
	getRecentFiles(): TFile[] {
		if (this.recentFiles && Date.now() - this.recentFiles.at < 10_000) {
			return this.recentFiles.files;
		}
		const files = [...this.app.vault.getFiles()].sort((a, b) => b.stat.mtime - a.stat.mtime);
		this.recentFiles = { at: Date.now(), files };
		return files;
	}

	private schedulePersist(): void {
		if (this.saveTimer) return;
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			void this.saveData(this.settings);
			this.rerenderDashboards();
		}, 1500);
	}

	// ── Global activity tracking ───────────────────────────

	private registerActivityTracking(): void {
		if (!this.settings.activityTrackingEnabled) return;

		this.registerEvent(
			this.app.vault.on("create", (file: TAbstractFile) => {
				this.recentFiles = null;
				if (this.isStartupArtifact(file)) return;
				if (!(file instanceof TFile)) return;
				const mtime = file.stat?.mtime;
				if (mtime) this.fileMtimes.set(file.path, mtime);
				this.recordActivity({
					action: "created",
					path: file.path,
					detail: this.isDailyNote(file) ? "daily note" : undefined,
				});
			}),
		);

		this.registerEvent(
			this.app.vault.on("modify", (file: TAbstractFile) => {
				if (!(file instanceof TFile)) return;
				this.recentFiles = null;
				// Only filter genuine startup-indexing modifies (mtime before
				// load). Real edits have a fresh mtime and must be live.
				const mtime = file.stat?.mtime;
				if (mtime === undefined || mtime < this.pluginLoadTime - 3000) return;
				this.fileMtimes.set(file.path, mtime);
				this.recordActivity({ action: "modified", path: file.path });
			}),
		);

		this.registerEvent(
			this.app.vault.on("delete", (file: TAbstractFile) => {
				this.recentFiles = null;
				if (file instanceof TFile) {
					const mtime = this.fileMtimes.get(file.path);
					this.fileMtimes.delete(file.path);
					this.recordActivity({
						action: "deleted",
						path: file.path,
						...(mtime !== undefined ? { mtime } : {}),
					});
				}
				this.taskSnapshot.delete(file.path);
				this.propertySnapshot.delete(file.path);
			}),
		);

		this.registerEvent(
			this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
				this.recentFiles = null;
				const sameFolder = this.parentOf(oldPath) === this.parentOf(file.path);
				if (file instanceof TFile) {
					const m = this.fileMtimes.get(oldPath);
					if (m !== undefined) this.fileMtimes.set(file.path, m);
					else {
						const st = file.stat?.mtime;
						if (st) this.fileMtimes.set(file.path, st);
					}
					this.fileMtimes.delete(oldPath);
					this.recordActivity({
						action: sameFolder ? "renamed" : "moved",
						path: file.path,
						oldPath,
					});
					const tasks = this.taskSnapshot.get(oldPath);
					if (tasks) {
						this.taskSnapshot.delete(oldPath);
						this.taskSnapshot.set(file.path, tasks);
					}
					const props = this.propertySnapshot.get(oldPath);
					if (props !== undefined) {
						this.propertySnapshot.delete(oldPath);
						this.propertySnapshot.set(file.path, props);
					}
				}
			}),
		);

		// Task checkbox toggles (debounced editor diff)
		this.registerEvent(
			this.app.workspace.on(
				"editor-change",
				(editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
					if (!this.settings.activityTaskTracking) return;
					const file = info.file;
					if (!(file instanceof TFile)) return;
					const existing = this.taskCheckQueue.findIndex((q) => q.file.path === file.path);
					if (existing >= 0) this.taskCheckQueue.splice(existing, 1);
					this.taskCheckQueue.push({ file, editor });
					this.scheduleTaskCheck();
				},
			),
		);

		// Frontmatter / property changes (debounced)
		this.registerEvent(
			this.app.metadataCache.on("changed", (file: TFile) => {
				if (this.propertyCheckQueue.has(file.path)) return;
				this.propertyCheckQueue.add(file.path);
				this.schedulePropertyCheck();
			}),
		);
	}

	private scheduleTaskCheck(): void {
		if (this.taskCheckTimer) return;
		this.taskCheckTimer = setTimeout(() => {
			this.taskCheckTimer = null;
			const queue = this.taskCheckQueue;
			this.taskCheckQueue = [];
			for (const { file, editor } of queue) {
				this.processTaskChanges(file, editor);
			}
		}, 1200);
	}

	private schedulePropertyCheck(): void {
		if (this.propertyCheckTimer) return;
		this.propertyCheckTimer = setTimeout(() => {
			this.propertyCheckTimer = null;
			const queue = [...this.propertyCheckQueue];
			this.propertyCheckQueue.clear();
			for (const path of queue) {
				this.processPropertyChange(path);
			}
		}, 800);
	}

	private processTaskChanges(file: TFile, editor: Editor): void {
		const current = new Map<number, string>();
		const lineCount = editor.lineCount();
		for (let i = 0; i < lineCount; i++) {
			const text = editor.getLine(i);
			if (this.checkboxState(text) !== null) {
				current.set(i, text);
			}
		}
		const prev = this.taskSnapshot.get(file.path);
		if (prev) {
			for (const [line, text] of current) {
				const oldText = prev.get(line);
				if (oldText === undefined) continue;
				const oldState = this.checkboxState(oldText);
				const newState = this.checkboxState(text);
				if (oldState !== null && newState !== null && oldState !== newState) {
					const clean = text.replace(/^\s*[-*+]\s*\[[ xX\-\/]\]\s*/, "");
					this.recordActivity({
						action: "task",
						path: file.path,
						detail: clean || text.trim(),
					});
				}
			}
		}
		this.taskSnapshot.set(file.path, current);
	}

	private checkboxState(text: string): string | null {
		const m = text.match(/^\s*[-*+]\s*\[([ xX\-\/])\]\s*/);
		return m ? m[1] : null;
	}

	private processPropertyChange(path: string): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			this.propertySnapshot.delete(path);
			return;
		}
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter || null;
		const serialized = JSON.stringify(frontmatter);
		const prev = this.propertySnapshot.get(path);
		if (prev === undefined) {
			this.propertySnapshot.set(path, serialized);
			return;
		}
		if (prev === serialized) return;
		const changedKeys = this.changedPropertyKeys(prev, serialized);
		this.propertySnapshot.set(path, serialized);
		if (changedKeys.length === 0) return;
		this.recordActivity({
			action: "property",
			path,
			detail: changedKeys.join(", "),
		});
	}

	private changedPropertyKeys(prev: string, next: string): string[] {
		let prevObj: Record<string, unknown> = {};
		let nextObj: Record<string, unknown> = {};
		try {
			prevObj = prev === "null" ? {} : JSON.parse(prev);
			nextObj = next === "null" ? {} : JSON.parse(next);
		} catch {
			return ["frontmatter"];
		}
		const keys = new Set([...Object.keys(prevObj), ...Object.keys(nextObj)]);
		const changed: string[] = [];
		for (const key of keys) {
			if (JSON.stringify(prevObj[key]) !== JSON.stringify(nextObj[key])) {
				changed.push(key);
			}
		}
		return changed;
	}

	/** Parent folder path of a vault path ("" for root). */
	private parentOf(path: string): string {
		const idx = path.lastIndexOf("/");
		return idx < 0 ? "" : path.slice(0, idx);
	}

	/** Earliest of the file's creation/modification times as Obsidian reports them. */
	private earliestStat(file: TAbstractFile): number {
		if (!(file instanceof TFile) || !file.stat) return Number.POSITIVE_INFINITY;
		return Math.min(file.stat.mtime, file.stat.ctime);
	}

	/**
	 * Pre-fill the mtime cache with every current vault file so a delete event
	 * that fires right after load (before any create/modify on that path) can
	 * still report the file's mtime for rename recovery.
	 */
	private primeFileMtimes(): void {
		for (const f of this.app.vault.getFiles()) {
			const m = f.stat?.mtime;
			if (m) this.fileMtimes.set(f.path, m);
		}
	}

	/** True if the file already existed before the plugin loaded (indexing artifact). */
	private isStartupArtifact(file: TAbstractFile): boolean {
		return this.earliestStat(file) < this.pluginLoadTime - 3000;
	}

	/** Drop create events that are vault-indexing artifacts, not real activity. */
	private purgeStartupArtifacts(): void {
		const cutoff = 10 * 60 * 1000;
		const before = this.settings.activityLog.length;
		this.settings.activityLog = this.settings.activityLog.filter((ev) => {
			if (ev.action !== "created") return true;
			const file = this.app.vault.getAbstractFileByPath(ev.path);
			if (!file) return true;
			return !(this.earliestStat(file) < ev.time - cutoff);
		});
		if (this.settings.activityLog.length !== before) {
			void this.saveData(this.settings);
		}
	}

	/** Drop non-edit noise from older logs so it stops flooding the cap. */
	private purgeActivityLogNoise(): void {
		const noise = new Set(["folder-created", "folder-deleted", "folder-renamed", "opened"]);
		const before = this.settings.activityLog.length;
		this.settings.activityLog = this.settings.activityLog.filter((ev) => !noise.has(ev.action));
		if (this.settings.activityLog.length !== before) {
			void this.saveData(this.settings);
		}
	}

	/** Detect whether a file matches the daily-notes plugin's folder + format. */
	private isDailyNote(file: TFile): boolean {
		if (file.extension !== "md") return false;
		try {
			const dailyInstance = this.app.internalPlugins?.plugins?.["daily-notes"]?.instance;
			const options = dailyInstance?.options;
			if (!options) return false;
			const folder = options.folder as string | undefined;
			if (folder && !file.path.startsWith(folder.replace(/\/+$/, "") + "/")) return false;
			const format = options.format as string | undefined;
			if (!format) return false;
			return (
				file.basename === moment().format(format) ||
				file.basename === moment().add(1, "day").format(format)
			);
		} catch {
			return false;
		}
	}

	// ── Live-update all open dashboards ────────────────────

	rerenderDashboards() {
		for (const renderer of this.activeRenderers) {
			renderer.render();
		}
	}

	// ── Update paths inside code blocks on file rename ────

	private async updateCodeBlockPaths(oldPath: string, newPath: string): Promise<void> {
		const ext = oldPath.match(/\.\w{1,10}$/)?.[0] || ".md";
		const oldPathNoExt = oldPath.replace(new RegExp(ext.replace(".", "\\.") + "$"), "");

		const mdFiles = this.app.vault.getMarkdownFiles();
		for (const file of mdFiles) {
			const content = await this.app.vault.cachedRead(file);
			if (!content.includes("```nexus-dashboard")) continue;

			// Match both old (no ext) and new (with ext) formats
			const hasOldFormat = content.includes(oldPathNoExt) && !content.includes(oldPath);
			const hasNewFormat = content.includes(oldPath);
			if (!hasOldFormat && !hasNewFormat) continue;

			let updated = content;

			if (hasOldFormat) {
				updated = updated.replaceAll(oldPathNoExt, newPath);
			} else {
				updated = updated.replaceAll(oldPath, newPath);
			}

			// Also update label if it matches old basename
			const oldBasename = oldPathNoExt.split("/").pop() || oldPathNoExt;
			const newBasename =
				newPath
					.replace(/\.\w{1,10}$/, "")
					.split("/")
					.pop() || "";
			if (oldBasename !== newBasename) {
				const escaped = oldBasename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				updated = updated.replace(
					new RegExp(`(label:\\s*)${escaped}(\\.md)?(\\s*\n)`),
					`$1${newBasename}$3`,
				);
			}

			if (updated !== content) {
				await this.app.vault.modify(file, updated);
			}
		}
		this.rerenderDashboards();
	}
}
