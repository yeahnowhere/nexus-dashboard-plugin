// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createCard } from "../renderer/cards";
import { renderSection } from "../renderer/sections";
import { Notice, Menu } from "./helpers/obsidian-mock";
import { makeContext } from "./helpers/render-context";
import type { CardConfig } from "../types";

function makeCard(overrides: Partial<CardConfig> = {}): CardConfig {
	return {
		type: "big",
		label: "Journal",
		desc: "Daily logs",
		path: "MOC/Journal MOC.md",
		icon: "Journal",
		...overrides,
	};
}

function renderCard(card: CardConfig, opts: { files?: string[] } = {}) {
	const ctx = makeContext({
		files: (opts.files ?? []).map((path) => ({ path })),
	});
	const cardEl = createCard(ctx, card);
	document.body.appendChild(cardEl);
	return { ctx, cardEl };
}

interface MenuItemSpec {
	title: string;
	onClick?: () => void;
}

function openContextMenu(cardEl: HTMLElement): Menu {
	const showSpy = vi.spyOn(Menu.prototype, "showAtMouseEvent");
	cardEl.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
	expect(showSpy).toHaveBeenCalledTimes(1);
	const menu = showSpy.mock.instances[0] as unknown as Menu;
	showSpy.mockRestore();
	return menu;
}

beforeEach(() => {
	Notice.instances = [];
});

describe("createCard", () => {
	it("renders a big card with title, description, and icon", () => {
		const { cardEl } = renderCard(makeCard());

		expect(cardEl.classList.contains("nexus-card")).toBe(true);
		expect(cardEl.querySelector(".nexus-card-title")?.textContent).toBe("Journal");
		expect(cardEl.querySelector(".nexus-card-desc")?.textContent).toBe("Daily logs");
		expect(cardEl.querySelector(".nexus-card-icon")?.innerHTML.length).toBeGreaterThan(0);
	});

	it("renders a mini card without a description when absent", () => {
		const { cardEl } = renderCard(makeCard({ type: "mini", desc: undefined }));

		expect(cardEl.classList.contains("nexus-card-mini")).toBe(true);
		expect(cardEl.querySelector(".nexus-card-mini-title")?.textContent).toBe("Journal");
		expect(cardEl.querySelector(".nexus-card-mini-desc")).toBeNull();
	});

	it("falls back to the default icon for unknown icons", () => {
		const { cardEl } = renderCard(makeCard({ icon: "Nonexistent" }));
		expect(cardEl.querySelector(".nexus-card-icon")?.innerHTML.length).toBeGreaterThan(0);
	});

	it("opens the file when a card pointing at an existing file is clicked", () => {
		const { ctx, cardEl } = renderCard(makeCard(), { files: ["MOC/Journal MOC.md"] });
		cardEl.click();
		expect(ctx.openLinkText).toHaveBeenCalledWith("MOC/Journal MOC.md", "", false);
	});

	it("shows a Notice when the card path does not exist", () => {
		const { ctx, cardEl } = renderCard(makeCard({ path: "MOC/Ghost.md" }));
		cardEl.click();
		expect(ctx.openLinkText).not.toHaveBeenCalled();
		expect(Notice.instances[Notice.instances.length - 1]?.message).toBe(
			"File not found: MOC/Ghost.md",
		);
	});

	it("builds a context menu with Open and Copy path", () => {
		const { cardEl } = renderCard(makeCard());
		const menu = openContextMenu(cardEl);

		const titles = (menu.items as MenuItemSpec[]).map((i) => i.title);
		expect(titles).toContain("Open");
		expect(titles).toContain("Copy path");
	});

	it("copies the path from the Copy path menu item", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			value: { writeText },
			configurable: true,
		});
		const { cardEl } = renderCard(makeCard({ path: "MOC/Journal MOC.md" }));
		const menu = openContextMenu(cardEl);

		const copyItem = (menu.items as MenuItemSpec[]).find((i) => i.title === "Copy path");
		copyItem?.onClick?.();
		expect(writeText).toHaveBeenCalledWith("MOC/Journal MOC.md");
	});

	it("adds Move up / Move down for big cards that match a MOC", async () => {
		const ctx = makeContext();
		const cardEl = createCard(
			ctx,
			makeCard({ path: "MOC/Knowledge MOC.md", label: "Knowledge MOC", icon: "Knowledge" }),
		);
		const menu = openContextMenu(cardEl);

		const titles = (menu.items as MenuItemSpec[]).map((i) => i.title);
		expect(titles).toContain("Move up");
		expect(titles).toContain("Move down");

		const moveUp = (menu.items as MenuItemSpec[]).find((i) => i.title === "Move up");
		await moveUp?.onClick?.();
		expect(ctx.settings.mocs[0]?.path).toBe("MOC/Knowledge MOC.md");
		expect(ctx.settings.mocs[1]?.path).toBe("MOC/Journal MOC.md");
		expect(ctx.saveSettings).toHaveBeenCalled();
		expect(ctx.rerender).toHaveBeenCalled();
	});

	it("omits reorder items for mini cards", () => {
		const { cardEl } = renderCard(makeCard({ type: "mini" }));
		const menu = openContextMenu(cardEl);

		const titles = (menu.items as MenuItemSpec[]).map((i) => i.title);
		expect(titles).toContain("Open");
		expect(titles).toContain("Copy path");
		expect(titles).not.toContain("Move up");
		expect(titles).not.toContain("Move down");
	});
});

describe("renderSection", () => {
	it("wraps the MOC grid in a unified panel", () => {
		const sectionEl = document.createElement("div");
		renderSection(makeContext(), sectionEl, {
			kind: "section",
			columns: 2,
			cards: [makeCard()],
			divider: undefined,
		});

		const grid = sectionEl.querySelector(".nexus-grid");
		expect(grid?.parentElement?.classList.contains("nexus-panel")).toBe(true);
		expect(grid?.parentElement?.classList.contains("nexus-moc-panel")).toBe(true);
	});

	it("wraps the mini grid in the panel too", () => {
		const sectionEl = document.createElement("div");
		renderSection(makeContext(), sectionEl, {
			kind: "section",
			columns: 3,
			cards: [makeCard({ type: "mini", desc: undefined })],
			divider: undefined,
		});

		const grid = sectionEl.querySelector(".nexus-mini-grid");
		expect(grid?.parentElement?.classList.contains("nexus-moc-panel")).toBe(true);
	});

	it("sets the grid height from the section height", () => {
		const sectionEl = document.createElement("div");
		renderSection(makeContext(), sectionEl, {
			kind: "section",
			columns: 2,
			height: 320,
			cards: [makeCard()],
			divider: undefined,
		});

		const grid = sectionEl.querySelector<HTMLElement>(".nexus-grid");
		expect(grid?.style.height).toBe("320px");
	});

	it("leaves the grid uncapped when the section height is 0 (Auto)", () => {
		const sectionEl = document.createElement("div");
		renderSection(makeContext(), sectionEl, {
			kind: "section",
			columns: 2,
			height: 0,
			cards: [makeCard()],
			divider: undefined,
		});

		const grid = sectionEl.querySelector<HTMLElement>(".nexus-grid");
		expect(grid?.style.height).toBe("");
	});
});
