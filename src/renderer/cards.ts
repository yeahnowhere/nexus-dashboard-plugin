import { Menu, Notice, TFile } from "obsidian";
import { SMALL_ICONS, ICONS, DEFAULT_ICON } from "../icons";
import type { CardConfig } from "../types";
import type { RendererContext } from "./context";

/** Build a clickable MOC card with a context menu (open / copy path / reorder). */
export function createCard(ctx: RendererContext, card: CardConfig): HTMLElement {
	const isMini = card.type === "mini";
	const sizeClass = isMini ? "nexus-card-mini" : "nexus-card";

	const cardEl = document.createElement("div");
	cardEl.className = sizeClass;

	// Navigate on click
	cardEl.addEventListener("click", (e) => {
		e.preventDefault();
		if (card.path) {
			const file = ctx.app.vault.getAbstractFileByPath(card.path);
			if (file instanceof TFile) {
				ctx.app.workspace.openLinkText(card.path, "", false);
			} else {
				new Notice(`File not found: ${card.path}`);
			}
		}
	});

	// Right-click context menu
	cardEl.addEventListener("contextmenu", (e) => {
		e.preventDefault();
		const menu = new Menu();

		menu.addItem((item) => {
			item
				.setTitle("Open")
				.setIcon("file-text")
				.onClick(() => {
					const file = ctx.app.vault.getAbstractFileByPath(card.path);
					if (file instanceof TFile) {
						ctx.app.workspace.openLinkText(card.path, "", false);
					} else {
						new Notice(`File not found: ${card.path}`);
					}
				});
		});

		menu.addItem((item) => {
			item
				.setTitle("Copy path")
				.setIcon("copy")
				.onClick(() => {
					navigator.clipboard.writeText(card.path);
				});
		});

		if (!isMini) {
			menu.addSeparator();

			const mocs = ctx.settings.mocs;
			const mocIndex = mocs.findIndex((m) => m.path === card.path && m.title === card.label);

			if (mocIndex > 0) {
				menu.addItem((item) => {
					item
						.setTitle("Move up")
						.setIcon("arrow-up")
						.onClick(async () => {
							[mocs[mocIndex - 1], mocs[mocIndex]] = [mocs[mocIndex], mocs[mocIndex - 1]];
							await ctx.saveSettings();
							ctx.rerender();
						});
				});
			}

			if (mocIndex >= 0 && mocIndex < mocs.length - 1) {
				menu.addItem((item) => {
					item
						.setTitle("Move down")
						.setIcon("arrow-down")
						.onClick(async () => {
							[mocs[mocIndex], mocs[mocIndex + 1]] = [mocs[mocIndex + 1], mocs[mocIndex]];
							await ctx.saveSettings();
							ctx.rerender();
						});
				});
			}
		}

		menu.showAtMouseEvent(e);
	});

	// Icon
	const iconName = card.icon || "MOC";
	const svg = isMini
		? SMALL_ICONS[iconName] || SMALL_ICONS["MOC"] || DEFAULT_ICON
		: ICONS[iconName] || ICONS["MOC"] || DEFAULT_ICON;

	const iconCls = isMini ? "nexus-card-mini-icon" : "nexus-card-icon";
	const icon = cardEl.createDiv({ cls: iconCls });
	icon.innerHTML = svg;

	// Body
	const bodyCls = isMini ? "nexus-card-mini-body" : "nexus-card-body";
	const titleCls = isMini ? "nexus-card-mini-title" : "nexus-card-title";
	const descCls = isMini ? "nexus-card-mini-desc" : "nexus-card-desc";
	const body = cardEl.createDiv({ cls: bodyCls });
	body.createEl("div", { text: card.label, cls: titleCls });

	if (card.desc) {
		body.createEl("div", { text: card.desc, cls: descCls });
	}

	return cardEl;
}
