import type { SectionConfig } from "../types";
import type { RendererContext } from "./context";
import { renderDivider } from "./dividers";
import { createCard } from "./cards";

/** Render a section of MOC cards (big or mini grid), optionally with a divider. */
export function renderSection(
	ctx: RendererContext,
	containerEl: HTMLElement,
	section: SectionConfig,
): void {
	if (section.cards.length === 0 && !section.divider) return;

	const sectionEl = containerEl.createDiv({ cls: "nexus-section" });

	// Render divider before cards if present
	if (section.divider && section.divider.title) {
		renderDivider(ctx, sectionEl, section.divider.title, section.divider.type);
	}

	if (section.cards.length === 0) return;

	const hasMini = section.cards.some((c) => c.type === "mini");
	const hasBig = section.cards.some((c) => c.type === "big");
	const gridCls =
		hasMini && !hasBig
			? `nexus-mini-grid nexus-mini-grid--cols-${section.columns}`
			: `nexus-grid nexus-grid--cols-${section.columns}`;
	const panelEl = sectionEl.createDiv({ cls: "nexus-panel nexus-moc-panel" });
	const gridEl = panelEl.createDiv({ cls: gridCls });
	const height = section.height ?? 0;
	if (height > 0) {
		gridEl.style.height = `${height}px`;
	}

	for (const cardConfig of section.cards) {
		const cardEl = createCard(ctx, cardConfig);
		gridEl.appendChild(cardEl);
	}
}
