import type { ActivityEvent } from "./types";

/** Merge duplicate consecutive edits to the same path+action within this window. */
export const TIMELINE_COALESCE_MS = 60_000;

/**
 * Obsidian reports an external rename (performed while the app was closed, or
 * detected by the file watcher) as a `deleted` event for the old path plus a
 * `created` event for the new path, instead of a single `rename` event. Pair a
 * delete+create within this window (same folder, same extension) into one
 * `renamed` entry so the timeline doesn't claim the file was deleted.
 */
export const TIMELINE_RENAME_PAIR_MS = 5_000;

/**
 * How far back (ms) startup reconciliation looks for files that were changed
 * on disk without ever producing an activity-log event (e.g. edits made by
 * external tools while Obsidian was closed).
 */
export const STARTUP_RECONCILE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/** Minimal file shape required to backfill the timeline from the vault. */
export interface TimelineFileMeta {
	path: string;
	extension: string;
	mtime: number;
}

export interface TimelineSource {
	/** Persisted activity log (newest first). */
	log: ActivityEvent[];
	/** Vault files (any order); used to backfill sparse activity. */
	files: TimelineFileMeta[];
}

export interface TimelineOptions {
	onlyMarkdown: boolean;
	include: string[];
	excludeFolders: string[];
	excludeExt: string[];
	types: string[];
	/** Resolved number of entries the timeline intends to display. */
	count: number;
	/** Coalescing window in ms (defaults to TIMELINE_COALESCE_MS). */
	coalesceMs?: number;
	/**
	 * Pair `deleted` + `created` events into `renamed` (ms window, defaults to
	 * TIMELINE_RENAME_PAIR_MS). Pass `false` to disable.
	 */
	pairRenameMs?: number | false;
}

export interface ReconcileOptions {
	/** Only reconcile files modified within this lookback window (ms). */
	lookbackMs: number;
	/**
	 * Skip files whose mtime is within this of the newest logged event for the
	 * same path (defaults to 0). Absorbs save/clock jitter.
	 */
	toleranceMs?: number;
	/** Only reconcile markdown files. */
	onlyMarkdown?: boolean;
}

/** Recovered rename/move events plus the `deleted` events they supersede. */
export interface RenameRecovery {
	events: ActivityEvent[];
	consumed: ActivityEvent[];
}

/** True when `path` is inside the vault-relative `prefix` (or is the prefix itself). */
export function isWithinPath(path: string, prefix: string): boolean {
	const p = prefix.replace(/\/+$/, "");
	return p.length === 0 || path === p || path.startsWith(p + "/");
}

function parentOf(path: string): string {
	const i = path.lastIndexOf("/");
	return i === -1 ? "" : path.slice(0, i);
}

function extensionOf(path: string): string {
	const name = path.slice(path.lastIndexOf("/") + 1);
	const i = name.lastIndexOf(".");
	return i <= 0 ? "" : name.slice(i + 1).toLowerCase();
}

/**
 * Merge a `deleted` event with a nearby `created` event for the same folder and
 * extension into a single `renamed` event. Obsidian emits delete+create (not a
 * `rename` event) for renames performed outside the app, so without this the
 * timeline would claim a file was deleted when it was actually renamed.
 *
 * Returns a new newest-first list. Unpaired events are preserved unchanged.
 */
export function pairDeleteCreateEvents(
	events: ActivityEvent[],
	windowMs: number = TIMELINE_RENAME_PAIR_MS,
): ActivityEvent[] {
	const byTime = [...events].sort((a, b) => a.time - b.time);
	const creates = byTime.filter((e) => e.action === "created");
	const usedDelete = new Set<ActivityEvent>();
	const usedCreate = new Set<ActivityEvent>();
	const renames: ActivityEvent[] = [];

	for (const ev of byTime) {
		if (ev.action !== "deleted") continue;
		const match = creates.find(
			(c) =>
				!usedCreate.has(c) &&
				Math.abs(c.time - ev.time) <= windowMs &&
				parentOf(c.path) === parentOf(ev.path) &&
				extensionOf(c.path) === extensionOf(ev.path),
		);
		if (!match) continue;
		usedDelete.add(ev);
		usedCreate.add(match);
		renames.push({
			time: Math.max(ev.time, match.time),
			action: "renamed",
			path: match.path,
			oldPath: ev.path,
		});
	}

	const rest = byTime.filter((e) => !usedDelete.has(e) && !usedCreate.has(e));
	return [...rest, ...renames].sort((a, b) => b.time - a.time);
}

/**
 * Build the ordered list of timeline events: filtered log entries, backfilled
 * recently-modified files, newest first, with consecutive duplicates coalesced.
 */
export function buildTimelineEvents(
	source: TimelineSource,
	opts: TimelineOptions,
): ActivityEvent[] {
	let logEvents: ActivityEvent[] = [];

	for (const ev of source.log) {
		if (opts.types.length > 0 && !opts.types.includes(ev.action)) continue;
		if (opts.onlyMarkdown && !ev.path.toLowerCase().endsWith(".md")) continue;
		if (opts.excludeExt.some((ext) => ev.path.toLowerCase().endsWith(ext.toLowerCase()))) continue;
		if (opts.include.length > 0 && !opts.include.some((inc) => isWithinPath(ev.path, inc))) continue;
		if (opts.excludeFolders.some((ex) => isWithinPath(ev.path, ex))) continue;
		logEvents.push(ev);
	}

	// Backfill: only when the active filter would actually show "modified"
	// entries, otherwise backfilled rows would violate the types filter.
	// Backfill runs even when the log is already saturated so files changed on
	// disk without a logged event (e.g. edits by external tools) still surface.
	const admitsModified = opts.types.length === 0 || opts.types.includes("modified");

	if (admitsModified) {
		const seen = new Set(logEvents.map((e) => e.path));
		const files = source.files
			.filter((f) => !seen.has(f.path))
			.filter((f) => {
				if (opts.onlyMarkdown && f.extension !== "md") return false;
				if (opts.excludeExt.some((ext) => f.path.toLowerCase().endsWith(ext.toLowerCase())))
					return false;
				if (opts.include.length > 0 && !opts.include.some((inc) => isWithinPath(f.path, inc)))
					return false;
				if (opts.excludeFolders.some((ex) => isWithinPath(f.path, ex))) return false;
				return true;
			})
			.sort((a, b) => b.mtime - a.mtime)
			.slice(0, opts.count);
		for (const f of files) {
			logEvents.push({ time: f.mtime, action: "modified", path: f.path });
		}
	}

	logEvents.sort((a, b) => b.time - a.time);

	if (opts.pairRenameMs !== false) {
		const pairMs = opts.pairRenameMs ?? TIMELINE_RENAME_PAIR_MS;
		if (pairMs > 0) logEvents = pairDeleteCreateEvents(logEvents, pairMs);
	}

	const coalesceMs = opts.coalesceMs ?? TIMELINE_COALESCE_MS;
	if (coalesceMs > 0) {
		const coalesced: ActivityEvent[] = [];
		for (const ev of logEvents) {
			const last = coalesced[coalesced.length - 1];
			const isDuplicate =
				last !== undefined &&
				last.action === ev.action &&
				last.path === ev.path &&
				// Events are newest-first, so the difference is positive.
				last.time - ev.time < coalesceMs;
			if (!isDuplicate) {
				coalesced.push({ ...ev });
			}
		}
		return coalesced;
	}

	return logEvents;
}

/**
 * Compute one "modified" event per file whose mtime is newer than anything the
 * activity log recorded for it, so changes made on disk (e.g. by external
 * tools while Obsidian was closed) are recovered exactly once. Newest first.
 */
export function collectModifiedEvents(
	files: TimelineFileMeta[],
	log: ActivityEvent[],
	opts: ReconcileOptions,
): ActivityEvent[] {
	const cutoff = Date.now() - opts.lookbackMs;
	const tolerance = opts.toleranceMs ?? 0;

	const newestByPath = new Map<string, number>();
	for (const ev of log) {
		const prev = newestByPath.get(ev.path);
		if (prev === undefined || ev.time > prev) {
			newestByPath.set(ev.path, ev.time);
		}
	}

	const events: ActivityEvent[] = [];
	for (const f of files) {
		if (opts.onlyMarkdown && f.extension !== "md") continue;
		if (f.mtime <= cutoff) continue;
		const last = newestByPath.get(f.path);
		if (last !== undefined && f.mtime <= last + tolerance) continue;
		events.push({ time: f.mtime, action: "modified", path: f.path });
	}
	return events.sort((a, b) => b.time - a.time);
}

/**
 * Recover external renames: Obsidian reports a file renamed outside the app as
 * a `deleted` event for the old path (and often no event for the new path at
 * all). Because a rename preserves the file mtime, match each `deleted` event
 * that carries an `mtime` against a current vault file with the same mtime and
 * reclassify it as `renamed` (same folder) or `moved` (different folder).
 *
 * Returns the recovered events and the `deleted` events they supersede (which
 * callers should remove from the log to avoid a misleading "deleted" row).
 */
export function collectRenameEvents(
	files: TimelineFileMeta[],
	log: ActivityEvent[],
	opts: ReconcileOptions,
): RenameRecovery {
	const cutoff = Date.now() - opts.lookbackMs;
	const tolerance = opts.toleranceMs ?? 0;

	const byPath = new Map(files.map((f) => [f.path, f]));
	const usedTargets = new Set<string>();
	const events: ActivityEvent[] = [];
	const consumed: ActivityEvent[] = [];
	const creates = log.filter((e) => e.action === "created");

	for (const ev of log) {
		if (ev.action !== "deleted" || typeof ev.mtime !== "number") continue;
		if (ev.time < cutoff) continue;

		// If a `created` event for the same folder+extension landed within the
		// display-pairing window, buildTimelineEvents already turns the pair
		// into a rename — recovering it here too would duplicate the row.
		const pairable = creates.some(
			(c) =>
				Math.abs(c.time - ev.time) <= TIMELINE_RENAME_PAIR_MS &&
				parentOf(c.path) === parentOf(ev.path) &&
				extensionOf(c.path) === extensionOf(ev.path),
		);
		if (pairable) continue;

		let best: TimelineFileMeta | undefined;
		let sameFolder = false;
		for (const [path, f] of byPath) {
			if (usedTargets.has(path)) continue;
			if (opts.onlyMarkdown && f.extension !== "md") continue;
			if (Math.abs(f.mtime - ev.mtime) > tolerance) continue;
			const folder = parentOf(path) === parentOf(ev.path);
			if (!best || (folder && !sameFolder)) {
				best = f;
				sameFolder = folder;
			}
		}
		if (!best) continue;

		consumed.push(ev);
		usedTargets.add(best.path);
		events.push({
			time: ev.time,
			action: sameFolder ? "renamed" : "moved",
			path: best.path,
			oldPath: ev.path,
		});
	}

	return { events, consumed };
}
