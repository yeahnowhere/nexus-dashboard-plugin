/**
 * A single-entry, time-to-live cache.
 *
 * Replaces the hand-rolled `{ at: Date.now(), value }` + manual TTL comparison
 * pattern used for `recentFiles` (in `main.ts`) and the vault-folder list (in
 * `settings/shared.ts`). One value at a time; `invalidate()` drops it early
 * (e.g. when the underlying data changes).
 */
export class TtlCache<V> {
	private entry: { at: number; value: V } | null = null;
	private readonly ttlMs: number;

	constructor(ttlMs: number) {
		this.ttlMs = ttlMs;
	}

	/**
	 * Return the cached value if still fresh, otherwise compute-and-store it.
	 * @param compute - Factory invoked only on a miss or expiry
	 * @returns The fresh cached value
	 */
	get(compute: () => V): V {
		const now = Date.now();
		if (this.entry && now - this.entry.at < this.ttlMs) return this.entry.value;
		const value = compute();
		this.entry = { at: now, value };
		return value;
	}

	/** Drop the cached value so the next {@link TtlCache.get} recomputes. */
	invalidate(): void {
		this.entry = null;
	}

	/** `true` while a value is cached and still within its TTL. */
	get has(): boolean {
		if (!this.entry) return false;
		return Date.now() - this.entry.at < this.ttlMs;
	}
}
