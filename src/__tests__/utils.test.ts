import { describe, it, expect } from "vitest";
import { hasExtension, ensureExtension, parseBool } from "../utils";

describe("hasExtension", () => {
	it("returns true for paths with extensions", () => {
		expect(hasExtension("MOC/Journal MOC.md")).toBe(true);
		expect(hasExtension("file.ts")).toBe(true);
		expect(hasExtension("path/to/file.json")).toBe(true);
	});

	it("returns false for extension-free paths", () => {
		expect(hasExtension("MOC/Journal MOC")).toBe(false);
		expect(hasExtension("file")).toBe(false);
		expect(hasExtension("path/to/file")).toBe(false);
	});

	it("handles edge cases", () => {
		expect(hasExtension("")).toBe(false);
		expect(hasExtension(".hidden")).toBe(true);
	});
});

describe("ensureExtension", () => {
	it("appends .md to extension-free paths", () => {
		expect(ensureExtension("MOC/Journal MOC")).toBe("MOC/Journal MOC.md");
		expect(ensureExtension("file")).toBe("file.md");
	});

	it("does not double-append .md", () => {
		expect(ensureExtension("MOC/Journal MOC.md")).toBe("MOC/Journal MOC.md");
		expect(ensureExtension("file.ts")).toBe("file.ts");
	});

	it("handles edge cases", () => {
		expect(ensureExtension("")).toBe(".md");
	});
});

describe("parseBool", () => {
	it("parses true/false case-insensitively", () => {
		expect(parseBool("true")).toBe(true);
		expect(parseBool("TRUE")).toBe(true);
		expect(parseBool("True")).toBe(true);
		expect(parseBool("false")).toBe(false);
		expect(parseBool("FALSE")).toBe(false);
		expect(parseBool("False")).toBe(false);
	});

	it("trims surrounding whitespace", () => {
		expect(parseBool("  true  ")).toBe(true);
		expect(parseBool("\tfalse")).toBe(false);
	});

	it("falls back for non-boolean values", () => {
		expect(parseBool("yes")).toBe(false);
		expect(parseBool("1")).toBe(false);
		expect(parseBool("")).toBe(false);
		expect(parseBool("yes", true)).toBe(true);
	});
});
