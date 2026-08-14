/**
 * Vitest setup file. Loads the Obsidian DOM polyfill when a browser-like
 * environment (happy-dom) is active; a no-op in the default `node` env where
 * `HTMLElement` does not exist.
 */
import { applyObsidianDomPolyfill } from "./obsidian-dom";

if (typeof HTMLElement !== "undefined") {
	applyObsidianDomPolyfill();
}
