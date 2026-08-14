import { renderFiglet, getFontByName } from "../figlet";
import type { HeaderConfig, HeadingConfig, DashboardConfig } from "../types";

/** Render the ASCII-art header banner. Pure — no plugin/app access needed. */
export function renderHeader(containerEl: HTMLElement, header: HeaderConfig): void {
	const font = getFontByName(header.font);
	const rendered = renderFiglet(header.text, { font });
	const wrapper = containerEl.createDiv({ cls: "ascii-header-wrapper" });
	wrapper.dataset.align = header.align || "center";
	const pre = wrapper.createEl("pre", { text: rendered, cls: "ascii-header-output" });
	if (header.color) pre.style.color = header.color;
	pre.style.setProperty("--nexus-ascii-size", String(header.size));
	pre.style.setProperty("--nexus-ascii-mobile-size", String(header.mobileSize ?? header.size * 0.5));

	if (document.body.classList.contains("is-phone")) {
		pre.style.visibility = "hidden";
		requestAnimationFrame(() => {
			const naturalWidth = pre.scrollWidth;
			const availableWidth = wrapper.clientWidth;
			if (naturalWidth > availableWidth && availableWidth > 0) {
				const currentPx = parseFloat(getComputedStyle(pre).fontSize);
				const targetPx = (availableWidth / naturalWidth) * currentPx;
				pre.style.setProperty("font-size", `${targetPx}px`, "important");
			}
			pre.style.visibility = "visible";
		});
	}
}

/** Render a figlet heading inside a block (uses the configured header font). */
export function renderHeading(
	containerEl: HTMLElement,
	heading: HeadingConfig,
	config: DashboardConfig,
): void {
	const headerFont = config.header.font || "ANSI Shadow";
	const font = getFontByName(headerFont);
	const rendered = renderFiglet(heading.text, { font });
	const wrapper = containerEl.createDiv({ cls: "nexus-heading-wrapper" });
	if (heading.align) wrapper.dataset.align = heading.align;
	const pre = wrapper.createEl("pre", { text: rendered, cls: "nexus-heading-output" });
	if (heading.color) pre.style.color = heading.color;
	const sizeMap: Record<string, number> = { small: 0.4, medium: 0.6, large: 0.8 };
	const size = sizeMap[heading.size || "medium"] || 0.6;
	pre.style.setProperty("--nexus-heading-size", String(size));
}
