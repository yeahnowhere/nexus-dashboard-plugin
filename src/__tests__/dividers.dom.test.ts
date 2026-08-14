// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderDivider, renderStandaloneDivider } from "../renderer/dividers";
import { DIVIDER_PRESETS } from "../defaults";
import { makeContext } from "./helpers/render-context";

function host(): HTMLElement {
	return document.createElement("div");
}

describe("renderDivider", () => {
	it("renders line-label-line structure with the default design", () => {
		const ctx = makeContext();
		const el = host();
		renderDivider(ctx, el, "SECTION");

		const divider = el.querySelector(".nexus-section-divider");
		expect(divider).not.toBeNull();
		expect(divider?.querySelectorAll(".nexus-section-divider-line").length).toBe(2);

		const label = divider?.querySelector<HTMLElement>(".nexus-section-divider-label");
		expect(label?.textContent).toBe("SECTION");
	});

	it("applies the configured gradient and line width from settings", () => {
		const ctx = makeContext();
		ctx.settings.dividerDesign = {
			...ctx.settings.dividerDesign,
			gradient: "linear-gradient(90deg, red, blue)",
			lineWidth: "3px",
		};
		const el = host();
		renderDivider(ctx, el, "X");

		const lines = el.querySelectorAll<HTMLElement>(".nexus-section-divider-line");
		expect(lines.length).toBe(2);
		expect(lines[0]?.style.background).toBe("linear-gradient(90deg, red, blue)");
		expect(lines[0]?.style.height).toBe("3px");
	});

	it("applies label styling from the design", () => {
		const ctx = makeContext();
		ctx.settings.dividerDesign = {
			...ctx.settings.dividerDesign,
			labelSize: "1rem",
			labelWeight: "800",
			labelColor: "#123456",
			labelSpacing: "0.5em",
		};
		const el = host();
		renderDivider(ctx, el, "X");

		const label = el.querySelector<HTMLElement>(".nexus-section-divider-label");
		expect(label?.style.fontSize).toBe("1rem");
		expect(label?.style.fontWeight).toBe("800");
		expect(label?.style.color).toBe("#123456");
		expect(label?.style.letterSpacing).toBe("0.5em");
	});

	it("honors a named preset override", () => {
		const ctx = makeContext();
		const el = host();
		renderDivider(ctx, el, "X", "bold");

		const label = el.querySelector<HTMLElement>(".nexus-section-divider-label");
		expect(label?.style.color).toBe(DIVIDER_PRESETS["bold"].labelColor);
		expect(label?.style.fontWeight).toBe(DIVIDER_PRESETS["bold"].labelWeight);

		const line = el.querySelector<HTMLElement>(".nexus-section-divider-line");
		expect(line?.style.height).toBe(DIVIDER_PRESETS["bold"].lineWidth);
	});

	it("falls back to the settings design for unknown preset names", () => {
		const ctx = makeContext();
		ctx.settings.dividerDesign = {
			...ctx.settings.dividerDesign,
			labelColor: "#abcdef",
		};
		const el = host();
		renderDivider(ctx, el, "X", "not-a-preset");

		const label = el.querySelector<HTMLElement>(".nexus-section-divider-label");
		expect(label?.style.color).toBe("#abcdef");
	});
});

describe("renderStandaloneDivider", () => {
	it("renders nothing when the title is empty", () => {
		const ctx = makeContext();
		const el = host();
		renderStandaloneDivider(ctx, el, { kind: "divider", title: "" });
		expect(el.children.length).toBe(0);
	});

	it("renders a divider when a title is present", () => {
		const ctx = makeContext();
		const el = host();
		renderStandaloneDivider(ctx, el, { kind: "divider", title: "BREAK" });
		expect(el.querySelector(".nexus-section-divider")).not.toBeNull();
	});
});
