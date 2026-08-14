import { splitCsv } from "../utils";
import type { TFile } from "obsidian";
import type { VaultActivityConfig } from "../types";
import type { RendererContext } from "./context";
import { renderDivider } from "./dividers";

/** Filter vault markdown files by optional path prefix + frontmatter tags, newest first. */
export function getFilteredFiles(
	ctx: RendererContext,
	config: { path?: string; tags?: string[]; count?: number },
	defaultCount: number,
): TFile[] {
	const count = config.count ?? defaultCount;

	let files = ctx.app.vault.getMarkdownFiles();

	if (config.path) {
		const paths = splitCsv(config.path).map((p) => p.toLowerCase());
		files = files.filter((f) => {
			const pathLower = f.path.toLowerCase();
			return paths.some((p) => pathLower.startsWith(p + "/") || pathLower === p);
		});
	}

	if (config.tags && config.tags.length > 0) {
		files = files.filter((f) => {
			const cache = ctx.app.metadataCache.getFileCache(f);
			const tags: string[] = [];
			if (cache?.frontmatter?.tags) {
				const fmTags = cache.frontmatter.tags;
				if (Array.isArray(fmTags)) {
					tags.push(...fmTags.map((t: string) => String(t).toLowerCase()));
				} else {
					tags.push(String(fmTags).toLowerCase());
				}
			}
			if (cache?.frontmatter?.tag) {
				tags.push(String(cache.frontmatter.tag).toLowerCase());
			}
			return config.tags?.some((t) => tags.includes(t.toLowerCase())) ?? false;
		});
	}

	return files.sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, count);
}

/** Render a compact "recently modified" file list with relative timestamps. */
export function renderVaultActivity(
	ctx: RendererContext,
	containerEl: HTMLElement,
	config: VaultActivityConfig,
): void {
	const opts = ctx.settings;
	const filterConfig = { path: config.path, tags: config.tags, count: config.count };
	const files = getFilteredFiles(ctx, filterConfig, config.count ?? opts.vaultActivityCount ?? 9);
	if (files.length === 0) return;

	const wrapperEl = containerEl.createDiv({ cls: "nexus-section" });

	// Determine label (empty label hides the header divider)
	const label = config.label || (opts.showVaultActivityDivider ? opts.vaultActivityLabel || "" : "");
	if (label) renderDivider(ctx, wrapperEl, label);

	// Compact file list
	const listEl = wrapperEl.createDiv({
		cls: `nexus-vault-activity${opts.vaultActivityShowFade ? " nexus-fade-mask" : ""}`,
	});
	listEl.style.maxHeight = `${opts.vaultActivityMaxHeight}px`;

	const relativeTime = (mtime: number): string => {
		const now = Date.now();
		const diff = now - mtime;
		const seconds = Math.floor(diff / 1000);
		if (seconds < 60) return "just now";
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 30) return `${days}d ago`;
		const months = Math.floor(days / 30);
		return `${months}mo ago`;
	};

	for (const file of files) {
		const row = listEl.createDiv({ cls: "nexus-vault-activity-row" });

		row.createEl("span", {
			text: file.basename,
			cls: "nexus-vault-activity-name",
		});

		row.createEl("span", {
			text: relativeTime(file.stat.mtime),
			cls: "nexus-vault-activity-time",
		});

		row.addEventListener("click", () => {
			ctx.app.workspace.openLinkText(file.path, "", false);
		});
	}
}
