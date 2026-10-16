/**
 * Check if a path already has a file extension.
 * @param path - File path to check
 * @returns `true` if the path ends with a dot followed by 1-10 word characters
 */
export function hasExtension(path: string): boolean {
	return /\.\w{1,10}$/.test(path);
}

/**
 * Auto-append `.md` to extension-free paths.
 * @param path - File path to normalize
 * @returns The original path if it already has an extension, otherwise `.md` is appended
 */
export function ensureExtension(path: string): string {
	return hasExtension(path) ? path : path + ".md";
}

/**
 * Safely parse a string to an integer with fallback and optional clamping.
 *
 * Handles the common pattern of `parseInt` + `Number.isFinite` validation
 * used throughout the parser and renderer.
 *
 * @param value - Raw string value to parse
 * @param fallback - Value to return if parsing fails or result is out of range. Use `undefined` for optional config fields.
 * @param min - Optional minimum allowed value (inclusive)
 * @param max - Optional maximum allowed value (inclusive)
 * @returns The parsed integer if valid and within bounds, otherwise `fallback`
 *
 * @example
 * ```ts
 * safeParseInt("5", 2);        // 5
 * safeParseInt("abc", 2);      // 2
 * safeParseInt("0", 3, 1, 4);  // 3 (below min)
 * safeParseInt("9", 3, 1, 4);  // 3 (above max)
 * safeParseInt("abc", undefined); // undefined
 * ```
 */
export function safeParseInt(
	value: string | number,
	fallback: number | undefined,
	min?: number,
	max?: number,
): number | undefined {
	const n = parseInt(String(value), 10);
	if (!Number.isFinite(n)) return fallback;
	if (min !== undefined && n < min) return fallback;
	if (max !== undefined && n > max) return fallback;
	return n;
}

/**
 * Parse a YAML-ish boolean value case-insensitively.
 *
 * Only the literals `true` / `false` (any casing) are treated as booleans;
 * anything else falls back, so a typo never silently flips a flag.
 *
 * @param value - Raw string value
 * @param fallback - Returned when the value is neither `true` nor `false`
 * @returns The parsed boolean, or `fallback`
 *
 * @example
 * ```ts
 * parseBool("true");   // true
 * parseBool("TRUE");   // true
 * parseBool("False");  // false
 * parseBool("yes");    // false (fallback)
 * ```
 */
export function parseBool(value: string, fallback = false): boolean {
	const v = value.trim().toLowerCase();
	if (v === "true") return true;
	if (v === "false") return false;
	return fallback;
}

/**
 * Split a comma-separated string into trimmed, non-empty values.
 *
 * Handles the common pattern of `.split(",").map(s => s.trim()).filter(s => s.length > 0)`
 * used for tags, exclude lists, and path lists throughout the parser.
 *
 * @param str - Comma-separated string to split
 * @returns Array of trimmed, non-empty strings
 *
 * @example
 * ```ts
 * splitCsv("a, b, c");    // ["a", "b", "c"]
 * splitCsv("a,, b ");     // ["a", "b"]
 * splitCsv("");           // []
 * ```
 */
export function splitCsv(str: string): string[] {
	return str
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/**
 * Parent folder path of a vault path (empty string for vault root).
 * @param path - Vault-relative file path
 * @returns Everything before the last `/`, or `""` when there is no folder
 */
export function parentOf(path: string): string {
	const idx = path.lastIndexOf("/");
	return idx < 0 ? "" : path.slice(0, idx);
}

/**
 * True when `path` is inside the vault-relative `prefix` (or is the prefix itself).
 * A trailing slash on the prefix is ignored.
 * @param path - Vault-relative path to test
 * @param prefix - Vault-relative folder prefix
 * @returns `true` when `path` equals `prefix` or lives underneath it
 */
export function isWithinPath(path: string, prefix: string): boolean {
	const p = prefix.replace(/\/+$/, "");
	return p.length === 0 || path === p || path.startsWith(p + "/");
}

/**
 * Format a date as a `YYYY-MM-DD` key (local time), used for heatmap cells
 * and timeline day grouping.
 * @param d - Date to format
 * @returns Local date key, e.g. `2026-08-06`
 */
export function dateKey(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Map over items with bounded concurrency, preserving input order.
 *
 * Turns a serial `for … await` chain (one round-trip per file) into a handful
 * of parallel workers, without flooding the vault with N simultaneous reads.
 *
 * @param items - Items to process
 * @param limit - Maximum number of in-flight promises (clamped to ≥ 1)
 * @param fn - Async mapper invoked once per item
 * @returns Results in the same order as `items`
 *
 * @example
 * ```ts
 * const contents = await mapWithConcurrency(files, 16, (f) => vault.cachedRead(f));
 * ```
 */
export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	const workers = Math.max(1, Math.min(Math.floor(limit), items.length));
	let next = 0;
	const run = async (): Promise<void> => {
		while (next < items.length) {
			const index = next++;
			results[index] = await fn(items[index], index);
		}
	};
	await Promise.all(Array.from({ length: workers }, run));
	return results;
}

/**
 * Apply a key-value pair from YAML-like config to a list-style config object.
 *
 * Unifies the identical `applyRecentlyKV`, `applyVaultListKV`, and
 * `applyVaultActivityKV` functions that share the same `show`/`count`/`path`/`tags` pattern.
 *
 * @param target - Config object to mutate (must have show, count?, path?, tags?)
 * @param kv - Key-value pair from the parser
 * @param extraKeys - Optional map of additional key handlers for type-specific fields
 *
 * @example
 * ```ts
 * applyListConfigKV(config, { key: "count", value: "5" });
 * applyListConfigKV(config, { key: "tags", value: "a, b, c" });
 * applyListConfigKV(config, { key: "label", value: "My List" }, {
 *   label: (val, target) => { target.label = val; },
 * });
 * ```
 */
export function applyListConfigKV(
	target: { show: boolean; count?: number; path?: string; tags?: string[] },
	kv: { key: string; value: string },
	extraKeys?: Record<
		string,
		(val: string, tgt: { show: boolean; count?: number; path?: string; tags?: string[] }) => void
	>,
): void {
	if (kv.key === "show") target.show = parseBool(kv.value);
	if (kv.key === "count") target.count = safeParseInt(kv.value, undefined, 1);
	if (kv.key === "path") target.path = kv.value;
	if (kv.key === "tags") target.tags = splitCsv(kv.value);
	if (extraKeys?.[kv.key]) extraKeys[kv.key](kv.value, target);
}
