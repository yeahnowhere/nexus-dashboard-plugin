// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderHeader, renderHeading } from "../renderer/header";
import { getFontByName, renderFiglet } from "../figlet";
import type { HeaderConfig, DashboardConfig } from "../types";

function makeHeader(overrides: Partial<HeaderConfig> = {}): HeaderConfig {
	return {
		text: "NEXUS",
		font: "ANSI Shadow",
		color: "#8A5CF6",
		size: 1.0,
		enabled: true,
		...overrides,
	};
}

function makeConfig(overrides: Partial<DashboardConfig> = {}): DashboardConfig {
	return {
		header: makeHeader(),
		stats: { enabled: true, items: [] },
		blocks: [],
		graph: { enabled: false, exclude: [] },
		...overrides,
	};
}

function host(): HTMLElement {
	return document.createElement("div");
}

describe("renderHeader", () => {
	it("emits .ascii-header-wrapper > pre.ascii-header-output", () => {
		const el = host();
		renderHeader(el, makeHeader());

		const wrapper = el.querySelector(".ascii-header-wrapper");
		expect(wrapper).not.toBeNull();
		const pre = wrapper?.querySelector("pre.ascii-header-output");
		expect(pre).not.toBeNull();
	});

	it("renders figlet text equal to renderFiglet(text)", () => {
		const el = host();
		renderHeader(el, makeHeader({ text: "NEXUS" }));

		const pre = el.querySelector("pre.ascii-header-output");
		const expected = renderFiglet("NEXUS", { font: getFontByName("ANSI Shadow") });
		expect(pre?.textContent).toBe(expected);
	});

	it("sets --nexus-ascii-size and applies the configured color", () => {
		const el = host();
		renderHeader(el, makeHeader({ size: 1.25, color: "#ff0000" }));

		const pre = el.querySelector<HTMLElement>("pre.ascii-header-output");
		expect(pre?.style.getPropertyValue("--nexus-ascii-size")).toBe("1.25");
		expect(pre?.style.color).toBe("#ff0000");
	});

	it("defaults alignment to center and honors an explicit align", () => {
		const centered = host();
		renderHeader(centered, makeHeader());
		expect(centered.querySelector<HTMLElement>(".ascii-header-wrapper")?.dataset.align).toBe(
			"center",
		);

		const left = host();
		renderHeader(left, makeHeader({ align: "left" }));
		expect(left.querySelector<HTMLElement>(".ascii-header-wrapper")?.dataset.align).toBe("left");
	});
});

describe("renderHeading", () => {
	it("sets --nexus-heading-size per heading.size", () => {
		const el = host();
		renderHeading(el, { text: "Hi", size: "large", align: "left" }, makeConfig());

		const pre = el.querySelector<HTMLElement>("pre.nexus-heading-output");
		expect(pre?.style.getPropertyValue("--nexus-heading-size")).toBe("0.8");
	});

	it("uses the configured header font from the dashboard config", () => {
		const el = host();
		renderHeading(el, { text: "Hi", size: "small", align: "center" }, makeConfig());

		const pre = el.querySelector<HTMLElement>("pre.nexus-heading-output");
		expect(pre?.textContent).toBe(renderFiglet("Hi", { font: getFontByName("ANSI Shadow") }));
	});

	it("applies the heading color", () => {
		const el = host();
		renderHeading(
			el,
			{ text: "Hi", size: "medium", align: "center", color: "#00ff00" },
			makeConfig(),
		);

		const pre = el.querySelector<HTMLElement>("pre.nexus-heading-output");
		expect(pre?.style.color).toBe("#00ff00");
	});
});
