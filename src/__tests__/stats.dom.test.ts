// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderStatsBar } from "../renderer/stats";
import { makeContext } from "./helpers/render-context";
import type { StatsConfig } from "../types";

function host(): HTMLElement {
	return document.createElement("div");
}

function makeStats(overrides: Partial<StatsConfig> = {}): StatsConfig {
	return { enabled: true, items: [], ...overrides };
}

describe("renderStatsBar", () => {
	it("renders one .nexus-stat-card per item with computed value and label", () => {
		const ctx = makeContext({
			files: [{ path: "a.md" }, { path: "b.md" }, { path: "pic.png" }, { path: "script.js" }],
		});
		const el = host();
		renderStatsBar(
			ctx,
			el,
			makeStats({
				items: [
					{ label: "Notes", folder: "", metric: "notes" },
					{ label: "Files", folder: "", metric: "files" },
				],
			}),
		);

		const cards = el.querySelectorAll(".nexus-stat-card");
		expect(cards.length).toBe(2);

		const firstNum = cards[0]?.querySelector(".nexus-stat-num");
		const firstLabel = cards[0]?.querySelector(".nexus-stat-label");
		expect(firstNum?.textContent).toBe("2");
		expect(firstLabel?.textContent).toBe("Notes");

		const secondNum = cards[1]?.querySelector(".nexus-stat-num");
		expect(secondNum?.textContent).toBe("4");
	});

	it("filters files by folder", () => {
		const ctx = makeContext({
			files: [{ path: "Projects/A.md" }, { path: "Other/B.md" }],
		});
		const el = host();
		renderStatsBar(
			ctx,
			el,
			makeStats({ items: [{ label: "Projects", folder: "Projects", metric: "files" }] }),
		);

		const num = el.querySelector(".nexus-stat-num");
		expect(num?.textContent).toBe("1");
	});

	it("renders the new-note button when enabled and omits it when disabled", () => {
		const ctx = makeContext({ files: [{ path: "a.md" }] });

		const withButton = host();
		renderStatsBar(
			ctx,
			withButton,
			makeStats({
				items: [{ label: "Files", folder: "" }],
				newNote: { enabled: true, label: "+ Add", folder: "" },
			}),
		);
		const btn = withButton.querySelector<HTMLElement>(".nexus-stat-new-note");
		expect(btn).not.toBeNull();
		expect(btn?.textContent).toContain("+ Add");

		const withoutButton = host();
		renderStatsBar(
			ctx,
			withoutButton,
			makeStats({
				items: [{ label: "Files", folder: "" }],
				newNote: { enabled: false, label: "+ Add", folder: "" },
			}),
		);
		expect(withoutButton.querySelector(".nexus-stat-new-note")).toBeNull();
	});
});
