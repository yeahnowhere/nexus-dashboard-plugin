import { describe, expect, it, vi } from "vitest";

import { parseDueDate, dueStatus, toggleTaskLine } from "../tasks";

describe("parseDueDate", () => {
	it("parses the 📅 emoji date format", () => {
		expect(parseDueDate("- [ ] Ship release 📅 2026-08-12")).toBe("2026-08-12");
	});

	it("parses the due: token format", () => {
		expect(parseDueDate("- [ ] Review PR due: 2026-08-12")).toBe("2026-08-12");
	});

	it("parses due: at the start of the line", () => {
		expect(parseDueDate("due: 2026-09-01 - [ ] Plan sprint")).toBe("2026-09-01");
	});

	it("returns null when no date is present", () => {
		expect(parseDueDate("- [ ] No deadline here")).toBeNull();
	});

	it("returns null for an invalid date", () => {
		expect(parseDueDate("- [ ] 🎂 2026-13-99")).toBeNull();
		expect(parseDueDate("- [ ] due: tomorrow")).toBeNull();
	});
});

describe("dueStatus", () => {
	const today = new Date(2026, 7, 6); // 2026-08-06

	it("classifies past dates as overdue", () => {
		expect(dueStatus("2026-08-05", today)).toBe("overdue");
	});

	it("classifies today as today", () => {
		expect(dueStatus("2026-08-06", today)).toBe("today");
	});

	it("classifies future dates as upcoming", () => {
		expect(dueStatus("2026-08-07", today)).toBe("upcoming");
	});

	it("classifies null as none", () => {
		expect(dueStatus(null, today)).toBe("none");
	});

	it("classifies invalid dates as none", () => {
		expect(dueStatus("not-a-date", today)).toBe("none");
		expect(dueStatus("2026-13-99", today)).toBe("none");
	});
});

describe("toggleTaskLine", () => {
	const makeFile = (content: string) => {
		const process = vi.fn(async (_file: unknown, fn: (data: string) => string) => fn(content));
		return { file: { vault: { process } }, process };
	};

	it("flips an unchecked task to checked", async () => {
		const { file, process } = makeFile("- [ ] Alpha\n- [x] Beta\n");
		const result = await toggleTaskLine(file as never, 0);
		expect(result).toBeUndefined();
		expect(process).toHaveBeenCalledTimes(1);
		const transform = process.mock.calls[0][1];
		expect(transform("- [ ] Alpha\n- [x] Beta\n")).toBe("- [x] Alpha\n- [x] Beta\n");
	});

	it("leaves an already-checked task untouched", async () => {
		const { file, process } = makeFile("- [x] Beta\n");
		await toggleTaskLine(file as never, 0);
		const transform = process.mock.calls[0][1];
		expect(transform("- [x] Beta\n")).toBe("- [x] Beta\n");
	});

	it("supports star and numbered list markers", async () => {
		const { file, process } = makeFile("* [ ] Star\n3. [ ] Numbered\n");
		await toggleTaskLine(file as never, 0);
		await toggleTaskLine(file as never, 1);
		const transformFirst = process.mock.calls[0][1];
		const transformSecond = process.mock.calls[1][1];
		expect(transformFirst("* [ ] Star\n3. [ ] Numbered\n")).toBe("* [x] Star\n3. [ ] Numbered\n");
		expect(transformSecond("* [ ] Star\n3. [ ] Numbered\n")).toBe("* [ ] Star\n3. [x] Numbered\n");
	});
});
