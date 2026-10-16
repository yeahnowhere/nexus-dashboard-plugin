import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TtlCache } from "../cache";

describe("TtlCache", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("computes once and reuses the value within the TTL", () => {
		let calls = 0;
		const cache = new TtlCache<number>(1000);

		expect(cache.get(() => ++calls)).toBe(1);
		expect(cache.get(() => ++calls)).toBe(1);
		expect(calls).toBe(1);
	});

	it("recomputes after the TTL elapses", () => {
		let calls = 0;
		const cache = new TtlCache<number>(1000);

		expect(cache.get(() => ++calls)).toBe(1);
		vi.advanceTimersByTime(999);
		expect(cache.get(() => ++calls)).toBe(1);
		vi.advanceTimersByTime(1);
		expect(cache.get(() => ++calls)).toBe(2);
		expect(calls).toBe(2);
	});

	it("invalidate forces the next get to recompute", () => {
		let calls = 0;
		const cache = new TtlCache<number>(1000);

		cache.get(() => ++calls);
		cache.invalidate();
		expect(cache.get(() => ++calls)).toBe(2);
		expect(calls).toBe(2);
	});

	it("has reflects freshness", () => {
		const cache = new TtlCache<string>(500);

		expect(cache.has).toBe(false);
		cache.get(() => "x");
		expect(cache.has).toBe(true);
		vi.advanceTimersByTime(500);
		expect(cache.has).toBe(false);
	});
});
