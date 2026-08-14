import { DIVIDER_PRESETS } from "../defaults";
import type { DividerBlockConfig } from "../types";
import type { RendererContext } from "./context";

/** Render a themed section divider. */
export function renderDivider(
	ctx: RendererContext,
	containerEl: HTMLElement,
	label: string,
	type?: string,
): void {
	const preset = type && DIVIDER_PRESETS[type] ? DIVIDER_PRESETS[type] : ctx.settings.dividerDesign;
	const d = preset;
	const dividerEl = containerEl.createDiv({ cls: "nexus-section-divider" });
	const lineLeft = dividerEl.createDiv({ cls: "nexus-section-divider-line" });
	lineLeft.style.background = d.gradient;
	lineLeft.style.height = d.lineWidth;
	const labelEl = dividerEl.createSpan({ cls: "nexus-section-divider-label", text: label });
	labelEl.style.fontSize = d.labelSize;
	labelEl.style.fontWeight = d.labelWeight;
	labelEl.style.color = d.labelColor;
	labelEl.style.letterSpacing = d.labelSpacing;
	const lineRight = dividerEl.createDiv({ cls: "nexus-section-divider-line" });
	lineRight.style.background = d.gradient;
	lineRight.style.height = d.lineWidth;
}

/** Render a standalone divider block (empty title renders nothing). */
export function renderStandaloneDivider(
	ctx: RendererContext,
	containerEl: HTMLElement,
	divider: DividerBlockConfig,
): void {
	if (!divider.title) return;
	renderDivider(ctx, containerEl, divider.title, divider.type);
}
