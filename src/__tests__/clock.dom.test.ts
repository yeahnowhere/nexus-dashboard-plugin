// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderClock } from "../renderer/clock";
import { makeContext } from "./helpers/render-context";
import type { ClockConfig } from "../types";

function host(): HTMLElement {
	return document.createElement("div");
}

function makeConfig(overrides: Partial<ClockConfig> = {}): ClockConfig {
	return { kind: "clock", show: true, ...overrides };
}

afterEach(() => {
	vi.useRealTimers();
});

describe("renderClock", () => {
	it("renders time and date elements and registers one interval", () => {
		const ctx = makeContext();
		const el = host();
		renderClock(ctx, el, makeConfig());

		expect(el.querySelector(".nexus-clock-time")).not.toBeNull();
		expect(el.querySelector(".nexus-clock-date")).not.toBeNull();
		expect(el.querySelector(".nexus-panel .nexus-clock")).not.toBeNull();
		expect(ctx.registerClockInterval).toHaveBeenCalledTimes(1);
		expect(el.querySelector(".nexus-clock-tz")).toBeNull();
	});

	it("omits the date element when showDate is false", () => {
		const ctx = makeContext();
		const el = host();
		renderClock(ctx, el, makeConfig({ showDate: false }));

		expect(el.querySelector(".nexus-clock-date")).toBeNull();
	});

	it("formats 24h time with seconds", () => {
		const ctx = makeContext();
		const el = host();
		renderClock(ctx, el, makeConfig({ format: "24h", showSeconds: true }));

		const time = el.querySelector(".nexus-clock-time")?.textContent;
		expect(time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
	});

	it("renders a timezone element when a timezone is configured", () => {
		const ctx = makeContext();
		const el = host();
		renderClock(ctx, el, makeConfig({ timezone: "UTC" }));

		const tz = el.querySelector(".nexus-clock-tz");
		expect(tz).not.toBeNull();
		expect(tz?.textContent?.trim().length).toBeGreaterThan(0);
	});

	it("renders a divider when a label is configured", () => {
		const ctx = makeContext();
		const el = host();
		renderClock(ctx, el, makeConfig({ label: "LOCAL TIME" }));

		expect(el.querySelector(".nexus-section-divider-label")?.textContent).toBe("LOCAL TIME");
	});

	it("updates the displayed time as fake timers advance", () => {
		vi.useFakeTimers();
		const ctx = makeContext();
		const el = host();
		renderClock(ctx, el, makeConfig({ showSeconds: true }));

		const before = el.querySelector(".nexus-clock-time")?.textContent;
		vi.advanceTimersByTime(1000);
		const after = el.querySelector(".nexus-clock-time")?.textContent;

		expect(after).not.toBe(before);
	});
});
