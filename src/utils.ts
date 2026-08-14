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
 * Format a date as a `YYYY-MM-DD` key (local time), used for heatmap cells
 * and timeline day grouping.
 * @param d - Date to format
 * @returns Local date key, e.g. `2026-08-06`
 */
export function dateKey(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
	if (kv.key === "show") target.show = kv.value === "true";
	if (kv.key === "count") target.count = safeParseInt(kv.value, undefined, 1);
	if (kv.key === "path") target.path = kv.value;
	if (kv.key === "tags") target.tags = splitCsv(kv.value);
	if (extraKeys?.[kv.key]) extraKeys[kv.key](kv.value, target);
}
