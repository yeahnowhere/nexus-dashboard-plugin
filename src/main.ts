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
import { hasExtension, ensureExtension, parentOf } from "./utils";
import { CoalescedScheduler } from "./scheduler";
import { TtlCache } from "./cache";
import { taskCheckboxState, stripTaskCheckbox } from "./tasks";
import { NexusSettingTab, clearVaultFoldersCache } from "./settings";
import { NexusRenderer } from "./renderer/index";
import { clearInjectedGraphLinks, injectAllGraphLinks } from "./renderer/graph";
import {
	STARTUP_RECONCILE_LOOKBACK_MS,
	TIMELINE_COALESCE_MS,
	collectModifiedEvents,
	collectRenameEvents,
	TimelineFileMeta,
} from "./timeline";

/** Trailing debounce for the vault graph-link rescan (quiescent edits wait this long). */
const GRAPH_REFRESH_DEBOUNCE_MS = 1200;
/** Hard cap so a burst (e.g. startup indexing) can't postpone the rescan indefinitely. */
const GRAPH_REFRESH_MAX_WAIT_MS = 3000;
/** Idle-callback timeout so a deferred rescan still runs within this window. */
const GRAPH_IDLE_TIMEOUT_MS = 2000;

type IdleScheduler = (cb: () => void, opts?: { timeout: number }) => number;

/**
 * Run `fn` when the browser is idle so heavy vault work yields to user input
 * (clicks, typing) instead of blocking it. Falls back to a macrotask when the
 * idle API is unavailable.
 */
function runWhenIdle(fn: () => void): void {
	const schedule = (globalThis as { requestIdleCallback?: IdleScheduler }).requestIdleCallback;
	if (typeof schedule === "function") {
		schedule(fn, { timeout: GRAPH_IDLE_TIMEOUT_MS });
	} else {
		setTimeout(fn, 0);
	}
}

export default class NexusDashboardPlugin extends Plugin {
	settings: NexusSettings = DEFAULT_SETTINGS;
	activeRenderers: Set<NexusRenderer> = new Set();

	private taskCheckQueue: Array<{ file: TFile; editor: Editor }> = [];
	private propertyCheckQueue: Set<string> = new Set();
	private taskSnapshot = new Map<string, Map<number, string>>();
	private propertySnapshot = new Map<string, string>();
	private graphDirtyPaths = new Set<string>();
	private dashboardRefreshFast = false;
	private recentFilesCache = new TtlCache<TFile[]>(10_000);
	private fileMtimes = new Map<string, number>();
	private startupTimer: ReturnType<typeof setTimeout> | null = null;
	private pluginLoadTime = Date.now();
	private startupMuted = true;
	private loaded = true;

	/** Coalesced settings write: earliest requested deadline wins (300 ms save, 1.5 s activity). */
	private persistScheduler = new CoalescedScheduler({
		mode: "earliest",
		delay: 300,
		run: () => {
			void this.saveData(this.settings);
		},
	});

	/** Coalesced graph rescan: 1.2 s trailing, capped at 3 s, runs when idle. */
	private graphScheduler = new CoalescedScheduler({
		mode: "debounce",
		delay: GRAPH_REFRESH_DEBOUNCE_MS,
		maxWait: GRAPH_REFRESH_MAX_WAIT_MS,
		run: () => {
			if (!this.loaded) return;
			const changed = [...this.graphDirtyPaths];
			this.graphDirtyPaths.clear();
			runWhenIdle(() => {
				if (!this.loaded) return;
				void injectAllGraphLinks(this.app, this.settings, changed);
			});
		},
	});

	/** Coalesced dashboard re-render: 200 ms (fast) / 800 ms trailing, capped at 3 s. */
	private dashboardScheduler = new CoalescedScheduler({
		mode: "debounce",
		delay: 800,
		maxWait: 3000,
		delayFor: () => (this.dashboardRefreshFast ? 200 : 800),
		onBeforeRun: () => {
			this.dashboardRefreshFast = false;
		},
		run: () => {
			if (!this.loaded) return;
			this.rerenderDashboards();
		},
	});

	/** Coalesced editor task-checkbox diff (runs once, 1.2 s after the last edit). */
	private taskCheckScheduler = new CoalescedScheduler({
		mode: "lock",
		delay: 1200,
		run: () => {
			if (!this.loaded) return;
			const queue = this.taskCheckQueue;
			this.taskCheckQueue = [];
			for (const { file, editor } of queue) {
				this.processTaskChanges(file, editor);
			}
		},
	});

	/** Coalesced frontmatter/property change check (runs once, 800 ms after the last change). */
	private propertyCheckScheduler = new CoalescedScheduler({
		mode: "lock",
		delay: 800,
		run: () => {
			if (!this.loaded) return;
			const queue = [...this.propertyCheckQueue];
			this.propertyCheckQueue.clear();
			for (const path of queue) {
				this.processPropertyChange(path);
			}
		},
	});

	async onload() {
		this.pluginLoadTime = Date.now();
		this.startupTimer = setTimeout(() => {
			this.startupTimer = null;
			if (!this.loaded) return;
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
		// even before any dashboard file is opened. A single coalesced scan
		// covers both the startup pass and later edits — no separate timer.
		this.app.workspace.onLayoutReady(() => {
			if (!this.loaded) return;
			this.scheduleGraphRefresh();
		});
		this.registerEvent(
			this.app.vault.on("create", (file: TAbstractFile) => {
				this.graphDirtyPaths.add(file.path);
				this.scheduleGraphRefresh();
			}),
		);
		this.registerEvent(
			this.app.vault.on("modify", (file: TAbstractFile) => {
				this.graphDirtyPaths.add(file.path);
				this.scheduleGraphRefresh();
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file: TAbstractFile) => {
				this.graphDirtyPaths.add(file.path);
				this.scheduleGraphRefresh();
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
				this.graphDirtyPaths.add(oldPath);
				this.graphDirtyPaths.add(file.path);
				this.scheduleGraphRefresh();
			}),
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", (file: TFile) => {
				this.graphDirtyPaths.add(file.path);
				this.scheduleGraphRefresh();
			}),
		);

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
				if (!this.loaded) return;
				this.openDashboard();
			});
		}
	}

	onunload() {
		this.loaded = false;
		if (this.startupTimer) clearTimeout(this.startupTimer);
		this.persistScheduler.dispose();
		this.graphScheduler.dispose();
		this.dashboardScheduler.dispose();
		this.taskCheckScheduler.dispose();
		this.propertyCheckScheduler.dispose();
		// Remove synthetic graph edges so disabling the plugin leaves no phantom links.
		clearInjectedGraphLinks(this.app);
		// Flush any pending settings/activity write so events aren't lost on quit.
		this.flushPendingWrites();
	}

	/**
	 * Coalesced settings write. Activity persists (1.5 s) and settings saves
	 * (300 ms) share one timer; the earliest requested deadline wins so a
	 * settings save can pull a pending activity write forward.
	 */
	private schedulePersist(delay: number): void {
		this.persistScheduler.schedule(delay);
	}

	/** Write any queued settings change immediately (unload, explicit flushes). */
	private flushPendingWrites(): void {
		this.persistScheduler.flush();
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

	/**
	 * Persist settings and refresh consumers, coalesced for rapid callers:
	 * the write lands within ~300 ms, dashboards re-render on a fast-lane
	 * (200 ms trailing) schedule, and the graph rescan waits for a quiet
	 * moment. Individual keystrokes no longer trigger O(vault) work each.
	 */
	async saveSettings() {
		this.trimActivityLog();
		this.schedulePersist(300);
		this.scheduleDashboardRefresh({ fast: true });
		this.scheduleGraphRefresh();
	}

	/** Write settings to disk immediately, bypassing the coalesced write. */
	async flushSettings(): Promise<void> {
		this.persistScheduler.cancel();
		await this.saveData(this.settings);
	}

	/**
	 * Coalesced re-scan of the vault for graph-link injection. Trailing, so
	 * continuous editing doesn't rescan between keystrokes, but capped by a
	 * max-wait so a burst such as startup indexing can't push the scan onto the
	 * user's first interaction. Only the paths reported since the last scan are
	 * re-read (the first scan is always full), and the scan runs when the
	 * browser is idle so it never blocks a click.
	 */
	private scheduleGraphRefresh(): void {
		if (!this.loaded) return;
		this.graphScheduler.schedule();
	}

	/**
	 * Coalesced re-render of every open dashboard. All refresh causes funnel
	 * here so one burst of vault/settings events produces exactly one rebuild:
	 * a 200 ms (fast lane) or 800 ms trailing debounce capped by a 3 s
	 * max-wait, so continuous events still render at most every 3 s.
	 */
	private scheduleDashboardRefresh(opts: { fast?: boolean } = {}): void {
		if (!this.loaded) return;
		if (opts.fast) this.dashboardRefreshFast = true;
		this.dashboardScheduler.schedule();
	}

	// ── Activity log ───────────────────────────────────────

	/** Append an event to the persisted activity log (newest first). */
	recordActivity(event: Omit<ActivityEvent, "time">): void {
		if (!this.settings.activityTrackingEnabled) return;
		// Ignore vault indexing / sync bursts that fire right after load.
		if (this.startupMuted) return;
		const now = Date.now();
		const log = this.settings.activityLog;
		const head = log[0];
		// Write-time coalescing: an autosave burst on one path collapses into
		// its newest event (mirrors the 60 s display-time window), so the cap
		// isn't filled with rows the timeline would hide anyway.
		if (
			head !== undefined &&
			head.action === event.action &&
			head.path === event.path &&
			(head.oldPath ?? "") === (event.oldPath ?? "") &&
			now - head.time < TIMELINE_COALESCE_MS
		) {
			log[0] = { ...event, time: now };
		} else {
			log.unshift({ ...event, time: now });
		}
		this.trimActivityLog();
		this.schedulePersist(1500);
		this.scheduleDashboardRefresh();
	}

	clearActivityLog(): void {
		this.settings.activityLog = [];
		void this.saveData(this.settings);
		this.scheduleDashboardRefresh({ fast: true });
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
		this.trimActivityLog();
		this.schedulePersist(1500);
		this.scheduleDashboardRefresh();
	}

	/**
	 * Vault files sorted by mtime (newest first), cached for a short TTL so
	 * the timeline backfill doesn't re-sort the whole vault on every render.
	 */
	getRecentFiles(): TFile[] {
		return this.recentFilesCache.get(() =>
			[...this.app.vault.getFiles()].sort((a, b) => b.stat.mtime - a.stat.mtime),
		);
	}

	/** Clamp the activity log to the configured cap (shared by all writers). */
	private trimActivityLog(): void {
		const max = Math.max(50, this.settings.activityLogMax || DEFAULT_SETTINGS.activityLogMax);
		if (this.settings.activityLog.length > max) {
			this.settings.activityLog.length = max;
		}
	}

	// ── Global activity tracking ───────────────────────────

	/**
	 * Register the vault/editor/metadata listeners that feed the activity log.
	 * Listeners are always attached and gate on `activityTrackingEnabled` at
	 * call time, so toggling tracking in settings takes effect immediately
	 * (no plugin reload needed).
	 */
	private registerActivityTracking(): void {
		this.registerEvent(
			this.app.vault.on("create", (file: TAbstractFile) => {
				this.recentFilesCache.invalidate();
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
				this.recentFilesCache.invalidate();
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
				this.recentFilesCache.invalidate();
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
				this.recentFilesCache.invalidate();
				const sameFolder = parentOf(oldPath) === parentOf(file.path);
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
					if (!this.settings.activityTrackingEnabled) return;
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
				if (!this.settings.activityTrackingEnabled) return;
				if (this.propertyCheckQueue.has(file.path)) return;
				this.propertyCheckQueue.add(file.path);
				this.schedulePropertyCheck();
			}),
		);
	}

	private scheduleTaskCheck(): void {
		this.taskCheckScheduler.schedule();
	}

	private schedulePropertyCheck(): void {
		this.propertyCheckScheduler.schedule();
	}

	private processTaskChanges(file: TFile, editor: Editor): void {
		const current = new Map<number, string>();
		const lineCount = editor.lineCount();
		for (let i = 0; i < lineCount; i++) {
			const text = editor.getLine(i);
			if (taskCheckboxState(text) !== null) {
				current.set(i, text);
			}
		}
		const prev = this.taskSnapshot.get(file.path);
		if (prev) {
			for (const [line, text] of current) {
				const oldText = prev.get(line);
				if (oldText === undefined) continue;
				const oldState = taskCheckboxState(oldText);
				const newState = taskCheckboxState(text);
				if (oldState !== null && newState !== null && oldState !== newState) {
					const clean = stripTaskCheckbox(text);
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
		const oldPathNoExt = oldPath.replace(new RegExp(ext.replace(/\./g, "\\.") + "$"), "");

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
		this.scheduleDashboardRefresh({ fast: true });
	}
}
