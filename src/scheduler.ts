/** Coalescing strategy used when a run is requested while one is already pending. */
export type CoalesceMode = "debounce" | "earliest" | "lock";

export interface CoalescedSchedulerOptions {
	/**
	 * Coalescing strategy:
	 * - `"debounce"` — every request restarts the trailing timer (optionally
	 *   capped by {@link CoalescedSchedulerOptions.maxWait}).
	 * - `"earliest"` — a request only moves the deadline earlier; a later
	 *   deadline never postpones a pending one.
	 * - `"lock"` — requests are ignored while a run is already pending.
	 */
	mode: CoalesceMode;
	/** Base trailing delay in milliseconds. */
	delay: number;
	/**
	 * Hard cap in milliseconds. When set, the run fires at most this long after
	 * the first pending request, so a continuous event burst still lands.
	 */
	maxWait?: number;
	/**
	 * Optional dynamic delay resolver consulted on each request (overrides
	 * {@link CoalescedSchedulerOptions.delay}). Useful for a "fast lane" whose
	 * delay depends on accumulated state.
	 */
	delayFor?: () => number;
	/** Invoked immediately before {@link CoalescedSchedulerOptions.run}, e.g. to reset per-cycle flags. */
	onBeforeRun?: () => void;
	/** The work to perform when the timer fires or a flush is requested. */
	run: () => void;
}

/**
 * A single-timer, debounced/coalesced callback.
 *
 * Replaces the hand-rolled `scheduleX` helpers scattered across `main.ts`
 * (persist, graph rescan, dashboard refresh, task check, property check), each
 * of which reimplemented the same "reset one timeout, guard against re-entry"
 * dance with slightly different edges. One instance owns at most one pending
 * timeout; `dispose()` clears it on unload.
 */
export class CoalescedScheduler {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private startedAt = 0;
	private deadline = 0;

	private readonly mode: CoalesceMode;
	private readonly delay: number;
	private readonly maxWait: number | undefined;
	private readonly delayFor: (() => number) | undefined;
	private readonly onBeforeRun: (() => void) | undefined;
	private readonly run: () => void;

	constructor(options: CoalescedSchedulerOptions) {
		this.mode = options.mode;
		this.delay = options.delay;
		this.maxWait = options.maxWait;
		this.delayFor = options.delayFor;
		this.onBeforeRun = options.onBeforeRun;
		this.run = options.run;
	}

	/** `true` while a run is scheduled but has not fired yet. */
	get pending(): boolean {
		return this.timer !== null;
	}

	/**
	 * Request a run. The callback fires after the trailing delay (capped by
	 * `maxWait` where configured); repeated calls coalesce per the mode.
	 * @param delayOverride - Optional per-request delay (ms), used by
	 * `"earliest"` mode where callers pass their own deadline.
	 */
	schedule(delayOverride?: number): void {
		const now = Date.now();
		const base = delayOverride ?? this.delayFor?.() ?? this.delay;

		if (this.timer) {
			if (this.mode === "lock") return;
			if (this.mode === "earliest") {
				const next = now + base;
				// Keep whichever deadline is sooner; only pull earlier, never push later.
				if (next >= this.deadline) return;
				this.deadline = next;
			} else {
				this.deadline = now + base;
			}
			this.restart(this.effectiveDelay(now));
			return;
		}

		this.startedAt = now;
		this.deadline = now + base;
		this.restart(this.effectiveDelay(now));
	}

	/** Cancel any pending run without invoking the callback. */
	cancel(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}

	/** Cancel any pending run and invoke the callback immediately. No-op when idle. */
	flush(): void {
		if (!this.timer) return;
		this.cancel();
		this.onBeforeRun?.();
		this.run();
	}

	/** Alias for {@link CoalescedScheduler.cancel}; call from `onunload`. */
	dispose(): void {
		this.cancel();
	}

	private effectiveDelay(now: number): number {
		const untilDeadline = Math.max(0, this.deadline - now);
		if (this.maxWait === undefined) return untilDeadline;
		const untilCap = Math.max(0, this.maxWait - (now - this.startedAt));
		return Math.min(untilDeadline, untilCap);
	}

	private restart(delay: number): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.timer = null;
			this.onBeforeRun?.();
			this.run();
		}, delay);
	}
}
