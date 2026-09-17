// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { getFilteredFiles } from "../renderer/vault-activity";
import { makeContext } from "./helpers/render-context";

function projectFiles() {
	return makeContext({
		files: [
			{ path: "Project/CA/Law Notes.md", mtime: 300 },
			{ path: "Project/Dashboard.md", mtime: 200 },
			{ path: "MOC/Journal MOC.md", mtime: 100 },
		],
	});
}

describe("getFilteredFiles", () => {
	it("includes files under a folder path ending with a slash", () => {
		const ctx = projectFiles();
		const result = getFilteredFiles(ctx, { path: "Project/", count: 50 }, 9);
		expect(result.map((f) => f.path)).toEqual(["Project/CA/Law Notes.md", "Project/Dashboard.md"]);
	});

	it("treats a folder path without a trailing slash identically", () => {
		const ctx = projectFiles();
		const result = getFilteredFiles(ctx, { path: "Project", count: 50 }, 9);
		expect(result.map((f) => f.path)).toEqual(["Project/CA/Law Notes.md", "Project/Dashboard.md"]);
	});

	it("respects the count limit", () => {
		const ctx = projectFiles();
		const result = getFilteredFiles(ctx, { path: "Project/", count: 1 }, 9);
		expect(result.map((f) => f.path)).toEqual(["Project/CA/Law Notes.md"]);
	});
});
