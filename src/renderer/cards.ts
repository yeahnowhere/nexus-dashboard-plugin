import { Menu, Notice, TFile } from "obsidian";
import { SMALL_ICONS, ICONS, DEFAULT_ICON } from "../icons";
import type { CardConfig } from "../types";
import type { RendererContext } from "./context";

/** Open the card's target file, or notify when the path no longer exists. */
function openCardPath(ctx: RendererContext, path: string): void {
	if (!path) return;
	const file = ctx.app.vault.getAbstractFileByPath(path);
	if (file instanceof TFile) {
		ctx.app.workspace.openLinkText(path, "", false);
	} else {
		new Notice(`File not found: ${path}`);
	}
}

/** True when a vault entry exists for the path (used for dead-link detection). */
function pathExists(ctx: RendererContext, path: string): boolean {
	return path !== "" && ctx.app.vault.getAbstractFileByPath(path) !== null;
}

/** Build a clickable, keyboard-accessible MOC card with a context menu (open / copy path / reorder). */
export function createCard(ctx: RendererContext, card: CardConfig): HTMLElement {
	const isMini = card.type === "mini";
	const sizeClass = isMini ? "nexus-card-mini" : "nexus-card";

	const cardEl = document.createElement("div");
	cardEl.className = sizeClass;

	if (!pathExists(ctx, card.path)) {
		cardEl.classList.add("nexus-card-dead");
	}

	// Keyboard focus + screen-reader semantics
	cardEl.tabIndex = 0;
	cardEl.setAttribute("role", "link");
	cardEl.setAttribute("aria-label", `Open ${card.label}`);

	const buildMenu = (): Menu => {
		const menu = new Menu();

		menu.addItem((item) =>
			item
				.setTitle("Open")
				.setIcon("file-text")
				.onClick(() => openCardPath(ctx, card.path)),
		);

		menu.addItem((item) =>
			item
				.setTitle("Copy path")
				.setIcon("copy")
				.onClick(() => {
					navigator.clipboard.writeText(card.path);
				}),
		);

		if (!isMini) {
			menu.addSeparator();

			const mocs = ctx.settings.mocs;
			const mocIndex = mocs.findIndex((m) => m.path === card.path && m.title === card.label);

			if (mocIndex > 0) {
				menu.addItem((item) =>
					item
						.setTitle("Move up")
						.setIcon("arrow-up")
						.onClick(async () => {
							[mocs[mocIndex - 1], mocs[mocIndex]] = [mocs[mocIndex], mocs[mocIndex - 1]];
							await ctx.saveSettings();
							ctx.rerender();
						}),
				);
			}

			if (mocIndex >= 0 && mocIndex < mocs.length - 1) {
				menu.addItem((item) =>
					item
						.setTitle("Move down")
						.setIcon("arrow-down")
						.onClick(async () => {
							[mocs[mocIndex], mocs[mocIndex + 1]] = [mocs[mocIndex + 1], mocs[mocIndex]];
							await ctx.saveSettings();
							ctx.rerender();
						}),
				);
			}
		}

		return menu;
	};

	const showContextMenuAt = (x: number, y: number): void => {
		buildMenu().showAtPosition({ x, y });
	};

	// Mouse: click opens, right-click opens the context menu
	cardEl.addEventListener("click", (e) => {
		e.preventDefault();
		openCardPath(ctx, card.path);
	});

	cardEl.addEventListener("contextmenu", (e) => {
		e.preventDefault();
		showContextMenuAt(e.clientX, e.clientY);
	});

	// Keyboard: Enter/Space opens; Menu / Shift+F10 opens the context menu at the card
	cardEl.addEventListener("keydown", (e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			openCardPath(ctx, card.path);
			return;
		}
		if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
			e.preventDefault();
			const rect = cardEl.getBoundingClientRect();
			showContextMenuAt(rect.left, rect.bottom);
		}
	});

	// Icon
	const iconName = card.icon || "MOC";
	const svg = isMini
		? SMALL_ICONS[iconName] || SMALL_ICONS["MOC"] || DEFAULT_ICON
		: ICONS[iconName] || ICONS["MOC"] || DEFAULT_ICON;

	const iconCls = isMini ? "nexus-card-mini-icon" : "nexus-card-icon";
	const icon = cardEl.createDiv({ cls: iconCls });
	icon.setAttribute("aria-hidden", "true");
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
