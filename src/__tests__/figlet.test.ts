import { describe, it, expect } from "vitest";
import { getAvailableFonts, getFontByName, renderFiglet } from "../figlet";

const EXPECTED_FONTS = [
	{ name: "ANSI Shadow", height: 7 },
	{ name: "Slant", height: 6 },
	{ name: "Small Slant", height: 5 },
	{ name: "Standard", height: 6 },
	{ name: "Graffiti", height: 6 },
];

describe("figlet font registry", () => {
	it("registers all five fonts", () => {
		const fonts = getAvailableFonts();
		expect(fonts).toHaveLength(5);
		for (const { name } of EXPECTED_FONTS) {
			expect(fonts).toContain(name);
		}
	});

	it("looks up each font by name with the correct height", () => {
		for (const { name, height } of EXPECTED_FONTS) {
			const font = getFontByName(name);
			expect(font.name).toBe(name);
			expect(font.height).toBe(height);
		}
	});

	it("falls back to ANSI Shadow for unknown names", () => {
		const font = getFontByName("DoesNotExist");
		expect(font.name).toBe("ANSI Shadow");
	});
});

describe("renderFiglet", () => {
	it("renders NEXUS with every font at up to the expected height", () => {
		for (const { name, height } of EXPECTED_FONTS) {
			const font = getFontByName(name);
			const out = renderFiglet("NEXUS", { font });
			const lines = out.split("\n");
			expect(lines.length, `${name} line count`).toBeGreaterThanOrEqual(1);
			expect(lines.length, `${name} line count`).toBeLessThanOrEqual(height);
			for (const line of lines) {
				expect(line, `${name} line content`).not.toBe("");
			}
		}
	});

	it("uppercases lowercase input", () => {
		const font = getFontByName("Standard");
		expect(renderFiglet("nexus", { font })).toBe(renderFiglet("NEXUS", { font }));
	});

	it("falls back to the default font when none is passed", () => {
		const out = renderFiglet("HI");
		expect(out).not.toBe("");
		expect(out.split("\n").length).toBeLessThanOrEqual(7);
	});
});
